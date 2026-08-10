import {
  boundedErrorCode,
  boundedErrorMessage,
  type GenerationJobType,
  type JobEventType,
  type JsonValue,
} from "./contracts";
import { JOB_HEARTBEAT_INTERVAL_MS } from "./policy";
import type {
  ClaimedGenerationJob,
  GenerationJobStore,
  JobFailure,
  ReportJobProgressInput,
} from "./store";

export type JobHandlerResult =
  | {
      status: "SUCCEEDED";
      result: JsonValue;
    }
  | {
      status: "SUPERSEDED";
      result?: JsonValue;
    };

export type JobProgressReporter = (
  type: ReportJobProgressInput["type"],
  progress: number,
  message?: string | null,
  metadata?: JsonValue | null,
) => Promise<void>;

export type JobHandlerContext = {
  job: ClaimedGenerationJob;
  signal: AbortSignal;
  reportProgress: JobProgressReporter;
};

export type GenerationJobHandler = (
  context: JobHandlerContext,
) => Promise<JobHandlerResult>;

export type GenerationJobHandlers = Record<
  GenerationJobType,
  GenerationJobHandler
>;

export type JobExecutionOutcome =
  | {
      status: "SUCCEEDED" | "SUPERSEDED";
      errorCode?: null;
    }
  | {
      status: "RETRYING" | "FAILED" | "DEAD_LETTERED";
      errorCode: string;
    }
  | { status: "LEASE_LOST"; errorCode?: "JOB_LEASE_LOST" };

export class JobExecutionError extends Error {
  constructor(
    readonly code: string,
    options: {
      retryable: boolean;
      publicMessage?: string | null;
      cause?: unknown;
    },
  ) {
    super(options.publicMessage ?? code, { cause: options.cause });
    this.name = "JobExecutionError";
    this.retryable = options.retryable;
    this.publicMessage = options.publicMessage ?? null;
  }

  readonly retryable: boolean;
  readonly publicMessage: string | null;
}

export class JobLeaseLostError extends Error {
  readonly code = "JOB_LEASE_LOST";

  constructor() {
    super("The worker no longer owns this job.");
    this.name = "JobLeaseLostError";
  }
}

export function failureFromUnknown(error: unknown): JobFailure {
  if (error instanceof JobExecutionError) {
    return {
      code: boundedErrorCode(error.code),
      message: boundedErrorMessage(error.publicMessage),
      retryable: error.retryable,
    };
  }

  const codes = errorCodes(error);
  const known = codes.find((code) => failureClassifications[code]);

  if (known) {
    return failureClassifications[known];
  }

  if (codes.some((code) => code.startsWith("08"))) {
    return {
      code: "DATABASE_CONNECTION_UNAVAILABLE",
      message: "The database connection was interrupted.",
      retryable: true,
    };
  }

  return {
    code: "UNEXPECTED_JOB_ERROR",
    message: null,
    retryable: false,
  };
}

const failureClassifications: Record<string, JobFailure> = {
  P1001: {
    code: "DATABASE_CONNECTION_UNAVAILABLE",
    message: "The database is temporarily unavailable.",
    retryable: true,
  },
  P1002: {
    code: "DATABASE_CONNECTION_UNAVAILABLE",
    message: "The database connection timed out.",
    retryable: true,
  },
  P2024: {
    code: "DATABASE_POOL_TIMEOUT",
    message: "A database connection was not available in time.",
    retryable: true,
  },
  P2028: {
    code: "DATABASE_TRANSACTION_TIMEOUT",
    message: "The database transaction exceeded its time budget.",
    retryable: true,
  },
  INVALID_JOB_PAYLOAD: {
    code: "INVALID_JOB_PAYLOAD",
    message: "The job payload is invalid.",
    retryable: false,
  },
  ADAPTATION_VALIDATION_FAILED: {
    code: "ADAPTATION_VALIDATION_FAILED",
    message: "The adaptive result did not pass structural validation.",
    retryable: false,
  },
  "40001": {
    code: "DATABASE_SERIALIZATION_FAILURE",
    message: "A concurrent database update must be retried.",
    retryable: true,
  },
  "40P01": {
    code: "DATABASE_DEADLOCK",
    message: "A concurrent database update must be retried.",
    retryable: true,
  },
  "57P01": {
    code: "DATABASE_CONNECTION_UNAVAILABLE",
    message: "The database restarted during processing.",
    retryable: true,
  },
  P2002: {
    code: "DATABASE_CONSTRAINT_FAILED",
    message: "The adaptive result conflicted with existing state.",
    retryable: false,
  },
  P2003: {
    code: "DATABASE_CONSTRAINT_FAILED",
    message: "The adaptive result referenced unavailable state.",
    retryable: false,
  },
  P2004: {
    code: "DATABASE_CONSTRAINT_FAILED",
    message: "The adaptive result did not satisfy database constraints.",
    retryable: false,
  },
  P2025: {
    code: "ADAPTATION_VALIDATION_FAILED",
    message: "The adaptive target is no longer available.",
    retryable: false,
  },
};

function errorCodes(error: unknown) {
  const codes: string[] = [];
  const visited = new Set<unknown>();
  let current = error;

  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (
      (typeof current !== "object" && typeof current !== "function") ||
      visited.has(current)
    ) {
      break;
    }
    visited.add(current);
    const candidate = current as {
      code?: unknown;
      sqlState?: unknown;
      cause?: unknown;
    };

    for (const value of [candidate.code, candidate.sqlState]) {
      if (typeof value === "string" && value.trim()) {
        codes.push(value.trim().toUpperCase().slice(0, 64));
      }
    }
    current = candidate.cause;
  }

  return codes;
}

type HeartbeatPump = {
  signal: AbortSignal;
  leaseLost: () => boolean;
  stop: () => Promise<void>;
};

function startHeartbeatPump(input: {
  store: GenerationJobStore;
  job: ClaimedGenerationJob;
  intervalMs: number;
  onHeartbeatError?: (error: unknown) => void;
}): HeartbeatPump {
  const controller = new AbortController();
  let stopped = false;
  let lost = false;
  let heartbeatChain = Promise.resolve();

  const tick = () => {
    heartbeatChain = heartbeatChain
      .then(async () => {
        if (stopped || lost) return;

        try {
          const renewed = await input.store.heartbeat(input.job);

          if (!renewed) {
            lost = true;
            controller.abort(new JobLeaseLostError());
          }
        } catch (error) {
          input.onHeartbeatError?.(error);
        }
      })
      .catch((error: unknown) => {
        input.onHeartbeatError?.(error);
      });
  };

  const timer = setInterval(tick, input.intervalMs);

  return {
    signal: controller.signal,
    leaseLost: () => lost,
    async stop() {
      stopped = true;
      clearInterval(timer);
      await heartbeatChain;
    },
  };
}

function isProgressEventType(
  type: JobEventType,
): type is ReportJobProgressInput["type"] {
  return (
    type === "UPDATING_PREFERENCES" ||
    type === "FINDING_REPLACEMENT" ||
    type === "VALIDATING_ITINERARY"
  );
}

export async function executeClaimedJob(input: {
  store: GenerationJobStore;
  handlers: GenerationJobHandlers;
  job: ClaimedGenerationJob;
  heartbeatIntervalMs?: number;
  onHeartbeatError?: (error: unknown) => void;
}): Promise<JobExecutionOutcome> {
  const heartbeat = startHeartbeatPump({
    store: input.store,
    job: input.job,
    intervalMs: input.heartbeatIntervalMs ?? JOB_HEARTBEAT_INTERVAL_MS,
    onHeartbeatError: input.onHeartbeatError,
  });
  const reportProgress: JobProgressReporter = async (
    type,
    progress,
    message,
    metadata,
  ) => {
    if (!isProgressEventType(type)) {
      throw new TypeError(`Unsupported progress event type: ${type}`);
    }

    const applied = await input.store.reportProgress({
      claim: input.job,
      type,
      progress,
      message,
      metadata,
    });

    if (!applied) {
      throw new JobLeaseLostError();
    }
  };

  try {
    const result = await input.handlers[input.job.type]({
      job: input.job,
      signal: heartbeat.signal,
      reportProgress,
    });

    await heartbeat.stop();

    if (heartbeat.leaseLost()) {
      return { status: "LEASE_LOST" };
    }

    if (result.status === "SUPERSEDED") {
      const applied = await input.store.supersede(
        input.job,
        result.result ?? null,
      );
      return { status: applied ? "SUPERSEDED" : "LEASE_LOST" };
    }

    const applied = await input.store.complete(input.job, result.result);
    return { status: applied ? "SUCCEEDED" : "LEASE_LOST" };
  } catch (error) {
    await heartbeat.stop();

    if (heartbeat.leaseLost() || error instanceof JobLeaseLostError) {
      return { status: "LEASE_LOST" };
    }

    const failure = failureFromUnknown(error);
    const failed = await input.store.fail(input.job, failure);

    if (!failed.applied) {
      return { status: "LEASE_LOST" };
    }

    return { status: failed.status, errorCode: failure.code };
  }
}

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
  | { status: "SUCCEEDED" | "SUPERSEDED" }
  | { status: "RETRYING" | "FAILED" | "DEAD_LETTERED" }
  | { status: "LEASE_LOST" };

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

  return {
    code: "UNEXPECTED_JOB_ERROR",
    message: null,
    retryable: true,
  };
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

    const failed = await input.store.fail(input.job, failureFromUnknown(error));

    if (!failed.applied) {
      return { status: "LEASE_LOST" };
    }

    return { status: failed.status };
  }
}

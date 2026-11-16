import { JOB_POLL_INTERVAL_MS, JOB_RECOVERY_INTERVAL_MS } from "./policy";
import {
  executeClaimedJob,
  type GenerationJobHandlers,
  type JobExecutionOutcome,
} from "./runner";
import type {
  ClaimedGenerationJob,
  GenerationJobStore,
  JobRecoveryResult,
} from "./store";
import type { JsonValue } from "./contracts";

type WorkerResultSummary = {
  domainOutcome: "REPLACED" | "NO_REPLACEMENT" | "SUPERSEDED" | null;
  outcomeReason:
    | "NO_CHEAPER_REPLACEMENT"
    | "NO_ELIGIBLE_CANDIDATE"
    | "VALIDATION_BLOCKED"
    | null;
  candidatePool: {
    persisted: number;
    fetched: number;
    total: number;
    eligible: number;
    excludedSamePlace: number;
    excludedNotCheaper: number;
  } | null;
  itineraryActivated: boolean | null;
};

function boundedCount(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? Math.min(value, 10_000)
    : 0;
}

function summarizeJobResult(value: JsonValue | undefined): WorkerResultSummary {
  const record =
    value && typeof value === "object" && !Array.isArray(value) ? value : null;
  const poolValue = record?.candidatePool;
  const pool =
    poolValue && typeof poolValue === "object" && !Array.isArray(poolValue)
      ? poolValue
      : null;
  const domainOutcome =
    record?.outcome === "REPLACED" ||
    record?.outcome === "NO_REPLACEMENT" ||
    record?.outcome === "SUPERSEDED"
      ? record.outcome
      : null;
  const outcomeReason =
    record?.outcomeReason === "NO_CHEAPER_REPLACEMENT" ||
    record?.outcomeReason === "NO_ELIGIBLE_CANDIDATE" ||
    record?.outcomeReason === "VALIDATION_BLOCKED"
      ? record.outcomeReason
      : null;

  return {
    domainOutcome,
    outcomeReason,
    candidatePool: pool
      ? {
          persisted: boundedCount(pool.persisted),
          fetched: boundedCount(pool.fetched),
          total: boundedCount(pool.total),
          eligible: boundedCount(pool.eligible),
          excludedSamePlace: boundedCount(pool.excludedSamePlace),
          excludedNotCheaper: boundedCount(pool.excludedNotCheaper),
        }
      : null,
    itineraryActivated:
      typeof record?.itineraryActivated === "boolean"
        ? record.itineraryActivated
        : null,
  };
}

export type WorkerLoopActivity =
  | {
      type: "RECOVERY_COMPLETED";
      result: JobRecoveryResult;
    }
  | {
      type: "JOB_CLAIMED";
      jobId: string;
      tripId: string;
      attempt: number;
    }
  | {
      type: "JOB_FINISHED";
      jobId: string;
      tripId: string;
      attempt: number;
      outcome: JobExecutionOutcome["status"];
      errorCode: string | null;
      retryScheduled: boolean;
      attemptDurationMs: number;
      totalDurationMs: number | null;
      domainOutcome: WorkerResultSummary["domainOutcome"];
      outcomeReason: WorkerResultSummary["outcomeReason"];
      candidatePool: WorkerResultSummary["candidatePool"];
      itineraryActivated: boolean | null;
    }
  | {
      type: "HEARTBEAT_ERROR";
      jobId: string;
      tripId: string;
      attempt: number;
      error: unknown;
    }
  | {
      type: "LOOP_ERROR";
      error: unknown;
    };

export type WorkerLoopExitReason = "ONCE_COMPLETED" | "ONCE_IDLE" | "SHUTDOWN";

export function abortableDelay(durationMs: number, signal: AbortSignal) {
  if (signal.aborted || durationMs <= 0) return Promise.resolve();

  return new Promise<void>((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, durationMs);

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export async function runGenerationWorkerLoop(input: {
  store: GenerationJobStore;
  handlers: GenerationJobHandlers;
  workerId: string;
  signal: AbortSignal;
  once?: boolean;
  pollIntervalMs?: number;
  recoveryIntervalMs?: number;
  now?: () => Date;
  delay?: (durationMs: number, signal: AbortSignal) => Promise<void>;
  execute?: (job: ClaimedGenerationJob) => Promise<JobExecutionOutcome>;
  onActivity?: (activity: WorkerLoopActivity) => void;
}): Promise<WorkerLoopExitReason> {
  const now = input.now ?? (() => new Date());
  const delay = input.delay ?? abortableDelay;
  const pollIntervalMs = input.pollIntervalMs ?? JOB_POLL_INTERVAL_MS;
  const recoveryIntervalMs =
    input.recoveryIntervalMs ?? JOB_RECOVERY_INTERVAL_MS;
  let lastRecoveryAt = Number.NEGATIVE_INFINITY;

  while (true) {
    if (input.signal.aborted) return "SHUTDOWN";

    const currentTime = now();

    try {
      if (currentTime.getTime() - lastRecoveryAt >= recoveryIntervalMs) {
        const result = await input.store.recoverExpiredClaims();
        lastRecoveryAt = currentTime.getTime();
        input.onActivity?.({ type: "RECOVERY_COMPLETED", result });
      }

      if (input.signal.aborted) return "SHUTDOWN";

      const job = await input.store.claimNext({
        workerId: input.workerId,
      });

      if (job) {
        if (input.signal.aborted) {
          await input.store.release(job);
          return "SHUTDOWN";
        }

        input.onActivity?.({
          type: "JOB_CLAIMED",
          jobId: job.id,
          tripId: job.tripId,
          attempt: job.attempt,
        });
        const attemptStartedAt = now().getTime();
        const outcome = await (
          input.execute ??
          ((claimed) =>
            executeClaimedJob({
              store: input.store,
              handlers: input.handlers,
              job: claimed,
              onHeartbeatError: (error) =>
                input.onActivity?.({
                  type: "HEARTBEAT_ERROR",
                  jobId: claimed.id,
                  tripId: claimed.tripId,
                  attempt: claimed.attempt,
                  error,
                }),
            }))
        )(job);
        const finishedAt = now().getTime();
        const resultSummary = summarizeJobResult(
          "result" in outcome ? outcome.result : undefined,
        );
        input.onActivity?.({
          type: "JOB_FINISHED",
          jobId: job.id,
          tripId: job.tripId,
          attempt: job.attempt,
          outcome: outcome.status,
          errorCode: outcome.errorCode ?? null,
          retryScheduled: outcome.status === "RETRYING",
          attemptDurationMs: Math.max(0, finishedAt - attemptStartedAt),
          totalDurationMs: job.createdAt
            ? Math.max(0, finishedAt - job.createdAt.getTime())
            : null,
          ...resultSummary,
        });

        if (input.once) return "ONCE_COMPLETED";
        continue;
      }

      if (input.once) return "ONCE_IDLE";
    } catch (error) {
      input.onActivity?.({ type: "LOOP_ERROR", error });

      if (input.once) throw error;
    }

    await delay(pollIntervalMs, input.signal);
  }
}

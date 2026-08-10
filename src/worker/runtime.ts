import { randomUUID } from "node:crypto";

import { createPostgresGenerationJobStore } from "@/features/jobs/postgres-store";
import type { GenerationJobHandlers } from "@/features/jobs/runner";
import {
  runGenerationWorkerLoop,
  type WorkerLoopActivity,
} from "@/features/jobs/worker-loop";

type EnvironmentSource = Record<string, string | undefined>;

function stableErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return "UNKNOWN_WORKER_ERROR";

  const candidate = error as { code?: unknown; name?: unknown };

  if (typeof candidate.code === "string" && candidate.code.trim()) {
    return candidate.code.trim().slice(0, 64);
  }

  if (typeof candidate.name === "string" && candidate.name.trim()) {
    return candidate.name.trim().slice(0, 64);
  }

  return "UNKNOWN_WORKER_ERROR";
}

function sanitizeWorkerId(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_.:-]/g, "-")
    .slice(0, 128);
}

export function resolveWorkerId(
  source: EnvironmentSource = process.env,
  processId = process.pid,
) {
  const configured =
    source.PLANNING_WORKER_ID ?? source.RENDER_INSTANCE_ID ?? source.HOSTNAME;
  const normalized = configured ? sanitizeWorkerId(configured) : "";

  return (
    normalized || `planning-worker-${processId}-${randomUUID().slice(0, 8)}`
  );
}

export class WorkerArgumentError extends Error {
  readonly code = "INVALID_WORKER_ARGUMENT";

  constructor(arguments_: readonly string[]) {
    super(
      `Unsupported worker argument${arguments_.length === 1 ? "" : "s"}: ${arguments_.join(", ")}`,
    );
    this.name = "WorkerArgumentError";
  }
}

export function parseWorkerArguments(arguments_: readonly string[]) {
  const supported = new Set(["--once"]);
  const unsupported = arguments_.filter((argument) => !supported.has(argument));

  if (unsupported.length > 0) {
    throw new WorkerArgumentError(unsupported);
  }

  return { once: arguments_.includes("--once") };
}

export function logWorkerActivity(
  workerId: string,
  activity: WorkerLoopActivity,
) {
  const common = {
    event: "planning_worker",
    workerId,
    activity: activity.type,
  };

  switch (activity.type) {
    case "RECOVERY_COMPLETED":
      console.info(
        JSON.stringify({
          ...common,
          recoveredCount: activity.result.recovered,
          deadLetteredCount: activity.result.deadLettered,
        }),
      );
      return;
    case "JOB_CLAIMED":
      console.info(
        JSON.stringify({
          ...common,
          jobId: activity.jobId,
          tripId: activity.tripId,
          attempt: activity.attempt,
        }),
      );
      return;
    case "JOB_FINISHED":
      console.info(
        JSON.stringify({
          ...common,
          jobId: activity.jobId,
          tripId: activity.tripId,
          attempt: activity.attempt,
          outcome: activity.outcome,
          errorCode: activity.errorCode,
          retryScheduled: activity.retryScheduled,
          attemptDurationMs: activity.attemptDurationMs,
          totalDurationMs: activity.totalDurationMs,
        }),
      );
      return;
    case "HEARTBEAT_ERROR":
      console.error(
        JSON.stringify({
          ...common,
          jobId: activity.jobId,
          tripId: activity.tripId,
          attempt: activity.attempt,
          errorCode: stableErrorCode(activity.error),
        }),
      );
      return;
    case "LOOP_ERROR":
      console.error(
        JSON.stringify({
          ...common,
          errorCode: stableErrorCode(activity.error),
        }),
      );
  }
}

export function installWorkerShutdownHandlers(
  controller: AbortController,
  onSignal?: (signal: NodeJS.Signals) => void,
) {
  const terminate = (signal: NodeJS.Signals) => {
    onSignal?.(signal);
    controller.abort(signal);
  };
  const onSigterm = () => terminate("SIGTERM");
  const onSigint = () => terminate("SIGINT");

  process.once("SIGTERM", onSigterm);
  process.once("SIGINT", onSigint);

  return () => {
    process.off("SIGTERM", onSigterm);
    process.off("SIGINT", onSigint);
  };
}

export async function runPlanningWorker(input: {
  handlers: GenerationJobHandlers;
  once?: boolean;
  signal?: AbortSignal;
  workerId?: string;
}) {
  const workerId = input.workerId ?? resolveWorkerId();
  const signal = input.signal ?? new AbortController().signal;
  const store = createPostgresGenerationJobStore();

  console.info(
    JSON.stringify({
      event: "planning_worker",
      workerId,
      activity: "STARTED",
      once: input.once ?? false,
    }),
  );

  const reason = await runGenerationWorkerLoop({
    store,
    handlers: input.handlers,
    workerId,
    signal,
    once: input.once,
    onActivity: (activity) => logWorkerActivity(workerId, activity),
  });

  console.info(
    JSON.stringify({
      event: "planning_worker",
      workerId,
      activity: "STOPPED",
      reason,
    }),
  );

  return reason;
}

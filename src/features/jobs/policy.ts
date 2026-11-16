import type { GenerationJobStatus } from "./contracts";

export const JOB_RETRY_DELAYS_MS = [5_000, 20_000, 60_000] as const;
export const DEFAULT_MAX_JOB_ATTEMPTS = 3;
export const JOB_HEARTBEAT_INTERVAL_MS = 5_000;
export const JOB_LEASE_DURATION_MS = 30_000;
export const JOB_POLL_INTERVAL_MS = 1_000;
export const JOB_RECOVERY_INTERVAL_MS = 30_000;

const terminalStatuses = new Set<GenerationJobStatus>([
  "SUCCEEDED",
  "FAILED",
  "DEAD_LETTERED",
  "SUPERSEDED",
]);

const allowedTransitions: Record<
  GenerationJobStatus,
  ReadonlySet<GenerationJobStatus>
> = {
  PENDING: new Set(["RUNNING", "SUPERSEDED"]),
  RUNNING: new Set([
    "RETRYING",
    "SUCCEEDED",
    "FAILED",
    "DEAD_LETTERED",
    "SUPERSEDED",
  ]),
  RETRYING: new Set(["RUNNING", "SUPERSEDED"]),
  SUCCEEDED: new Set(),
  FAILED: new Set(),
  DEAD_LETTERED: new Set(),
  SUPERSEDED: new Set(),
};

export type JobFailureDisposition =
  | {
      status: "RETRYING";
      availableAt: Date;
      delayMs: number;
    }
  | {
      status: "FAILED" | "DEAD_LETTERED";
      availableAt: null;
      delayMs: null;
    };

export type JobFailurePlan =
  | {
      status: "RETRYING";
      delayMs: number;
    }
  | {
      status: "FAILED" | "DEAD_LETTERED";
      delayMs: null;
    };

export function isTerminalJobStatus(status: GenerationJobStatus) {
  return terminalStatuses.has(status);
}

export function canTransitionJobStatus(
  from: GenerationJobStatus,
  to: GenerationJobStatus,
) {
  return allowedTransitions[from].has(to);
}

export function retryDelayMs(failedAttempt: number) {
  if (!Number.isInteger(failedAttempt) || failedAttempt < 1) {
    throw new RangeError("failedAttempt must be a positive integer.");
  }

  return (
    JOB_RETRY_DELAYS_MS[
      Math.min(failedAttempt - 1, JOB_RETRY_DELAYS_MS.length - 1)
    ] ?? JOB_RETRY_DELAYS_MS.at(-1)!
  );
}

export function failureDisposition(input: {
  failedAttempt: number;
  maxAttempts?: number;
  retryable: boolean;
  now: Date;
}): JobFailureDisposition {
  const plan = failurePlan(input);

  if (plan.status !== "RETRYING") {
    return {
      ...plan,
      availableAt: null,
    };
  }

  return {
    ...plan,
    availableAt: new Date(input.now.getTime() + plan.delayMs),
  };
}

export function failurePlan(input: {
  failedAttempt: number;
  maxAttempts?: number;
  retryable: boolean;
}): JobFailurePlan {
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_JOB_ATTEMPTS;

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError("maxAttempts must be a positive integer.");
  }

  if (!input.retryable) {
    return {
      status: "FAILED",
      delayMs: null,
    };
  }

  if (input.failedAttempt >= maxAttempts) {
    return {
      status: "DEAD_LETTERED",
      delayMs: null,
    };
  }

  const delayMs = retryDelayMs(input.failedAttempt);

  return {
    status: "RETRYING",
    delayMs,
  };
}

export function leaseExpiresAt(now: Date, durationMs = JOB_LEASE_DURATION_MS) {
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) {
    throw new RangeError("durationMs must be a positive safe integer.");
  }

  return new Date(now.getTime() + durationMs);
}

export function isExpiredRunningClaim(input: {
  status: GenerationJobStatus;
  leaseExpiresAt: Date | null;
  now: Date;
}) {
  return (
    input.status === "RUNNING" &&
    input.leaseExpiresAt !== null &&
    input.leaseExpiresAt.getTime() <= input.now.getTime()
  );
}

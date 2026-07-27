import { afterEach, describe, expect, it, vi } from "vitest";

import type { ClaimedGenerationJob, GenerationJobStore } from "./store";
import {
  JobExecutionError,
  executeClaimedJob,
  failureFromUnknown,
  type GenerationJobHandlers,
} from "./runner";

const job: ClaimedGenerationJob = {
  id: "job_1",
  tripId: "trip_1",
  feedbackId: "feedback_1",
  type: "PROCESS_FEEDBACK_EVENT",
  status: "RUNNING",
  idempotencyKey: "operation_1",
  tripVersion: 1,
  preferenceProfileVersionId: "preference_1",
  parentItineraryVersionId: "itinerary_1",
  payload: {
    feedbackId: "feedback_1",
    operationId: "00000000-0000-4000-8000-000000000001",
    tripVersion: 1,
    preferenceProfileVersionId: "preference_1",
    parentItineraryVersionId: "itinerary_1",
  },
  attemptId: "attempt_1",
  attempt: 1,
  maxAttempts: 3,
  workerId: "worker_1",
  leaseExpiresAt: new Date("2026-07-26T12:00:30.000Z"),
};

function createStore(
  overrides: Partial<GenerationJobStore> = {},
): GenerationJobStore {
  return {
    enqueueFeedbackJob: vi.fn(),
    claimNext: vi.fn(),
    heartbeat: vi.fn().mockResolvedValue(true),
    release: vi.fn().mockResolvedValue(true),
    reportProgress: vi.fn().mockResolvedValue(true),
    complete: vi.fn().mockResolvedValue(true),
    fail: vi.fn().mockResolvedValue({
      applied: true,
      status: "RETRYING",
      availableAt: new Date(),
      delayMs: 5_000,
    }),
    supersede: vi.fn().mockResolvedValue(true),
    recoverExpiredClaims: vi
      .fn()
      .mockResolvedValue({ recovered: 0, deadLettered: 0 }),
    ...overrides,
  };
}

describe("job runner", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("persists progress and completes a successful handler", async () => {
    const store = createStore();
    const handlers: GenerationJobHandlers = {
      PROCESS_FEEDBACK_EVENT: async ({ reportProgress }) => {
        await reportProgress(
          "UPDATING_PREFERENCES",
          25,
          "Updating preferences.",
        );
        return { status: "SUCCEEDED", result: { outcome: "REPLACED" } };
      },
    };

    await expect(executeClaimedJob({ store, handlers, job })).resolves.toEqual({
      status: "SUCCEEDED",
    });
    expect(store.reportProgress).toHaveBeenCalledWith({
      claim: job,
      type: "UPDATING_PREFERENCES",
      progress: 25,
      message: "Updating preferences.",
      metadata: undefined,
    });
    expect(store.complete).toHaveBeenCalledWith(job, {
      outcome: "REPLACED",
    });
  });

  it("records a bounded explicit failure policy", async () => {
    const store = createStore();
    const handlers: GenerationJobHandlers = {
      PROCESS_FEEDBACK_EVENT: async () => {
        throw new JobExecutionError("provider timeout!", {
          retryable: true,
          publicMessage: "The place provider timed out.",
        });
      },
    };

    await expect(
      executeClaimedJob({ store, handlers, job }),
    ).resolves.toMatchObject({ status: "RETRYING" });
    expect(store.fail).toHaveBeenCalledWith(job, {
      code: "PROVIDER_TIMEOUT_",
      message: "The place provider timed out.",
      retryable: true,
    });
  });

  it("does not expose unknown error messages", () => {
    expect(failureFromUnknown(new Error("database password"))).toEqual({
      code: "UNEXPECTED_JOB_ERROR",
      message: null,
      retryable: true,
    });
  });

  it("stops terminal writes after heartbeat ownership is lost", async () => {
    vi.useFakeTimers();
    let resolveHandler:
      | ((result: { status: "SUCCEEDED"; result: null }) => void)
      | undefined;
    const store = createStore({
      heartbeat: vi.fn().mockResolvedValue(false),
    });
    const handlers: GenerationJobHandlers = {
      PROCESS_FEEDBACK_EVENT: ({ signal }) =>
        new Promise((resolve) => {
          resolveHandler = resolve;
          signal.addEventListener(
            "abort",
            () => resolve({ status: "SUCCEEDED", result: null }),
            { once: true },
          );
        }),
    };
    const execution = executeClaimedJob({
      store,
      handlers,
      job,
      heartbeatIntervalMs: 5_000,
    });

    await vi.advanceTimersByTimeAsync(5_000);
    resolveHandler?.({ status: "SUCCEEDED", result: null });

    await expect(execution).resolves.toEqual({ status: "LEASE_LOST" });
    expect(store.complete).not.toHaveBeenCalled();
    expect(store.fail).not.toHaveBeenCalled();
  });
});

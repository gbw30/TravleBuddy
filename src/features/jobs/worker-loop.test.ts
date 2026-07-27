import { describe, expect, it, vi } from "vitest";

import type { ClaimedGenerationJob, GenerationJobStore } from "./store";
import type { GenerationJobHandlers } from "./runner";
import { runGenerationWorkerLoop } from "./worker-loop";

const handlers = {
  PROCESS_FEEDBACK_EVENT: vi.fn(),
} as unknown as GenerationJobHandlers;

const job = {
  id: "job_1",
  attempt: 1,
} as ClaimedGenerationJob;

function storeWithClaims(
  claims: Array<ClaimedGenerationJob | null>,
): GenerationJobStore {
  return {
    enqueueFeedbackJob: vi.fn(),
    claimNext: vi.fn(async () => claims.shift() ?? null),
    heartbeat: vi.fn(),
    release: vi.fn().mockResolvedValue(true),
    reportProgress: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
    supersede: vi.fn(),
    recoverExpiredClaims: vi
      .fn()
      .mockResolvedValue({ recovered: 1, deadLettered: 0 }),
  };
}

describe("generation worker loop", () => {
  it("recovers claims and processes at most one job in once mode", async () => {
    const store = storeWithClaims([job, null]);
    const activities: string[] = [];
    const outcome = await runGenerationWorkerLoop({
      store,
      handlers,
      workerId: "worker_1",
      signal: new AbortController().signal,
      once: true,
      execute: vi.fn().mockResolvedValue({ status: "SUCCEEDED" }),
      onActivity: (activity) => activities.push(activity.type),
    });

    expect(outcome).toBe("ONCE_COMPLETED");
    expect(store.recoverExpiredClaims).toHaveBeenCalledOnce();
    expect(store.claimNext).toHaveBeenCalledOnce();
    expect(activities).toEqual([
      "RECOVERY_COMPLETED",
      "JOB_CLAIMED",
      "JOB_FINISHED",
    ]);
  });

  it("returns idle without polling forever in once mode", async () => {
    const store = storeWithClaims([null]);

    await expect(
      runGenerationWorkerLoop({
        store,
        handlers,
        workerId: "worker_1",
        signal: new AbortController().signal,
        once: true,
      }),
    ).resolves.toBe("ONCE_IDLE");
  });

  it("stops claiming after shutdown but finishes an active job", async () => {
    const controller = new AbortController();
    const store = storeWithClaims([job, null]);
    const execute = vi.fn(async () => {
      controller.abort();
      return { status: "SUCCEEDED" as const };
    });

    await expect(
      runGenerationWorkerLoop({
        store,
        handlers,
        workerId: "worker_1",
        signal: controller.signal,
        execute,
      }),
    ).resolves.toBe("SHUTDOWN");
    expect(execute).toHaveBeenCalledOnce();
    expect(store.claimNext).toHaveBeenCalledOnce();
  });

  it("rechecks shutdown after recovery and does not start a claim", async () => {
    const controller = new AbortController();
    const store = storeWithClaims([job]);
    vi.mocked(store.recoverExpiredClaims).mockImplementation(async () => {
      controller.abort();
      return { recovered: 0, deadLettered: 0 };
    });
    const execute = vi.fn();

    await expect(
      runGenerationWorkerLoop({
        store,
        handlers,
        workerId: "worker_1",
        signal: controller.signal,
        execute,
      }),
    ).resolves.toBe("SHUTDOWN");
    expect(store.claimNext).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("releases a claim obtained concurrently with shutdown", async () => {
    const controller = new AbortController();
    const store = storeWithClaims([job]);
    vi.mocked(store.claimNext).mockImplementation(async () => {
      controller.abort();
      return job;
    });
    const execute = vi.fn();

    await expect(
      runGenerationWorkerLoop({
        store,
        handlers,
        workerId: "worker_1",
        signal: controller.signal,
        execute,
      }),
    ).resolves.toBe("SHUTDOWN");
    expect(store.release).toHaveBeenCalledWith(job);
    expect(execute).not.toHaveBeenCalled();
  });

  it("uses an abortable poll delay when no work is available", async () => {
    const controller = new AbortController();
    const store = storeWithClaims([null]);
    const delay = vi.fn(async () => {
      controller.abort();
    });

    await expect(
      runGenerationWorkerLoop({
        store,
        handlers,
        workerId: "worker_1",
        signal: controller.signal,
        delay,
      }),
    ).resolves.toBe("SHUTDOWN");
    expect(delay).toHaveBeenCalledWith(1_000, controller.signal);
  });
});

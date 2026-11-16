import { describe, expect, it, vi } from "vitest";

import type { ClaimedGenerationJob } from "@/features/jobs/store";
import {
  createGenerationJobHandlers,
  loadProcessFeedbackEventJob,
} from "./handlers";

const job = {
  id: "job_1",
  workerId: "worker_1",
  attempt: 2,
  type: "PROCESS_FEEDBACK_EVENT",
} as ClaimedGenerationJob;

describe("worker handlers", () => {
  it("loads the stable adaptation handler through the worker entrypoint", async () => {
    await expect(loadProcessFeedbackEventJob()).resolves.toEqual(
      expect.any(Function),
    );
  });

  it("adapts the cross-domain feedback handler without passing payload data", async () => {
    const processFeedbackEventJob = vi
      .fn()
      .mockResolvedValue({ status: "SUCCEEDED", result: { replaced: true } });
    const handler = createGenerationJobHandlers(processFeedbackEventJob);
    const signal = new AbortController().signal;
    const reportProgress = vi.fn();

    await expect(
      handler.PROCESS_FEEDBACK_EVENT({
        job,
        signal,
        reportProgress,
      }),
    ).resolves.toEqual({
      status: "SUCCEEDED",
      result: { replaced: true },
    });
    expect(processFeedbackEventJob).toHaveBeenCalledWith({
      jobId: "job_1",
      workerId: "worker_1",
      attempt: 2,
      signal,
      reportProgress,
    });
    expect(processFeedbackEventJob.mock.calls[0]?.[0]).not.toHaveProperty(
      "payload",
    );
  });

  it("rejects malformed terminal results as non-retryable failures", async () => {
    const handler = createGenerationJobHandlers(
      vi.fn().mockResolvedValue({ status: "UNKNOWN" }),
    );

    await expect(
      handler.PROCESS_FEEDBACK_EVENT({
        job,
        signal: new AbortController().signal,
        reportProgress: vi.fn(),
      }),
    ).rejects.toMatchObject({
      code: "INVALID_JOB_HANDLER_RESULT",
      retryable: false,
    });
  });
});

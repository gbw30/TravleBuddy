import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobLeaseLostError } from "@/features/jobs/runner";

const mocks = vi.hoisted(() => ({
  db: {
    $transaction: vi.fn(),
    generationJob: {
      findFirst: vi.fn(),
    },
    planningFeedback: {
      updateMany: vi.fn(),
    },
  },
  tx: {
    $queryRawUnsafe: vi.fn(),
    planningFeedback: {
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({
  db: mocks.db,
}));

import { processFeedbackEventJob } from "./job-handler";

describe("processFeedbackEventJob claim fencing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.$transaction.mockImplementation((callback) => callback(mocks.tx));
  });

  it("rejects an expired or reassigned attempt before changing feedback state", async () => {
    mocks.tx.$queryRawUnsafe.mockResolvedValue([]);

    await expect(
      processFeedbackEventJob({
        jobId: "job-1",
        workerId: "worker-old",
        attempt: 2,
        signal: new AbortController().signal,
        reportProgress: vi.fn(),
      }),
    ).rejects.toBeInstanceOf(JobLeaseLostError);

    expect(mocks.tx.$queryRawUnsafe).toHaveBeenCalledOnce();
    const [query, ...parameters] = mocks.tx.$queryRawUnsafe.mock.calls[0] ?? [];

    expect(query).toContain("status = 'RUNNING'");
    expect(query).toContain("attempt_count = $3");
    expect(query).toContain("lease_expires_at > clock_timestamp()");
    expect(query).toContain("FOR UPDATE");
    expect(parameters).toEqual(["job-1", "worker-old", 2]);
    expect(mocks.db.generationJob.findFirst).not.toHaveBeenCalled();
    expect(mocks.db.planningFeedback.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.planningFeedback.updateMany).not.toHaveBeenCalled();
  });
});

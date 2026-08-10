import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: {
    assertAuthenticatedApiUser: vi.fn(),
  },
  jobs: {
    getGenerationJobForTrip: vi.fn(),
  },
}));

vi.mock("@/lib/authorization", () => ({
  UnauthorizedError: class UnauthorizedError extends Error {},
  assertAuthenticatedApiUser: mocks.auth.assertAuthenticatedApiUser,
}));

vi.mock("@/features/jobs/queries", () => ({
  getGenerationJobForTrip: mocks.jobs.getGenerationJobForTrip,
}));

import { GET } from "./route";

const context = {
  params: Promise.resolve({
    tripId: "trip_1",
    jobId: "job_1",
  }),
};

describe("/api/trips/[tripId]/jobs/[jobId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.assertAuthenticatedApiUser.mockResolvedValue("user_1");
  });

  it("returns only the ownership-gated public job DTO without caching", async () => {
    const job = {
      id: "job_1",
      type: "PROCESS_FEEDBACK_EVENT",
      status: "RUNNING",
      progress: 45,
      progressMessage: "Finding a replacement.",
      attemptCount: 1,
      maxAttempts: 3,
      availableAt: "2026-07-27T01:00:00.000Z",
      completedAt: null,
      errorCode: null,
      result: null,
      createdAt: "2026-07-27T01:00:00.000Z",
      updatedAt: "2026-07-27T01:00:02.000Z",
      events: [
        {
          id: "event_1",
          type: "FINDING_REPLACEMENT",
          progress: 45,
          message: "Finding a replacement.",
          createdAt: "2026-07-27T01:00:02.000Z",
        },
      ],
    };
    mocks.jobs.getGenerationJobForTrip.mockResolvedValue(job);

    const response = await GET(
      new Request("http://localhost/api/trips/trip_1/jobs/job_1"),
      context,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(mocks.jobs.getGenerationJobForTrip).toHaveBeenCalledWith(
      "user_1",
      "trip_1",
      "job_1",
    );
    await expect(response.json()).resolves.toEqual({ job });
  });

  it("uses the same 404 for absent and cross-owner jobs", async () => {
    mocks.jobs.getGenerationJobForTrip.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/trips/trip_1/jobs/job_1"),
      context,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Generation job not found.",
    });
  });

  it("maps authentication and internal failures without leaking details", async () => {
    const { UnauthorizedError } = await import("@/lib/authorization");
    mocks.auth.assertAuthenticatedApiUser.mockRejectedValueOnce(
      new UnauthorizedError(),
    );
    expect(
      (
        await GET(
          new Request("http://localhost/api/trips/trip_1/jobs/job_1"),
          context,
        )
      ).status,
    ).toBe(401);

    mocks.auth.assertAuthenticatedApiUser.mockResolvedValue("user_1");
    mocks.jobs.getGenerationJobForTrip.mockRejectedValueOnce(
      new Error("database URL and secret should not leak"),
    );
    const response = await GET(
      new Request("http://localhost/api/trips/trip_1/jobs/job_1"),
      context,
    );
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("database URL");
  });
});

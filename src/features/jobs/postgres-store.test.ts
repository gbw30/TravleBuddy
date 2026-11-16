import { describe, expect, it, vi } from "vitest";

import {
  JobIdempotencyConflictError,
  PostgresGenerationJobStore,
  type JobDatabaseClient,
} from "./postgres-store";
import type { ClaimedGenerationJob } from "./store";

const payload = {
  feedbackId: "feedback_1",
  operationId: "00000000-0000-4000-8000-000000000001",
  tripVersion: 2,
  preferenceProfileVersionId: "preference_2",
  parentItineraryVersionId: "itinerary_1",
};

function fakeDatabase(responses: unknown[][]) {
  const calls: Array<{ query: string; values: unknown[] }> = [];
  const database: JobDatabaseClient = {
    $queryRawUnsafe: vi.fn(async (query: string, ...values: unknown[]) => {
      calls.push({ query, values });
      return responses.shift() ?? [];
    }) as JobDatabaseClient["$queryRawUnsafe"],
  };

  return { calls, database };
}

const claim: ClaimedGenerationJob = {
  id: "job_1",
  tripId: "trip_1",
  feedbackId: "feedback_1",
  type: "PROCESS_FEEDBACK_EVENT",
  status: "RUNNING",
  idempotencyKey: "operation_1",
  tripVersion: 2,
  preferenceProfileVersionId: "preference_2",
  parentItineraryVersionId: "itinerary_1",
  payload,
  attemptId: "attempt_1",
  attempt: 1,
  maxAttempts: 3,
  workerId: "worker_1",
  leaseExpiresAt: new Date("2026-07-26T12:00:30.000Z"),
};

describe("PostgresGenerationJobStore", () => {
  it("enqueues feedback and its initial event in one statement", async () => {
    const { calls, database } = fakeDatabase([
      [
        {
          id: "job_1",
          tripId: "trip_1",
          feedbackId: "feedback_1",
          type: "PROCESS_FEEDBACK_EVENT",
          status: "PENDING",
          tripVersion: 2,
          preferenceProfileVersionId: "preference_2",
          parentItineraryVersionId: "itinerary_1",
          payload,
          created: true,
        },
      ],
    ]);
    const store = new PostgresGenerationJobStore(() => database);

    await expect(
      store.enqueueFeedbackJob({
        tripId: "trip_1",
        feedbackId: "feedback_1",
        idempotencyKey: "operation_1",
        tripVersion: 2,
        preferenceProfileVersionId: "preference_2",
        parentItineraryVersionId: "itinerary_1",
        payload,
      }),
    ).resolves.toEqual({
      id: "job_1",
      tripId: "trip_1",
      type: "PROCESS_FEEDBACK_EVENT",
      status: "PENDING",
      created: true,
    });
    expect(calls[0]?.query).toContain("inserted AS");
    expect(calls[0]?.query).toContain("INSERT INTO job_events");
    expect(calls[0]?.query).toContain("processing_status = 'QUEUED'");
    expect(calls[0]?.query).toContain(
      "ON CONFLICT (trip_id, idempotency_key) DO NOTHING",
    );
    expect(calls[0]?.query).toContain("clock_timestamp()");
    expect(calls[0]?.values[7]).toBe(JSON.stringify(payload));
    expect(calls[0]?.values).not.toContainEqual(expect.any(Date));
  });

  it("returns an existing job for an idempotent enqueue replay", async () => {
    const { database } = fakeDatabase([
      [],
      [
        {
          id: "job_existing",
          tripId: "trip_1",
          feedbackId: "feedback_1",
          type: "PROCESS_FEEDBACK_EVENT",
          status: "SUCCEEDED",
          tripVersion: 2,
          preferenceProfileVersionId: "preference_2",
          parentItineraryVersionId: "itinerary_1",
          payload,
          created: false,
        },
      ],
    ]);
    const store = new PostgresGenerationJobStore(() => database);

    await expect(
      store.enqueueFeedbackJob({
        tripId: "trip_1",
        feedbackId: "feedback_1",
        idempotencyKey: "operation_1",
        tripVersion: 2,
        preferenceProfileVersionId: "preference_2",
        parentItineraryVersionId: "itinerary_1",
        payload,
      }),
    ).resolves.toMatchObject({
      id: "job_existing",
      status: "SUCCEEDED",
      created: false,
    });
  });

  it("rejects an idempotency replay bound to different captured state", async () => {
    const { database } = fakeDatabase([
      [],
      [
        {
          id: "job_existing",
          tripId: "trip_1",
          feedbackId: "feedback_other",
          type: "PROCESS_FEEDBACK_EVENT",
          status: "PENDING",
          tripVersion: 3,
          preferenceProfileVersionId: "preference_3",
          parentItineraryVersionId: "itinerary_2",
          payload: {
            ...payload,
            feedbackId: "feedback_other",
            tripVersion: 3,
          },
          created: false,
        },
      ],
    ]);
    const store = new PostgresGenerationJobStore(() => database);

    await expect(
      store.enqueueFeedbackJob({
        tripId: "trip_1",
        feedbackId: "feedback_1",
        idempotencyKey: "operation_1",
        tripVersion: 2,
        preferenceProfileVersionId: "preference_2",
        parentItineraryVersionId: "itinerary_1",
        payload,
      }),
    ).rejects.toBeInstanceOf(JobIdempotencyConflictError);
  });

  it("claims atomically with SKIP LOCKED and opens an attempt", async () => {
    const { calls, database } = fakeDatabase([
      [
        {
          ...claim,
          type: "PROCESS_FEEDBACK_EVENT",
          status: "RUNNING",
          leaseExpiresAt: "2026-07-26T12:00:30.000Z",
        },
      ],
    ]);
    const store = new PostgresGenerationJobStore(() => database);
    const claimed = await store.claimNext({
      workerId: "worker_1",
    });

    expect(claimed).toEqual(claim);
    expect(calls[0]?.query).toContain("FOR UPDATE SKIP LOCKED");
    expect(calls[0]?.query).toContain("INSERT INTO job_attempts");
    expect(calls[0]?.query).toContain("processing_status = 'PROCESSING'");
    expect(calls[0]?.query).toContain("clock_timestamp()");
    expect(calls[0]?.query).toContain("available_at <= job_clock.now");
    expect(calls[0]?.values[0]).toBe(30_000);
    expect(calls[0]?.values[1]).toBe("worker_1");
    expect(calls[0]?.values).not.toContainEqual(expect.any(Date));
  });

  it("renews only the currently owned live claim", async () => {
    const { calls, database } = fakeDatabase([[{ applied: 1 }]]);
    const store = new PostgresGenerationJobStore(() => database);

    await expect(store.heartbeat(claim)).resolves.toBe(true);
    expect(calls[0]?.query).toContain("clock_timestamp()");
    expect(calls[0]?.query).toContain("lease_expires_at > job_clock.now");
    expect(calls[0]?.values[3]).toBe(30_000);
    expect(calls[0]?.values).not.toContainEqual(expect.any(Date));
  });

  it("releases only the currently owned live claim back to the queue", async () => {
    const { calls, database } = fakeDatabase([[{ applied: 1 }]]);
    const store = new PostgresGenerationJobStore(() => database);

    await expect(store.release(claim)).resolves.toBe(true);
    expect(calls[0]?.query).toContain("status = 'RETRYING'");
    expect(calls[0]?.query).toContain(
      "max_attempts = generation_jobs.max_attempts + 1",
    );
    expect(calls[0]?.query).toContain("status = 'ABANDONED'");
    expect(calls[0]?.query).toContain("processing_status = 'QUEUED'");
    expect(calls[0]?.query).toContain("lease_expires_at > job_clock.now");
    expect(calls[0]?.query).toContain("clock_timestamp()");
    expect(calls[0]?.values.slice(0, 4)).toEqual([
      claim.id,
      claim.workerId,
      claim.attempt,
      claim.attemptId,
    ]);
    expect(calls[0]?.values).not.toContainEqual(expect.any(Date));
  });

  it("schedules the first failure and dead-letters the third", async () => {
    const first = fakeDatabase([
      [{ applied: 1, availableAt: "2026-07-26T12:00:05.000Z" }],
    ]);
    const firstStore = new PostgresGenerationJobStore(() => first.database);
    await expect(
      firstStore.fail(claim, {
        code: "PROVIDER_TIMEOUT",
        message: null,
        retryable: true,
      }),
    ).resolves.toEqual({
      applied: true,
      status: "RETRYING",
      availableAt: new Date("2026-07-26T12:00:05.000Z"),
      delayMs: 5_000,
    });
    expect(first.calls[0]?.values[3]).toBe("RETRYING");
    expect(first.calls[0]?.values[4]).toBe(5_000);
    expect(first.calls[0]?.query).toContain("clock_timestamp()");
    expect(first.calls[0]?.values).not.toContainEqual(expect.any(Date));
    expect(first.calls[0]?.query).toContain('::"FeedbackProcessingStatus"');

    const third = fakeDatabase([[{ applied: 1 }]]);
    const thirdStore = new PostgresGenerationJobStore(() => third.database);
    await expect(
      thirdStore.fail(
        { ...claim, attempt: 3 },
        { code: "PROVIDER_TIMEOUT", message: null, retryable: true },
      ),
    ).resolves.toMatchObject({
      applied: true,
      status: "DEAD_LETTERED",
      availableAt: null,
    });
    expect(third.calls[0]?.values[3]).toBe("DEAD_LETTERED");
  });

  it("synchronizes linked feedback on success and supersession", async () => {
    const completed = fakeDatabase([[{ applied: 1 }]]);
    const completedStore = new PostgresGenerationJobStore(
      () => completed.database,
    );
    await expect(
      completedStore.complete(claim, { outcome: "REPLACED" }),
    ).resolves.toBe(true);
    expect(completed.calls[0]?.query).toContain(
      "processing_status = 'PROCESSED'",
    );
    expect(completed.calls[0]?.query).toContain("processed_at = job_clock.now");
    expect(completed.calls[0]?.query).toContain("clock_timestamp()");
    expect(completed.calls[0]?.values).not.toContainEqual(expect.any(Date));

    const superseded = fakeDatabase([[{ applied: 1 }]]);
    const supersededStore = new PostgresGenerationJobStore(
      () => superseded.database,
    );
    await expect(
      supersededStore.supersede(claim, { outcome: "SUPERSEDED" }),
    ).resolves.toBe(true);
    expect(superseded.calls[0]?.query).toContain(
      "processing_status = 'SUPERSEDED'",
    );
  });

  it("recovers expired leases with bounded retry/dead-letter counts", async () => {
    const { calls, database } = fakeDatabase([
      [{ recovered: 2, deadLettered: 1 }],
    ]);
    const store = new PostgresGenerationJobStore(() => database);

    await expect(store.recoverExpiredClaims()).resolves.toEqual({
      recovered: 2,
      deadLettered: 1,
    });
    expect(calls[0]?.query).toContain("status = 'ABANDONED'");
    expect(calls[0]?.query).toContain("FOR UPDATE OF job SKIP LOCKED");
    expect(calls[0]?.query).toContain("INTERVAL '5 seconds'");
    expect(calls[0]?.query).toContain("INTERVAL '20 seconds'");
    expect(calls[0]?.query).toContain("INTERVAL '60 seconds'");
    expect(calls[0]?.query).toContain('::"FeedbackProcessingStatus"');
    expect(calls[0]?.query).toContain("clock_timestamp()");
    expect(calls[0]?.query).toContain("job.lease_expires_at <= job_clock.now");
    expect(calls[0]?.values).toEqual([]);
  });

  it("rejects out-of-range progress before touching PostgreSQL", async () => {
    const { database } = fakeDatabase([]);
    const store = new PostgresGenerationJobStore(() => database);

    await expect(
      store.reportProgress({
        claim,
        type: "VALIDATING_ITINERARY",
        progress: 100,
      }),
    ).rejects.toThrow(/0 to 99/);
    expect(database.$queryRawUnsafe).not.toHaveBeenCalled();
  });
});

import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { PostgresGenerationJobStore } from "./postgres-store";

const integrationDatabaseUrl =
  process.env.ADAPTATION_TEST_DATABASE_URL?.trim() ?? "";
const describeWithPostgres = integrationDatabaseUrl ? describe : describe.skip;
const client = integrationDatabaseUrl
  ? new PrismaClient({
      adapter: new PrismaPg(integrationDatabaseUrl),
    })
  : null;

describeWithPostgres("PostgresGenerationJobStore integration", () => {
  let userId = "";
  let tripId = "";

  beforeEach(async () => {
    userId = `job_test_user_${randomUUID()}`;
    tripId = `job_test_trip_${randomUUID()}`;
    await client!.user.create({
      data: {
        id: userId,
        email: `${userId}@example.invalid`,
        trips: {
          create: {
            id: tripId,
            title: "Disposable queue integration trip",
          },
        },
      },
    });
  });

  afterEach(async () => {
    if (!client) return;

    if (userId) {
      await client.user.deleteMany({
        where: {
          id: userId,
        },
      });
    }
  });

  afterAll(async () => {
    if (!client) return;

    await client.$disconnect();
  });

  async function createPendingJob(index: number) {
    const operationId = randomUUID();

    return client!.generationJob.create({
      data: {
        tripId,
        type: "PROCESS_FEEDBACK_EVENT",
        idempotencyKey: `integration:${operationId}`,
        tripVersion: 1,
        payload: {
          feedbackId: `feedback_${index}`,
          operationId,
          tripVersion: 1,
          preferenceProfileVersionId: null,
          parentItineraryVersionId: null,
        },
      },
    });
  }

  it("lets two atomic claimers take different jobs", async () => {
    await Promise.all([createPendingJob(1), createPendingJob(2)]);
    const store = new PostgresGenerationJobStore(() => client!);
    const [left, right] = await Promise.all([
      store.claimNext({ workerId: `left_${randomUUID()}` }),
      store.claimNext({ workerId: `right_${randomUUID()}` }),
    ]);

    expect(left).not.toBeNull();
    expect(right).not.toBeNull();
    expect(left?.id).not.toBe(right?.id);
    expect(new Set([left?.id, right?.id]).size).toBe(2);
  });

  it("lets only one of two atomic claimers take a single job", async () => {
    const pending = await createPendingJob(1);
    const store = new PostgresGenerationJobStore(() => client!);
    const claims = await Promise.all([
      store.claimNext({ workerId: `left_${randomUUID()}` }),
      store.claimNext({ workerId: `right_${randomUUID()}` }),
    ]);
    const claimed = claims.filter((item) => item !== null);

    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.id).toBe(pending.id);
  });

  it("recovers an expired lease without losing the job", async () => {
    await createPendingJob(1);
    const store = new PostgresGenerationJobStore(() => client!);
    const claimed = await store.claimNext({
      workerId: `recovery_${randomUUID()}`,
      leaseDurationMs: 1,
    });

    expect(claimed).not.toBeNull();
    await client!.$queryRawUnsafe(
      "SELECT pg_sleep(0.01)::text AS slept",
    );
    await expect(store.recoverExpiredClaims()).resolves.toMatchObject({
      recovered: 1,
      deadLettered: 0,
    });
    await expect(
      client!.generationJob.findUniqueOrThrow({
        where: {
          id: claimed!.id,
        },
        select: {
          status: true,
          workerId: true,
          leaseExpiresAt: true,
          attempts: {
            select: {
              status: true,
            },
          },
        },
      }),
    ).resolves.toMatchObject({
      status: "RETRYING",
      workerId: null,
      leaseExpiresAt: null,
      attempts: [{ status: "ABANDONED" }],
    });
  });

  it("safely releases a shutdown-race claim without processing it", async () => {
    await createPendingJob(1);
    const store = new PostgresGenerationJobStore(() => client!);
    const claimed = await store.claimNext({
      workerId: `shutdown_${randomUUID()}`,
    });

    expect(claimed).not.toBeNull();
    await expect(store.release(claimed!)).resolves.toBe(true);
    await expect(store.release(claimed!)).resolves.toBe(false);
    await expect(
      client!.generationJob.findUniqueOrThrow({
        where: { id: claimed!.id },
        select: {
          status: true,
          workerId: true,
          leaseExpiresAt: true,
          attempts: {
            select: {
              status: true,
            },
          },
        },
      }),
    ).resolves.toMatchObject({
      status: "RETRYING",
      workerId: null,
      leaseExpiresAt: null,
      attempts: [{ status: "ABANDONED" }],
    });
  });

  it("preserves execution capacity when the nominal final claim is repeatedly released", async () => {
    const pending = await createPendingJob(1);
    await client!.generationJob.update({
      where: { id: pending.id },
      data: {
        attemptCount: 2,
        maxAttempts: 3,
      },
    });
    const store = new PostgresGenerationJobStore(() => client!);

    const nominalFinal = await store.claimNext({
      workerId: `shutdown_final_${randomUUID()}`,
    });
    expect(nominalFinal).toMatchObject({
      id: pending.id,
      attempt: 3,
      maxAttempts: 3,
    });
    await expect(store.release(nominalFinal!)).resolves.toBe(true);

    const replacementClaim = await store.claimNext({
      workerId: `shutdown_repeated_${randomUUID()}`,
    });
    expect(replacementClaim).toMatchObject({
      id: pending.id,
      attempt: 4,
      maxAttempts: 4,
    });
    await expect(store.release(replacementClaim!)).resolves.toBe(true);

    const executableClaim = await store.claimNext({
      workerId: `execution_${randomUUID()}`,
    });
    expect(executableClaim).toMatchObject({
      id: pending.id,
      attempt: 5,
      maxAttempts: 5,
    });
    await expect(
      client!.generationJob.findUniqueOrThrow({
        where: { id: pending.id },
        select: {
          attemptCount: true,
          maxAttempts: true,
          attempts: {
            orderBy: { attempt: "asc" },
            select: {
              attempt: true,
              status: true,
              errorCode: true,
            },
          },
        },
      }),
    ).resolves.toEqual({
      attemptCount: 5,
      maxAttempts: 5,
      attempts: [
        {
          attempt: 3,
          status: "ABANDONED",
          errorCode: "WORKER_SHUTDOWN",
        },
        {
          attempt: 4,
          status: "ABANDONED",
          errorCode: "WORKER_SHUTDOWN",
        },
        {
          attempt: 5,
          status: "RUNNING",
          errorCode: null,
        },
      ],
    });
  });
});

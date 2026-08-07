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

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const databaseGeneratedIdTables = [
  "accounts",
  "conflicts",
  "generation_jobs",
  "itinerary_city_windows",
  "itinerary_days",
  "itinerary_items",
  "itinerary_versions",
  "job_attempts",
  "job_events",
  "place_suggestions",
  "planning_events",
  "planning_feedback",
  "planning_mutations",
  "preference_profile_versions",
  "sessions",
  "trip_destinations",
  "trip_preferences",
  "trip_travel_segments",
  "trips",
  "user_travel_preferences",
  "users",
] as const;

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

  it("keeps database UUID defaults on every generated primary key", async () => {
    const rows = await client!.$queryRaw<
      Array<{ column_default: string | null; table_name: string }>
    >`
      SELECT table_name, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'id'
        AND table_name <> '_prisma_migrations'
      ORDER BY table_name
    `;

    expect(rows.map((row) => row.table_name)).toEqual(
      [...databaseGeneratedIdTables].sort(),
    );
    expect(
      rows.every((row) => row.column_default?.includes("gen_random_uuid()")),
    ).toBe(true);
  });

  it("returns database-generated IDs from a nested create", async () => {
    const email = `generated_${randomUUID()}@example.invalid`;
    const created = await client!.user.create({
      data: {
        email,
        trips: {
          create: {
            destinations: {
              create: {
                city: "Paris",
                country: "France",
              },
            },
            title: "Database-generated ID trip",
          },
        },
      },
      select: {
        id: true,
        trips: {
          select: {
            destinations: { select: { id: true } },
            id: true,
          },
        },
      },
    });

    try {
      expect(created.id).toMatch(uuidPattern);
      expect(created.trips[0]?.id).toMatch(uuidPattern);
      expect(created.trips[0]?.destinations[0]?.id).toMatch(uuidPattern);
    } finally {
      await client!.user.delete({ where: { id: created.id } });
    }
  });

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

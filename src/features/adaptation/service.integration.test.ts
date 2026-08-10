import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const integrationDatabaseUrl =
  process.env.ADAPTATION_TEST_DATABASE_URL?.trim() ?? "";
const describeWithPostgres = integrationDatabaseUrl ? describe : describe.skip;
const client = integrationDatabaseUrl
  ? new PrismaClient({ adapter: new PrismaPg(integrationDatabaseUrl) })
  : null;
const previousDatabaseUrl = process.env.DATABASE_URL;

describeWithPostgres("immediate adaptive removal integration", () => {
  let userId = "";
  let tripId = "";
  let targetItemId = "";
  let sourceItineraryVersionId = "";
  let captureItineraryItemFeedback:
    | (typeof import("./service"))["captureItineraryItemFeedback"]
    | null = null;

  beforeAll(async () => {
    process.env.DATABASE_URL = integrationDatabaseUrl;
    ({ captureItineraryItemFeedback } = await import("./service"));
  });

  beforeEach(async () => {
    const user = await client!.user.create({
      data: {
        email: `adaptive_remove_${randomUUID()}@example.invalid`,
      },
    });
    userId = user.id;
    const trip = await client!.trip.create({
      data: {
        userId,
        title: "Disposable immediate removal trip",
        status: "PLANNING",
        startDate: new Date("2026-08-01T00:00:00.000Z"),
        endDate: new Date("2026-08-02T00:00:00.000Z"),
        budgetAmount: 500,
        budgetCurrency: "USD",
        preference: {
          create: {
            pace: "BALANCED",
            interests: ["CULTURE"],
          },
        },
      },
    });
    tripId = trip.id;
    const destination = await client!.tripDestination.create({
      data: {
        tripId,
        city: "Bogota",
        country: "Colombia",
      },
    });
    const suggestions = await Promise.all(
      [
        ["Premium Museum", "museum"],
        ["City Walk", "walk"],
        ["Botanical Garden", "garden"],
      ].map(([name, providerPlaceId]) =>
        client!.placeSuggestion.create({
          data: {
            tripId,
            destinationId: destination.id,
            provider: "MOCK",
            providerPlaceId,
            category: "ACTIVITY",
            status: "SELECTED",
            name,
            city: "Bogota",
            country: "Colombia",
            estimatedCostAmount: name === "Premium Museum" ? 100 : 25,
            estimatedCostCurrency: "USD",
          },
        }),
      ),
    );
    const preferenceVersion = await client!.preferenceProfileVersion.create({
      data: {
        tripId,
        version: 1,
        snapshot: {
          schemaVersion: 1,
          interests: {},
          priceSensitivity: {
            weight: 0.4,
            confidence: 0.4,
            source: "INFERRED",
            observedAt: "2026-08-01T00:00:00.000Z",
          },
          pace: {
            value: "BALANCED",
            confidence: 1,
            source: "EXPLICIT",
            observedAt: "2026-08-01T00:00:00.000Z",
          },
        },
      },
    });
    const itineraryVersion = await client!.itineraryVersion.create({
      data: {
        tripId,
        version: 1,
        preferenceProfileVersionId: preferenceVersion.id,
        status: "ACTIVE",
        changeScope: "INITIAL",
        activatedAt: new Date(),
      },
    });
    sourceItineraryVersionId = itineraryVersion.id;
    const firstDay = await client!.itineraryDay.create({
      data: {
        tripId,
        itineraryVersionId: itineraryVersion.id,
        dayNumber: 1,
        title: "Day 1",
        estimatedCostAmount: 125,
        estimatedCostCurrency: "USD",
      },
    });
    const secondDay = await client!.itineraryDay.create({
      data: {
        tripId,
        itineraryVersionId: itineraryVersion.id,
        dayNumber: 2,
        title: "Day 2 preserved",
        notes: "Unrelated content",
        estimatedCostAmount: 25,
        estimatedCostCurrency: "USD",
      },
    });
    const target = await client!.itineraryItem.create({
      data: {
        tripId,
        dayId: firstDay.id,
        placeSuggestionId: suggestions[0].id,
        title: suggestions[0].name,
        sortOrder: 0,
        estimatedCostAmount: 100,
        estimatedCostCurrency: "USD",
      },
    });
    targetItemId = target.id;
    await client!.itineraryItem.createMany({
      data: [
        {
          tripId,
          dayId: firstDay.id,
          placeSuggestionId: suggestions[1].id,
          title: suggestions[1].name,
          sortOrder: 1,
          estimatedCostAmount: 25,
          estimatedCostCurrency: "USD",
        },
        {
          tripId,
          dayId: secondDay.id,
          placeSuggestionId: suggestions[2].id,
          title: suggestions[2].name,
          sortOrder: 0,
          estimatedCostAmount: 25,
          estimatedCostCurrency: "USD",
        },
      ],
    });
    await client!.trip.update({
      where: { id: tripId },
      data: {
        activePreferenceProfileVersionId: preferenceVersion.id,
        activeItineraryVersionId: itineraryVersion.id,
      },
    });
  });

  afterEach(async () => {
    if (userId) {
      await client!.user.deleteMany({ where: { id: userId } });
    }
  });

  afterAll(async () => {
    const { disconnectDb } = await import("@/lib/db");
    await disconnectDb();
    await client?.$disconnect();
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
  });

  it("atomically removes one item, versions preferences, and replays safely", async () => {
    const operationId = randomUUID();
    const control = {
      expectedRevision: 0,
      operationId,
      mutationKind: "itinerary_item_feedback" as const,
      requestFingerprint: "a".repeat(64),
    };
    const first = await captureItineraryItemFeedback!(
      userId,
      tripId,
      targetItemId,
      {
        action: "REJECT",
        reason: "TOO_EXPENSIVE",
      },
      control,
    );

    expect(first).toMatchObject({
      status: "removed",
      revision: 1,
      affectedDay: 1,
      preferenceDelta: {
        field: "priceSensitivity",
      },
    });
    const persisted = await client!.trip.findUniqueOrThrow({
      where: { id: tripId },
      select: {
        planningRevision: true,
        activePreferenceProfileVersion: {
          select: { version: true, snapshot: true },
        },
        activeItineraryVersion: {
          select: {
            version: true,
            days: {
              select: {
                dayNumber: true,
                title: true,
                notes: true,
                items: {
                  select: { title: true },
                  orderBy: { sortOrder: "asc" },
                },
              },
              orderBy: { dayNumber: "asc" },
            },
          },
        },
      },
    });

    expect(persisted.planningRevision).toBe(1);
    expect(persisted.activePreferenceProfileVersion?.version).toBe(2);
    expect(persisted.activePreferenceProfileVersion?.snapshot).toMatchObject({
      priceSensitivity: {
        weight: 0.5,
        confidence: 0.5,
      },
    });
    expect(persisted.activeItineraryVersion).toMatchObject({
      version: 2,
      days: [
        { dayNumber: 1, items: [{ title: "City Walk" }] },
        {
          dayNumber: 2,
          title: "Day 2 preserved",
          notes: "Unrelated content",
          items: [{ title: "Botanical Garden" }],
        },
      ],
    });
    expect(await client!.generationJob.count({ where: { tripId } })).toBe(0);
    expect(
      await client!.planningFeedback.count({
        where: { tripId, processingStatus: "PROCESSED" },
      }),
    ).toBe(1);
    expect(
      await client!.itineraryVersion.findUniqueOrThrow({
        where: { id: sourceItineraryVersionId },
        select: { status: true },
      }),
    ).toEqual({ status: "SUPERSEDED" });

    await expect(
      captureItineraryItemFeedback!(
        userId,
        tripId,
        targetItemId,
        { action: "REJECT", reason: "TOO_EXPENSIVE" },
        control,
      ),
    ).resolves.toEqual(first);
    expect(await client!.planningFeedback.count({ where: { tripId } })).toBe(1);
    expect(await client!.itineraryVersion.count({ where: { tripId } })).toBe(2);
  });
});

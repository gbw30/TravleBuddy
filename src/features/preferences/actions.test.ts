import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    $transaction: vi.fn(),
  },
  tx: {
    $queryRawUnsafe: vi.fn(),
    trip: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    tripPreference: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    preferenceProfileVersion: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    planningEvent: {
      create: vi.fn(),
    },
    userTravelPreference: {
      upsert: vi.fn(),
    },
  },
  auth: {
    requireUser: vi.fn(),
  },
  itinerary: {
    rebuildItineraryDraftForTripTx: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({
  db: mocks.db,
}));

vi.mock("@/lib/authorization", () => ({
  requireUser: mocks.auth.requireUser,
}));

vi.mock("@/features/itinerary/builder", () => ({
  rebuildItineraryDraftForTripTx:
    mocks.itinerary.rebuildItineraryDraftForTripTx,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`redirect:${destination}`);
  }),
}));

import { saveTripPreference } from "./actions";

function trip(overrides: Record<string, unknown> = {}) {
  return {
    id: "trip_1",
    userId: "user_1",
    title: "Barcelona",
    status: "PLANNING",
    startDate: new Date("2026-07-01T00:00:00.000Z"),
    endDate: new Date("2026-07-07T00:00:00.000Z"),
    budgetAmount: "1500",
    budgetCurrency: "EUR",
    destinations: [{ city: "Barcelona", country: "Spain" }],
    preference: { pace: "BALANCED" },
    ...overrides,
  };
}

const preferenceInput = {
  budgetLevel: "MODERATE",
  pace: "BALANCED",
  interests: ["FOOD", "ART"],
  transportationModes: ["WALKING"],
  accommodationTypes: ["HOTEL"],
  hotelPriority: 7,
  walkingToleranceKm: 8.5,
  dietaryRestrictions: ["vegetarian"],
  accessibilityNeeds: ["step-free access"],
  mustAvoid: ["crowded clubs"],
  customNotes: "Keep afternoons flexible.",
  customPreferences: ["quiet mornings", "local markets"],
};

describe("preference actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.$transaction.mockImplementation((callback) => callback(mocks.tx));
    mocks.tx.trip.findFirst.mockResolvedValue(trip());
    mocks.tx.trip.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.trip.findUniqueOrThrow.mockResolvedValue({ planningRevision: 1 });
    mocks.tx.trip.update.mockResolvedValue({ id: "trip_1" });
    mocks.tx.preferenceProfileVersion.findFirst.mockResolvedValue(null);
    mocks.tx.preferenceProfileVersion.create.mockResolvedValue({
      id: "preference_version_1",
      version: 1,
    });
    mocks.tx.tripPreference.findUnique.mockResolvedValue(null);
    mocks.tx.tripPreference.upsert.mockResolvedValue({
      id: "preference_1",
      tripId: "trip_1",
      ...preferenceInput,
      walkingToleranceKm: {
        toString: () => "8.5",
      },
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      metadata: null,
    });
    mocks.itinerary.rebuildItineraryDraftForTripTx.mockResolvedValue({
      status: "rebuilt",
      itinerary: {
        days: [],
        totals: {
          itemCount: 0,
          estimatedCostAmount: null,
          estimatedCostCurrency: null,
        },
      },
    });
  });

  it("creates a preference profile for an owned planning-ready trip", async () => {
    const result = await saveTripPreference(
      "user_1",
      "trip_1",
      preferenceInput,
    );

    expect(result.status).toBe("saved");
    expect(mocks.tx.trip.updateMany).toHaveBeenCalledOnce();
    expect(mocks.tx.tripPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tripId: "trip_1" },
        create: expect.objectContaining({
          tripId: "trip_1",
          pace: "BALANCED",
          interests: ["FOOD", "ART"],
        }),
        update: expect.objectContaining({
          budgetLevel: "MODERATE",
          transportationModes: ["WALKING"],
          metadata: {
            customPreferences: ["quiet mornings", "local markets"],
          },
        }),
      }),
    );
  });

  it("marks the result as updated when a profile already exists", async () => {
    mocks.tx.tripPreference.findUnique.mockResolvedValue({
      id: "preference_1",
    });

    const result = await saveTripPreference(
      "user_1",
      "trip_1",
      preferenceInput,
    );

    expect(result).toMatchObject({
      status: "saved",
      operation: "updated",
    });
  });

  it("blocks non-owned, archived, and not-ready trips", async () => {
    mocks.tx.trip.findFirst.mockResolvedValueOnce(null);
    await expect(
      saveTripPreference("user_1", "trip_2", preferenceInput),
    ).resolves.toEqual({ status: "not_found" });

    mocks.tx.trip.findFirst.mockResolvedValueOnce(trip({ status: "ARCHIVED" }));
    await expect(
      saveTripPreference("user_1", "trip_1", preferenceInput),
    ).resolves.toEqual({ status: "archived" });

    mocks.tx.trip.findFirst.mockResolvedValueOnce(
      trip({
        status: "DRAFT",
        startDate: null,
        endDate: null,
        budgetAmount: null,
        budgetCurrency: null,
        destinations: [],
        preference: null,
      }),
    );
    await expect(
      saveTripPreference("user_1", "trip_1", preferenceInput),
    ).resolves.toMatchObject({
      status: "not_ready",
      missingRequirements: expect.arrayContaining(["at least one destination"]),
    });
    expect(mocks.tx.trip.updateMany).not.toHaveBeenCalled();
  });

  it("writes a summary planning event after saving", async () => {
    await saveTripPreference("user_1", "trip_1", preferenceInput);

    expect(mocks.tx.planningEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tripId: "trip_1",
        actor: "SYSTEM",
        type: "SYSTEM_NOTE",
        visibleToUser: true,
        metadata: expect.objectContaining({
          operation: "created",
          interestCount: 2,
          transportationModeCount: 1,
          customPreferenceCount: 2,
        }),
      }),
    });
  });

  it("extracts saved trip preferences into the user travel profile", async () => {
    await saveTripPreference("user_1", "trip_1", preferenceInput);

    expect(mocks.tx.userTravelPreference.upsert).toHaveBeenCalledWith({
      where: {
        userId: "user_1",
      },
      update: expect.objectContaining({
        pace: "BALANCED",
        interests: ["FOOD", "ART"],
        customPreferences: ["quiet mornings", "local markets"],
        metadata: {
          sourceTripId: "trip_1",
          source: "trip_preference",
        },
      }),
      create: expect.objectContaining({
        userId: "user_1",
        budgetLevel: "MODERATE",
        transportationModes: ["WALKING"],
      }),
    });
  });

  it("rebuilds the itinerary when saved trip pace changes", async () => {
    mocks.tx.trip.findFirst.mockResolvedValue(
      trip({
        preference: {
          pace: "RELAXED",
        },
      }),
    );

    await saveTripPreference("user_1", "trip_1", {
      ...preferenceInput,
      pace: "PACKED",
    });

    expect(mocks.itinerary.rebuildItineraryDraftForTripTx).toHaveBeenCalledWith(
      mocks.tx,
      "trip_1",
      expect.objectContaining({
        operationId: expect.any(String),
        tripId: "trip_1",
      }),
    );
  });
});

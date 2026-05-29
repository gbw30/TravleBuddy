import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    $transaction: vi.fn(),
    trip: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    userTravelPreference: {
      findUnique: vi.fn(),
    },
  },
  tx: {
    trip: {
      findFirst: vi.fn(),
      update: vi.fn(),
      findFirstOrThrow: vi.fn(),
      deleteMany: vi.fn(),
    },
    tripDestination: {
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    tripPreference: {
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({
  db: mocks.db,
}));

vi.mock("@/lib/authorization", () => ({
  requireUser: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`redirect:${destination}`);
  }),
}));

import { createTrip, deleteTrip, updateTrip } from "./actions";

function trip(overrides: Record<string, unknown> = {}) {
  return {
    id: "trip_1",
    userId: "user_1",
    title: "Draft trip",
    status: "DRAFT",
    destinationSearchText: null,
    startDate: null,
    endDate: null,
    budgetAmount: null,
    budgetCurrency: null,
    departureCity: null,
    departureCountry: null,
    departureTimeZone: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    destinations: [],
    preference: null,
    ...overrides,
  };
}

describe("trip actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.$transaction.mockImplementation((callback) => callback(mocks.tx));
  });

  it("creates a draft trip for the authenticated user", async () => {
    mocks.db.trip.create.mockResolvedValue(trip({ title: "Summer trip" }));

    const result = await createTrip("user_1", {
      intent: "draft",
      title: "Summer trip",
      destinations: [{ city: "Barcelona", country: "Spain" }],
      startDate: "2026-07-01",
      endDate: "2026-07-07",
      budgetAmount: "1200",
      budgetCurrency: "EUR",
      travelStyle: "BALANCED",
    });

    expect(mocks.db.trip.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user_1",
          title: "Summer trip",
          status: "DRAFT",
        }),
      }),
    );
    expect(result.status).toBe("DRAFT");
  });

  it("creates a planning trip with ordered destinations when continuing", async () => {
    mocks.db.trip.create.mockResolvedValue(
      trip({
        title: "European route",
        status: "PLANNING",
        departureCity: "Bogota",
        departureCountry: "Colombia",
        departureTimeZone: "America/Bogota",
        startDate: new Date("2026-07-01T00:00:00.000Z"),
        endDate: new Date("2026-07-20T00:00:00.000Z"),
        budgetAmount: "3200",
        budgetCurrency: "EUR",
        destinations: [
          {
            id: "destination_1",
            city: "Barcelona",
            country: "Spain",
            region: null,
            sortOrder: 0,
            timeZone: "Europe/Madrid",
          },
          {
            id: "destination_2",
            city: "Madrid",
            country: "Spain",
            region: null,
            sortOrder: 1,
            timeZone: "Europe/Madrid",
          },
        ],
        preference: {
          pace: "BALANCED",
        },
      }),
    );

    const result = await createTrip("user_1", {
      intent: "continue",
      title: "European route",
      departureCity: "Bogota",
      departureCountry: "Colombia",
      destinations: [
        { city: "Barcelona", country: "Spain" },
        { city: "Madrid", country: "Spain" },
      ],
      startDate: "2026-07-01",
      endDate: "2026-07-20",
      budgetAmount: "3200",
      budgetCurrency: "EUR",
      travelStyle: "BALANCED",
    });

    expect(mocks.db.trip.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          departureCity: "Bogota",
          departureCountry: "Colombia",
          departureTimeZone: "America/Bogota",
          destinationSearchText: "Barcelona, Spain -> Madrid, Spain",
          status: "PLANNING",
          destinations: {
            create: [
              {
                city: "Barcelona",
                country: "Spain",
                sortOrder: 0,
                timeZone: "Europe/Madrid",
              },
              {
                city: "Madrid",
                country: "Spain",
                sortOrder: 1,
                timeZone: "Europe/Madrid",
              },
            ],
          },
          preference: {
            create: {
              pace: "BALANCED",
            },
          },
        }),
      }),
    );
    expect(result.status).toBe("PLANNING");
  });

  it("uses saved profile preferences when creating a new trip with autofill enabled", async () => {
    mocks.db.userTravelPreference.findUnique.mockResolvedValue({
      budgetLevel: "MODERATE",
      pace: "PACKED",
      interests: ["FOOD", "ART"],
      transportationModes: ["WALKING"],
      accommodationTypes: ["HOTEL"],
      hotelPriority: 8,
      walkingToleranceKm: { toString: () => "7.5" },
      dietaryRestrictions: ["vegetarian"],
      accessibilityNeeds: [],
      mustAvoid: ["crowds"],
      customPreferences: ["quiet mornings"],
      metadata: {
        sourceTripId: "trip_1",
      },
    });
    mocks.db.trip.create.mockResolvedValue(
      trip({
        title: "Profile-backed trip",
        preference: {
          pace: "PACKED",
        },
      }),
    );

    await createTrip("user_1", {
      intent: "draft",
      title: "Profile-backed trip",
      useProfilePreferences: true,
    });

    expect(mocks.db.userTravelPreference.findUnique).toHaveBeenCalledWith({
      where: {
        userId: "user_1",
      },
    });
    expect(mocks.db.trip.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          preference: {
            create: expect.objectContaining({
              pace: "PACKED",
              budgetLevel: "MODERATE",
              interests: ["FOOD", "ART"],
              metadata: {
                customPreferences: ["quiet mornings"],
                source: "user_travel_preference",
              },
            }),
          },
        }),
      }),
    );
  });

  it("allows duplicate trip titles by using generated ids as keys", async () => {
    mocks.db.trip.create.mockResolvedValue(trip({ title: "Summer trip" }));

    await createTrip("user_1", { title: "Summer trip" });
    await createTrip("user_1", { title: "Summer trip" });

    expect(mocks.db.trip.create).toHaveBeenCalledTimes(2);
  });

  it("returns not_found when updating a trip not owned by the user", async () => {
    mocks.tx.trip.findFirst.mockResolvedValue(null);

    await expect(
      updateTrip("user_1", "trip_2", { title: "Nope" }),
    ).resolves.toEqual({ status: "not_found" });
  });

  it("refuses to update archived trips", async () => {
    mocks.tx.trip.findFirst.mockResolvedValue(
      trip({
        status: "ARCHIVED",
      }),
    );

    await expect(
      updateTrip("user_1", "trip_1", { title: "Revive me" }),
    ).resolves.toEqual({ status: "archived" });
    expect(mocks.tx.trip.update).not.toHaveBeenCalled();
  });

  it("derives planning status when an owned trip becomes complete", async () => {
    mocks.tx.trip.findFirst.mockResolvedValue(trip());
    mocks.tx.trip.findFirstOrThrow.mockResolvedValue(
      trip({
        title: "Complete trip",
        startDate: new Date("2026-07-01T00:00:00.000Z"),
        endDate: new Date("2026-07-07T00:00:00.000Z"),
        budgetAmount: "1500",
        budgetCurrency: "USD",
        destinations: [
          {
            id: "destination_1",
            city: "Paris",
            country: "France",
            region: null,
            sortOrder: 0,
            timeZone: "Europe/Paris",
          },
        ],
      }),
    );
    mocks.tx.trip.update.mockResolvedValue(
      trip({
        title: "Complete trip",
        status: "PLANNING",
        startDate: new Date("2026-07-01T00:00:00.000Z"),
        endDate: new Date("2026-07-07T00:00:00.000Z"),
        budgetAmount: "1500",
        budgetCurrency: "USD",
        destinations: [
          {
            id: "destination_1",
            city: "Paris",
            country: "France",
            region: null,
            sortOrder: 0,
            timeZone: "Europe/Paris",
          },
        ],
      }),
    );

    const result = await updateTrip("user_1", "trip_1", {
      title: "Complete trip",
      destinationCity: "Paris",
      destinationCountry: "France",
      startDate: "2026-07-01",
      endDate: "2026-07-07",
      budgetAmount: "1500",
      budgetCurrency: "USD",
    });

    expect(result.status).toBe("updated");
    if (result.status === "updated") {
      expect(result.trip.status).toBe("PLANNING");
    }
  });

  it("returns not_found when deleting a non-owned trip", async () => {
    mocks.tx.trip.findFirst.mockResolvedValue(null);

    await expect(deleteTrip("user_1", "trip_2")).resolves.toEqual({
      status: "not_found",
    });
  });

  it("refuses to delete archived trips", async () => {
    mocks.tx.trip.findFirst.mockResolvedValue(trip({ status: "ARCHIVED" }));

    await expect(deleteTrip("user_1", "trip_1")).resolves.toEqual({
      status: "archived",
    });
  });
});

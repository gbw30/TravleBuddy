import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    $transaction: vi.fn(),
  },
  tx: {
    trip: {
      findFirst: vi.fn(),
    },
    tripPreference: {
      upsert: vi.fn(),
    },
    placeSuggestion: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    planningFeedback: {
      create: vi.fn(),
    },
    planningEvent: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({
  db: mocks.db,
}));

vi.mock("@/lib/authorization", () => ({
  requireUser: vi.fn(),
}));

import {
  addUserPlanningPlace,
  generateRecommendations,
  recordPlanningMessage,
  selectRecommendation,
} from "./service";

function planningTrip(overrides: Record<string, unknown> = {}) {
  return {
    id: "trip_1",
    userId: "user_1",
    status: "PLANNING",
    startDate: new Date("2026-07-01T00:00:00.000Z"),
    endDate: new Date("2026-07-07T00:00:00.000Z"),
    budgetAmount: "1500",
    budgetCurrency: "EUR",
    destinations: [
      {
        id: "destination_1",
        city: "Barcelona",
        country: "Spain",
        sortOrder: 0,
      },
    ],
    preference: {
      id: "preference_1",
      budgetLevel: "MODERATE",
      pace: "RELAXED",
      interests: ["MUSEUMS", "FOOD"],
      transportationModes: ["WALKING"],
      accommodationTypes: ["HOTEL"],
      hotelPriority: 8,
      walkingToleranceKm: { toString: () => "3" },
      dietaryRestrictions: [],
      accessibilityNeeds: [],
      mustAvoid: [],
      customNotes: null,
      metadata: {
        customPreferences: ["Quiet hotels", "Local markets"],
      },
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    ...overrides,
  };
}

describe("planning recommendation service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.$transaction.mockImplementation((callback) => callback(mocks.tx));
    mocks.tx.trip.findFirst.mockResolvedValue(planningTrip());
    mocks.tx.placeSuggestion.findMany.mockResolvedValue([]);
    mocks.tx.placeSuggestion.upsert.mockImplementation(({ create }) =>
      Promise.resolve({
        id: create.providerPlaceId,
        ...create,
        status: "PENDING",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
    );
  });

  it("records a user planning message and autosaves extracted preference chips", async () => {
    const result = await recordPlanningMessage("user_1", "trip_1", {
      topic: "HOTEL_BASE",
      message: "I want a quiet hotel near museums and local markets.",
    });

    expect(result.status).toBe("recorded");
    expect(mocks.tx.planningFeedback.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tripId: "trip_1",
        targetType: "TRIP",
        targetId: "trip_1",
        source: "USER",
        action: "REFINE",
        userNote: "I want a quiet hotel near museums and local markets.",
      }),
    });
    expect(mocks.tx.tripPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tripId: "trip_1" },
        update: expect.objectContaining({
          interests: expect.arrayContaining(["MUSEUMS"]),
          metadata: {
            customPreferences: expect.arrayContaining([
              "Quiet hotels",
              "Local markets",
            ]),
          },
        }),
      }),
    );
  });

  it("generates five topic-specific mock recommendations and writes a batch event", async () => {
    const result = await generateRecommendations("user_1", "trip_1", {
      topic: "HOTEL_BASE",
    });

    expect(result.status).toBe("generated");
    if (result.status !== "generated") {
      throw new Error("Expected recommendations to be generated.");
    }
    expect(result.recommendations).toHaveLength(5);
    expect(result.recommendations.every((item) => item.category === "HOTEL")).toBe(
      true,
    );
    expect(mocks.tx.placeSuggestion.upsert).toHaveBeenCalledTimes(5);
    expect(mocks.tx.planningEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tripId: "trip_1",
        actor: "ENGINE",
        type: "RECOMMENDATION_BATCH",
        visibleToUser: true,
      }),
    });
  });

  it("saves user-entered places as selected anchors", async () => {
    mocks.tx.placeSuggestion.create.mockResolvedValue({
      id: "anchor_1",
      tripId: "trip_1",
      provider: "USER",
      providerPlaceId: null,
      category: "ATTRACTION",
      status: "SELECTED",
      name: "Sagrada Familia",
      description: null,
      explanation: "Added by you as an already-decided place.",
      address: null,
      city: "Barcelona",
      country: "Spain",
      latitude: null,
      longitude: null,
      rating: null,
      priceLevel: null,
      estimatedCostAmount: null,
      estimatedCostCurrency: null,
      score: null,
      rawProviderData: null,
      metadata: { topic: "ACTIVITIES" },
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const result = await addUserPlanningPlace("user_1", "trip_1", {
      topic: "ACTIVITIES",
      name: "Sagrada Familia",
      category: "ATTRACTION",
      city: "Barcelona",
      country: "Spain",
    });

    expect(result.status).toBe("saved");
    expect(mocks.tx.placeSuggestion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: "USER",
          status: "SELECTED",
          name: "Sagrada Familia",
        }),
      }),
    );
  });

  it("selects an owned recommendation and stores feedback", async () => {
    mocks.tx.placeSuggestion.findFirst.mockResolvedValue({
      id: "suggestion_1",
      tripId: "trip_1",
      status: "PENDING",
    });

    const result = await selectRecommendation("user_1", "trip_1", {
      suggestionId: "suggestion_1",
    });

    expect(result.status).toBe("selected");
    expect(mocks.tx.placeSuggestion.updateMany).toHaveBeenCalledWith({
      where: {
        id: "suggestion_1",
        tripId: "trip_1",
      },
      data: {
        status: "SELECTED",
      },
    });
    expect(mocks.tx.planningFeedback.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        targetType: "PLACE_SUGGESTION",
        placeSuggestionId: "suggestion_1",
        action: "SELECT",
      }),
    });
  });
});

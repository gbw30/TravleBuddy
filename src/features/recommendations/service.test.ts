import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    $transaction: vi.fn(),
  },
  auth: {
    requireUser: vi.fn(),
  },
  nextCache: {
    revalidatePath: vi.fn(),
    refresh: vi.fn(),
  },
  nextNavigation: {
    redirect: vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    }),
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
      findMany: vi.fn(),
    },
    planningEvent: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
  itinerary: {
    rebuildItineraryDraftForTripTx: vi.fn(),
    getPersistedItineraryForTripTx: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({
  db: mocks.db,
}));

vi.mock("@/lib/authorization", () => ({
  requireUser: mocks.auth.requireUser,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.nextCache.revalidatePath,
  refresh: mocks.nextCache.refresh,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.nextNavigation.redirect,
}));

vi.mock("@/features/itinerary/builder", () => ({
  rebuildItineraryDraftForTripTx: mocks.itinerary.rebuildItineraryDraftForTripTx,
  getPersistedItineraryForTripTx: mocks.itinerary.getPersistedItineraryForTripTx,
}));

import {
  addUserPlanningPlace,
  getPlanningWorkspace,
  generateRecommendations,
  recordPlanningMessage,
  deselectRecommendation,
  rejectRecommendation,
  selectRecommendation,
  selectRecommendationFormAction,
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
    mocks.auth.requireUser.mockResolvedValue("user_1");
    mocks.tx.trip.findFirst.mockResolvedValue(planningTrip());
    mocks.tx.placeSuggestion.findMany.mockResolvedValue([]);
    mocks.tx.planningFeedback.findMany.mockResolvedValue([]);
    mocks.tx.planningEvent.findMany.mockResolvedValue([]);
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
    mocks.itinerary.getPersistedItineraryForTripTx.mockResolvedValue({
      days: [],
      totals: {
        itemCount: 0,
        estimatedCostAmount: null,
        estimatedCostCurrency: null,
      },
    });
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

  it("rebuilds the itinerary when extracted planning feedback changes pace", async () => {
    const result = await recordPlanningMessage("user_1", "trip_1", {
      topic: "BUDGET_PACE",
      message: "Make this a packed schedule with as much as possible.",
    });

    expect(result.status).toBe("recorded");
    expect(mocks.itinerary.rebuildItineraryDraftForTripTx).toHaveBeenCalledWith(
      mocks.tx,
      "trip_1",
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

  it("generates recommendations for the selected trip destination", async () => {
    mocks.tx.trip.findFirst.mockResolvedValue(
      planningTrip({
        destinations: [
          {
            id: "destination_1",
            city: "Barcelona",
            country: "Spain",
            sortOrder: 0,
          },
          {
            id: "destination_2",
            city: "Madrid",
            country: "Spain",
            sortOrder: 1,
          },
        ],
      }),
    );

    const result = await generateRecommendations("user_1", "trip_1", {
      topic: "ACTIVITIES",
      destinationId: "destination_2",
      planningDayNumber: 2,
    });

    expect(result.status).toBe("generated");
    expect(mocks.tx.placeSuggestion.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          destinationId: "destination_2",
          city: "Madrid",
          country: "Spain",
          metadata: expect.objectContaining({
            destinationId: "destination_2",
            planningDayNumber: 2,
          }),
        }),
      }),
    );
    expect(mocks.tx.planningEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          destinationId: "destination_2",
          planningDayNumber: 2,
        }),
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
      estimatedCostAmount: 65,
      estimatedCostCurrency: "EUR",
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
      estimatedCostAmount: 65,
      estimatedCostCurrency: "EUR",
    });

    expect(result.status).toBe("saved");
    expect(mocks.tx.placeSuggestion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: "USER",
          status: "SELECTED",
          name: "Sagrada Familia",
          estimatedCostAmount: 65,
          estimatedCostCurrency: "EUR",
        }),
      }),
    );
    expect(mocks.itinerary.rebuildItineraryDraftForTripTx).toHaveBeenCalledWith(
      mocks.tx,
      "trip_1",
    );
  });

  it("rejects user-entered anchors outside the saved trip destinations", async () => {
    const result = await addUserPlanningPlace("user_1", "trip_1", {
      topic: "ACTIVITIES",
      name: "Louvre Museum",
      category: "ATTRACTION",
      city: "Paris",
      country: "France",
    });

    expect(result.status).toBe("invalid_destination");
    expect(mocks.tx.placeSuggestion.create).not.toHaveBeenCalled();
  });

  it("rejects user-entered place costs that exceed the supported guardrail", async () => {
    const result = await addUserPlanningPlace("user_1", "trip_1", {
      topic: "ACTIVITIES",
      name: "Private island",
      category: "ATTRACTION",
      city: "Barcelona",
      country: "Spain",
      estimatedCostAmount: 1_000_000_000,
      estimatedCostCurrency: "EUR",
    });

    expect(result.status).toBe("invalid_estimated_cost");
    expect(mocks.tx.placeSuggestion.create).not.toHaveBeenCalled();
    expect(mocks.itinerary.rebuildItineraryDraftForTripTx).not.toHaveBeenCalled();
  });

  it("selects an owned recommendation and stores feedback", async () => {
    mocks.tx.placeSuggestion.findFirst.mockResolvedValue({
      id: "suggestion_1",
      tripId: "trip_1",
      status: "PENDING",
      name: "Barcelona Gallery Quarter Hotel",
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
    expect(mocks.tx.planningEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tripId: "trip_1",
        actor: "USER",
        type: "USER_FEEDBACK",
        visibleToUser: true,
      }),
    });
    expect(mocks.itinerary.rebuildItineraryDraftForTripTx).toHaveBeenCalledWith(
      mocks.tx,
      "trip_1",
    );
  });

  it("refreshes the current planning view after a successful form selection without redirecting", async () => {
    mocks.tx.placeSuggestion.findFirst.mockResolvedValue({
      id: "suggestion_1",
      tripId: "trip_1",
      status: "PENDING",
      name: "Barcelona Gallery Quarter Hotel",
    });
    const formData = new FormData();

    formData.set("tripId", "trip_1");
    formData.set("topic", "HOTEL_BASE");
    formData.set("suggestionId", "suggestion_1");

    await selectRecommendationFormAction(formData);

    expect(mocks.nextCache.refresh).toHaveBeenCalledOnce();
    expect(mocks.nextNavigation.redirect).not.toHaveBeenCalled();
  });

  it("rejects an owned recommendation with a reason and timeline event", async () => {
    mocks.tx.placeSuggestion.findFirst.mockResolvedValue({
      id: "suggestion_1",
      tripId: "trip_1",
      status: "PENDING",
      name: "Barcelona Gallery Quarter Hotel",
    });

    const result = await rejectRecommendation("user_1", "trip_1", {
      suggestionId: "suggestion_1",
      reason: "TOO_EXPENSIVE",
      note: "More than I want to spend.",
    });

    expect(result.status).toBe("rejected");
    expect(mocks.tx.placeSuggestion.updateMany).toHaveBeenCalledWith({
      where: {
        id: "suggestion_1",
        tripId: "trip_1",
      },
      data: {
        status: "REJECTED",
      },
    });
    expect(mocks.tx.planningFeedback.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "REJECT",
        reason: "TOO_EXPENSIVE",
        userNote: "More than I want to spend.",
        placeSuggestionId: "suggestion_1",
      }),
    });
    expect(mocks.tx.planningEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actor: "USER",
        type: "USER_FEEDBACK",
        title: "Recommendation rejected",
      }),
    });
  });

  it("rebuilds the itinerary when a selected place is rejected", async () => {
    mocks.tx.placeSuggestion.findFirst.mockResolvedValue({
      id: "suggestion_1",
      tripId: "trip_1",
      status: "SELECTED",
      name: "Barcelona Gallery Quarter Hotel",
    });

    const result = await rejectRecommendation("user_1", "trip_1", {
      suggestionId: "suggestion_1",
      reason: "WRONG_VIBE",
    });

    expect(result.status).toBe("rejected");
    expect(mocks.itinerary.rebuildItineraryDraftForTripTx).toHaveBeenCalledWith(
      mocks.tx,
      "trip_1",
    );
  });

  it("deselects a selected place without rejecting it", async () => {
    mocks.tx.placeSuggestion.findFirst.mockResolvedValue({
      id: "suggestion_1",
      tripId: "trip_1",
      status: "SELECTED",
      name: "Barcelona Gallery Quarter Hotel",
    });

    const result = await deselectRecommendation("user_1", "trip_1", {
      suggestionId: "suggestion_1",
    });

    expect(result.status).toBe("deselected");
    expect(mocks.tx.placeSuggestion.updateMany).toHaveBeenCalledWith({
      where: {
        id: "suggestion_1",
        tripId: "trip_1",
      },
      data: {
        status: "PENDING",
      },
    });
    expect(mocks.tx.planningFeedback.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "DESELECT",
        placeSuggestionId: "suggestion_1",
      }),
    });
    expect(mocks.itinerary.rebuildItineraryDraftForTripTx).toHaveBeenCalledWith(
      mocks.tx,
      "trip_1",
    );
  });

  it("returns a place action log for misclick recovery", async () => {
    mocks.tx.placeSuggestion.findMany.mockResolvedValueOnce([]);
    mocks.tx.placeSuggestion.findMany.mockResolvedValueOnce([]);
    mocks.tx.planningEvent.findMany.mockResolvedValue([]);
    mocks.tx.planningFeedback.findMany.mockResolvedValueOnce([
      {
        id: "feedback_1",
        action: "REJECT",
        reason: "TOO_EXPENSIVE",
        userNote: "Misclicked this one.",
        createdAt: new Date("2026-05-31T12:00:00.000Z"),
        placeSuggestion: {
          id: "suggestion_1",
          name: "Barcelona Gallery Quarter Hotel",
          category: "HOTEL",
          status: "REJECTED",
          city: "Barcelona",
          country: "Spain",
        },
      },
    ]);

    const result = await getPlanningWorkspace("user_1", "trip_1");

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      throw new Error("Expected planning workspace.");
    }
    expect(result.placeActionLog).toEqual([
      {
        id: "feedback_1",
        action: "REJECT",
        reason: "TOO_EXPENSIVE",
        note: "Misclicked this one.",
        createdAt: "2026-05-31T12:00:00.000Z",
        place: {
          id: "suggestion_1",
          name: "Barcelona Gallery Quarter Hotel",
          category: "HOTEL",
          status: "REJECTED",
          city: "Barcelona",
          country: "Spain",
        },
      },
    ]);
    expect(result.itineraryPreview).toEqual({
      days: [],
      totals: {
        itemCount: 0,
        estimatedCostAmount: null,
        estimatedCostCurrency: null,
      },
    });
  });

  it("loads planning workspace transaction queries sequentially", async () => {
    let placeSuggestionQueryInFlight = false;

    mocks.tx.placeSuggestion.findMany.mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          if (placeSuggestionQueryInFlight) {
            reject(new Error("concurrent placeSuggestion query"));
            return;
          }

          placeSuggestionQueryInFlight = true;
          queueMicrotask(() => {
            placeSuggestionQueryInFlight = false;
            resolve([]);
          });
        }),
    );

    const result = await getPlanningWorkspace("user_1", "trip_1");

    expect(result.status).toBe("ok");
  });
});

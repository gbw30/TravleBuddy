import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    $transaction: vi.fn(),
  },
  tx: {
    trip: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    placeSuggestion: {
      findMany: vi.fn(),
    },
    planningFeedback: {
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    conflict: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    itineraryItem: {
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    itineraryDay: {
      deleteMany: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    itineraryCityWindow: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    tripTravelSegment: {
      findMany: vi.fn(),
    },
    planningEvent: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({
  db: mocks.db,
}));

import { buildItineraryDraft, rebuildItinerary } from "./builder";

const baseTrip = {
  id: "trip_1",
  startDate: new Date("2026-07-01T00:00:00.000Z"),
  endDate: new Date("2026-07-03T00:00:00.000Z"),
  budgetCurrency: "EUR",
  logisticsMode: "FLEXIBLE" as const,
  travelSegments: [],
  preference: {
    pace: "BALANCED" as const,
  },
};

function place(
  id: string,
  category:
    | "HOTEL"
    | "ATTRACTION"
    | "LANDMARK"
    | "ACTIVITY"
    | "RESTAURANT"
    | "ENTERTAINMENT",
  score: number,
  estimatedCostAmount: number | null = null,
) {
  return {
    id,
    tripId: "trip_1",
    category,
    name: `${category} ${id}`,
    description: null,
    score,
    estimatedCostAmount,
    estimatedCostCurrency: estimatedCostAmount === null ? null : "EUR",
  };
}

describe("buildItineraryDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.$transaction.mockImplementation((callback) => callback(mocks.tx));
    mocks.tx.trip.findFirst.mockResolvedValue({
      ...baseTrip,
      title: "Barcelona",
      status: "PLANNING",
      budgetAmount: "1500",
      destinations: [{ id: "destination_1" }],
    });
    mocks.tx.placeSuggestion.findMany.mockResolvedValue([
      place("hotel", "HOTEL", 80, 300),
      place("landmark", "LANDMARK", 92, 20),
    ]);
    mocks.tx.conflict.findMany.mockResolvedValue([]);
    mocks.tx.conflict.createMany.mockResolvedValue({ count: 0 });
    mocks.tx.conflict.deleteMany.mockResolvedValue({ count: 0 });
    mocks.tx.conflict.updateMany.mockResolvedValue({ count: 0 });
    mocks.tx.itineraryDay.findMany.mockResolvedValue([]);
    mocks.tx.itineraryCityWindow.deleteMany.mockResolvedValue({ count: 0 });
    mocks.tx.itineraryCityWindow.createMany.mockResolvedValue({ count: 0 });
    mocks.tx.tripTravelSegment.findMany.mockResolvedValue([]);
    mocks.tx.planningFeedback.findMany.mockResolvedValue([
      {
        id: "feedback_1",
        targetType: "ITINERARY_ITEM",
        targetId: "old_item_1",
        itineraryDayId: null,
        itineraryItemId: "old_item_1",
        conflictId: null,
        metadata: {
          source: "qa",
        },
      },
    ]);
    mocks.tx.planningFeedback.update.mockResolvedValue({ id: "feedback_1" });
    mocks.tx.itineraryDay.create.mockImplementation(({ data }) =>
      Promise.resolve({
        id: `day_${data.dayNumber}`,
      }),
    );
    mocks.tx.itineraryItem.create.mockImplementation(({ data }) =>
      Promise.resolve({
        id: `item_${data.placeSuggestionId}`,
      }),
    );
  });

  it("does not build when no selected places exist", () => {
    expect(
      buildItineraryDraft({
        trip: baseTrip,
        selectedPlaces: [],
      }),
    ).toEqual({
      status: "no_selected_places",
      days: [],
      totals: {
        itemCount: 0,
        estimatedCostAmount: null,
        estimatedCostCurrency: null,
      },
      conflicts: [],
      conflictSummary: {
        total: 0,
        low: 0,
        medium: 0,
        high: 0,
      },
    });
  });

  it("creates one day for every trip date and puts hotels first on day one", () => {
    const result = buildItineraryDraft({
      trip: baseTrip,
      selectedPlaces: [
        place("restaurant", "RESTAURANT", 95, 70),
        place("hotel", "HOTEL", 80, 300),
        place("landmark", "LANDMARK", 92, 20),
      ],
    });

    expect(result.status).toBe("built");
    expect(result.days.map((day) => day.date)).toEqual([
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
    ]);
    expect(result.days.every((day) => day.timeSlots.length === 48)).toBe(true);
    expect(result.days[0].items.map((item) => item.title)).toEqual([
      "HOTEL hotel",
      "LANDMARK landmark",
      "RESTAURANT restaurant",
    ]);
    expect(result.days[0]).toMatchObject({
      itemCount: 3,
      estimatedCostAmount: 390,
      estimatedCostCurrency: "EUR",
    });
    expect(result.totals).toMatchObject({
      itemCount: 3,
      estimatedCostAmount: 390,
      estimatedCostCurrency: "EUR",
    });
  });

  it("distributes non-hotel places by exact pace capacity", () => {
    const result = buildItineraryDraft({
      trip: {
        ...baseTrip,
        preference: {
          pace: "RELAXED" as const,
        },
      },
      selectedPlaces: [
        place("a", "ATTRACTION", 90),
        place("b", "ATTRACTION", 80),
        place("c", "ACTIVITY", 70),
        place("d", "RESTAURANT", 60),
      ],
    });

    expect(result.status).toBe("built");
    expect(result.days.map((day) => day.itemCount)).toEqual([3, 1, 0]);
  });

  it("orders categories deterministically before score within each category", () => {
    const result = buildItineraryDraft({
      trip: baseTrip,
      selectedPlaces: [
        place("restaurant-high", "RESTAURANT", 99),
        place("attraction-low", "ATTRACTION", 40),
        place("activity-mid", "ACTIVITY", 75),
        place("landmark-mid", "LANDMARK", 75),
        place("attraction-high", "ATTRACTION", 95),
      ],
    });

    expect(result.days[0].items.map((item) => item.title)).toEqual([
      "ATTRACTION attraction-high",
      "ATTRACTION attraction-low",
      "LANDMARK landmark-mid",
      "ACTIVITY activity-mid",
    ]);
    expect(result.days[1].items.map((item) => item.title)).toEqual([
      "RESTAURANT restaurant-high",
    ]);
  });

  it("derives same-day ticketed city windows and 30-minute transfer slots", () => {
    const result = buildItineraryDraft({
      trip: {
        ...baseTrip,
        logisticsMode: "TICKETED" as const,
        destinations: [
          {
            id: "destination_1",
            city: "Los Angeles",
            country: "United States",
          },
          {
            id: "destination_2",
            city: "New York",
            country: "United States",
          },
        ],
        travelSegments: [
          {
            id: "segment_1",
            originCity: "Los Angeles",
            originCountry: "United States",
            destinationCity: "New York",
            destinationCountry: "United States",
            departAt: new Date("2026-07-02T14:00:00.000Z"),
            arriveAt: new Date("2026-07-02T20:00:00.000Z"),
          },
        ],
      },
      selectedPlaces: [place("museum", "ATTRACTION", 90, 25)],
    });

    expect(result.status).toBe("built");
    expect(result.days[1].cityWindows).toEqual([
      expect.objectContaining({
        city: "Los Angeles",
        country: "United States",
        startTime: "2026-07-02T00:00:00.000Z",
        endTime: "2026-07-02T14:00:00.000Z",
        source: "TICKETED",
      }),
      expect.objectContaining({
        city: "New York",
        country: "United States",
        startTime: "2026-07-02T20:00:00.000Z",
        endTime: "2026-07-03T00:00:00.000Z",
        source: "TICKETED",
      }),
    ]);
    expect(result.days[1].timeSlots).toHaveLength(48);
    expect(
      result.days[1].timeSlots.filter(
        (slot) => slot.travelSegmentId === "segment_1",
      ),
    ).toHaveLength(12);
  });

  it("replaces previous generated itinerary rows before persisting a rebuild", async () => {
    const result = await rebuildItinerary("user_1", "trip_1");

    expect(result.status).toBe("rebuilt");
    if (result.status !== "rebuilt") {
      throw new Error("Expected itinerary rebuild.");
    }
    expect(mocks.tx.planningFeedback.findMany).toHaveBeenCalledWith({
      where: {
        tripId: "trip_1",
        OR: [
          { targetType: "ITINERARY_DAY" },
          { targetType: "ITINERARY_ITEM" },
          { targetType: "CONFLICT" },
        ],
      },
      select: expect.objectContaining({
        id: true,
        targetType: true,
        targetId: true,
        metadata: true,
      }),
    });
    expect(mocks.tx.planningFeedback.update).toHaveBeenCalledWith({
      where: {
        id: "feedback_1",
      },
      data: {
        targetType: "TRIP",
        targetId: "trip_1",
        itineraryDayId: null,
        itineraryItemId: null,
        conflictId: null,
        metadata: {
          source: "qa",
          detachedBy: "itinerary_rebuild",
          originalTarget: {
            targetType: "ITINERARY_ITEM",
            targetId: "old_item_1",
            itineraryDayId: null,
            itineraryItemId: "old_item_1",
            conflictId: null,
          },
        },
      },
    });
    expect(mocks.tx.conflict.updateMany).toHaveBeenCalledWith({
      where: {
        tripId: "trip_1",
        status: {
          not: "OPEN",
        },
        itineraryItemId: {
          not: null,
        },
      },
      data: {
        itineraryItemId: null,
      },
    });
    expect(mocks.tx.conflict.deleteMany).toHaveBeenCalledWith({
      where: {
        tripId: "trip_1",
        status: "OPEN",
      },
    });
    expect(mocks.tx.itineraryItem.deleteMany).toHaveBeenCalledWith({
      where: {
        tripId: "trip_1",
      },
    });
    expect(mocks.tx.itineraryDay.deleteMany).toHaveBeenCalledWith({
      where: {
        tripId: "trip_1",
      },
    });
    expect(mocks.tx.itineraryCityWindow.deleteMany).toHaveBeenCalledWith({
      where: {
        tripId: "trip_1",
      },
    });
    expect(mocks.tx.itineraryDay.create).toHaveBeenCalledTimes(3);
    expect(mocks.tx.itineraryItem.create).toHaveBeenCalledTimes(2);
    expect(mocks.tx.planningEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actor: "ENGINE",
        type: "ITINERARY_PROPOSAL",
        visibleToUser: true,
      }),
    });
    expect(result.itinerary.totals).toMatchObject({
      itemCount: 2,
      estimatedCostAmount: 320,
      estimatedCostCurrency: "EUR",
    });
  });

  it("persists generated itinerary rows sequentially inside the transaction", async () => {
    let writeInFlight = false;

    mocks.tx.placeSuggestion.findMany.mockResolvedValue([
      place("hotel", "HOTEL", 80, 300),
      place("landmark", "LANDMARK", 92, 20),
      place("activity", "ACTIVITY", 90, 40),
    ]);
    mocks.tx.itineraryDay.create.mockImplementation(
      ({ data }) =>
        new Promise((resolve, reject) => {
          if (writeInFlight) {
            reject(new Error("concurrent itinerary write"));
            return;
          }

          writeInFlight = true;
          queueMicrotask(() => {
            writeInFlight = false;
            resolve({
              id: `day_${data.dayNumber}`,
            });
          });
        }),
    );
    mocks.tx.itineraryItem.create.mockImplementation(
      ({ data }) =>
        new Promise((resolve, reject) => {
          if (writeInFlight) {
            reject(new Error("concurrent itinerary write"));
            return;
          }

          writeInFlight = true;
          queueMicrotask(() => {
            writeInFlight = false;
            resolve({
              id: `item_${data.placeSuggestionId}`,
            });
          });
        }),
    );

    const result = await rebuildItinerary("user_1", "trip_1");

    expect(result.status).toBe("rebuilt");
  });
});

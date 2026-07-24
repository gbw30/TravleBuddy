import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    $transaction: vi.fn(),
  },
  tx: {
    trip: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    itineraryDay: {
      findMany: vi.fn(),
    },
    itineraryItem: {
      findMany: vi.fn(),
    },
    placeSuggestion: {
      findMany: vi.fn(),
    },
    conflict: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    planningEvent: {
      create: vi.fn(),
    },
    planningFeedback: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({
  db: mocks.db,
}));

import {
  checkItineraryConflicts,
  detectItineraryConflicts,
  getOpenItineraryConflictsForTripTx,
  updateItineraryConflictStatus,
} from "./conflict-engine";

const planningTrip = {
  id: "trip_1",
  title: "Barcelona",
  status: "PLANNING" as const,
  startDate: new Date("2026-07-01T00:00:00.000Z"),
  endDate: new Date("2026-07-02T00:00:00.000Z"),
  budgetAmount: 250,
  budgetCurrency: "EUR",
  destinations: [{ id: "destination_1" }],
  preference: {
    pace: "BALANCED" as const,
  },
};

function item(
  id: string,
  input: {
    title?: string;
    category?:
      | "HOTEL"
      | "ATTRACTION"
      | "LANDMARK"
      | "ACTIVITY"
      | "RESTAURANT"
      | "ENTERTAINMENT";
    city?: string | null;
    country?: string | null;
    durationMinutes?: number | null;
    estimatedCostAmount?: number | null;
    estimatedCostCurrency?: string | null;
    startTime?: Date | null;
    endTime?: Date | null;
    metadata?: Record<string, unknown> | null;
  } = {},
) {
  return {
    id,
    placeSuggestionId: id,
    title: input.title ?? `Place ${id}`,
    startTime: input.startTime ?? null,
    endTime: input.endTime ?? null,
    durationMinutes:
      "durationMinutes" in input ? (input.durationMinutes ?? null) : 90,
    estimatedCostAmount: input.estimatedCostAmount ?? null,
    estimatedCostCurrency: input.estimatedCostCurrency ?? null,
    placeSuggestion: {
      category: input.category ?? "ATTRACTION",
      city: input.city ?? "Barcelona",
      country: input.country ?? "Spain",
      metadata: input.metadata ?? null,
    },
  };
}

function day(dayNumber: number, items: ReturnType<typeof item>[]) {
  return {
    id: `day_${dayNumber}`,
    dayNumber,
    items,
  };
}

describe("detectItineraryConflicts", () => {
  it("flags a high budget conflict only in the trip budget currency", () => {
    const conflicts = detectItineraryConflicts({
      trip: planningTrip,
      days: [
        day(1, [
          item("a", { estimatedCostAmount: 200, estimatedCostCurrency: "EUR" }),
          item("b", { estimatedCostAmount: 90, estimatedCostCurrency: "EUR" }),
          item("c", { estimatedCostAmount: 500, estimatedCostCurrency: "USD" }),
        ]),
      ],
    });

    expect(conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "BUDGET",
          severity: "HIGH",
          itineraryItemId: null,
        }),
      ]),
    );
  });

  it("adds one medium warning when the budget total excludes mixed currencies", () => {
    const conflicts = detectItineraryConflicts({
      trip: planningTrip,
      days: [
        day(1, [
          item("a", { estimatedCostAmount: 100, estimatedCostCurrency: "EUR" }),
          item("b", { estimatedCostAmount: 90, estimatedCostCurrency: "USD" }),
          item("c", { estimatedCostAmount: 80, estimatedCostCurrency: "USD" }),
          item("d", { estimatedCostAmount: 70, estimatedCostCurrency: "GBP" }),
        ]),
      ],
    });
    const mixedCurrencyConflicts = conflicts.filter(
      (conflict) =>
        conflict.type === "BUDGET" &&
        conflict.severity === "MEDIUM" &&
        (conflict.metadata as { rule?: string } | undefined)?.rule ===
          "mixed_currency_cost_exclusions",
    );

    expect(mixedCurrencyConflicts).toHaveLength(1);
    expect(mixedCurrencyConflicts[0]?.metadata).toEqual(
      expect.objectContaining({
        excludedCostCurrencies: ["GBP", "USD"],
      }),
    );
  });

  it("keeps selected overflow visible as one low scheduling conflict", () => {
    const conflicts = detectItineraryConflicts({
      trip: {
        ...planningTrip,
        selectedPlaces: [
          { id: "scheduled", name: "Scheduled museum" },
          { id: "overflow_1", name: "Overflow market" },
          { id: "overflow_2", name: "Overflow show" },
        ],
      },
      days: [day(1, [item("scheduled")])],
    });
    const overflowConflicts = conflicts.filter(
      (conflict) =>
        conflict.severity === "LOW" &&
        (conflict.metadata as { rule?: string } | undefined)?.rule ===
          "unscheduled_selected_overflow",
    );

    expect(overflowConflicts).toHaveLength(1);
    expect(overflowConflicts[0]?.metadata).toEqual(
      expect.objectContaining({
        unscheduledCount: 2,
        placeSuggestionIds: ["overflow_1", "overflow_2"],
      }),
    );
  });

  it("uses comfort-buffer density thresholds before medium capacity warnings", () => {
    const lowConflicts = detectItineraryConflicts({
      trip: planningTrip,
      days: [
        day(1, [
          item("a", { category: "ATTRACTION" }),
          item("b", { category: "LANDMARK" }),
          item("c", { category: "ACTIVITY" }),
        ]),
      ],
    });
    const mediumConflicts = detectItineraryConflicts({
      trip: planningTrip,
      days: [
        day(1, [
          item("a", { category: "ATTRACTION" }),
          item("b", { category: "LANDMARK" }),
          item("c", { category: "ACTIVITY" }),
          item("d", { category: "ENTERTAINMENT" }),
          item("e", { category: "ATTRACTION" }),
        ]),
      ],
    });

    expect(lowConflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "SCHEDULE_DENSITY",
          severity: "LOW",
          metadata: expect.objectContaining({ rule: "comfort_buffer" }),
        }),
      ]),
    );
    expect(mediumConflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "SCHEDULE_DENSITY",
          severity: "MEDIUM",
          metadata: expect.objectContaining({ rule: "pace_capacity" }),
        }),
      ]),
    );
  });

  it("flags missing durations, mixed-city days, overlaps, unavailable items, hotel mismatch, and missing restaurant coverage", () => {
    const conflicts = detectItineraryConflicts({
      trip: planningTrip,
      days: [
        day(1, [
          item("hotel", { category: "HOTEL", city: "Girona" }),
          item("museum", {
            category: "ATTRACTION",
            city: "Barcelona",
            durationMinutes: null,
            startTime: new Date("2026-07-01T10:00:00.000Z"),
            endTime: new Date("2026-07-01T12:00:00.000Z"),
          }),
          item("market", {
            category: "LANDMARK",
            city: "Madrid",
            startTime: new Date("2026-07-01T11:00:00.000Z"),
            endTime: new Date("2026-07-01T13:00:00.000Z"),
          }),
          item("closed", {
            category: "ENTERTAINMENT",
            metadata: { unavailable: true },
          }),
        ]),
      ],
    });

    expect(conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "MISSING_DURATION",
          itineraryItemId: "museum",
        }),
        expect.objectContaining({ type: "DISTANCE", severity: "MEDIUM" }),
        expect.objectContaining({
          type: "TIME",
          severity: "HIGH",
          itineraryItemId: "market",
        }),
        expect.objectContaining({
          type: "CLOSED_OR_UNAVAILABLE",
          itineraryItemId: "closed",
        }),
        expect.objectContaining({
          type: "HOTEL_LOCATION",
          itineraryItemId: "hotel",
        }),
        expect.objectContaining({
          type: "SCHEDULE_DENSITY",
          metadata: expect.objectContaining({ rule: "restaurant_coverage" }),
        }),
      ]),
    );
  });

  it("does not flag restaurant coverage when a restaurant is already assigned to the day", () => {
    const conflicts = detectItineraryConflicts({
      trip: planningTrip,
      days: [
        day(1, [
          item("museum", { category: "ATTRACTION" }),
          item("lunch", { category: "RESTAURANT" }),
        ]),
      ],
    });

    expect(conflicts).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "SCHEDULE_DENSITY",
          metadata: expect.objectContaining({ rule: "restaurant_coverage" }),
        }),
      ]),
    );
  });
});

describe("conflict service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.$transaction.mockImplementation((callback) => callback(mocks.tx));
    mocks.tx.trip.findFirst.mockResolvedValue(planningTrip);
    mocks.tx.trip.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.trip.findUniqueOrThrow.mockResolvedValue({ planningRevision: 1 });
    mocks.tx.itineraryDay.findMany.mockResolvedValue([
      day(1, [item("museum", { durationMinutes: null })]),
    ]);
    mocks.tx.conflict.createMany.mockResolvedValue({ count: 2 });
    mocks.tx.conflict.deleteMany.mockResolvedValue({ count: 1 });
    mocks.tx.itineraryItem.findMany.mockResolvedValue([{ id: "museum" }]);
    mocks.tx.placeSuggestion.findMany.mockResolvedValue([]);
    mocks.tx.conflict.findMany.mockResolvedValue([
      {
        id: "conflict_1",
        itineraryItemId: "museum",
        type: "MISSING_DURATION",
        severity: "LOW",
        status: "OPEN",
        message: "Museum is missing a planned duration.",
        recommendation: "Add a duration before detailed scheduling.",
        metadata: { rule: "missing_duration" },
      },
    ]);
    mocks.tx.conflict.updateMany.mockResolvedValue({ count: 1 });
  });

  it("replaces open conflicts, preserves non-open history, and writes a summary event", async () => {
    const result = await checkItineraryConflicts("user_1", "trip_1");

    expect(result.status).toBe("checked");
    expect(mocks.tx.trip.updateMany).toHaveBeenCalledOnce();
    expect(mocks.tx.conflict.deleteMany).toHaveBeenCalledWith({
      where: {
        tripId: "trip_1",
        status: "OPEN",
      },
    });
    expect(mocks.tx.conflict.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          tripId: "trip_1",
          status: "OPEN",
        }),
      ]),
    });
    expect(mocks.tx.planningEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actor: "ENGINE",
        type: "CONFLICT_SUMMARY",
        visibleToUser: true,
      }),
    });
  });

  it("retries conflict persistence without item links when a rapid rebuild removes referenced items", async () => {
    mocks.tx.conflict.createMany
      .mockRejectedValueOnce({
        code: "P2003",
        message: "Foreign key constraint violated",
      })
      .mockResolvedValueOnce({ count: 1 });

    const result = await checkItineraryConflicts("user_1", "trip_1");

    expect(result.status).toBe("checked");
    expect(mocks.tx.conflict.createMany).toHaveBeenCalledTimes(2);
    expect(mocks.tx.conflict.createMany).toHaveBeenNthCalledWith(2, {
      data: expect.arrayContaining([
        expect.objectContaining({
          tripId: "trip_1",
          itineraryItemId: null,
          status: "OPEN",
        }),
      ]),
    });
  });

  it("deduplicates matching open conflicts before returning them to the page", async () => {
    mocks.tx.conflict.findMany.mockResolvedValueOnce([
      {
        id: "conflict_1",
        itineraryItemId: "museum",
        type: "MISSING_DURATION",
        severity: "LOW",
        status: "OPEN",
        message: "Museum is missing a planned duration.",
        recommendation: "Add a duration before detailed scheduling.",
        metadata: { rule: "missing_duration" },
      },
      {
        id: "conflict_2",
        itineraryItemId: "museum",
        type: "MISSING_DURATION",
        severity: "LOW",
        status: "OPEN",
        message: "Museum is missing a planned duration.",
        recommendation: "Add a duration before detailed scheduling.",
        metadata: { rule: "missing_duration" },
      },
    ]);

    const conflicts = await getOpenItineraryConflictsForTripTx(
      mocks.tx as never,
      "trip_1",
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.id).toBe("conflict_1");
    expect(mocks.tx.conflict.deleteMany).not.toHaveBeenCalled();
    expect(mocks.tx.trip.updateMany).not.toHaveBeenCalled();
  });

  it("marks a conflict ignored or resolved only for an owned trip", async () => {
    const result = await updateItineraryConflictStatus("user_1", "trip_1", {
      conflictId: "conflict_1",
      status: "IGNORED",
    });

    expect(result).toEqual({ status: "updated", revision: 1 });
    expect(mocks.tx.trip.updateMany).toHaveBeenCalledOnce();
    expect(mocks.tx.conflict.updateMany).toHaveBeenCalledWith({
      where: {
        id: "conflict_1",
        tripId: "trip_1",
      },
      data: {
        status: "IGNORED",
      },
    });
    expect(mocks.tx.planningFeedback.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        targetType: "CONFLICT",
        action: "IGNORE",
        conflictId: "conflict_1",
      }),
    });
  });
});

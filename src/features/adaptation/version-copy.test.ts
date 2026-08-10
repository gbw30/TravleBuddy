import { describe, expect, it, vi } from "vitest";
import type { PlanningTransaction } from "@/features/planning/mutation";
import {
  materializeAdaptiveItineraryVersionTx,
  type AdaptiveItinerarySnapshot,
} from "./version-copy";

const source = {
  id: "itinerary_version_1",
  version: 1,
  days: [
    {
      id: "day_1",
      dayNumber: 1,
      date: new Date("2026-08-01T00:00:00.000Z"),
      title: "Day 1",
      notes: null,
      estimatedCostAmount: 150,
      estimatedCostCurrency: "USD",
      cityWindows: [
        {
          destinationId: "destination_1",
          travelSegmentId: null,
          city: "Bogota",
          country: "Colombia",
          startTime: new Date("2026-08-01T09:00:00.000Z"),
          endTime: new Date("2026-08-01T17:00:00.000Z"),
          source: "TRIP_DESTINATION",
        },
      ],
      items: [
        {
          id: "item_remove",
          placeSuggestionId: "suggestion_remove",
          title: "Premium Museum",
          description: null,
          startTime: null,
          endTime: null,
          durationMinutes: null,
          sortOrder: 0,
          estimatedCostAmount: 100,
          estimatedCostCurrency: "USD",
          notes: null,
          placeSuggestion: {
            destinationId: "destination_1",
            providerPlaceId: "museum_1",
            category: "ATTRACTION",
            city: "Bogota",
            country: "Colombia",
            metadata: null,
          },
        },
        {
          id: "item_keep",
          placeSuggestionId: "suggestion_keep",
          title: "City Walk",
          description: null,
          startTime: null,
          endTime: null,
          durationMinutes: null,
          sortOrder: 1,
          estimatedCostAmount: 50,
          estimatedCostCurrency: "USD",
          notes: null,
          placeSuggestion: {
            destinationId: "destination_1",
            providerPlaceId: "walk_1",
            category: "ACTIVITY",
            city: "Bogota",
            country: "Colombia",
            metadata: null,
          },
        },
      ],
    },
    {
      id: "day_2",
      dayNumber: 2,
      date: new Date("2026-08-02T00:00:00.000Z"),
      title: "Day 2",
      notes: "Preserve this day",
      estimatedCostAmount: 25,
      estimatedCostCurrency: "USD",
      cityWindows: [],
      items: [
        {
          id: "item_other_day",
          placeSuggestionId: "suggestion_other_day",
          title: "Park",
          description: null,
          startTime: null,
          endTime: null,
          durationMinutes: null,
          sortOrder: 0,
          estimatedCostAmount: 25,
          estimatedCostCurrency: "USD",
          notes: null,
          placeSuggestion: {
            destinationId: "destination_1",
            providerPlaceId: "park_1",
            category: "ATTRACTION",
            city: "Bogota",
            country: "Colombia",
            metadata: null,
          },
        },
      ],
    },
  ],
} as unknown as AdaptiveItinerarySnapshot;

describe("materializeAdaptiveItineraryVersionTx", () => {
  it("batch-copies the itinerary, removes only the target, and recomputes its day", async () => {
    const tx = {
      itineraryVersion: {
        findFirst: vi.fn(async () => ({ version: 1 })),
        create: vi.fn(async () => ({
          id: "itinerary_version_2",
          version: 2,
        })),
      },
      itineraryDay: {
        createManyAndReturn: vi.fn(async () => [
          { id: "new_day_1", dayNumber: 1 },
          { id: "new_day_2", dayNumber: 2 },
        ]),
      },
      itineraryCityWindow: {
        createMany: vi.fn(async () => ({ count: 1 })),
      },
      itineraryItem: {
        createManyAndReturn: vi.fn(async () => [
          {
            id: "new_item_keep",
            dayId: "new_day_1",
            placeSuggestionId: "suggestion_keep",
            sortOrder: 1,
          },
          {
            id: "new_item_other_day",
            dayId: "new_day_2",
            placeSuggestionId: "suggestion_other_day",
            sortOrder: 0,
          },
        ]),
      },
    } as unknown as PlanningTransaction;

    await expect(
      materializeAdaptiveItineraryVersionTx(tx, {
        tripId: "trip_1",
        source,
        preferenceProfileVersionId: "preference_version_1",
        targetItemId: "item_remove",
        feedbackId: "feedback_1",
        preferenceExplanation: "Feedback recorded.",
        change: { kind: "REMOVE" },
      }),
    ).resolves.toEqual({
      id: "itinerary_version_2",
      version: 2,
      affectedDay: 1,
      rejectedSuggestionId: "suggestion_remove",
      replacementItemId: null,
    });

    expect(tx.itineraryDay.createManyAndReturn).toHaveBeenCalledOnce();
    const days = vi.mocked(tx.itineraryDay.createManyAndReturn).mock
      .calls[0]![0]!.data as Array<Record<string, unknown>>;
    expect(days).toEqual([
      expect.objectContaining({
        dayNumber: 1,
        estimatedCostAmount: 50,
        estimatedCostCurrency: "USD",
      }),
      expect.objectContaining({
        dayNumber: 2,
        notes: "Preserve this day",
        estimatedCostAmount: 25,
      }),
    ]);
    const items = vi.mocked(tx.itineraryItem.createManyAndReturn).mock
      .calls[0]![0]!.data as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    expect(items).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ placeSuggestionId: "suggestion_remove" }),
      ]),
    );
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dayId: "new_day_2",
          title: "Park",
        }),
      ]),
    );
  });
});

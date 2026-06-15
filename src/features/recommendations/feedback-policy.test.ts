import { describe, expect, it } from "vitest";
import {
  feedbackPenaltyForPlace,
  rejectedProviderPlaceIds,
} from "./feedback-policy";
import type { MockPlace, RecommendationFeedbackSignal } from "./types";

const basePlace = {
  id: "barcelona-hotel-base-1",
  city: "Barcelona",
  country: "Spain",
  name: "Barcelona Gallery Quarter Hotel",
  category: "HOTEL",
  topic: "HOTEL_BASE",
  tags: ["MUSEUMS", "ART"],
  budgetLevels: ["MODERATE"],
  pace: ["RELAXED"],
  transportationModes: ["WALKING"],
  accommodationTypes: ["HOTEL"],
  customMatches: ["Quiet hotels"],
  description: "A calm hotel near galleries.",
  address: "Barcelona planning district",
  latitude: 41.391,
  longitude: 2.164,
  rating: 4.7,
  priceLevel: 3,
  estimatedCostAmount: 220,
  estimatedCostCurrency: "EUR",
} satisfies MockPlace;

function rejectedSignal(
  overrides: Partial<RecommendationFeedbackSignal> = {},
): RecommendationFeedbackSignal {
  return {
    providerPlaceId: "barcelona-hotel-base-2",
    topic: "HOTEL_BASE",
    category: "HOTEL",
    name: "Rejected Hotel",
    reason: "TOO_EXPENSIVE",
    note: null,
    tags: ["MUSEUMS"],
    estimatedCostAmount: 200,
    priceLevel: 3,
    latitude: 41.389,
    longitude: 2.162,
    ...overrides,
  };
}

describe("recommendation feedback policy", () => {
  it("excludes exact rejected mock provider ids", () => {
    expect(
      rejectedProviderPlaceIds([
        rejectedSignal({ providerPlaceId: "barcelona-hotel-base-1" }),
        rejectedSignal({ providerPlaceId: null }),
      ]),
    ).toEqual(new Set(["barcelona-hotel-base-1"]));
  });

  it("penalizes places at or above the cost of too-expensive rejections", () => {
    const result = feedbackPenaltyForPlace(basePlace, {
      topic: "HOTEL_BASE",
      selectedPlaces: [],
      rejectedFeedback: [rejectedSignal({ reason: "TOO_EXPENSIVE" })],
    });

    expect(result.penalty).toBeLessThan(0);
    expect(result.reasons).toContain("similar cost to a rejected expensive option");
  });

  it("penalizes similar vibe tags after wrong-vibe feedback", () => {
    const result = feedbackPenaltyForPlace(basePlace, {
      topic: "HOTEL_BASE",
      selectedPlaces: [],
      rejectedFeedback: [
        rejectedSignal({ reason: "WRONG_VIBE", tags: ["MUSEUMS", "ART"] }),
      ],
    });

    expect(result.penalty).toBeLessThan(0);
    expect(result.reasons).toContain("similar vibe to a rejected option");
  });

  it("does not add broad penalties for other feedback", () => {
    const result = feedbackPenaltyForPlace(basePlace, {
      topic: "HOTEL_BASE",
      selectedPlaces: [],
      rejectedFeedback: [rejectedSignal({ reason: "OTHER" })],
    });

    expect(result.penalty).toBe(0);
    expect(result.reasons).toEqual([]);
  });
});

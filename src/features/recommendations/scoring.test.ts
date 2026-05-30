import { describe, expect, it } from "vitest";
import { scoreMockPlace } from "./scoring";
import type { MockPlace } from "./types";

const place = {
  id: "barcelona-hotel-1",
  city: "Barcelona",
  country: "Spain",
  name: "Gallery Quarter Hotel",
  category: "HOTEL",
  topic: "HOTEL_BASE",
  tags: ["MUSEUMS", "ART", "FOOD"],
  budgetLevels: ["MODERATE"],
  pace: ["RELAXED", "BALANCED"],
  transportationModes: ["WALKING"],
  accommodationTypes: ["HOTEL"],
  customMatches: ["Quiet hotels", "Local markets"],
  description: "A calm hotel near galleries and independent cafes.",
  address: "Eixample, Barcelona",
  latitude: 41.391,
  longitude: 2.164,
  rating: 4.7,
  priceLevel: 3,
  estimatedCostAmount: 210,
  estimatedCostCurrency: "EUR",
} satisfies MockPlace;

describe("recommendation scoring", () => {
  it("scores matching mock places with an explainable score breakdown", () => {
    const result = scoreMockPlace(place, {
      topic: "HOTEL_BASE",
      preference: {
        budgetLevel: "MODERATE",
        pace: "RELAXED",
        interests: ["MUSEUMS", "FOOD"],
        transportationModes: ["WALKING"],
        accommodationTypes: ["HOTEL"],
        hotelPriority: 8,
        walkingToleranceKm: 3,
        customPreferences: ["Quiet hotels", "Local markets"],
        mustAvoid: [],
      },
      selectedPlaces: [],
    });

    expect(result.score).toBeGreaterThan(80);
    expect(result.explanation).toContain("matches your interest in museums");
    expect(result.breakdown.preferenceMatch).toBeGreaterThan(0);
    expect(result.breakdown.budgetFit).toBeGreaterThan(0);
  });

  it("penalizes places that match must-avoid refinements", () => {
    const result = scoreMockPlace(
      {
        ...place,
        tags: ["NIGHTLIFE"],
        customMatches: ["crowded clubs"],
      },
      {
        topic: "FOOD_NIGHTLIFE",
        preference: {
          budgetLevel: "MODERATE",
          pace: "RELAXED",
          interests: ["NIGHTLIFE"],
          transportationModes: [],
          accommodationTypes: [],
          hotelPriority: null,
          walkingToleranceKm: null,
          customPreferences: [],
          mustAvoid: ["crowded clubs"],
        },
        selectedPlaces: [],
      },
    );

    expect(result.breakdown.penalties).toBeLessThan(0);
    expect(result.explanation).toContain("penalized");
  });
});

import { describe, expect, it } from "vitest";
import {
  extractPreferenceSignals,
  hasTopicRecommendationReadiness,
} from "./extraction";

describe("planning preference extraction", () => {
  it("extracts structured preference signals from natural-language planning text", () => {
    expect(
      extractPreferenceSignals(
        "I want a quiet hotel near museums, walkable cafes, and local markets. Keep it moderate and relaxed.",
      ),
    ).toEqual({
      budgetLevel: "MODERATE",
      pace: "RELAXED",
      interests: ["MUSEUMS", "FOOD"],
      transportationModes: ["WALKING"],
      accommodationTypes: ["HOTEL"],
      customPreferences: ["Quiet hotels", "Local markets"],
      mustAvoid: [],
      walkingToleranceKm: null,
    });
  });

  it("detects avoidances and walking tolerance when the user refines a recommendation batch", () => {
    expect(
      extractPreferenceSignals(
        "Refresh these. Avoid crowded clubs and anything more than 3 km away.",
      ),
    ).toMatchObject({
      customPreferences: ["Low-crowd attractions"],
      mustAvoid: ["crowded clubs"],
      walkingToleranceKm: 3,
    });
  });
});

describe("topic recommendation readiness", () => {
  it("requires a topic plus two useful preference signals", () => {
    expect(
      hasTopicRecommendationReadiness({
        topic: "HOTEL_BASE",
        preference: {
          budgetLevel: "MODERATE",
          pace: null,
          interests: [],
          transportationModes: [],
          accommodationTypes: ["HOTEL"],
          hotelPriority: null,
          walkingToleranceKm: null,
          customPreferences: [],
          mustAvoid: [],
        },
        selectedPlaceCount: 0,
      }),
    ).toEqual({
      isReady: true,
      signalCount: 2,
      missingSignalCount: 0,
    });
  });

  it("keeps the loop in question mode when only one signal exists", () => {
    expect(
      hasTopicRecommendationReadiness({
        topic: "FOOD_NIGHTLIFE",
        preference: {
          budgetLevel: null,
          pace: null,
          interests: ["FOOD"],
          transportationModes: [],
          accommodationTypes: [],
          hotelPriority: null,
          walkingToleranceKm: null,
          customPreferences: [],
          mustAvoid: [],
        },
        selectedPlaceCount: 0,
      }),
    ).toEqual({
      isReady: false,
      signalCount: 1,
      missingSignalCount: 1,
    });
  });
});

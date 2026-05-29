import { describe, expect, it } from "vitest";
import { userTravelPreferenceDataFromTripPreference } from "./preferences";

describe("profile preference extraction", () => {
  it("converts a trip preference into saved user travel preference data", () => {
    expect(
      userTravelPreferenceDataFromTripPreference("trip_1", {
        budgetLevel: "MODERATE",
        pace: "BALANCED",
        interests: ["FOOD", "ART"],
        transportationModes: ["WALKING"],
        accommodationTypes: ["HOTEL"],
        hotelPriority: 7,
        walkingToleranceKm: 8.5,
        dietaryRestrictions: ["vegetarian"],
        accessibilityNeeds: ["step-free access"],
        mustAvoid: ["crowds"],
        customPreferences: ["quiet mornings"],
      }),
    ).toEqual({
      budgetLevel: "MODERATE",
      pace: "BALANCED",
      interests: ["FOOD", "ART"],
      transportationModes: ["WALKING"],
      accommodationTypes: ["HOTEL"],
      hotelPriority: 7,
      walkingToleranceKm: 8.5,
      dietaryRestrictions: ["vegetarian"],
      accessibilityNeeds: ["step-free access"],
      mustAvoid: ["crowds"],
      customPreferences: ["quiet mornings"],
      metadata: {
        sourceTripId: "trip_1",
        source: "trip_preference",
      },
    });
  });
});

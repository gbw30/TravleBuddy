import { describe, expect, it } from "vitest";
import {
  parsePreferenceTextList,
  preferenceInputSchema,
  searchCustomPreferenceSuggestions,
  travelMvpInterestOptions,
} from "./schemas";

const validPreferenceInput = {
  budgetLevel: "MODERATE",
  pace: "BALANCED",
  interests: ["FOOD", "HISTORY"],
  transportationModes: ["WALKING", "PUBLIC_TRANSIT"],
  accommodationTypes: ["HOTEL"],
  hotelPriority: 8,
  walkingToleranceKm: 12.5,
  dietaryRestrictions: "vegetarian, no peanuts\nlow sugar",
  accessibilityNeeds: "step-free access\nquiet spaces",
  mustAvoid: "crowded clubs, long lines",
  customNotes: "Prefer local neighborhoods.",
  customPreferences: ["quiet mornings", "neighborhood cafes"],
};

describe("preference input schema", () => {
  it("parses a complete Phase 5 preference profile", () => {
    const result = preferenceInputSchema.parse(validPreferenceInput);

    expect(result).toEqual({
      budgetAmount: null,
      budgetLevel: "MODERATE",
      pace: "BALANCED",
      interests: ["FOOD", "HISTORY"],
      transportationModes: ["WALKING", "PUBLIC_TRANSIT"],
      accommodationTypes: ["HOTEL"],
      hotelPriority: 8,
      walkingToleranceKm: 12.5,
      dietaryRestrictions: ["vegetarian", "no peanuts", "low sugar"],
      accessibilityNeeds: ["step-free access", "quiet spaces"],
      mustAvoid: ["crowded clubs", "long lines"],
      customNotes: "Prefer local neighborhoods.",
      customPreferences: ["quiet mornings", "neighborhood cafes"],
    });
  });

  it("requires core profile fields for completion", () => {
    const result = preferenceInputSchema.safeParse({
      budgetLevel: "",
      pace: "",
      interests: [],
      transportationModes: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors).toMatchObject({
        budgetLevel: expect.any(Array),
        pace: expect.any(Array),
        interests: expect.any(Array),
        transportationModes: expect.any(Array),
      });
    }
  });

  it("rejects values outside the enum-backed option sets", () => {
    expect(
      preferenceInputSchema.safeParse({
        ...validPreferenceInput,
        budgetLevel: "ULTRA_LUXURY",
      }).success,
    ).toBe(false);
    expect(
      preferenceInputSchema.safeParse({
        ...validPreferenceInput,
        interests: ["FOOD", "SKIING"],
      }).success,
    ).toBe(false);
    expect(
      preferenceInputSchema.safeParse({
        ...validPreferenceInput,
        transportationModes: ["WALKING", "TELEPORT"],
      }).success,
    ).toBe(false);
  });

  it("supports the expanded Travel MVP interest vocabulary", () => {
    expect(travelMvpInterestOptions.map((option) => option.value)).toEqual([
      "FOOD",
      "HISTORY",
      "MUSEUMS",
      "NATURE",
      "ADVENTURE",
      "NIGHTLIFE",
      "SHOPPING",
      "PHOTOGRAPHY",
      "BEACHES",
      "ART",
      "ARCHITECTURE",
      "MUSIC",
      "WELLNESS",
      "LOCAL_CULTURE",
      "HIDDEN_GEMS",
    ]);
  });

  it("enforces broad slider ranges", () => {
    expect(
      preferenceInputSchema.safeParse({
        ...validPreferenceInput,
        hotelPriority: 11,
      }).success,
    ).toBe(false);
    expect(
      preferenceInputSchema.safeParse({
        ...validPreferenceInput,
        walkingToleranceKm: 25.5,
      }).success,
    ).toBe(false);
    expect(
      preferenceInputSchema.safeParse({
        ...validPreferenceInput,
        walkingToleranceKm: 12.25,
      }).success,
    ).toBe(false);
  });

  it("parses the trip budget amount slider value from preferences", () => {
    const result = preferenceInputSchema.parse({
      ...validPreferenceInput,
      budgetAmount: "2500",
    });

    expect(result.budgetAmount).toBe(2500);
  });

  it("splits free text lists by comma and newline", () => {
    expect(parsePreferenceTextList(" vegan, \n gluten-free ,,  low sodium ")).toEqual([
      "vegan",
      "gluten-free",
      "low sodium",
    ]);
  });

  it("dedupes and trims custom non-core preference boxes", () => {
    const result = preferenceInputSchema.parse({
      ...validPreferenceInput,
      customPreferences: [
        " quiet mornings ",
        "Quiet mornings",
        "",
        "local markets",
      ],
    });

    expect(result.customPreferences).toEqual(["quiet mornings", "local markets"]);
  });

  it("searches known custom preference suggestions", () => {
    expect(searchCustomPreferenceSuggestions("quiet")).toEqual([
      "Quiet mornings",
      "Quiet hotels",
    ]);
    expect(searchCustomPreferenceSuggestions("volcano")).toEqual([]);
  });
});

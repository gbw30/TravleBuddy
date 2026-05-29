import type { ParsedPreferenceInput } from "@/features/preferences/schemas";

export type ExtractableTripPreference = Pick<
  ParsedPreferenceInput,
  | "budgetLevel"
  | "pace"
  | "interests"
  | "transportationModes"
  | "accommodationTypes"
  | "hotelPriority"
  | "walkingToleranceKm"
  | "dietaryRestrictions"
  | "accessibilityNeeds"
  | "mustAvoid"
  | "customPreferences"
>;

export function userTravelPreferenceDataFromTripPreference(
  sourceTripId: string,
  input: ExtractableTripPreference,
) {
  return {
    budgetLevel: input.budgetLevel,
    pace: input.pace,
    interests: input.interests,
    transportationModes: input.transportationModes,
    accommodationTypes: input.accommodationTypes,
    hotelPriority: input.hotelPriority,
    walkingToleranceKm: input.walkingToleranceKm,
    dietaryRestrictions: input.dietaryRestrictions,
    accessibilityNeeds: input.accessibilityNeeds,
    mustAvoid: input.mustAvoid,
    customPreferences: input.customPreferences,
    metadata: {
      sourceTripId,
      source: "trip_preference",
    },
  };
}

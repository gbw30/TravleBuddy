import { z } from "zod";

export const travelMvpInterestOptions = [
  { value: "FOOD", label: "Food" },
  { value: "HISTORY", label: "History" },
  { value: "MUSEUMS", label: "Museums" },
  { value: "NATURE", label: "Nature" },
  { value: "ADVENTURE", label: "Adventure" },
  { value: "NIGHTLIFE", label: "Nightlife" },
  { value: "SHOPPING", label: "Shopping" },
  { value: "PHOTOGRAPHY", label: "Photography" },
  { value: "BEACHES", label: "Beaches" },
  { value: "ART", label: "Art" },
  { value: "ARCHITECTURE", label: "Architecture" },
  { value: "MUSIC", label: "Music" },
  { value: "WELLNESS", label: "Wellness" },
  { value: "LOCAL_CULTURE", label: "Local culture" },
  { value: "HIDDEN_GEMS", label: "Hidden gems" },
] as const;

export const budgetLevelOptions = [
  { value: "BUDGET", label: "Budget" },
  { value: "MODERATE", label: "Moderate" },
  { value: "LUXURY", label: "Luxury" },
] as const;

export const paceOptions = [
  { value: "RELAXED", label: "Relaxed" },
  { value: "BALANCED", label: "Balanced" },
  { value: "PACKED", label: "Packed" },
] as const;

export const transportationModeOptions = [
  { value: "WALKING", label: "Walking" },
  { value: "PUBLIC_TRANSIT", label: "Public transit" },
  { value: "RIDE_SHARE", label: "Ride share" },
  { value: "RENTAL_CAR", label: "Rental car" },
  { value: "MIXED", label: "Mixed" },
] as const;

export const accommodationTypeOptions = [
  { value: "HOSTEL", label: "Hostel" },
  { value: "HOTEL", label: "Hotel" },
  { value: "RESORT", label: "Resort" },
  { value: "AIRBNB", label: "Airbnb" },
  { value: "OTHER", label: "Other" },
] as const;

export const customPreferenceSuggestionOptions = [
  "Quiet mornings",
  "Quiet hotels",
  "Local markets",
  "Rooftop views",
  "Kid-friendly stops",
  "Low-crowd attractions",
  "Late checkout",
  "Scenic walks",
  "Independent cafes",
  "Flexible afternoons",
] as const;

const interestValues = travelMvpInterestOptions.map((option) => option.value);
const budgetLevelValues = budgetLevelOptions.map((option) => option.value);
const paceValues = paceOptions.map((option) => option.value);
const transportationModeValues = transportationModeOptions.map(
  (option) => option.value,
);
const accommodationTypeValues = accommodationTypeOptions.map(
  (option) => option.value,
);

const blankStringToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

function optionValueSchema<const T extends readonly [string, ...string[]]>(
  values: T,
) {
  return z.preprocess(blankStringToUndefined, z.enum(values));
}

function optionalArrayValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

export function parsePreferenceTextList(value: unknown) {
  const values = Array.isArray(value) ? value : [value];

  return values
    .flatMap((item) => (typeof item === "string" ? item.split(/[,\n]/) : []))
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseCustomPreferences(value: unknown) {
  const seen = new Set<string>();

  return parsePreferenceTextList(value).filter((item) => {
    const key = item.toLocaleLowerCase();

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function searchCustomPreferenceSuggestions(query: string) {
  const normalized = query.trim().toLocaleLowerCase();

  if (!normalized) {
    return [];
  }

  return customPreferenceSuggestionOptions.filter((option) =>
    option.toLocaleLowerCase().includes(normalized),
  );
}

const interestSchema = z.enum(
  interestValues as [typeof interestValues[number], ...typeof interestValues],
);
const budgetLevelSchema = optionValueSchema(
  budgetLevelValues as [
    typeof budgetLevelValues[number],
    ...typeof budgetLevelValues,
  ],
);
const paceSchema = optionValueSchema(
  paceValues as [typeof paceValues[number], ...typeof paceValues],
);
const transportationModeSchema = z.enum(
  transportationModeValues as [
    typeof transportationModeValues[number],
    ...typeof transportationModeValues,
  ],
);
const accommodationTypeSchema = z.enum(
  accommodationTypeValues as [
    typeof accommodationTypeValues[number],
    ...typeof accommodationTypeValues,
  ],
);

const requiredInterestArraySchema = z.preprocess(
  optionalArrayValue,
  z.array(interestSchema).min(1, "Select at least one interest."),
);

const requiredTransportationArraySchema = z.preprocess(
  optionalArrayValue,
  z.array(transportationModeSchema).min(1, "Select at least one transportation mode."),
);

const optionalAccommodationArraySchema = z.preprocess(
  optionalArrayValue,
  z.array(accommodationTypeSchema),
);

const textListSchema = z.preprocess(
  parsePreferenceTextList,
  z.array(z.string().trim().min(1)),
);

const customPreferenceListSchema = z.preprocess(
  parseCustomPreferences,
  z.array(z.string().trim().min(1)),
);

const optionalHotelPrioritySchema = z.preprocess(
  blankStringToUndefined,
  z.coerce.number().int().min(1).max(10).optional(),
).transform((value) => value ?? null);

const optionalWalkingToleranceSchema = z
  .preprocess(
    blankStringToUndefined,
    z.coerce.number().min(0.5).max(25).optional(),
  )
  .refine(
    (value) => value === undefined || Number.isInteger(value * 2),
    "Walking tolerance must use 0.5 km steps.",
  )
  .transform((value) => value ?? null);

const optionalNotesSchema = z
  .preprocess(
    (value) => {
      if (typeof value !== "string") {
        return value ?? null;
      }

      const trimmed = value.trim();

      return trimmed.length > 0 ? trimmed : null;
    },
    z.string().nullable().optional(),
  )
  .transform((value) => value ?? null);

export const preferenceInputSchema = z.object({
  budgetLevel: budgetLevelSchema,
  pace: paceSchema,
  interests: requiredInterestArraySchema,
  transportationModes: requiredTransportationArraySchema,
  accommodationTypes: optionalAccommodationArraySchema.default([]),
  hotelPriority: optionalHotelPrioritySchema,
  walkingToleranceKm: optionalWalkingToleranceSchema,
  dietaryRestrictions: textListSchema.default([]),
  accessibilityNeeds: textListSchema.default([]),
  mustAvoid: textListSchema.default([]),
  customNotes: optionalNotesSchema,
  customPreferences: customPreferenceListSchema.default([]),
});

export type PreferenceInput = z.input<typeof preferenceInputSchema>;
export type ParsedPreferenceInput = z.output<typeof preferenceInputSchema>;

export function getPreferenceInputFromFormData(formData: FormData) {
  return {
    budgetLevel: formData.get("budgetLevel"),
    pace: formData.get("pace"),
    interests: formData.getAll("interests"),
    transportationModes: formData.getAll("transportationModes"),
    accommodationTypes: formData.getAll("accommodationTypes"),
    hotelPriority: formData.get("hotelPriority"),
    walkingToleranceKm: formData.get("walkingToleranceKm"),
    dietaryRestrictions: formData.get("dietaryRestrictions"),
    accessibilityNeeds: formData.get("accessibilityNeeds"),
    mustAvoid: formData.get("mustAvoid"),
    customNotes: formData.get("customNotes"),
    customPreferences: formData.getAll("customPreferences"),
  };
}

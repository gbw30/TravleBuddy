import { z } from "zod";

export const preferenceSourceSchema = z.enum([
  "EXPLICIT",
  "INFERRED",
  "DEFAULT",
]);

export const unitIntervalSchema = z.number().finite().min(0).max(1);

export const observedAtSchema = z.string().datetime({ offset: true });

export const weightedPreferenceSignalSchema = z
  .object({
    weight: unitIntervalSchema,
    confidence: unitIntervalSchema,
    source: preferenceSourceSchema,
    observedAt: observedAtSchema,
  })
  .strict();

export const travelPaceSchema = z.enum(["RELAXED", "BALANCED", "PACKED"]);

export const categoricalPreferenceSignalSchema = z
  .object({
    value: travelPaceSchema,
    confidence: unitIntervalSchema,
    source: preferenceSourceSchema,
    observedAt: observedAtSchema,
  })
  .strict();

const interestKeySchema = z.string().trim().min(1).max(100);

export const adaptivePreferenceSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    interests: z
      .record(interestKeySchema, weightedPreferenceSignalSchema)
      .refine(
        (interests) => Object.keys(interests).length <= 64,
        "A preference snapshot cannot contain more than 64 interests.",
      ),
    priceSensitivity: weightedPreferenceSignalSchema,
    pace: categoricalPreferenceSignalSchema.nullable(),
  })
  .strict();

export const feedbackActionSchema = z.enum([
  "ACCEPT",
  "REJECT",
  "REFRESH",
  "REFINE",
  "SELECT",
  "DESELECT",
  "IGNORE",
  "RESOLVE",
  "REQUEST_ALTERNATIVE",
]);

export const feedbackReasonSchema = z.enum([
  "NOT_INTERESTED",
  "TOO_EXPENSIVE",
  "TOO_FAR",
  "WRONG_VIBE",
  "ALREADY_BEEN_THERE",
  "TOO_BUSY",
  "TOO_SLOW",
  "GOOD_MATCH",
  "OTHER",
]);

export const adaptationFeedbackSchema = z
  .object({
    eventId: z.string().trim().min(1).max(191),
    action: feedbackActionSchema,
    reason: feedbackReasonSchema.nullable(),
    observedAt: observedAtSchema,
  })
  .strict();

export const itineraryItemFeedbackInputSchema = z
  .object({
    action: z.enum(["REJECT", "REQUEST_ALTERNATIVE"]),
    reason: feedbackReasonSchema,
    userNote: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

export const suggestionCategorySchema = z.enum([
  "DESTINATION",
  "HOTEL",
  "ATTRACTION",
  "RESTAURANT",
  "ACTIVITY",
  "LANDMARK",
  "ENTERTAINMENT",
]);

export const replacementCandidateSchema = z
  .object({
    id: z.string().trim().min(1).max(191),
    providerPlaceId: z.string().trim().min(1).max(500),
    destinationId: z.string().trim().min(1).max(191),
    category: suggestionCategorySchema,
    name: z.string().trim().min(1).max(500),
    score: z.number().finite().min(0).max(100).nullable(),
    rating: z.number().finite().min(0).max(5).nullable(),
  })
  .strict();

export const replacementCandidateFilterSchema = z
  .object({
    destinationId: z.string().trim().min(1).max(191),
    category: suggestionCategorySchema,
    selectedCandidateIds: z
      .array(z.string().trim().min(1).max(191))
      .max(1_000)
      .default([]),
    selectedProviderPlaceIds: z
      .array(z.string().trim().min(1).max(500))
      .max(1_000)
      .default([]),
    rejectedCandidateIds: z
      .array(z.string().trim().min(1).max(191))
      .max(1_000)
      .default([]),
    rejectedProviderPlaceIds: z
      .array(z.string().trim().min(1).max(500))
      .max(1_000)
      .default([]),
  })
  .strict();

export const adaptationChangeKindSchema = z.enum([
  "REJECT_ITINERARY_ITEM",
  "SAVE_RESTAURANT",
  "SWAP_ITINERARY_ITEM",
  "MARK_DAY_TOO_BUSY",
  "CHANGE_DAILY_START_TIME",
  "REJECT_SIMILAR_ITEMS",
  "CHANGE_TRANSPORTATION",
  "CHANGE_DESTINATION",
  "CHANGE_TRIP_DATES",
  "CHANGE_BUDGET_SUBSTANTIALLY",
  "CHANGE_TRAVELERS",
  "CHANGE_HOTEL_AREA",
]);

export const adaptationImpactLevelSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

export const copyOnWriteItemSchema = z
  .object({
    id: z.string().trim().min(1).max(191),
    placeSuggestionId: z.string().trim().min(1).max(191).nullable().optional(),
    sortOrder: z.number().int().nonnegative(),
  })
  .passthrough();

export const copyOnWriteDaySchema = z
  .object({
    id: z.string().trim().min(1).max(191),
    dayNumber: z.number().int().positive(),
    items: z.array(copyOnWriteItemSchema),
  })
  .passthrough();

export const copyOnWriteItinerarySchema = z
  .object({
    days: z.array(copyOnWriteDaySchema),
  })
  .passthrough();

export type PreferenceSource = z.infer<typeof preferenceSourceSchema>;
export type WeightedPreferenceSignal = z.infer<
  typeof weightedPreferenceSignalSchema
>;
export type CategoricalPreferenceSignal = z.infer<
  typeof categoricalPreferenceSignalSchema
>;
export type AdaptivePreferenceSnapshot = z.infer<
  typeof adaptivePreferenceSnapshotSchema
>;
export type AdaptationFeedback = z.infer<typeof adaptationFeedbackSchema>;
export type ItineraryItemFeedbackInput = z.infer<
  typeof itineraryItemFeedbackInputSchema
>;
export type SuggestionCategory = z.infer<typeof suggestionCategorySchema>;
export type ReplacementCandidate = z.infer<typeof replacementCandidateSchema>;
export type ReplacementCandidateFilter = z.input<
  typeof replacementCandidateFilterSchema
>;
export type ParsedReplacementCandidateFilter = z.output<
  typeof replacementCandidateFilterSchema
>;
export type AdaptationChangeKind = z.infer<typeof adaptationChangeKindSchema>;
export type AdaptationImpactLevel = z.infer<typeof adaptationImpactLevelSchema>;

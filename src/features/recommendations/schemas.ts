import { z } from "zod";
import { recommendationRejectReasons } from "./feedback-policy";

export const planningTopicSchema = z.enum([
  "HOTEL_BASE",
  "ACTIVITIES",
  "FOOD_NIGHTLIFE",
  "BUDGET_PACE",
]);

export const generateRecommendationsInputSchema = z.object({
  topic: planningTopicSchema,
  destinationId: z.string().trim().min(1).optional(),
  planningDayNumber: z.number().int().positive().optional(),
});

export const refreshRecommendationsInputSchema = z.object({
  topic: planningTopicSchema,
  note: z.string().trim().min(1),
  destinationId: z.string().trim().min(1).optional(),
  planningDayNumber: z.number().int().positive().optional(),
});

export const rejectRecommendationInputSchema = z.object({
  reason: z.enum(recommendationRejectReasons),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((value) => value || null),
});

export type GenerateRecommendationsInput = z.infer<
  typeof generateRecommendationsInputSchema
>;
export type RefreshRecommendationsInput = z.infer<
  typeof refreshRecommendationsInputSchema
>;
export type RejectRecommendationInput = z.infer<
  typeof rejectRecommendationInputSchema
>;

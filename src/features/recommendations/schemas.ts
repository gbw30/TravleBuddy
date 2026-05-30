import { z } from "zod";

export const planningTopicSchema = z.enum([
  "HOTEL_BASE",
  "ACTIVITIES",
  "FOOD_NIGHTLIFE",
  "BUDGET_PACE",
]);

export const generateRecommendationsInputSchema = z.object({
  topic: planningTopicSchema,
});

export const refreshRecommendationsInputSchema = z.object({
  topic: planningTopicSchema,
  note: z.string().trim().min(1),
});

export type GenerateRecommendationsInput = z.infer<
  typeof generateRecommendationsInputSchema
>;
export type RefreshRecommendationsInput = z.infer<
  typeof refreshRecommendationsInputSchema
>;

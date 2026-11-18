// What the Memory service knows about a traveller's taste. Safe to import in
// the browser: this file must not import server code.
import { z } from "zod";

/** The topics of taste, in the order the conversation covers them (PRD 7.3). */
export const TASTE_TOPICS = [
  "pace",
  "day_shape",
  "interests",
  "atmosphere",
  "food",
  "getting_around",
  "stay",
  "budget_priorities",
] as const;
export type TasteTopic = (typeof TASTE_TOPICS)[number];

/** An answer on one topic: the values chosen, and whether they were told or a default. */
export const tripAnswerSchema = z.object({
  values: z.array(z.string().trim().min(1).max(80)).max(8),
  source: z.enum(["told", "default"]),
});
export type TripAnswer = z.infer<typeof tripAnswerSchema>;
export type AnswerSource = TripAnswer["source"];

/** The traveller's taste for one trip, by topic (PRD 12.1). */
export type TripTaste = Partial<Record<TasteTopic, TripAnswer>>;

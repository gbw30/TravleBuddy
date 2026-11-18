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

// The personal profile: what the site believes about a traveller across
// trips (PRD 12.2).

/** Hard limits. A proposal never breaks one; everything else is a taste. */
export const LIMIT_TOPICS = ["dietary_rules", "allergies"] as const;
/** The fixed set of topics the ranking understands (TB-MEM-03, TB-MEM-14). */
export const PROFILE_TOPICS = [
  ...TASTE_TOPICS,
  "budget",
  ...LIMIT_TOPICS,
] as const;
export type ProfileTopic = (typeof PROFILE_TOPICS)[number];
/** Topics that can hold several values at once. The others hold one. */
export const MULTI_TOPICS: readonly ProfileTopic[] = [
  "interests",
  "food",
  "dietary_rules",
  "allergies",
];

/** How sure the site is: learned once, learned and seen again, or said by the traveller. */
export const SURENESS = ["think", "usually", "always"] as const;
export type Sureness = (typeof SURENESS)[number];

const entrySourceSchema = z.discriminatedUnion("type", [
  /** The traveller said so. */
  z.object({ type: z.literal("told") }),
  /** Learned from trips; the most recent is named (TB-MEM-06). */
  z.object({
    type: z.literal("trip"),
    tripId: z.string().min(1).max(80),
    tripTitle: z.string().trim().min(1).max(120),
  }),
]);
export type EntrySource = z.infer<typeof entrySourceSchema>;

/** One thing the site believes: a value on a topic, how sure, and from where (TB-MEM-04). */
export const profileEntrySchema = z.object({
  topic: z.enum(PROFILE_TOPICS),
  value: z.string().trim().min(1).max(80),
  sureness: z.enum(SURENESS),
  source: entrySourceSchema,
});
export type ProfileEntry = z.infer<typeof profileEntrySchema>;

/**
 * Something the traveller said that fits no topic, such as "I hate queues".
 * It is kept and shown, and does not yet affect suggestions (TB-MEM-14).
 */
export const profileNoteSchema = z.object({
  text: z.string().trim().min(1).max(300),
});
export type ProfileNote = z.infer<typeof profileNoteSchema>;

export const kindOf = (topic: ProfileTopic): "hard_limit" | "taste" =>
  (LIMIT_TOPICS as readonly string[]).includes(topic) ? "hard_limit" : "taste";

/** Sureness in the words the traveller reads. */
export const SURENESS_WORDS: Record<Sureness, string> = {
  think: "I think",
  usually: "usually",
  always: "always",
};

/** Where an entry came from, in the words the traveller reads. */
export const sourceWords = (source: EntrySource): string =>
  source.type === "told"
    ? "you told me"
    : `from your trip “${source.tripTitle}”`;

/** Each topic in the words the traveller reads. */
export const TOPIC_NAMES: Record<ProfileTopic, string> = {
  pace: "Pace",
  day_shape: "Shape of the day",
  interests: "Interests",
  atmosphere: "Atmosphere",
  food: "Food",
  getting_around: "Getting around",
  stay: "Where you stay",
  budget_priorities: "Spending",
  budget: "Budget",
  dietary_rules: "Dietary rules",
  allergies: "Allergies",
};

/** What a topic can hold, for the profile page and for filing what is said. */
export type ProfileTopicInfo = {
  topic: ProfileTopic;
  name: string;
  kind: "hard_limit" | "taste";
  /** Whether the topic holds several values at once. */
  several: boolean;
  /** The values the ranking understands, with the words to show them. */
  choices: { value: string; label: string }[];
  /** The topic takes the traveller's own words, such as an allergy. */
  freeText: boolean;
};

export { fileUnder, type Filed } from "./profile-filing";

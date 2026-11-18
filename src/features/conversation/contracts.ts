// The shapes of the guided conversation. Safe to import in the browser: this
// file must not import server code.
import { z } from "zod";

import {
  TASTE_TOPICS,
  type AnswerSource,
  type TasteTopic,
  type TripAnswer,
  type TripTaste,
} from "@/features/memory/contracts";
import { COMMITMENT_KINDS } from "@/features/trips/contracts";
import { CURRENCIES } from "@/lib/currency";

/** The facts the agent needs first (PRD 7.2). */
export const FACT_TOPICS = [
  "where",
  "when",
  "who",
  "budget",
  "firmness",
  "decided",
  "purpose",
] as const;
export type FactTopic = (typeof FACT_TOPICS)[number];
// The topics of taste belong to the Memory service; the conversation asks
// about them one at a time (PRD 7.3).
export { TASTE_TOPICS, type AnswerSource, type TasteTopic, type TripAnswer };
/** Asked once, when an answer goes against the personal profile (PRD 7.6). */
export const DIFFERENCE_TOPIC = "difference";
export type Topic = FactTopic | TasteTopic | typeof DIFFERENCE_TOPIC;
const ALL_TOPICS = [...FACT_TOPICS, ...TASTE_TOPICS, DIFFERENCE_TOPIC] as const;

/** How a question is answered by tapping (PRD 7.1). Typing is always allowed too. */
export type QuestionForm =
  | "pick_one"
  | "pick_several"
  | "this_or_that"
  | "open_text";

export type Choice = { value: string; label: string };

export type Question = {
  topic: Topic;
  stage: "facts" | "taste" | "memory";
  form: QuestionForm;
  prompt: string;
  choices: Choice[];
  /** What the agent says when the question is skipped: the default it uses. */
  skipSays: string;
  /**
   * The answer the personal profile already holds. The question then asks
   * to confirm it instead of asking from scratch (TB-AGT-06).
   */
  remembered?: string[];
};

/**
 * What the script goes by: the traveller's taste for this trip, by topic, and
 * the fact questions they chose to skip.
 */
export type TripProfile = {
  taste: TripTaste;
  skippedFacts: FactTopic[];
};
export const emptyTripProfile: TripProfile = { taste: {}, skippedFacts: [] };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const text = (max: number) => z.string().trim().min(1).max(max);

/**
 * What a typed message means, as structured data. Both the rule-based reader
 * and the AI model produce this shape, and nothing changes until it has been
 * checked against this schema (TB-AGT-14, TB-TRU-03).
 */
export const intentSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("facts"),
    /** City names as typed; each is looked up before it is saved. */
    cities: z.array(text(80)).max(12).optional(),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
    lengthNights: z.number().int().min(1).max(365).optional(),
    timeOfYear: z.number().int().min(1).max(12).optional(),
    adults: z.number().int().min(1).max(20).optional(),
    children: z.number().int().min(0).max(20).optional(),
    budgetAmount: z.number().positive().max(10_000_000).optional(),
    budgetCurrency: z.enum(CURRENCIES).optional(),
    budgetBasis: z.enum(["TRIP", "DAY"]).optional(),
    datesFirmness: z.enum(["FIXED", "FLEXIBLE"]).optional(),
    budgetFirmness: z.enum(["FIXED", "FLEXIBLE"]).optional(),
    purpose: text(120).optional(),
  }),
  z.object({
    type: z.literal("taste"),
    topic: z.enum(TASTE_TOPICS),
    values: z.array(text(80)).min(1).max(8),
  }),
  /** "I've booked teamLab for Thursday at 3" (TB-FIX-05). */
  z.object({
    type: z.literal("commitment"),
    kind: z.enum(COMMITMENT_KINDS),
    title: text(160),
    date: isoDate.optional(),
    startTime: clock.optional(),
    endTime: clock.optional(),
  }),
  /** "Let's do day 4 first" (TB-AGT-11). */
  z.object({
    type: z.literal("go_to"),
    day: z.number().int().min(1).max(400),
    part: z.enum(["morning", "lunch", "afternoon", "dinner"]).optional(),
  }),
  z.object({ type: z.literal("skip") }),
  /** Nothing the agent can act on. */
  z.object({ type: z.literal("none") }),
]);
export type Intent = z.infer<typeof intentSchema>;

/** One entry in the saved conversation (TB-AGT-13). */
export const messageBodySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: text(1200) }),
  /** A question the agent asked. The topic finds its choices in the script. */
  z.object({
    kind: z.literal("question"),
    topic: z.enum(ALL_TOPICS),
    text: text(600),
  }),
  /** The cards the agent offered for a slot. */
  z.object({
    kind: z.literal("proposal"),
    slotId: z.string().max(40),
    text: text(600),
    placeNames: z.array(text(160)).max(3),
  }),
]);
export type MessageBody = z.infer<typeof messageBodySchema>;

export type ConversationMessage = {
  id: string;
  from: "agent" | "traveller";
  body: MessageBody;
  at: string;
};

/** One thing the traveller does in the conversation. */
export const turnSchema = z.discriminatedUnion("type", [
  /** A tapped choice, or several, for the question that is waiting. */
  z.object({
    type: z.literal("answer"),
    topic: z.enum(ALL_TOPICS),
    values: z.array(text(80)).min(1).max(8),
  }),
  z.object({
    type: z.literal("skip"),
    topic: z.enum(ALL_TOPICS),
  }),
  /** A typed message. */
  z.object({ type: z.literal("say"), text: text(600) }),
]);
export type Turn = z.infer<typeof turnSchema>;

/** What a turn answers. The screen then reads the conversation again. */
export type TurnResult = {
  /** The slot the traveller asked to work on, when they named a day. */
  focus: string | null;
  /** Whether the turn changed the trip, its taste or its plan. A message that could not be read changes nothing. */
  changed: boolean;
};

/** Everything the conversation screen needs. */
export type ConversationSnapshot = {
  messages: ConversationMessage[];
  /** The question waiting for an answer. It is worked out, not saved, until it is answered. */
  waiting: Question | null;
  /** What the agent still needs before it can propose anything (TB-AGT-08). */
  needs: string[];
  /** The AI model is off or at its cap: only tap choices and simple typed answers are read (TB-AGT-15). */
  limited: boolean;
};

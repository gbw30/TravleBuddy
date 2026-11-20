// The shape of a plan. Safe to import in the browser: this file must not
// import server code.
import { z } from "zod";

import type { TravelMeans } from "@/features/places/contracts";
import type { CommitmentKind } from "@/features/trips/contracts";

export const PACES = ["relaxed", "balanced", "packed"] as const;
export type Pace = (typeof PACES)[number];

export const SLOT_KINDS = [
  "breakfast",
  "morning",
  "morning-2",
  "lunch",
  "afternoon",
  "afternoon-2",
  "dinner",
] as const;
export type SlotKind = (typeof SLOT_KINDS)[number];
/** What a traveller calls each slot. */
export const SLOT_WORDS: Record<SlotKind, string> = {
  breakfast: "Breakfast",
  morning: "Morning",
  "morning-2": "Late morning",
  lunch: "Lunch",
  afternoon: "Afternoon",
  "afternoon-2": "Late afternoon",
  dinner: "Dinner",
};

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * What the traveller has chosen. Everything else in a plan (times, travel,
 * flags) is worked out from these choices and the trip's facts, so the same
 * choices always give the same plan (TB-ITN-17).
 */
export const planStateSchema = z.object({
  pace: z.enum(PACES),
  /** The first day assumed while the trip has no dates (TB-ITN-18). */
  provisionalStart: isoDate.nullable(),
  /** Slot id to the place chosen for it. `minutes` is the traveller's own visit length. */
  picks: z.record(
    z.string(),
    z.object({
      placeId: z.string(),
      minutes: z.number().int().min(10).max(600).nullable(),
    }),
  ),
  /** Places saved for later, and why a place landed here when it could not be fitted. */
  shelf: z.array(
    z.object({ placeId: z.string(), reason: z.string().max(200).nullable() }),
  ),
  /** Day number to the departure time of an assumed transfer the traveller moved. */
  transferTimes: z.record(z.string(), clock),
});
export type PlanState = z.infer<typeof planStateSchema>;

export const emptyPlanState: PlanState = {
  pace: "balanced",
  provisionalStart: null,
  picks: {},
  shelf: [],
  transferTimes: {},
};

const slot = z.string().regex(/^d\d{1,3}-[a-z0-9-]{4,12}$/);
const placeId = z.string().min(1).max(80);

/** One change the traveller makes to a plan. */
export const planActionSchema = z.discriminatedUnion("type", [
  /** Put a place in a slot: a picked card, or a place from the shelf. */
  z.object({ type: z.literal("pick"), slotId: slot, placeId }),
  z.object({ type: z.literal("save"), placeId }),
  z.object({ type: z.literal("unshelve"), placeId }),
  z.object({ type: z.literal("move"), fromSlotId: slot, toSlotId: slot }),
  z.object({ type: z.literal("remove"), slotId: slot }),
  z.object({
    type: z.literal("minutes"),
    slotId: slot,
    /** Null returns to the standard visit length. */
    minutes: z.number().int().min(10).max(600).nullable(),
  }),
  z.object({ type: z.literal("pace"), pace: z.enum(PACES) }),
  z.object({
    type: z.literal("transfer"),
    day: z.number().int().min(1).max(400),
    start: clock,
  }),
  z.object({ type: z.literal("undo") }),
  /** "Show me others": turn down a whole set or one card, with reasons (TB-CRD-07). */
  z.object({
    type: z.literal("others"),
    slotId: slot,
    placeIds: z.array(placeId).min(1).max(3),
    reasons: z.array(z.string().max(40)).max(8),
    note: z
      .string()
      .trim()
      .max(300)
      .nullish()
      .transform((value) => value || null),
  }),
]);
export type PlanAction = z.infer<typeof planActionSchema>;

/**
 * How far a Quick plan build has come (PRD 11.3). A build fills one day per
 * request, so this is what lets it resume.
 */
export const buildProgressSchema = z.object({
  /** The next day to build, from 1. Past the last day, the build is finished. */
  nextDay: z.number().int().min(1).max(401),
  /** What the build put where: slot id to place id. */
  built: z.record(z.string(), z.string()),
  /** Slots where the second-ranked place was nearly as good as the one taken. */
  close: z.array(z.string()),
  /** Slots it found no place for. They stay open. */
  empty: z.array(z.string()),
  /** True when places could not be gathered, so only saved ones were used. */
  unreachable: z.boolean(),
});
export type BuildProgress = z.infer<typeof buildProgressSchema>;

/** A rule of PRD 9.3 the plan breaks at one item, with a way to mend it. */
export type PlanFlag = {
  rule: "closed" | "hours-unknown" | "overlap" | "day" | "city";
  message: string;
  fix: string | null;
};

export type TravelLeg = { means: TravelMeans; minutes: number };

export type PlanEntry =
  | {
      type: "open";
      slotId: string;
      kind: SlotKind;
      start: string;
      /** The city the traveller is in at this slot: lower-case "name|country". */
      cityKey: string;
    }
  | {
      type: "place";
      slotId: string;
      kind: SlotKind;
      cityKey: string;
      placeId: string;
      start: string;
      minutes: number;
      /** False when the traveller set the visit length themselves. */
      minutesEstimated: boolean;
      /** Estimated travel from the item before it. Null when unknown. */
      travelIn: TravelLeg | null;
      flags: PlanFlag[];
    }
  | {
      /** Something already decided. Never moved or removed by the plan. */
      type: "commitment";
      commitmentId: string;
      commitmentKind: CommitmentKind;
      title: string;
      /** Null for a must-include with no time yet. */
      start: string | null;
      minutes: number | null;
      /** The slot a must-include with no time has been given. */
      slotId: string | null;
      /** A ticket's ends and arrival clock, each by the clock of its place. */
      ticket: { from: string; to: string; arrives: string | null } | null;
    }
  | {
      /** Travel between cities with no ticket yet: assumed, not booked (TB-ITN-19). */
      type: "transfer";
      from: string;
      to: string;
      start: string;
      /** How long the journey takes. */
      minutes: number;
      /** When it arrives by the clock there, if that clock differs from the one left behind. */
      arriveLocal: string | null;
    }
  | { type: "wander"; start: string; minutes: number; area: string | null }
  | {
      /** Time the plan allows to get to a ticket, or away from one. Shown, never hidden. */
      type: "allowance";
      way: "to" | "from";
      /** The ticket's mode, as the trip records it. Null when it has no details. */
      mode: string | null;
      start: string;
      minutes: number;
    }
  /** Breakfast that comes with the stay: a quiet row, with nothing to choose. */
  | { type: "breakfast-at-stay"; start: string; minutes: number };

export type PlanDay = {
  day: number;
  date: string;
  /** Where the day starts. */
  city: string;
  entries: PlanEntry[];
};

/** A fact the plan cannot be laid out without. */
export type PlanBlocker = "where" | "when" | "nights";

export type PlanView = {
  /** Empty while a blocker remains. */
  days: PlanDay[];
  blockers: PlanBlocker[];
  pace: Pace;
  /** True when the dates are assumed, not the traveller's own. */
  provisionalDates: boolean;
  shelf: { placeId: string; reason: string | null }[];
  /** Commitments with no time that no day had room for. Never dropped. */
  unplaced: { commitmentId: string; title: string; reason: string }[];
};

/** Where a ticket's journey starts and ends. Null when the mode is not known. */
export const placeWordFor = (mode: string | null): string | null =>
  mode === null
    ? null
    : mode === "FLIGHT"
      ? "airport"
      : mode === "FERRY"
        ? "port"
        : "station";

// The shape of a plan. Safe to import in the browser: this file must not
// import server code.
import { z } from "zod";

import type { TravelMeans } from "@/features/places/contracts";
import type { CommitmentKind } from "@/features/trips/contracts";

export const PACES = ["relaxed", "balanced", "packed"] as const;
export type Pace = (typeof PACES)[number];

export const SLOT_KINDS = [
  "morning",
  "morning-2",
  "lunch",
  "afternoon",
  "afternoon-2",
  "dinner",
] as const;
export type SlotKind = (typeof SLOT_KINDS)[number];

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

/** A rule of PRD 9.3 the plan breaks at one item, with a way to mend it. */
export type PlanFlag = {
  rule: "closed" | "hours-unknown" | "overlap" | "day" | "city";
  message: string;
  fix: string | null;
};

export type TravelLeg = { means: TravelMeans; minutes: number };

export type PlanEntry =
  | { type: "open"; slotId: string; kind: SlotKind; start: string }
  | {
      type: "place";
      slotId: string;
      kind: SlotKind;
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
    }
  | {
      /** Travel between cities with no ticket yet: assumed, not booked (TB-ITN-19). */
      type: "transfer";
      from: string;
      to: string;
      start: string;
      minutes: number;
    }
  | { type: "wander"; start: string; minutes: number; area: string | null };

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

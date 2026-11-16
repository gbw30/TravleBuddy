import type { CardPlace } from "@/components/keepsake/types";

export type SamplePlace = CardPlace & { visitMinutes: number };

export type Slot = {
  id: string;
  day: number;
  start: string;
  label: string;
  /** Travel leg shown above this slot. */
  travelIn: { means: string; minutes: number } | null;
};

export type Entry =
  | {
      type: "item";
      slotId: string;
      placeId: string;
      locked: boolean;
      flag: string | null;
    }
  | { type: "wander"; slotId: string; minutes: number; area: string | null }
  | { type: "open"; slotId: string };

export type Commitment = {
  id: string;
  kind: "transport" | "stay" | "reservation" | "must-see" | "other";
  title: string;
  date: string;
  time: string | null;
};

export type SampleTrip = {
  title: string;
  days: { day: number; city: string; date: string }[];
  /** In time order across the trip. */
  slots: Slot[];
  /** Slot ids in the order the agent proposes (PRD 7.5). */
  fillOrder: string[];
  places: Record<string, SamplePlace>;
  /** Slot id to successive sets of place ids. */
  proposals: Record<string, string[][]>;
  /** One entry per slot, in the same order as `slots`. */
  initial: Entry[];
  commitments: Commitment[];
  /** `${placeId}@${slotId}` to the rule that placement breaks. */
  moveFlags: Record<string, string>;
  /** Slot id to the agent's proposal sentence. */
  agentLines: Record<string, string>;
};

export type PlanningState = {
  entries: Entry[];
  shelf: string[];
  discarded: string[];
  activeSlotId: string | null;
  /** Slot id to the index of the proposal set now showing. */
  proposalSet: Record<string, number>;
  /** Undo stack, newest last. */
  past: Omit<PlanningState, "past">[];
};

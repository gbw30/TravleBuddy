// The shape of a plan answer. Types only, so the browser may import it.
import type { PlanView } from "@/features/itinerary/contracts";
import type { CardDto, CardSet } from "@/features/recommendations/contracts";

/**
 * Whether the places for a proposal could be gathered. "pending": they have
 * not been asked for yet, and reading the plan again will ask. "unavailable"
 * and "capped": the cards come from saved places only, and the screen says so
 * (TB-TRU-06, TB-SYS-11).
 */
export type ProposalStatus = "ready" | "pending" | "unavailable" | "capped";

/** One sentence of a build's report. `slotId` when the traveller can choose there. */
export type ReportLine = { line: string; slotId: string | null };

/**
 * What a Quick plan build did, as the agent reports it (PRD 11.4). Worked
 * out from the plan as it stands, so it stays true after the traveller
 * changes things.
 */
export type BuildReport = {
  /** The page asks for the next day until this is false (PRD 11.3). */
  building: boolean;
  /** Each day, and whether the build has been through it. */
  days: { day: number; date: string; built: boolean }[];
  /** What it built, in two or three sentences. */
  built: string[];
  /** What it assumed, each with the step of the brief where it is changed. */
  assumed: { line: string; step: number }[];
  /** What is on the shelf and why, and the slots it found nothing for. */
  unfitted: ReportLine[];
  /** Where it was unsure. */
  unsure: ReportLine[];
};

/** Everything the workspace screen needs to show a plan. */
export type PlanSnapshot = {
  view: PlanView;
  /** A card for every place in the plan and on the shelf, by place id. */
  chosen: Record<string, CardDto>;
  /** The cards for the slot in focus. Null when there is no slot to fill. */
  proposal: (CardSet & { status: ProposalStatus; cityName: string }) | null;
  /**
   * Guided planning proposes meals once the food question is answered or
   * skipped (TB-AGT-07). "food" means the slot in focus is a meal and the
   * agent is waiting for that answer; there is then no proposal.
   */
  holding: "food" | null;
  /** A shelved place that fits the open slot in focus, for the agent to offer (TB-ITN-14). */
  shelfOffer: { placeId: string; name: string; slotId: string } | null;
  canUndo: boolean;
  /** The report of a build, or its progress while it runs. Null when none was started. */
  build: BuildReport | null;
};

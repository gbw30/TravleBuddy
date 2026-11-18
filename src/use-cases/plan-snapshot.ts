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
};

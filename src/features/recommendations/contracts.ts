// What a card and a set of cards look like. Safe to import in the browser:
// this file must not import server code.
import type { PlaceDto, TravelMeans } from "@/features/places/contracts";

/** The common reasons for turning a card down (PRD 8.3). */
export const DISCARD_REASONS = [
  { key: "too_expensive", label: "Too expensive" },
  { key: "too_far", label: "Too far" },
  { key: "not_my_taste", label: "Not my taste" },
  { key: "already_been", label: "Already been" },
  { key: "too_touristy", label: "Too touristy" },
  { key: "too_busy", label: "Too busy or loud" },
  { key: "wrong_time", label: "Wrong time of day" },
  { key: "other", label: "Something else" },
] as const;
export type DiscardReason = (typeof DISCARD_REASONS)[number]["key"];

/** The key for a reason given by its key or its label; null when it is neither. */
export function discardReason(text: string): DiscardReason | null {
  const found = DISCARD_REASONS.find(
    (reason) => reason.key === text || reason.label === text,
  );
  return found?.key ?? null;
}

/**
 * A place as a card shows it. Every fact comes from saved place data; a fact
 * the data lacks is null and shown as unknown (TB-TRU-02, TB-TRU-05).
 */
export type CardDto = {
  placeId: string;
  name: string;
  origin: PlaceDto["origin"];
  kind: PlaceDto["kind"];
  /** One line for the front: the kind, and the travel time when known. */
  essentials: string;
  summary: string;
  /** Why it suits this traveller and this slot, built from what ranked it. */
  reason: string;
  address: string | null;
  /** Opening hours as the provider wrote them. */
  hours: string | null;
  /** The standard visit length for its kind: an estimate. */
  visitMinutes: number;
  /** Estimated travel from the stop before it. Null when a position is unknown. */
  travel: { means: TravelMeans; minutes: number } | null;
  /**
   * The traveller's hard limits the place's listing cannot confirm, such as
   * "vegetarian" or "shellfish allergy" (TB-MEM-05). The card is marked, and
   * no card ever says a place is safe for an allergy. Absent or empty: none.
   */
  unconfirmed?: string[];
};

/** The proposal for one slot. */
export type CardSet = {
  slotId: string;
  cards: CardDto[];
  /** Fewer than three places fit; the set is never padded (TB-CRD-01). */
  short: boolean;
};

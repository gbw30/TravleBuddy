import type { SlotKind } from "@/features/itinerary/contracts";
import {
  distanceKm,
  isOpenFor,
  kindLabel,
  parseOpeningHours,
  travelEstimate,
  visitMinutes,
  type PlaceDto,
  type PlaceKind,
} from "@/features/places/contracts";

import type { CardDto, CardSet } from "./contracts";

// Which places are offered for a slot, in what order, and why. Fixed rules
// only: no randomness and no clock, and ties are broken by place id, so the
// same inputs always give the same cards (TB-TRU-04).

/** What the traveller's earlier answers on this trip say about their taste. */
export type CardHistory = {
  /** Places turned down. They are not offered again in this trip (TB-CRD-09). */
  discarded: string[];
  /** How strongly "too far" has been said: 0 to 3. */
  tooFar: number;
  /** How strongly "too touristy" has been said: 0 to 3. */
  lessTouristy: number;
  /** Kinds of place turned down as "not my taste". */
  dislikedKinds: PlaceKind[];
};

export const noHistory: CardHistory = {
  discarded: [],
  tooFar: 0,
  lessTouristy: 0,
  dislikedKinds: [],
};

export type ProposeInput = {
  slot: { id: string; kind: SlotKind; date: string; start: string };
  cityName: string;
  /** The stop just before the slot, when its position is known. */
  from: { name: string; latitude: number; longitude: number } | null;
  /** Saved places of the slot's city that suit the slot's kind. */
  candidates: PlaceDto[];
  /** Places already in the plan or on the shelf. */
  taken: string[];
  /** Kinds of place already in this day. */
  kindsInDay: PlaceKind[];
  history: CardHistory;
};

const slotWord: Record<SlotKind, string> = {
  morning: "morning",
  "morning-2": "late morning",
  lunch: "lunch",
  afternoon: "afternoon",
  "afternoon-2": "late afternoon",
  dinner: "dinner",
};
const meansWord = { walk: "walk", transit: "ride", drive: "drive" } as const;

type Ranked = {
  place: PlaceDto;
  score: number;
  open: "open" | "unknown";
  travel: ReturnType<typeof travelEstimate> | null;
  fresh: boolean;
};

function rank(input: ProposeInput): Ranked[] {
  const { slot, from, history } = input;
  const out = new Set([...input.taken, ...history.discarded]);

  return input.candidates
    .flatMap((place): Ranked[] => {
      if (out.has(place.id)) return [];
      const minutes = visitMinutes(place.kind);
      const open = isOpenFor(
        parseOpeningHours(place.openingHours),
        slot.date,
        slot.start,
        minutes,
      );
      // A place known to be closed for the visit is never offered (TB-ITN-05).
      if (open === "closed") return [];

      const point =
        place.latitude === null || place.longitude === null
          ? null
          : { latitude: place.latitude, longitude: place.longitude };
      const fresh = !input.kindsInDay.includes(place.kind);
      let score = 0;
      if (from && point) {
        // Nearer is better, and more so once the traveller has said "too far".
        score -= distanceKm(from, point) * (1 + history.tooFar);
      }
      if (place.notable) score += 2 - 1.5 * history.lessTouristy;
      if (open === "open") score += 0.5;
      if (!fresh) score -= 1.5;
      if (history.dislikedKinds.includes(place.kind)) score -= 3;

      return [
        {
          place,
          score,
          open,
          travel: from && point ? travelEstimate(from, point) : null,
          fresh,
        },
      ];
    })
    .sort((a, b) => b.score - a.score || (a.place.id < b.place.id ? -1 : 1));
}

/** One to three sentences from the factors that ranked the place (PRD 13). */
function reasonFor(ranked: Ranked, input: ProposeInput): string {
  const { place, travel } = ranked;
  const sentences: string[] = [];
  const slot = slotWord[input.slot.kind];

  if (travel && input.from) {
    sentences.push(
      `It is about a ${travel.minutes}-minute ${meansWord[travel.means]} from ${input.from.name}, so it fits your ${slot}.`,
    );
  } else {
    sentences.push(`It fits your ${slot} in ${input.cityName}.`);
  }

  if (input.history.tooFar > 0 && travel) {
    sentences.push(
      "You said the last places were too far, so I looked closer.",
    );
  } else if (input.history.lessTouristy > 0 && !place.notable) {
    sentences.push(
      "You asked for somewhere less touristy, and this is a quieter choice.",
    );
  } else if (ranked.fresh && input.kindsInDay.length > 0) {
    sentences.push(
      `You have no ${kindLabel(place.kind).toLowerCase()} in this day yet.`,
    );
  } else if (place.notable) {
    sentences.push(`It is one of ${input.cityName}'s well-known places.`);
  }

  sentences.push(
    ranked.open === "open"
      ? "It is open for the whole visit."
      : "Its opening hours are not known, so check before you go.",
  );
  return sentences.slice(0, 3).join(" ");
}

/** A place as a card, with a reason. Used for proposals and for places already chosen. */
export function toCard(
  place: PlaceDto,
  cityName: string,
  reason: string,
  travel: CardDto["travel"] = null,
): CardDto {
  const kind = kindLabel(place.kind);
  const marked =
    place.origin === "SAMPLE"
      ? " Sample data, not a real listing."
      : place.origin === "USER"
        ? " Added by you."
        : "";
  return {
    placeId: place.id,
    name: place.name,
    origin: place.origin,
    kind: place.kind,
    essentials: travel
      ? `${kind} · ${travel.minutes} min ${meansWord[travel.means]}`
      : kind,
    summary: `${kind} in ${cityName}. ${place.openingHours ? `Open ${place.openingHours}.` : "Opening hours unknown."}${marked}`,
    reason,
    address: place.address,
    hours: place.openingHours,
    visitMinutes: visitMinutes(place.kind),
    travel,
  };
}

/**
 * The proposal for a slot: the three best places that fit, or fewer when
 * fewer fit. It is never padded (TB-CRD-01).
 */
export function proposeCards(input: ProposeInput): CardSet {
  const best = rank(input).slice(0, 3);
  return {
    slotId: input.slot.id,
    cards: best.map((ranked) =>
      toCard(
        ranked.place,
        input.cityName,
        reasonFor(ranked, input),
        ranked.travel
          ? { means: ranked.travel.means, minutes: ranked.travel.minutes }
          : null,
      ),
    ),
    short: best.length < 3,
  };
}

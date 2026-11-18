import { SLOT_WORDS, type SlotKind } from "@/features/itinerary/contracts";
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

/**
 * What the traveller said about their taste for this trip, in the form the
 * ranking understands. Price and rating are absent: the place data has neither.
 */
export type CardTaste = {
  /**
   * The interests named, with the words to say them. Empty when left open,
   * null when not asked yet. `from` is the trip an interest is remembered
   * from, when it was not said for this trip.
   */
  interests: { value: string; label: string; from?: string }[] | null;
  atmosphere: "lively" | "quiet" | null;
  /** The traveller likes to get around on foot. */
  onFoot: boolean;
  /** The trips the atmosphere and the way of getting around are remembered from (TB-MEM-06). */
  rememberedFrom?: { atmosphere?: string; onFoot?: string };
  /** Food rules named, such as "vegetarian". Empty when there are none, null when not asked yet. */
  food: string[] | null;
};

export const noTaste: CardTaste = {
  interests: null,
  atmosphere: null,
  onFoot: false,
  food: null,
};

/** The kinds of place each interest means. */
export const INTEREST_KINDS: Record<string, PlaceKind[]> = {
  museums: ["museum"],
  history: ["temple", "sight"],
  nature: ["park"],
  views: ["viewpoint"],
  markets: ["market"],
  activities: ["activity"],
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
  taste: CardTaste;
};

const meansWord = { walk: "walk", transit: "ride", drive: "drive" } as const;

type Ranked = {
  place: PlaceDto;
  score: number;
  open: "open" | "unknown";
  travel: ReturnType<typeof travelEstimate> | null;
  fresh: boolean;
  /** The interest of the traveller's this place answers, if any. */
  interest: { value: string; label: string; from?: string } | undefined;
};

function rank(input: ProposeInput): Ranked[] {
  const { slot, from, history, taste } = input;
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
      const interest = taste.interests?.find((item) =>
        INTEREST_KINDS[item.value]?.includes(place.kind),
      );
      let score = 0;
      if (from && point) {
        // Nearer is better, and more so once the traveller has said "too far"
        // or that they like to walk.
        score -=
          distanceKm(from, point) *
          (1 + history.tooFar + (taste.onFoot ? 0.5 : 0));
      }
      if (interest) score += 2.5;
      if (place.notable) {
        score += 2 - 1.5 * history.lessTouristy;
        if (taste.atmosphere === "lively") score += 1;
        if (taste.atmosphere === "quiet") score -= 1.5;
      }
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
          interest,
        },
      ];
    })
    .sort((a, b) => b.score - a.score || (a.place.id < b.place.id ? -1 : 1));
}

const words = (items: string[]) =>
  items.length < 3
    ? items.join(" and ")
    : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

/**
 * What about the traveller the place rests on (TB-RSN-02). It comes from a
 * factor that ranked the place when one applies; otherwise it says plainly
 * what the traveller has or has not told, with what the place adds.
 */
function travellerSentence(ranked: Ranked, input: ProposeInput): string {
  const { place, travel } = ranked;
  const { history, taste } = input;
  const meal = input.slot.kind === "lunch" || input.slot.kind === "dinner";

  // A food rule is always named: the place data cannot confirm it either
  // way, and the card must say so (PRD 12.2).
  if (meal && taste.food?.length) {
    return `You eat ${words(taste.food)} food, and the place data does not say whether this place serves it, so check with the venue.`;
  }
  // A memory from another trip names that trip (TB-MEM-06).
  const recalled = (trip: string | undefined, said: string, liked: string) =>
    trip ? `I remember from your trip “${trip}” that you ${liked}` : said;
  const from = taste.rememberedFrom ?? {};
  if (ranked.interest) {
    return `${recalled(
      ranked.interest.from,
      `You said you like ${ranked.interest.label}`,
      `like ${ranked.interest.label}`,
    )}.`;
  }
  if (history.tooFar > 0 && travel) {
    return "You said the last places were too far, so I looked closer.";
  }
  if (history.lessTouristy > 0 && !place.notable) {
    return "You asked for somewhere less touristy, and this is a quieter choice.";
  }
  if (taste.atmosphere === "quiet" && !place.notable) {
    return `${recalled(from.atmosphere, "You asked for quiet places", "like quiet places")}, and this is a quieter choice.`;
  }
  if (taste.atmosphere === "lively" && place.notable) {
    return `${recalled(from.atmosphere, "You like lively places", "like lively places")}, and this is one of ${input.cityName}'s well-known ones.`;
  }
  if (taste.onFoot && travel?.means === "walk") {
    return `${recalled(from.onFoot, "You like to get around on foot", "like to get around on foot")}, and this is a walk away.`;
  }

  const adds =
    ranked.fresh && input.kindsInDay.length > 0
      ? `you have no ${kindLabel(place.kind).toLowerCase()} in this day yet`
      : place.notable
        ? `it is one of ${input.cityName}'s well-known places`
        : null;
  const [told, joiner] = meal
    ? taste.food === null
      ? ["You have not told me about food yet", "and"]
      : ["You have no food rules", "and"]
    : taste.interests === null
      ? ["You have not told me what you like to see yet", "and"]
      : taste.interests.length === 0
        ? ["You left what to see open", "and"]
        : ["It is not one of the interests you named", "but"];
  return `${told}${adds ? `, ${joiner} ${adds}` : ""}.`;
}

/**
 * One to three sentences from the factors that ranked the place: what about
 * the slot, what about the traveller, and what is known of its hours (PRD 13).
 */
function reasonFor(ranked: Ranked, input: ProposeInput): string {
  const { travel } = ranked;
  const slot = SLOT_WORDS[input.slot.kind].toLowerCase();
  return [
    travel && input.from
      ? `It is about a ${travel.minutes}-minute ${meansWord[travel.means]} from ${input.from.name}, so it fits your ${slot}.`
      : `It fits your ${slot} in ${input.cityName}.`,
    travellerSentence(ranked, input),
    ranked.open === "open"
      ? "It is open for the whole visit."
      : "Its opening hours are not known, so check before you go.",
  ].join(" ");
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

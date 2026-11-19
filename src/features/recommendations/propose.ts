import { SLOT_WORDS, type SlotKind } from "@/features/itinerary/contracts";
import {
  distanceKm,
  isOpenFor,
  kindLabel,
  parseOpeningHours,
  placeLinks,
  travelEstimate,
  visitMinutes,
  type PlaceDto,
  type PlaceKind,
  type TravelMeans,
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
  /** The way of getting around the traveller named; travel is timed by it. */
  means?: TravelMeans;
  /** The trips the atmosphere and the way of getting around are remembered from (TB-MEM-06). */
  rememberedFrom?: { atmosphere?: string; onFoot?: string };
  /**
   * The dietary rules proposals must respect, such as "vegetarian": those
   * given for this trip and those remembered. Empty when there are none,
   * null when not asked yet. They are hard limits (TB-MEM-05).
   */
  food: string[] | null;
  /** Allergies, in the traveller's words. No listing can confirm these. */
  allergies?: string[];
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
  /** Names of the places already in the plan: another branch of one is not a new idea. */
  namesInPlan?: string[];
  /**
   * Whether putting the place in the slot leaves the plan with no newly
   * broken rule. A place that would push another past its hours, or land
   * on something decided, is not offered (PRD 9.3).
   */
  fits?: (place: PlaceDto) => boolean;
  history: CardHistory;
  taste: CardTaste;
};

const meansWord = { walk: "walk", transit: "ride", drive: "drive" } as const;

const isMeal = (kind: SlotKind) =>
  kind === "breakfast" || kind === "lunch" || kind === "dinner";

type Ranked = {
  place: PlaceDto;
  score: number;
  open: "open" | "unknown";
  travel: ReturnType<typeof travelEstimate> | null;
  fresh: boolean;
  /** Whether its listing says it serves every dietary rule of the traveller's. */
  dietConfirmed: boolean;
  /** The interest of the traveller's this place answers, if any. */
  interest: { value: string; label: string; from?: string } | undefined;
};

function rank(input: ProposeInput): Ranked[] {
  const { slot, from, history, taste } = input;
  const out = new Set([...input.taken, ...history.discarded]);
  const sameNames = new Set(
    (input.namesInPlan ?? []).map((name) => name.toLowerCase()),
  );

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
      // Nor is a place to eat whose listing says it does not serve one of
      // the traveller's dietary rules (TB-MEM-05).
      const rules = isMeal(slot.kind) ? (taste.food ?? []) : [];
      if (rules.some((rule) => place.servesNot.includes(rule))) return [];
      const dietConfirmed =
        rules.length > 0 && rules.every((rule) => place.serves.includes(rule));

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
      // A listing that confirms the rules beats one that says nothing.
      if (dietConfirmed) score += 2;
      if (!fresh) score -= 1.5;
      if (history.dislikedKinds.includes(place.kind)) score -= 3;
      // Less than a confirmed dietary rule is worth: eating twice at a
      // place known to serve the rule beats a new place that says nothing.
      if (sameNames.has(place.name.toLowerCase())) score -= 1.5;

      return [
        {
          place,
          score,
          open,
          travel:
            from && point ? travelEstimate(from, point, taste.means) : null,
          fresh,
          dietConfirmed,
          interest,
        },
      ];
    })
    .sort((a, b) => b.score - a.score || (a.place.id < b.place.id ? -1 : 1));
}

/** Whether the place is a sample, whose data is not a real listing. */
const isSample = (place: PlaceDto) => place.origin === "SAMPLE";

/** What a real place's tags say about notability; nothing for a sample or own place. */
const notability = (place: PlaceDto) =>
  place.origin !== "OSM"
    ? null
    : place.notable
      ? "it has a Wikipedia or Wikidata entry"
      : "it has no Wikipedia or Wikidata entry";

/** The tag's own word for each rule: a vegan tag is what implied vegetarian. */
function listedWords(place: PlaceDto, rules: string[]): string[] {
  const says = (diet: string) =>
    ["yes", "only"].includes(
      place.tags[`diet:${diet.replace("-", "_")}`] ?? "",
    );
  return rules.map((rule) =>
    rule === "vegetarian" && !says("vegetarian") && says("vegan")
      ? "vegan"
      : rule,
  );
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
  const meal = isMeal(input.slot.kind);

  // A hard limit is always named on a place to eat. A listing can confirm a
  // dietary rule; nothing can confirm an allergy, and no card says a place
  // is safe for one (PRD 12.2, TB-MEM-05).
  const rules = meal ? (taste.food ?? []) : [];
  const allergies = meal ? (taste.allergies ?? []) : [];
  const allergy = `${words(allergies)} allergy`;
  if (rules.length > 0 && allergies.length > 0) {
    return ranked.dietConfirmed
      ? `${
          isSample(place)
            ? `The sample data says it serves ${words(rules)} food`
            : `Its listing says it has ${words(listedWords(place, rules))} options`
        }, but place data cannot tell whether it is safe for your ${allergy}, so check with the venue.`
      : `You eat ${words(rules)} food and have a ${allergy}, and the place data confirms neither, so check with the venue.`;
  }
  if (rules.length > 0) {
    return ranked.dietConfirmed
      ? `You eat ${words(rules)} food, and ${
          isSample(place)
            ? "the sample data says it serves it"
            : `its listing says it has ${words(listedWords(place, rules))} options`
        }.`
      : `You eat ${words(rules)} food, and the place data does not say whether this place serves it, so check with the venue.`;
  }
  if (allergies.length > 0) {
    return `You have a ${allergy}, and place data cannot tell whether a place is safe for it, so check with the venue.`;
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
    return "You said the last places were too far.";
  }
  const known = notability(place);
  if (known && history.lessTouristy > 0 && !place.notable) {
    return `You asked for somewhere less touristy, and ${known}.`;
  }
  if (known && taste.atmosphere === "quiet" && !place.notable) {
    return `${recalled(from.atmosphere, "You asked for quiet places", "like quiet places")}, and ${known}.`;
  }
  if (known && taste.atmosphere === "lively" && place.notable) {
    return `${recalled(from.atmosphere, "You like lively places", "like lively places")}, and ${known}.`;
  }
  if (taste.onFoot && travel?.means === "walk") {
    return `${recalled(from.onFoot, "You like to get around on foot", "like to get around on foot")}, and this is a walk away.`;
  }

  const adds =
    ranked.fresh && input.kindsInDay.length > 0
      ? `you have no ${kindLabel(place.kind).toLowerCase()} in this day yet`
      : place.notable
        ? notability(place)
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
      ? ranked.place.origin === "OSM"
        ? "Its listed hours cover the whole visit."
        : "It is open for the whole visit."
      : "Its opening hours are not known, so check before you go.",
  ].join(" ");
}

/** A place as a card, with a reason. Used for proposals and for places already chosen. */
export function toCard(
  place: PlaceDto,
  cityName: string,
  reason: string,
  travel: CardDto["travel"] = null,
  /** The traveller's hard limits this place's listing cannot confirm. */
  unconfirmed: string[] = [],
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
    // The mark is on the front of the card, where it is seen before picking.
    essentials: [
      travel
        ? `${kind} · about ${travel.minutes} min ${meansWord[travel.means]}`
        : kind,
      ...(unconfirmed.length > 0
        ? [`not confirmed: ${unconfirmed.join(", ")}`]
        : []),
    ].join(" · "),
    summary: `${kind} in ${cityName}. ${place.openingHours ? `Open ${place.openingHours}.` : "Opening hours unknown."}${marked}`,
    reason,
    address: place.address,
    hours: place.openingHours,
    visitMinutes: visitMinutes(place.kind),
    travel,
    links: placeLinks(place, cityName),
    hoursDoubt: place.hoursDoubt,
    ...(unconfirmed.length > 0 ? { unconfirmed } : {}),
  };
}

/** The traveller's hard limits a place to eat's listing cannot confirm. */
function unconfirmedFor(ranked: Ranked, input: ProposeInput): string[] {
  if (!isMeal(input.slot.kind)) return [];
  return [
    ...(input.taste.food ?? []).filter(
      (rule) => !ranked.place.serves.includes(rule),
    ),
    ...(input.taste.allergies ?? []).map((item) => `${item} allergy`),
  ];
}

/**
 * Two places this near in score are as good as each other: alike in every
 * way that counts and within about a hundred metres in distance. A wider
 * margin marked nearly every choice of a built trip as close.
 */
const CLOSE_SCORE = 0.1;

/**
 * The proposal for a slot: the three best places that fit, or fewer when
 * fewer fit. It is never padded (TB-CRD-01).
 */
export function proposeCards(input: ProposeInput): CardSet {
  // The best three that fit. Only as many are tried as it takes to find them.
  const best: Ranked[] = [];
  for (const ranked of rank(input)) {
    if (best.length === 3) break;
    if (!input.fits || input.fits(ranked.place)) best.push(ranked);
  }
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
        unconfirmedFor(ranked, input),
      ),
    ),
    short: best.length < 3,
    close: best.length > 1 && best[0].score - best[1].score <= CLOSE_SCORE,
  };
}

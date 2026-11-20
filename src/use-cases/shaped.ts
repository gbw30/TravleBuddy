import { QUESTIONS } from "@/features/conversation";
import { buildPlanView, readPlanState } from "@/features/itinerary";
import {
  isMeal,
  type PlanEntry,
  type PlanView,
} from "@/features/itinerary/contracts";
import {
  limitsInUse,
  readProfile,
  readTripTaste,
  tasteInUse,
  type TasteInUse,
} from "@/features/memory";
import type { PlaceDto } from "@/features/places/contracts";
import { INTEREST_KINDS } from "@/features/recommendations";
import { getTrip, listTrips } from "@/features/trips";
import { NEW_TRIP_TITLE } from "@/features/trips/contracts";
import { db } from "@/lib/db";

import { count, list } from "./brief";
import { contextFor, startingState } from "./plan";
import type { ShapedView } from "./profile-view";

// "How this shaped your trip" on the profile page (PRD 12.5): memory is only
// understandable if the traveller can see what it did. Each line pairs a
// memory the trip went by with something its plan shows.

type Placed = Extract<PlanEntry, { type: "place" }>;
const PACE_WORDS: Record<string, string> = {
  relaxed: "A relaxed pace",
  balanced: "A balanced pace",
  packed: "Full days",
};
const SHAPE_WORDS: Record<string, string> = {
  early: "Early starts",
  late: "Late nights",
};
const labelOf = (topic: "interests" | "food", value: string) =>
  QUESTIONS[topic].choices.find((choice) => choice.value === value)?.label ??
  value;
/** "at 09:00" when every time is the same, "between 09:00 and 10:30" otherwise. */
const when = (clocks: string[]) => {
  const sorted = [...clocks].sort();
  const [first, last] = [sorted[0], sorted[sorted.length - 1]];
  return first === last ? `at ${first}` : `between ${first} and ${last}`;
};

/**
 * The memories a trip went by, each with an effect its plan shows. Pure. A
 * memory the trip overrode, or one that shows nowhere in the plan, is left
 * out: the page claims nothing it cannot point to.
 */
export function shapedBy(input: {
  /** The taste the trip goes by, with where each answer comes from. */
  taste: TasteInUse;
  /** The dietary rules of the personal profile. */
  dietaryRules: string[];
  view: PlanView;
  places: Record<string, PlaceDto>;
}): ShapedView["pairs"] {
  const { taste, view, places } = input;
  const pairs: ShapedView["pairs"] = [];
  const slots = view.days.map((day) =>
    day.entries.filter(
      (entry): entry is Extract<PlanEntry, { type: "open" | "place" }> =>
        entry.type === "open" || entry.type === "place",
    ),
  );
  const placed = slots
    .flat()
    .filter(
      (entry): entry is Placed =>
        entry.type === "place" && Boolean(places[entry.placeId]),
    );
  const meals = placed.filter((entry) => isMeal(entry.kind));
  const sights = placed.filter((entry) => !isMeal(entry.kind));

  const pace = taste.pace?.from === "profile" ? taste.pace.values[0] : null;
  if (pace && view.pace === pace && PACE_WORDS[pace]) {
    const most = Math.max(
      0,
      ...slots.map((day) => day.filter((entry) => !isMeal(entry.kind)).length),
    );
    if (most > 0) {
      pairs.push({
        memory: PACE_WORDS[pace],
        effect: `No day has more than ${count(most, "sight or activity", "sights or activities")}.`,
      });
    }
  }

  const shape =
    taste.day_shape?.from === "profile" ? taste.day_shape.values[0] : null;
  const firstStarts = slots.flatMap((day) => (day[0] ? [day[0].start] : []));
  if (shape && SHAPE_WORDS[shape] && firstStarts.length > 0) {
    const dinners = slots
      .flat()
      .filter((entry) => entry.kind === "dinner")
      .map((entry) => entry.start);
    pairs.push({
      memory: SHAPE_WORDS[shape],
      effect: `Its days begin ${when(firstStarts)}${
        dinners.length > 0 ? `, with dinner ${when(dinners)}` : ""
      }.`,
    });
  }

  if (input.dietaryRules.length > 0 && meals.length > 0) {
    const says = (entry: Placed, key: "serves" | "servesNot") =>
      places[entry.placeId][key];
    const confirmed = meals.filter((entry) =>
      input.dietaryRules.every((rule) => says(entry, "serves").includes(rule)),
    ).length;
    const against = meals.filter((entry) =>
      input.dietaryRules.some((rule) =>
        says(entry, "servesNot").includes(rule),
      ),
    ).length;
    pairs.push({
      memory: `${list(input.dietaryRules.map((rule) => labelOf("food", rule)))} food`,
      effect: `${
        confirmed === 0
          ? "No meal is"
          : `${confirmed} of ${count(meals.length, "meal")} ${confirmed === 1 ? "is" : "are"}`
      } at a place that says it serves it; ${
        against === 0
          ? "none is at a place that says it does not"
          : `${against} ${against === 1 ? "is" : "are"} at a place that says it does not`
      }.`,
    });
  }

  if (taste.interests?.from === "profile") {
    for (const interest of taste.interests.values) {
      const of = sights.filter((entry) =>
        INTEREST_KINDS[interest]?.includes(places[entry.placeId].kind),
      );
      if (of.length === 0) continue;
      const names = of.slice(0, 3).map((entry) => places[entry.placeId].name);
      pairs.push({
        memory: labelOf("interests", interest),
        effect: `${of.length} of its ${count(sights.length, "sight or activity", "sights and activities")} ${of.length === 1 ? "is" : "are"} of that kind: ${list(names)}${of.length > 3 ? " and more" : ""}.`,
      });
    }
  }
  return pairs;
}

/** How many of the traveller's newest trips are looked at for one with a plan. */
const LOOK_AT = 5;

/**
 * What the profile did to the traveller's most recent trip with a plan, or
 * null when there is no such trip or nothing to show for it.
 */
export async function loadShaped(userId: string): Promise<ShapedView | null> {
  const trips = (await listTrips(userId)).slice(0, LOOK_AT);
  for (const summary of trips) {
    const saved = await readPlanState(db, summary.id);
    if (Object.keys(saved.state.picks).length === 0) continue;
    const trip = await getTrip(userId, summary.id);
    if (!trip) continue;
    const [profile, said] = await Promise.all([
      readProfile(db, userId),
      readTripTaste(db, trip.id),
    ]);
    const taste = tasteInUse(profile.entries, said);
    const state = startingState(saved, trip, taste);
    const context = await contextFor(trip, state, userId, [], taste);
    const pairs = shapedBy({
      taste,
      dietaryRules: limitsInUse(profile.entries, []).dietaryRules,
      view: buildPlanView(state, context),
      places: context.places,
    });
    if (pairs.length === 0) return null;
    return {
      tripId: trip.id,
      title:
        trip.title !== NEW_TRIP_TITLE
          ? trip.title
          : (trip.facts.cities[0]?.city.name ?? trip.title),
      pairs,
    };
  }
  return null;
}

import { builtPlaceIds, readBuild, readPlanState } from "@/features/itinerary";
import {
  learnedEntries,
  readForgotten,
  readProfile,
  readTripDifference,
  readTripTaste,
  replaceLearned,
  type TripEvidence,
} from "@/features/memory";
import {
  TASTE_TOPICS,
  type TasteTopic,
  type TripTaste,
} from "@/features/memory/contracts";
import { getPlaces } from "@/features/places";
import type { PlaceKind } from "@/features/places/contracts";
import { INTEREST_KINDS, readDiscards } from "@/features/recommendations";
import { listFinishedTrips } from "@/features/trips";
import { db } from "@/lib/db";

// What finished trips teach the personal profile (PRD 12.4). It spans four
// services: Trips says which plans are finished, Memory holds what was said
// and the profile, Itinerary the places chosen, Recommendations what was
// turned down. The rules that decide what is learned are Memory's and pure.

/** Answers that say "no preference": nothing to learn from them. */
const NO_PREFERENCE = new Set(["neither", "either", "none"]);
/** Places of one interest in a plan before the trip counts as showing it. */
const PICKS_TO_SHOW = 2;
/** Cards turned down as too touristy or too busy before a trip shows a taste for quiet: more than one set of three. */
const DISCARDS_TO_SHOW = 4;

/**
 * What one trip showed about the traveller's taste: what they said, the
 * kinds of place they chose, and what they turned down.
 */
export function tripShows(
  taste: TripTaste,
  pickedKinds: PlaceKind[],
  discardReasons: (string | null)[],
): TripEvidence["shown"] {
  const shown = new Map<string, { topic: TasteTopic; value: string }>();
  const add = (topic: TasteTopic, value: string) =>
    shown.set(`${topic}\n${value}`, { topic, value });

  for (const topic of TASTE_TOPICS) {
    // Dietary rules are hard limits: offered for the profile when given,
    // never learned from behaviour.
    if (topic === "food") continue;
    const answer = taste[topic];
    if (answer?.source !== "told") continue;
    for (const value of answer.values) {
      if (!NO_PREFERENCE.has(value)) add(topic, value);
    }
  }
  for (const [interest, kinds] of Object.entries(INTEREST_KINDS)) {
    const picked = pickedKinds.filter((kind) => kinds.includes(kind)).length;
    if (picked >= PICKS_TO_SHOW) add("interests", interest);
  }
  const crowded = discardReasons.filter(
    (reason) => reason === "too_touristy" || reason === "too_busy",
  ).length;
  if (crowded >= DISCARDS_TO_SHOW) add("atmosphere", "quiet");
  return [...shown.values()];
}

/**
 * The evidence of the traveller's finished trips. A trip finished before the
 * profile was last reset is left out, so a reset profile is not learned back
 * from the same past (TB-MEM-12).
 */
export async function gatherEvidence(userId: string): Promise<TripEvidence[]> {
  const [trips, profile] = await Promise.all([
    listFinishedTrips(userId),
    readProfile(db, userId),
  ]);
  const counted = trips.filter(
    (trip) => !profile.learnAfter || trip.finishedAt > profile.learnAfter,
  );
  return Promise.all(
    counted.map(async (trip) => {
      const [taste, difference, plan, discards, build] = await Promise.all([
        readTripTaste(db, trip.id),
        readTripDifference(db, trip.id),
        readPlanState(db, trip.id),
        readDiscards(db, trip.id),
        readBuild(db, trip.id),
      ]);
      // A place the build chose is the agent's choice, not the traveller's:
      // it shows nothing about their taste (PRD 12.4).
      const built = new Set(builtPlaceIds(build, plan.state));
      const places = await getPlaces(
        [
          ...new Set(
            Object.values(plan.state.picks)
              .map((pick) => pick.placeId)
              .filter((placeId) => !built.has(placeId)),
          ),
        ],
        userId,
      );
      return {
        tripId: trip.id,
        tripTitle: trip.title,
        finishedAt: trip.finishedAt,
        // A trip marked as different teaches nothing through behaviour (TB-MEM-09).
        different: difference.differs === true,
        shown: tripShows(
          taste,
          places.map((place) => place.kind),
          discards.map((discard) => discard.reason),
        ),
      };
    }),
  );
}

/** The trips that showed one value, for forgetting a learned entry with all its evidence. */
export async function tripsThatShowed(
  userId: string,
  topic: string,
  value: string,
): Promise<string[]> {
  return (await gatherEvidence(userId))
    .filter((trip) =>
      trip.shown.some((item) => item.topic === topic && item.value === value),
    )
    .map((trip) => trip.tripId);
}

/**
 * Brings the learned part of the profile up to date with the traveller's
 * finished trips. Called when a plan is marked finished or reopened, and
 * when a trip is deleted. Answers whether the profile changed.
 */
export async function learnFromTrips(userId: string): Promise<boolean> {
  const evidence = await gatherEvidence(userId);
  return db.$transaction(async (tx) => {
    const [profile, forgotten] = await Promise.all([
      readProfile(tx, userId),
      readForgotten(tx, userId),
    ]);
    return replaceLearned(
      tx,
      userId,
      learnedEntries(profile.entries, evidence, forgotten),
    );
  });
}

/**
 * `learnFromTrips` for use after a change the traveller made: a failure to
 * learn is logged and must not undo or fail that change.
 */
export async function learnQuietly(userId: string): Promise<void> {
  try {
    await learnFromTrips(userId);
  } catch (error) {
    console.error("Learning from finished trips failed", error);
  }
}

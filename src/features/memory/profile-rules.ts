import {
  MULTI_TOPICS,
  TASTE_TOPICS,
  type ProfileEntry,
  type ProfileTopic,
  type Sureness,
  type TasteTopic,
  type TripTaste,
} from "./contracts";

// The rules of memory (PRD 12): which value is used when the trip and the
// personal profile differ, and what may be learned from finished trips.
// Pure: the stores apply what these functions decide.

/** The value in use on one topic, and where it came from. */
export type TasteInUse = Partial<
  Record<
    TasteTopic,
    {
      values: string[];
      /** "trip": said for this trip. "profile": remembered. "default": nothing known. */
      from: "trip" | "profile" | "default";
      /** The remembered entries used, so the agent can name their trip (TB-MEM-06). */
      entries: ProfileEntry[];
    }
  >
>;

const about = (entries: ProfileEntry[], topic: ProfileTopic) =>
  entries.filter((entry) => entry.topic === topic);

/**
 * What the personal profile holds on a topic a trip asks about. A trip's
 * food answer holds its dietary rules, so the remembered rules answer it.
 */
export function rememberedFor(
  personal: ProfileEntry[],
  topic: TasteTopic,
): ProfileEntry[] {
  return about(personal, topic === "food" ? "dietary_rules" : topic);
}

/**
 * The taste a trip goes by. What the traveller said for this trip wins; then
 * what is remembered; then the default of a question they skipped (TB-MEM-02).
 */
export function tasteInUse(
  personal: ProfileEntry[],
  trip: TripTaste,
): TasteInUse {
  const inUse: TasteInUse = {};
  for (const topic of TASTE_TOPICS) {
    const answer = trip[topic];
    const remembered = rememberedFor(personal, topic);
    if (answer?.source === "told") {
      inUse[topic] = { values: answer.values, from: "trip", entries: [] };
    } else if (remembered.length > 0) {
      inUse[topic] = {
        values: remembered.map((entry) => entry.value),
        from: "profile",
        entries: remembered,
      };
    } else if (answer) {
      inUse[topic] = { values: answer.values, from: "default", entries: [] };
    }
  }
  return inUse;
}

/**
 * The dietary rules and allergies a trip's proposals must respect: every one
 * in the personal profile, and every rule given for this trip. A trip can add
 * to them and never takes one away (PRD 12.2).
 */
export function limitsInUse(
  personal: ProfileEntry[],
  tripRules: string[],
): { dietaryRules: string[]; allergies: string[] } {
  const rules = [
    ...about(personal, "dietary_rules").map((entry) => entry.value),
    ...tripRules.filter((rule) => rule !== "none"),
  ];
  return {
    dietaryRules: [...new Set(rules)],
    allergies: [
      ...new Set(about(personal, "allergies").map((entry) => entry.value)),
    ],
  };
}

/**
 * Whether an answer given for a trip goes against what is remembered on that
 * topic: both say something, and they share nothing (TB-AGT-12).
 */
export function conflicts(values: string[], remembered: ProfileEntry[]) {
  return (
    values.length > 0 &&
    remembered.length > 0 &&
    !remembered.some((entry) => values.includes(entry.value))
  );
}

/** What one finished trip showed about the traveller's taste. */
export type TripEvidence = {
  tripId: string;
  tripTitle: string;
  /** When its plan was marked finished. */
  finishedAt: string;
  /** The traveller marked this trip as different from their usual (TB-MEM-09). */
  different: boolean;
  shown: { topic: TasteTopic; value: string }[];
};

/** A learned entry the traveller deleted, with the trips it had come from (TB-MEM-12). */
export type Forgotten = {
  topic: ProfileTopic;
  value: string;
  tripIds: string[];
};

const TRIPS_TO_LEARN = 2;
const sureAfter = (trips: number): Sureness =>
  trips > TRIPS_TO_LEARN ? "usually" : "think";

/**
 * Every entry that finished trips have taught, given what the traveller has
 * stated and what they deleted. The store replaces the learned entries with
 * this set and leaves the stated ones alone.
 *
 * - A value is learned once it shows in two finished, ordinary trips (TB-MEM-08).
 * - A trip marked as different teaches nothing (TB-MEM-09).
 * - A topic the traveller has stated is not learned over; where a topic holds
 *   several values, other values may be learned beside the stated ones (TB-MEM-10).
 * - A trip behind a deleted entry no longer counts for that value (TB-MEM-12).
 * - A topic that holds one value learns the value seen in most trips, the
 *   most recent on a tie.
 * - Hard limits are never learned from behaviour.
 */
export function learnedEntries(
  stated: ProfileEntry[],
  evidence: TripEvidence[],
  forgotten: Forgotten[],
): ProfileEntry[] {
  // Most recent first; the trip id settles two finished at the same moment.
  const ordinary = evidence
    .filter((trip) => !trip.different)
    .sort((a, b) =>
      a.finishedAt === b.finishedAt
        ? a.tripId < b.tripId
          ? -1
          : 1
        : a.finishedAt < b.finishedAt
          ? 1
          : -1,
    );

  const learned: ProfileEntry[] = [];
  for (const topic of TASTE_TOPICS) {
    const said = about(stated, topic)
      .filter((entry) => entry.source.type === "told")
      .map((entry) => entry.value);
    const several = MULTI_TOPICS.includes(topic);
    if (said.length > 0 && !several) continue;

    // For each value, the trips that showed it, most recent first.
    const trips = new Map<string, TripEvidence[]>();
    for (const trip of ordinary) {
      const values = new Set(
        trip.shown
          .filter((item) => item.topic === topic)
          .map((item) => item.value),
      );
      for (const value of values) {
        const dropped = forgotten.some(
          (item) =>
            item.topic === topic &&
            item.value === value &&
            item.tripIds.includes(trip.tripId),
        );
        if (!dropped) trips.set(value, [...(trips.get(value) ?? []), trip]);
      }
    }

    const candidates = [...trips.entries()]
      .filter(
        ([value, seen]) =>
          seen.length >= TRIPS_TO_LEARN && !said.includes(value),
      )
      // Seen in most trips first, then the most recent, then by name, so
      // the same trips always teach the same entries in the same order.
      .sort(
        ([first, a], [second, b]) =>
          b.length - a.length ||
          (a[0].finishedAt === b[0].finishedAt
            ? first < second
              ? -1
              : 1
            : a[0].finishedAt < b[0].finishedAt
              ? 1
              : -1),
      );
    for (const [value, seen] of several ? candidates : candidates.slice(0, 1)) {
      learned.push({
        topic,
        value,
        sureness: sureAfter(seen.length),
        source: {
          type: "trip",
          tripId: seen[0].tripId,
          tripTitle: seen[0].tripTitle,
        },
      });
    }
  }
  return learned;
}

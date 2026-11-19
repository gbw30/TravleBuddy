import type { Pace, PlanEntry } from "@/features/itinerary/contracts";
import type { PlanSnapshot } from "@/use-cases/plan-snapshot";

// The checks of PRD 18 that a machine can make on a planned trip, and one
// more that reading the first itineraries asked for: no day without a meal. Pure: they
// read a plan as the site answers it, what the traveller expects, and what
// the place source knows. The sixth check of PRD 18, "the developer reads
// the itinerary and would follow it", stays the developer's.

export type Finding = { check: string; ok: boolean; detail: string };

/** A place the source knows, by name: the only places that exist. */
export type KnownPlace = { serves: string[]; servesNot: string[] };

export type Expected = {
  pace: Pace;
  dietaryRules: string[];
  /** What was already decided, with the time it must keep. */
  decided: { title: string; start: string | null }[];
};

const SIGHTS_A_DAY: Record<Pace, number> = {
  relaxed: 2,
  balanced: 3,
  packed: 4,
};
type Slot = Extract<PlanEntry, { type: "open" | "place" }>;
const isSlot = (entry: PlanEntry): entry is Slot =>
  entry.type === "open" || entry.type === "place";
const isMeal = (entry: Slot) =>
  entry.kind === "lunch" || entry.kind === "dinner";
const finding = (check: string, problems: string[], fine: string): Finding => ({
  check,
  ok: problems.length === 0,
  detail: problems.length === 0 ? fine : problems.join("; "),
});

/** PRD 18's checks on a plan: places, rules, limits, pace. */
export function checkItinerary(input: {
  plan: PlanSnapshot;
  expected: Expected;
  known: Map<string, KnownPlace>;
}): Finding[] {
  const { plan, expected, known } = input;
  const days = plan.view.days;
  const placed = days.flatMap((day) =>
    day.entries.flatMap((entry) =>
      entry.type === "place" ? [{ day: day.day, entry }] : [],
    ),
  );
  const nameOf = (placeId: string) => plan.chosen[placeId]?.name ?? null;

  const invented = placed.flatMap(({ day, entry }) => {
    const card = plan.chosen[entry.placeId];
    // A place the traveller added by hand exists because they say so.
    return card && (known.has(card.name) || card.origin === "USER")
      ? []
      : [`day ${day} ${entry.kind}: ${card?.name ?? "a place with no card"}`];
  });
  const ids = placed.map(({ entry }) => entry.placeId);
  const twice = [
    ...new Set(ids.filter((id, at) => ids.indexOf(id) !== at)),
  ].map((id) => nameOf(id) ?? id);

  // A place picked although the traveller had already decided it.
  const decidedToo = placed.flatMap(({ day, entry }) => {
    const name = nameOf(entry.placeId);
    return expected.decided.some(
      ({ title }) => title.trim().toLowerCase() === name?.trim().toLowerCase(),
    )
      ? [`${name} is picked on day ${day} and is also already decided`]
      : [];
  });

  const broken = placed.flatMap(({ day, entry }) =>
    entry.flags
      .filter((flag) => flag.rule !== "hours-unknown")
      .map((flag) => `day ${day} ${nameOf(entry.placeId)}: ${flag.rule}`),
  );

  const kept = days.flatMap((day) =>
    day.entries.flatMap((entry) =>
      entry.type === "commitment" ? [entry] : [],
    ),
  );
  const moved = expected.decided.flatMap(({ title, start }) => {
    const found = kept.filter((entry) => entry.title === title);
    if (found.length === 0) {
      const unplaced = plan.view.unplaced.some((item) => item.title === title);
      return unplaced && start === null ? [] : [`${title} is missing`];
    }
    return start === null || found.some((entry) => entry.start === start)
      ? []
      : [`${title} is at ${found[0].start}, not ${start}`];
  });

  const against = placed.flatMap(({ day, entry }) => {
    if (!isMeal(entry)) return [];
    const name = nameOf(entry.placeId);
    const says = name ? known.get(name) : undefined;
    const rules = expected.dietaryRules.filter((rule) =>
      says?.servesNot.includes(rule),
    );
    return rules.length > 0
      ? [
          `day ${day} ${entry.kind}: ${name} says it does not serve ${rules.join(", ")} food`,
        ]
      : [];
  });

  const noMeal = days.flatMap((day) =>
    day.entries
      .filter(isSlot)
      .filter((entry) => entry.type === "open" && isMeal(entry))
      .map((entry) => `day ${day.day} has no ${entry.kind}`),
  );

  const most = SIGHTS_A_DAY[expected.pace];
  const paceProblems = [
    ...(plan.view.pace === expected.pace
      ? []
      : [`the plan's pace is ${plan.view.pace}, not ${expected.pace}`]),
    ...days.flatMap((day) => {
      const sights = day.entries
        .filter(isSlot)
        .filter((e) => !isMeal(e)).length;
      return sights > most
        ? [
            `day ${day.day} has ${sights} sights or activities, more than ${most}`,
          ]
        : [];
    }),
  ];

  return [
    finding(
      "No place is invented",
      [
        ...invented,
        ...twice.map((name) => `${name} is in the plan twice`),
        ...decidedToo,
      ],
      `${placed.length} places, each one the place source knows, none twice`,
    ),
    finding("No rule is broken", broken, "no place carries a broken-rule flag"),
    finding(
      "Nothing already decided was moved",
      moved,
      expected.decided.length === 0
        ? "nothing was decided beforehand"
        : `${expected.decided.length} decided, each where it was`,
    ),
    finding(
      "No hard limit is broken",
      against,
      expected.dietaryRules.length === 0
        ? "the traveller has no dietary rule"
        : `no meal is at a place that says it does not serve ${expected.dietaryRules.join(", ")} food`,
    ),
    finding(
      "Every day has its meals",
      noMeal,
      "no lunch or dinner is left open",
    ),
    finding(
      "The days match the pace",
      paceProblems,
      `${expected.pace}: no day has more than ${most} sights or activities`,
    ),
  ];
}

/** What a reason may truthfully say about this traveller and this trip. */
export type Truth = {
  cities: string[];
  /** Interests the trip goes by, in the words a card uses ("museums and exhibitions"). Null when not answered. */
  interests: string[] | null;
  /** Dietary rules in use. Null when food was not answered at all. */
  food: string[] | null;
  atmosphere: "lively" | "quiet" | null;
  onFoot: boolean;
  /** Names of trips a memory may come from. */
  trips: string[];
};

const words = (items: string[]) =>
  items.length < 3
    ? items.join(" and ")
    : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

/**
 * Checks one card's reason, sentence by sentence, against what is true of
 * the traveller and the trip (PRD 13, PRD 18). A sentence of a form this
 * check does not know fails: a new kind of claim must be taught to it.
 */
export function checkReason(reason: string, truth: Truth): string[] {
  const problems: string[] = [];
  const fits =
    /^It is about a \d+-minute (walk|ride|drive) from .+?, so it fits your [a-z ]+\. /.exec(
      reason,
    ) ?? /^It fits your [a-z ]+ in (.+?)\. /.exec(reason);
  if (!fits) return [`does not say how it fits the slot: “${reason}”`];
  if (fits[1] && !["walk", "ride", "drive"].includes(fits[1])) {
    if (!truth.cities.includes(fits[1])) {
      problems.push(`names ${fits[1]}, which is not a city of the trip`);
    }
  }
  const rest = reason.slice(fits[0].length);
  const hours = [
    "It is open for the whole visit.",
    "Its hours may be out of date, so check before you go.",
    "Its opening hours are not known, so check before you go.",
  ].find((sentence) => rest.endsWith(sentence));
  if (!hours)
    return [
      ...problems,
      `does not say what is known of its hours: “${reason}”`,
    ];
  const about = rest.slice(0, rest.length - hours.length).trim();

  const food = truth.food ?? [];
  const liked = (label: string) =>
    truth.interests?.includes(label)
      ? []
      : [`says the traveller likes ${label}, which they did not say`];
  const fromTrip = (trip: string) =>
    truth.trips.includes(trip)
      ? []
      : [`names the trip “${trip}”, which is not one of theirs`];
  let match: RegExpExecArray | null;

  if (
    (match =
      /^You eat (.+?) food, and (its listing says it has .+? options|the sample data says it serves it|the place data does not say whether this place serves it, so check with the venue)\.$/.exec(
        about,
      ))
  ) {
    if (match[1] !== words(food))
      problems.push(
        `says the traveller eats ${match[1]} food; their rules are ${words(food) || "none"}`,
      );
  } else if (
    (match = /^I remember from your trip “(.+?)” that you like (.+?)\.$/.exec(
      about,
    ))
  ) {
    problems.push(...fromTrip(match[1]), ...liked(match[2]));
  } else if ((match = /^You said you like (.+?)\.$/.exec(about))) {
    problems.push(...liked(match[1]));
  } else if (
    /^(You asked for quiet places|I remember from your trip “.+?” that you like quiet places), and it has no Wikipedia or Wikidata entry\.$/.test(
      about,
    )
  ) {
    if (truth.atmosphere !== "quiet")
      problems.push(
        "says the traveller asked for quiet places, which they did not",
      );
  } else if (
    /^(You like lively places|I remember from your trip “.+?” that you like lively places), and it has a Wikipedia or Wikidata entry\.$/.test(
      about,
    )
  ) {
    if (truth.atmosphere !== "lively")
      problems.push(
        "says the traveller likes lively places, which they did not say",
      );
  } else if (
    /^(You like to get around on foot|I remember from your trip “.+?” that you like to get around on foot), and this is a walk away\.$/.test(
      about,
    )
  ) {
    if (!truth.onFoot)
      problems.push(
        "says the traveller likes to get around on foot, which they did not say",
      );
  } else if (/^You have not told me about food yet(, and .+)?\.$/.test(about)) {
    if (truth.food !== null)
      problems.push("says food was not answered, but it was");
  } else if (/^You have no food rules(, and .+)?\.$/.test(about)) {
    if (truth.food === null || food.length > 0)
      problems.push("says the traveller has no food rules, which is not so");
  } else if (
    /^You have not told me what you like to see yet(, and .+)?\.$/.test(about)
  ) {
    if (truth.interests !== null)
      problems.push("says interests were not answered, but they were");
  } else if (/^You left what to see open(, and .+)?\.$/.test(about)) {
    if (truth.interests === null || truth.interests.length > 0)
      problems.push("says what to see was left open, which is not so");
  } else if (
    /^It is not one of the interests you named(, but .+)?\.$/.test(about)
  ) {
    if (!truth.interests || truth.interests.length === 0)
      problems.push(
        "speaks of interests the traveller named, but they named none",
      );
  } else {
    problems.push(`says something this check does not know: “${about}”`);
  }
  return problems;
}

/** Every reason shown, checked. One finding for the lot. */
export function checkReasons(reasons: string[], truth: Truth): Finding {
  const problems = [
    ...new Set(reasons.flatMap((reason) => checkReason(reason, truth))),
  ];
  return finding(
    "Every reason is true of the traveller and the trip",
    problems.slice(0, 6),
    `${reasons.length} reasons read, sentence by sentence`,
  );
}

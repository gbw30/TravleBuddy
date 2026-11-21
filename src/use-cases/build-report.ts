import {
  isMeal,
  slotWords,
  type BuildProgress,
  type PlanEntry,
  type PlanView,
} from "@/features/itinerary/contracts";
import type { TasteTopic } from "@/features/memory/contracts";
import type { PlaceDto } from "@/features/places/contracts";
import {
  computed,
  fillAll,
  fromPlace,
  fromTraveller,
  refsOf,
  sentence,
  type Sentence,
} from "@/lib/wording";

import { count, day as dayWords, list, styleSentence } from "./brief";
import type { BriefAnswer } from "./brief-view";
import type { BuildReport, ReportLine } from "./plan-snapshot";

// The report of a Quick plan build (PRD 11.4): what it built, what it
// assumed, what it could not fit and where it was unsure. Pure. Every
// sentence is worked out from the plan as it stands and the notes the build
// left, so nothing in it is a guess.

/** The style answers a build goes by. The others do not shape it yet. */
const USED: TasteTopic[] = [
  "pace",
  "day_shape",
  "interests",
  "atmosphere",
  "food",
  "getting_around",
];
/** How many of one kind of note are spelled out before the rest are counted. */
const SPELLED_OUT = 3;

type Slot = Extract<PlanEntry, { type: "open" | "place" }>;

export function buildReportOf(input: {
  view: PlanView;
  places: Record<string, PlaceDto>;
  progress: BuildProgress;
  /** The trip's style answers, with where each comes from. */
  style: BriefAnswer[];
  /** The dietary rules the trip's proposals respect. */
  dietaryRules: string[];
  /** The profile entry each remembered rule came from, by rule; a rule given for this trip has none. */
  dietaryEntries?: Record<string, string>;
  cities: string[];
  /** How many things were already decided. */
  decided: number;
}): {
  report: BuildReport;
  /**
   * The sentences each line is made of, in the order the report reads: what
   * it built, assumed, left unfitted and was unsure of. Kept private.
   */
  sentences: Sentence[][];
} {
  const { view, places, progress } = input;
  const sentences: Sentence[][] = [];
  /** A line of the report, kept with the sentences it is the fill of. */
  const say = (...made: Sentence[]) => {
    sentences.push(made);
    return fillAll(made);
  };
  const slots = new Map<string, { day: number; entry: Slot }>();
  for (const day of view.days) {
    for (const entry of day.entries) {
      if (entry.type === "open" || entry.type === "place") {
        slots.set(entry.slotId, { day: day.day, entry });
      }
    }
  }
  const at = (slotId: string) => {
    const slot = slots.get(slotId)!;
    return computed(
      "slot",
      `${slotWords(slot.entry.kind)} on day ${slot.day}`,
      "slot-of-plan",
      { slot: slotId },
    );
  };
  /** A number worked out from the plan, as the words that count it. */
  const counted = (gap: string, words: string, name: string, n: number) =>
    computed(gap, words, name, { count: n });
  // What the build put in place and the traveller has left there, in the
  // order of the days.
  const standing = [...slots].flatMap(([slotId, { entry }]) => {
    const place = entry.type === "place" ? places[entry.placeId] : undefined;
    return entry.type === "place" &&
      place &&
      progress.built[slotId] === entry.placeId
      ? [{ slotId, entry, place }]
      : [];
  });
  const meals = standing.filter(({ entry }) => isMeal(entry.kind));
  const own =
    [...slots.values()].filter(({ entry }) => entry.type === "place").length -
    standing.length;

  const nDays = view.days.length;
  const days = counted("days", count(nDays, "day"), "days-in-plan", nDays);
  const cities = computed("cities", list(input.cities), "trip-cities", {
    cities: input.cities.join(","),
  });
  const chosen = (n: number) =>
    counted("places", count(n, "place"), "places-chosen", n);
  const built = [
    input.decided > 0
      ? say(
          sentence(
            "built-days-decided",
            "{days} in {cities}, planned around {things} already decided.",
            [
              days,
              cities,
              counted(
                "things",
                count(input.decided, "thing"),
                "things-decided",
                input.decided,
              ),
            ],
          ),
        )
      : say(sentence("built-days", "{days} in {cities}.", [days, cities])),
    say(
      standing.length === 0
        ? sentence("built-nothing", "I have not placed anything yet.")
        : meals.length === 0
          ? sentence("built-see", "I chose {places} to see.", [
              chosen(standing.length),
            ])
          : meals.length === standing.length
            ? sentence("built-eat", "I chose {places} to eat at.", [
                chosen(meals.length),
              ])
            : sentence(
                "built-both",
                "I chose {places}: {see} to see and {eat} to eat at.",
                [
                  chosen(standing.length),
                  counted(
                    "see",
                    String(standing.length - meals.length),
                    "places-chosen",
                    standing.length - meals.length,
                  ),
                  counted(
                    "eat",
                    String(meals.length),
                    "places-chosen",
                    meals.length,
                  ),
                ],
              ),
    ),
    ...(own > 0
      ? [
          say(
            sentence(
              "built-own",
              "{places} you chose yourself stayed where {were}.",
              [
                counted("places", count(own, "place"), "places-left", own),
                counted(
                  "were",
                  own === 1 ? "it was" : "they were",
                  "plural",
                  own,
                ),
              ],
            ),
          ),
        ]
      : []),
  ];

  const assumed = [
    ...(view.provisionalDates && view.days[0]
      ? [
          {
            line: say(
              sentence(
                "assumed-start",
                "The trip starts on {date}, as you gave no dates.",
                [
                  computed(
                    "date",
                    dayWords(view.days[0].date),
                    "provisional-start",
                    { date: view.days[0].date },
                  ),
                ],
              ),
            ),
            step: 1,
          },
        ]
      : []),
    ...input.style
      .filter((answer) => USED.includes(answer.topic) && answer.from !== "trip")
      .map((answer) => ({ line: say(styleSentence(answer)), step: 4 })),
  ];

  /** The first few spelled out, the rest counted. */
  const some = <T extends { slotId: string }>(
    items: T[],
    line: (item: T) => ReportLine,
    rest: (more: number) => Sentence,
  ): ReportLine[] =>
    items.length <= SPELLED_OUT
      ? items.map(line)
      : [
          ...items.slice(0, SPELLED_OUT).map(line),
          { line: say(rest(items.length - SPELLED_OUT)), slotId: null },
        ];

  const stillOpen = progress.empty.filter(
    (slotId) => slots.get(slotId)?.entry.type === "open",
  );
  const unfitted: ReportLine[] = [
    ...view.shelf.flatMap((item) => {
      const shelved = places[item.placeId];
      return shelved
        ? [
            {
              line: say(
                sentence("shelf-place", "{place} is on your shelf.", [
                  fromPlace("place", shelved.name, shelved, null),
                ]),
                item.reason
                  ? sentence("shelf-reason", "{reason}", [
                      computed("reason", item.reason, "shelf-reason", {
                        placeId: shelved.id,
                      }),
                    ])
                  : sentence("shelf-saved", "You saved it for later."),
              ),
              slotId: null,
            },
          ]
        : [];
    }),
    ...some(
      stillOpen.map((slotId) => ({ slotId })),
      ({ slotId }) => ({
        line: say(
          sentence("open-nothing-fits", "Nothing I know fits {slot}.", [
            at(slotId),
          ]),
        ),
        slotId,
      }),
      (more) =>
        sentence("open-more", "{slots} open for the same reason.", [
          counted(
            "slots",
            count(more, "more slot is", "more slots are"),
            "slots-open",
            more,
          ),
        ]),
    ),
  ];

  const close = standing.filter(({ slotId }) =>
    progress.close.includes(slotId),
  );
  const hoursUnknown = standing.filter(({ entry }) =>
    entry.flags.some((flag) => flag.rule === "hours-unknown"),
  );
  const unconfirmed = meals.filter(
    ({ place }) =>
      input.dietaryRules.length > 0 &&
      !input.dietaryRules.every((rule) => place.serves.includes(rule)),
  );
  /** The places by name, once each, as one fact. */
  const names = (items: typeof standing) =>
    computed(
      "names",
      list([...new Set(items.map(({ place }) => place.name))]),
      "places-named",
      { placeIds: [...new Set(items.map(({ place }) => place.id))].join(",") },
    );
  const checkIt = sentence("check-first", "Check before you go.");
  const unsure: ReportLine[] = [
    ...some(
      close,
      ({ slotId, place }) => ({
        line: say(
          sentence("close-for-slot", "Two places were close for {slot}.", [
            at(slotId),
          ]),
          sentence("close-chose", "I chose {place}.", [
            fromPlace("place", place.name, place, null),
          ]),
        ),
        slotId,
      }),
      (more) =>
        sentence("close-more", "{choices} close too.", [
          counted(
            "choices",
            count(more, "more choice was", "more choices were"),
            "close-choices",
            more,
          ),
        ]),
    ),
    ...(unconfirmed.length > 0
      ? [
          {
            line: say(
              sentence(
                "diet-unconfirmed",
                "{names} {verb} not say whether {rules} food is served.",
                [
                  names(unconfirmed),
                  counted(
                    "verb",
                    new Set(unconfirmed.map(({ place }) => place.name)).size ===
                      1
                      ? "does"
                      : "do",
                    "plural",
                    unconfirmed.length,
                  ),
                  fromTraveller(
                    "rules",
                    list(input.dietaryRules),
                    refsOf(
                      input.dietaryRules.map(
                        (rule) => input.dietaryEntries?.[rule],
                      ),
                      "food",
                    ),
                  ),
                ],
              ),
              checkIt,
            ),
            slotId: null,
          },
        ]
      : []),
    ...(hoursUnknown.length > 0
      ? [
          {
            line: say(
              sentence(
                "hours-unknown",
                "I do not know the opening hours of {names}.",
                [names(hoursUnknown)],
              ),
              checkIt,
            ),
            slotId: null,
          },
        ]
      : []),
    ...(progress.unreachable
      ? [
          {
            line: say(
              sentence(
                "places-unreachable",
                "I could not look up new places for part of this, so I used the places I already knew.",
              ),
            ),
            slotId: null,
          },
        ]
      : []),
  ];

  return {
    report: {
      building: progress.nextDay <= view.days.length,
      days: view.days.map((day) => ({
        day: day.day,
        date: day.date,
        built: day.day < progress.nextDay,
      })),
      built,
      assumed,
      unfitted,
      unsure,
    },
    sentences,
  };
}

import {
  isMeal,
  SLOT_WORDS,
  type BuildProgress,
  type PlanEntry,
  type PlanView,
  type SlotKind,
} from "@/features/itinerary/contracts";
import type { PlaceDto } from "@/features/places/contracts";
import type { TasteTopic } from "@/features/memory/contracts";

import { count, day as dayWords, list, styleLine } from "./brief";
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

const slotWords = (kind: SlotKind) =>
  isMeal(kind) ? kind : `the ${SLOT_WORDS[kind].toLowerCase()}`;
type Slot = Extract<PlanEntry, { type: "open" | "place" }>;

export function buildReportOf(input: {
  view: PlanView;
  places: Record<string, PlaceDto>;
  progress: BuildProgress;
  /** The trip's style answers, with where each comes from. */
  style: BriefAnswer[];
  /** The dietary rules the trip's proposals respect. */
  dietaryRules: string[];
  cities: string[];
  /** How many things were already decided. */
  decided: number;
}): BuildReport {
  const { view, places, progress } = input;
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
    return `${slotWords(slot.entry.kind)} on day ${slot.day}`;
  };
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

  const built = [
    `${count(view.days.length, "day")} in ${list(input.cities)}${
      input.decided > 0
        ? `, planned around ${count(input.decided, "thing")} already decided`
        : ""
    }.`,
    standing.length === 0
      ? "I have not placed anything yet."
      : meals.length === 0
        ? `I chose ${count(standing.length, "place")} to see.`
        : meals.length === standing.length
          ? `I chose ${count(meals.length, "place")} to eat at.`
          : `I chose ${count(standing.length, "place")}: ${standing.length - meals.length} to see and ${meals.length} to eat at.`,
    ...(own > 0
      ? [
          `${count(own, "place")} you chose yourself stayed where ${own === 1 ? "it was" : "they were"}.`,
        ]
      : []),
  ];

  const assumed = [
    ...(view.provisionalDates && view.days[0]
      ? [
          {
            line: `The trip starts on ${dayWords(view.days[0].date)}, as you gave no dates.`,
            step: 1,
          },
        ]
      : []),
    ...input.style
      .filter((answer) => USED.includes(answer.topic) && answer.from !== "trip")
      .map((answer) => ({ line: styleLine(answer), step: 4 })),
  ];

  /** The first few spelled out, the rest counted. */
  const some = (lines: ReportLine[], rest: (more: number) => string) =>
    lines.length <= SPELLED_OUT
      ? lines
      : [
          ...lines.slice(0, SPELLED_OUT),
          { line: rest(lines.length - SPELLED_OUT), slotId: null },
        ];

  const stillOpen = progress.empty.filter(
    (slotId) => slots.get(slotId)?.entry.type === "open",
  );
  const unfitted: ReportLine[] = [
    ...view.shelf.flatMap((item) =>
      places[item.placeId]
        ? [
            {
              line: `${places[item.placeId].name} is on your shelf. ${item.reason ?? "You saved it for later."}`,
              slotId: null,
            },
          ]
        : [],
    ),
    ...some(
      stillOpen.map((slotId) => ({
        line: `Nothing I know fits ${at(slotId)}.`,
        slotId,
      })),
      (more) =>
        `${count(more, "more slot is", "more slots are")} open for the same reason.`,
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
  const names = (items: typeof standing) =>
    list([...new Set(items.map(({ place }) => place.name))]);
  const unsure: ReportLine[] = [
    ...some(
      close.map(({ slotId, place }) => ({
        line: `Two places were close for ${at(slotId)}. I chose ${place.name}.`,
        slotId,
      })),
      (more) =>
        `${count(more, "more choice was", "more choices were")} close too.`,
    ),
    ...(unconfirmed.length > 0
      ? [
          {
            line: `${names(unconfirmed)} ${new Set(unconfirmed.map(({ place }) => place.name)).size === 1 ? "does" : "do"} not say whether ${list(input.dietaryRules)} food is served. Check before you go.`,
            slotId: null,
          },
        ]
      : []),
    ...(hoursUnknown.length > 0
      ? [
          {
            line: `I do not know the opening hours of ${names(hoursUnknown)}. Check before you go.`,
            slotId: null,
          },
        ]
      : []),
    ...(progress.unreachable
      ? [
          {
            line: "I could not look up new places for part of this, so I used the places I already knew.",
            slotId: null,
          },
        ]
      : []),
  ];

  return {
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
  };
}

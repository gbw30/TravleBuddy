import { describe, expect, it } from "vitest";

import type {
  BuildProgress,
  PlanEntry,
  PlanView,
} from "@/features/itinerary/contracts";
import type { PlaceDto } from "@/features/places/contracts";
import { fillAll } from "@/lib/wording";

import type { BriefAnswer } from "./brief-view";
import { buildReportOf } from "./build-report";

const place = (id: string, over: Partial<PlaceDto> = {}): PlaceDto => ({
  id,
  origin: "SAMPLE",
  name: id,
  kind: "sight",
  cityKey: "lisbon|portugal",
  latitude: 38.7,
  longitude: -9.1,
  address: null,
  openingHours: null,
  notable: false,
  serves: [],
  servesNot: [],
  originRef: null,
  tags: {},
  lastEditedAt: null,
  fetchedAt: null,
  hoursDoubt: null,
  ...over,
});
const open = (slotId: string, kind: PlanEntry & { type: "open" }): PlanEntry =>
  ({ ...kind, slotId }) as PlanEntry;
const at = (
  slotId: string,
  placeId: string | null,
  flags: string[] = [],
): PlanEntry => {
  const kind = slotId.split("-").slice(1).join("-");
  return placeId
    ? ({
        type: "place",
        slotId,
        kind,
        cityKey: "lisbon|portugal",
        placeId,
        start: "10:00",
        minutes: 60,
        minutesEstimated: true,
        travelIn: null,
        flags: flags.map((rule) => ({ rule, message: "", fix: null })),
      } as PlanEntry)
    : open(slotId, {
        type: "open",
        kind,
        start: "10:00",
        cityKey: "lisbon|portugal",
      } as never);
};
const view = (days: PlanEntry[][], over: Partial<PlanView> = {}): PlanView => ({
  days: days.map((entries, index) => ({
    day: index + 1,
    date: `2027-04-${12 + index}`,
    city: "Lisbon",
    entries,
    stayNote: null,
    returnNote: null,
  })),
  blockers: [],
  pace: "relaxed",
  provisionalDates: false,
  shelf: [],
  unplaced: [],
  ...over,
});
const places = Object.fromEntries(
  [
    place("Castle"),
    place("Gallery", { kind: "museum" }),
    place("Old Town"),
    place("Corner Noodles", { kind: "restaurant", serves: ["vegetarian"] }),
    place("Garden Table", { kind: "restaurant" }),
    place("Tile Museum", { kind: "museum" }),
  ].map((item) => [item.id, item]),
);
const progress = (over: Partial<BuildProgress> = {}): BuildProgress => ({
  nextDay: 3,
  built: {},
  close: [],
  empty: [],
  unreachable: false,
  ...over,
});
const answer = (
  topic: BriefAnswer["topic"],
  from: BriefAnswer["from"],
  values: string[] = [],
  source: string | null = null,
): BriefAnswer => ({
  topic,
  name: {
    pace: "Pace",
    interests: "Interests",
    food: "Food",
    stay: "Where you stay",
  }[topic as "pace"],
  asks: "",
  several: false,
  choices: values.map((value) => ({
    value,
    label: value[0].toUpperCase() + value.slice(1),
  })),
  values,
  from,
  source,
  assumes: "I will keep a balanced pace.",
});
const worded = (over: Partial<Parameters<typeof buildReportOf>[0]> = {}) =>
  buildReportOf({
    view: view([
      [
        at("d1-morning", "Castle"),
        at("d1-lunch", "Corner Noodles"),
        at("d1-dinner", null),
      ],
      [at("d2-morning", "Gallery"), at("d2-lunch", "Garden Table")],
    ]),
    places,
    progress: progress({
      built: {
        "d1-morning": "Castle",
        "d1-lunch": "Corner Noodles",
        "d2-morning": "Gallery",
        "d2-lunch": "Garden Table",
      },
    }),
    style: [],
    dietaryRules: [],
    cities: ["Lisbon"],
    decided: 0,
    ...over,
  });
const report = (over: Partial<Parameters<typeof buildReportOf>[0]> = {}) =>
  worded(over).report;

describe("the report of a build", () => {
  it("has a record of sentences for each line, in the order the report reads", () => {
    const { report: made, sentences } = worded({
      view: view([[at("d1-morning", "Castle", ["hours-unknown"])]], {
        provisionalDates: true,
      }),
      style: [answer("pace", "profile", ["relaxed"], "from your trip")],
      progress: progress({
        built: { "d1-morning": "Castle" },
        close: ["d1-morning"],
      }),
    });
    const lines = [
      ...made.built,
      ...made.assumed.map((item) => item.line),
      ...made.unfitted.map((item) => item.line),
      ...made.unsure.map((item) => item.line),
    ];
    expect(lines.length).toBeGreaterThan(4);
    expect(sentences.map((item) => fillAll(item))).toEqual(lines);
    expect(sentences.flat().every((item) => item.template.length > 0)).toBe(
      true,
    );
    expect(
      sentences.flat().flatMap((item) => item.facts).length,
    ).toBeGreaterThan(0);
  });

  it("keeps every caution, doubt and assumption as fixed text, and leaves what it did free", () => {
    const { sentences } = worded({
      view: view(
        [
          [at("d1-morning", "Castle", ["hours-unknown"])],
          [at("d2-lunch", "Garden Table")],
        ],
        { provisionalDates: true },
      ),
      style: [answer("pace", "profile", ["relaxed"], "from your trip")],
      dietaryRules: ["vegetarian"],
      progress: progress({
        built: { "d1-morning": "Castle", "d2-lunch": "Garden Table" },
        close: ["d1-morning"],
        unreachable: true,
      }),
    });
    const fixed = (template: string) =>
      sentences.flat().filter((item) => item.template === template);
    for (const template of [
      "hours-unknown",
      "check-first",
      "diet-unconfirmed",
      "places-unreachable",
      "assumed-start",
      "style-pace-from",
      "close-for-slot",
    ]) {
      expect(fixed(template).length, template).toBeGreaterThan(0);
      expect(fixed(template).every((item) => item.fixed === true)).toBe(true);
    }
    for (const template of ["built-days", "built-both", "close-chose"]) {
      expect(fixed(template).length, template).toBeGreaterThan(0);
      expect(fixed(template).some((item) => item.fixed)).toBe(false);
    }
  });

  it("says what was built in two sentences", () => {
    expect(report().built).toEqual([
      "2 days in Lisbon.",
      "I chose 4 places: 2 to see and 2 to eat at.",
    ]);
    expect(report({ cities: ["Lisbon", "Porto"], decided: 1 }).built[0]).toBe(
      "2 days in Lisbon and Porto, planned around 1 thing already decided.",
    );
  });

  it("counts only what the build chose and the traveller left in place", () => {
    const swapped = report({
      view: view([
        // The traveller swapped the morning and chose a dinner themselves.
        [
          at("d1-morning", "Tile Museum"),
          at("d1-lunch", "Corner Noodles"),
          at("d1-dinner", "Garden Table"),
        ],
        [at("d2-morning", "Gallery"), at("d2-lunch", null)],
      ]),
    });
    expect(swapped.built.slice(1)).toEqual([
      "I chose 2 places: 1 to see and 1 to eat at.",
      "2 places you chose yourself stayed where they were.",
    ]);
    expect(report({ progress: progress() }).built[1]).toBe(
      "I have not placed anything yet.",
    );
  });

  it("lists what it assumed, each with the step of the brief that changes it", () => {
    const assumed = report({
      view: view([[at("d1-morning", "Castle")]], { provisionalDates: true }),
      style: [
        answer(
          "pace",
          "profile",
          ["relaxed"],
          "from your trip “Porto, May 2027”",
        ),
        answer("interests", "trip", ["museums"]),
        answer("food", "none"),
        // Where to stay does not shape a build, so it is not an assumption of it.
        answer("stay", "default", ["hotel"]),
      ],
    }).assumed;
    expect(assumed).toEqual([
      {
        line: "The trip starts on Mon, 12 Apr 2027, as you gave no dates.",
        step: 1,
      },
      { line: "Pace: relaxed (from your trip “Porto, May 2027”).", step: 4 },
      { line: "Food: I will keep a balanced pace.", step: 4 },
    ]);
    expect(report().assumed).toEqual([]);
  });

  it("says what is on the shelf and why, and which slots nothing fitted", () => {
    const unfitted = report({
      view: view(
        [
          [
            at("d1-morning", "Castle"),
            at("d1-dinner", null),
            at("d1-afternoon", "Old Town"),
          ],
        ],
        {
          shelf: [
            { placeId: "Tile Museum", reason: "Swapped out of day 1." },
            { placeId: "Gallery", reason: null },
          ],
        },
      ),
      // The afternoon was empty after the build; the traveller has since filled it.
      progress: progress({ nextDay: 2, empty: ["d1-dinner", "d1-afternoon"] }),
    }).unfitted;
    expect(unfitted).toEqual([
      {
        line: "Tile Museum is on your shelf. Swapped out of day 1.",
        slotId: null,
      },
      {
        line: "Gallery is on your shelf. You saved it for later.",
        slotId: null,
      },
      { line: "Nothing I know fits dinner on day 1.", slotId: "d1-dinner" },
    ]);
    expect(report().unfitted).toEqual([]);
  });

  it("offers a close choice to the traveller, while the place it chose still stands", () => {
    const unsure = report({
      progress: progress({
        built: {
          "d1-morning": "Castle",
          "d2-morning": "Tile Museum",
          "d2-lunch": "Garden Table",
        },
        // Day 2's morning was close too, but the traveller has changed it since.
        close: ["d1-morning", "d2-morning", "d2-lunch"],
      }),
    }).unsure;
    expect(unsure).toEqual([
      {
        line: "Two places were close for the morning on day 1. I chose Castle.",
        slotId: "d1-morning",
      },
      {
        line: "Two places were close for lunch on day 2. I chose Garden Table.",
        slotId: "d2-lunch",
      },
    ]);
  });

  it("words a breakfast like the other meals, and counts it as a place to eat at", () => {
    const withBreakfast = report({
      view: view([
        [at("d1-breakfast", "Corner Noodles"), at("d1-morning", "Castle")],
      ]),
      progress: progress({
        built: { "d1-breakfast": "Corner Noodles", "d1-morning": "Castle" },
        close: ["d1-breakfast"],
      }),
    });
    expect(withBreakfast.unsure[0].line).toBe(
      "Two places were close for breakfast on day 1. I chose Corner Noodles.",
    );
    expect(withBreakfast.built[1]).toBe(
      "I chose 2 places: 1 to see and 1 to eat at.",
    );
  });

  it("spells out three close choices and counts the rest", () => {
    const slots = ["d1-morning", "d1-lunch", "d2-morning", "d2-lunch"];
    const all = buildReportOf({
      view: view([
        [at("d1-morning", "Castle"), at("d1-lunch", "Corner Noodles")],
        [at("d2-morning", "Gallery"), at("d2-lunch", "Garden Table")],
      ]),
      places,
      progress: progress({
        built: {
          "d1-morning": "Castle",
          "d1-lunch": "Corner Noodles",
          "d2-morning": "Gallery",
          "d2-lunch": "Garden Table",
        },
        close: slots,
      }),
      style: [],
      dietaryRules: [],
      cities: ["Lisbon"],
      decided: 0,
    }).report.unsure;
    expect(all).toHaveLength(4);
    expect(all[3]).toEqual({
      line: "1 more choice was close too.",
      slotId: null,
    });
  });

  it("names the places whose hours it does not know, and meals that do not confirm a dietary rule", () => {
    const unsure = report({
      view: view([
        [
          at("d1-morning", "Castle", ["hours-unknown"]),
          at("d1-lunch", "Corner Noodles"),
        ],
        [
          at("d2-morning", "Gallery", ["hours-unknown"]),
          at("d2-lunch", "Garden Table"),
        ],
      ]),
      dietaryRules: ["vegetarian"],
    }).unsure;
    expect(unsure).toEqual([
      {
        line: "Garden Table does not say whether vegetarian food is served. Check before you go.",
        slotId: null,
      },
      {
        line: "I do not know the opening hours of Castle and Gallery. Check before you go.",
        slotId: null,
      },
    ]);
  });

  it("cites the profile entry of a remembered rule, and the trip's answer for one given for this trip", () => {
    const refOfRules = (dietaryEntries: Record<string, string>) =>
      worded({
        view: view([[at("d1-lunch", "Garden Table")]]),
        progress: progress({ built: { "d1-lunch": "Garden Table" } }),
        dietaryRules: ["vegetarian", "halal"],
        dietaryEntries,
      })
        .sentences.flat()
        .flatMap((item) => item.facts)
        .find((fact) => fact.gap === "rules")?.source;
    expect(refOfRules({ vegetarian: "e1" })).toEqual({
      type: "traveller",
      ref: "profile:e1,trip-taste:food",
    });
    expect(refOfRules({})).toEqual({
      type: "traveller",
      ref: "trip-taste:food",
    });
  });

  it("says when it could not look up new places", () => {
    expect(
      report({ progress: progress({ unreachable: true }) }).unsure,
    ).toEqual([
      {
        line: "I could not look up new places for part of this, so I used the places I already knew.",
        slotId: null,
      },
    ]);
  });

  it("shows how far a build is while it runs", () => {
    const running = report({ progress: progress({ nextDay: 2 }) });
    expect(running.building).toBe(true);
    expect(running.days).toEqual([
      { day: 1, date: "2027-04-12", built: true },
      { day: 2, date: "2027-04-13", built: false },
    ]);
    expect(report().building).toBe(false);
  });
});

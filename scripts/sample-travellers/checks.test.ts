import { describe, expect, it } from "vitest";

import type { PlanEntry } from "@/features/itinerary/contracts";
import type { PlanSnapshot } from "@/use-cases/plan-snapshot";

import {
  checkItinerary,
  checkReason,
  checkReasons,
  type Expected,
  type Truth,
} from "./checks";

const known = new Map(
  Object.entries({
    Castle: { serves: [], servesNot: [] },
    Gallery: { serves: [], servesNot: [] },
    "Old Town": { serves: [], servesNot: [] },
    "Corner Noodles": { serves: ["vegetarian"], servesNot: [] },
    "Lantern Grill": { serves: [], servesNot: ["vegetarian"] },
  }),
);
const at = (
  slotId: string,
  name: string | null,
  flags: string[] = [],
): PlanEntry => {
  const kind = slotId.split("-").slice(1).join("-");
  const base = { slotId, kind, cityKey: "lisbon|portugal", start: "10:00" };
  return (
    name
      ? {
          ...base,
          type: "place",
          placeId: name,
          minutes: 60,
          minutesEstimated: true,
          travelIn: null,
          flags: flags.map((rule) => ({ rule, message: "", fix: null })),
        }
      : { ...base, type: "open" }
  ) as PlanEntry;
};
const decided = (title: string, start: string | null): PlanEntry =>
  ({
    type: "commitment",
    commitmentId: title,
    commitmentKind: "RESERVATION",
    title,
    start,
    minutes: 60,
    slotId: null,
  }) as PlanEntry;
const plan = (
  days: PlanEntry[][],
  pace: PlanSnapshot["view"]["pace"] = "relaxed",
): PlanSnapshot => {
  const names = days
    .flat()
    .flatMap((entry) => (entry.type === "place" ? [entry.placeId] : []));
  return {
    view: {
      days: days.map((entries, index) => ({
        day: index + 1,
        date: `2027-04-${12 + index}`,
        city: "Lisbon",
        entries,
      })),
      blockers: [],
      pace,
      provisionalDates: false,
      shelf: [],
      unplaced: [],
    },
    chosen: Object.fromEntries(
      names.map((name) => [name, { placeId: name, name }]),
    ),
    proposal: null,
    holding: null,
    shelfOffer: null,
    canUndo: false,
    build: null,
  } as unknown as PlanSnapshot;
};
const expected = (over: Partial<Expected> = {}): Expected => ({
  pace: "relaxed",
  dietaryRules: [],
  decided: [],
  ...over,
});
const failed = (findings: ReturnType<typeof checkItinerary>) =>
  findings
    .filter((item) => !item.ok)
    .map((item) => `${item.check}: ${item.detail}`);
const good = plan([
  [
    at("d1-morning", "Castle"),
    at("d1-lunch", "Corner Noodles"),
    at("d1-afternoon", "Gallery"),
  ],
]);

describe("the checks on a planned trip", () => {
  it("pass a plan of known places that breaks nothing", () => {
    const findings = checkItinerary({
      plan: good,
      expected: expected({ dietaryRules: ["vegetarian"] }),
      known,
    });
    expect(failed(findings)).toEqual([]);
    expect(findings.map((item) => item.check)).toEqual([
      "No place is invented",
      "No rule is broken",
      "Nothing already decided was moved",
      "No hard limit is broken",
      "Every day has its meals",
      "The days match the pace",
    ]);
  });

  it("catch a place the source does not know, and a place used twice", () => {
    const invented = plan([
      [at("d1-morning", "Castle"), at("d1-afternoon", "Moon Garden")],
      [at("d2-morning", "Castle")],
    ]);
    expect(
      failed(checkItinerary({ plan: invented, expected: expected(), known })),
    ).toEqual([
      "No place is invented: day 1 afternoon: Moon Garden; Castle is in the plan twice",
    ]);
  });

  it("let a place the traveller added by hand pass: it exists because they say so", () => {
    const own = plan([[at("d1-afternoon", "Aunt Keiko's flat")]]);
    own.chosen["Aunt Keiko's flat"] = {
      ...own.chosen["Aunt Keiko's flat"],
      origin: "USER",
    };
    expect(
      failed(checkItinerary({ plan: own, expected: expected(), known })),
    ).toEqual([]);
  });

  it("catch a place picked although it was already decided, and a day with a meal left open", () => {
    const both = plan([
      [
        decided("castle", "15:00"),
        at("d1-morning", "Castle"),
        at("d1-lunch", null),
        at("d1-dinner", "Corner Noodles"),
      ],
    ]);
    expect(
      failed(
        checkItinerary({
          plan: both,
          expected: expected({
            decided: [{ title: "castle", start: "15:00" }],
          }),
          known,
        }),
      ),
    ).toEqual([
      "No place is invented: Castle is picked on day 1 and is also already decided",
      "Every day has its meals: day 1 has no lunch",
    ]);
  });

  it("catch a broken rule, and let unknown opening hours pass", () => {
    const flagged = plan([
      [
        at("d1-morning", "Castle", ["closed"]),
        at("d1-afternoon", "Gallery", ["hours-unknown"]),
      ],
    ]);
    expect(
      failed(checkItinerary({ plan: flagged, expected: expected(), known })),
    ).toEqual(["No rule is broken: day 1 Castle: closed"]);
  });

  it("catch something decided that moved or went missing", () => {
    const kept = plan([
      [decided("Fado evening", "20:00"), at("d1-morning", "Castle")],
    ]);
    expect(
      failed(
        checkItinerary({
          plan: kept,
          expected: expected({
            decided: [{ title: "Fado evening", start: "20:00" }],
          }),
          known,
        }),
      ),
    ).toEqual([]);
    expect(
      failed(
        checkItinerary({
          plan: kept,
          expected: expected({
            decided: [
              { title: "Fado evening", start: "19:00" },
              { title: "Boat trip", start: "10:00" },
            ],
          }),
          known,
        }),
      ),
    ).toEqual([
      "Nothing already decided was moved: Fado evening is at 20:00, not 19:00; Boat trip is missing",
    ]);
  });

  it("catch a meal at a place whose listing goes against a dietary rule", () => {
    const grill = plan([
      [at("d1-dinner", "Lantern Grill"), at("d1-lunch", "Corner Noodles")],
    ]);
    expect(
      failed(
        checkItinerary({
          plan: grill,
          expected: expected({ dietaryRules: ["vegetarian"] }),
          known,
        }),
      ),
    ).toEqual([
      "No hard limit is broken: day 1 dinner: Lantern Grill says it does not serve vegetarian food",
    ]);
    // Without the rule the same plan is fine.
    expect(
      failed(checkItinerary({ plan: grill, expected: expected(), known })),
    ).toEqual([]);
  });

  it("catch a plan at the wrong pace, or a day fuller than the pace allows", () => {
    const full = plan(
      [
        [
          at("d1-morning", "Castle"),
          at("d1-morning-2", "Gallery"),
          at("d1-afternoon", "Old Town"),
        ],
      ],
      "balanced",
    );
    expect(
      failed(checkItinerary({ plan: full, expected: expected(), known })),
    ).toEqual([
      "The days match the pace: the plan's pace is balanced, not relaxed; day 1 has 3 sights or activities, more than 2",
    ]);
    expect(
      failed(
        checkItinerary({
          plan: full,
          expected: expected({ pace: "balanced" }),
          known,
        }),
      ),
    ).toEqual([]);
  });
});

describe("the check on a card's reason", () => {
  const truth = (over: Partial<Truth> = {}): Truth => ({
    cities: ["Lisbon"],
    interests: ["museums and exhibitions"],
    food: ["vegetarian"],
    atmosphere: null,
    onFoot: false,
    trips: ["Porto, May 2027"],
    ...over,
  });
  const open = "It is open for the whole visit.";
  const unknown = "Its opening hours are not known, so check before you go.";

  it("passes reasons that say only what is true", () => {
    for (const reason of [
      `It fits your morning in Lisbon. You said you like museums and exhibitions. ${open}`,
      `It is about a 12-minute walk from Castle, so it fits your afternoon. I remember from your trip “Porto, May 2027” that you like museums and exhibitions. ${unknown}`,
      `It fits your lunch in Lisbon. You eat vegetarian food, and its listing says it serves it. ${open}`,
      `It fits your dinner in Lisbon. You eat vegetarian food, and the place data does not say whether this place serves it, so check with the venue. ${unknown}`,
      `It fits your afternoon in Lisbon. It is not one of the interests you named, but you have no park or garden in this day yet. ${open}`,
    ]) {
      expect(checkReason(reason, truth()), reason).toEqual([]);
    }
    expect(
      checkReason(
        `It fits your morning in Lisbon. You have not told me what you like to see yet, and it is one of Lisbon's well-known places. ${open}`,
        truth({ interests: null }),
      ),
    ).toEqual([]);
    expect(
      checkReason(
        `It fits your lunch in Lisbon. You have no food rules. ${open}`,
        truth({ food: [] }),
      ),
    ).toEqual([]);
    expect(
      checkReason(
        `It fits your lunch in Lisbon. You have not told me about food yet. ${open}`,
        truth({ food: null }),
      ),
    ).toEqual([]);
    expect(
      checkReason(
        `It fits your morning in Lisbon. You asked for quiet places, and this is a quieter choice. ${open}`,
        truth({ atmosphere: "quiet" }),
      ),
    ).toEqual([]);
  });

  it("catches a claim about the traveller that is not so", () => {
    expect(
      checkReason(
        `It fits your morning in Lisbon. You said you like views. ${open}`,
        truth(),
      ),
    ).toEqual(["says the traveller likes views, which they did not say"]);
    expect(
      checkReason(
        `It fits your morning in Lisbon. I remember from your trip “Rome, 2026” that you like museums and exhibitions. ${open}`,
        truth(),
      ),
    ).toEqual(["names the trip “Rome, 2026”, which is not one of theirs"]);
    expect(
      checkReason(
        `It fits your lunch in Lisbon. You eat vegan food, and its listing says it serves it. ${open}`,
        truth(),
      ),
    ).toEqual([
      "says the traveller eats vegan food; their rules are vegetarian",
    ]);
    expect(
      checkReason(
        `It fits your lunch in Lisbon. You have no food rules. ${open}`,
        truth(),
      ),
    ).toEqual(["says the traveller has no food rules, which is not so"]);
    expect(
      checkReason(
        `It fits your morning in Lisbon. You asked for quiet places, and this is a quieter choice. ${open}`,
        truth(),
      ),
    ).toEqual([
      "says the traveller asked for quiet places, which they did not",
    ]);
  });

  it("catches a city that is not the trip's, and a sentence of a kind it does not know", () => {
    expect(
      checkReason(
        `It fits your morning in Porto. You said you like museums and exhibitions. ${open}`,
        truth(),
      ),
    ).toEqual(["names Porto, which is not a city of the trip"]);
    expect(
      checkReason(
        `It fits your morning in Lisbon. Everyone loves it. ${open}`,
        truth(),
      ),
    ).toEqual([
      "says something this check does not know: “Everyone loves it.”",
    ]);
    expect(checkReason("A lovely spot.", truth())[0]).toContain(
      "does not say how it fits the slot",
    );
  });

  it("sums every reason into one finding", () => {
    const fine = checkReasons(
      [
        `It fits your morning in Lisbon. You said you like museums and exhibitions. ${open}`,
      ],
      truth(),
    );
    expect(fine).toMatchObject({
      ok: true,
      detail: "1 reasons read, sentence by sentence",
    });
    const bad = checkReasons(
      [`It fits your morning in Lisbon. You said you like views. ${open}`],
      truth(),
    );
    expect(bad.ok).toBe(false);
  });
});

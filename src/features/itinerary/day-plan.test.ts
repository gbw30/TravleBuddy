import { describe, expect, it } from "vitest";

import { travelEstimate, type PlaceDto } from "@/features/places/contracts";
import type { CommitmentDto } from "@/features/trips/contracts";

import {
  emptyPlanState,
  type Pace,
  type PlanEntry,
  type PlanState,
} from "./contracts";
import {
  buildPlanView,
  kindSuitsSlot,
  provisionalStart,
  slotId,
  type PlanContext,
} from "./day-plan";

const city = (name: string, latitude: number, longitude: number) => ({
  name,
  region: null,
  country: "Japan",
  latitude,
  longitude,
  timeZone: "Asia/Tokyo",
});
const tokyo = city("Tokyo", 35.6769, 139.7639);
const kyoto = city("Kyoto", 35.0116, 135.7681);

const place = (id: string, over: Partial<PlaceDto> = {}): PlaceDto => ({
  id,
  origin: "SAMPLE",
  name: id,
  kind: "museum",
  cityKey: "tokyo|japan",
  latitude: 35.7188,
  longitude: 139.7765,
  address: null,
  openingHours: "Mo-Su 09:00-18:00",
  notable: true,
  serves: [],
  servesNot: [],
  originRef: null,
  tags: {},
  lastEditedAt: null,
  fetchedAt: null,
  hoursDoubt: null,
  ...over,
});
const commitment = (over: Partial<CommitmentDto>): CommitmentDto => ({
  id: "c1",
  kind: "RESERVATION",
  title: "Dinner at Den",
  date: null,
  startTime: null,
  endDate: null,
  endTime: null,
  reference: null,
  note: null,
  located: null,
  transport: null,
  ...over,
});

// 10 May 2027 is a Monday.
const context = (over: Partial<PlanContext> = {}): PlanContext => ({
  facts: {
    cities: [{ city: tokyo, nights: 2 }],
    startDate: "2027-05-10",
    endDate: "2027-05-12",
    lengthNights: null,
    timeOfYear: null,
  },
  commitments: [],
  places: {},
  ...over,
});
const state = (over: Partial<PlanState> = {}): PlanState => ({
  ...emptyPlanState,
  ...over,
});
const kinds = (entries: PlanEntry[]) =>
  entries.map((entry) => (entry.type === "open" ? entry.kind : entry.type));
const found = <T extends PlanEntry["type"]>(entries: PlanEntry[], type: T) =>
  entries.filter((entry) => entry.type === type) as Extract<
    PlanEntry,
    { type: T }
  >[];

describe("what a plan needs before it can be laid out", () => {
  it("names the missing fact and lays out nothing", () => {
    const none = context().facts;
    expect(
      buildPlanView(state(), context({ facts: { ...none, cities: [] } }))
        .blockers,
    ).toEqual(["where"]);
    expect(
      buildPlanView(state(), context({ facts: { ...none, startDate: null } }))
        .blockers,
    ).toEqual(["when"]);
    expect(
      buildPlanView(
        state(),
        context({
          facts: {
            ...none,
            cities: [{ city: tokyo, nights: null }],
            endDate: null,
          },
        }),
      ).blockers,
    ).toEqual(["nights"]);
    expect(
      buildPlanView(
        state(),
        context({
          facts: {
            ...none,
            cities: [
              { city: tokyo, nights: 2 },
              { city: kyoto, nights: null },
            ],
          },
        }),
      ),
    ).toMatchObject({ blockers: ["nights"], days: [] });
  });

  it("works a single city's nights out from the dates", () => {
    const view = buildPlanView(
      state(),
      context({
        facts: { ...context().facts, cities: [{ city: tokyo, nights: null }] },
      }),
    );
    expect(view.days.map((day) => day.date)).toEqual([
      "2027-05-10",
      "2027-05-11",
      "2027-05-12",
    ]);
  });
});

describe("the days and their slots", () => {
  it("gives each day the slots of its pace, and time to wander after lunch", () => {
    const day = (pace: PlanState["pace"]) =>
      buildPlanView(state({ pace }), context()).days[1].entries;
    expect(kinds(day("relaxed"))).toEqual([
      "morning",
      "lunch",
      "wander",
      "afternoon",
      "dinner",
    ]);
    expect(kinds(day("balanced"))).toEqual([
      "morning",
      "lunch",
      "wander",
      "afternoon",
      "afternoon-2",
      "dinner",
    ]);
    expect(kinds(day("packed"))).toEqual([
      "morning",
      "morning-2",
      "lunch",
      "afternoon",
      "afternoon-2",
      "dinner",
    ]);
    expect(found(day("relaxed"), "wander")[0]).toMatchObject({
      start: "13:45",
      minutes: 120,
    });
    expect(found(day("balanced"), "wander")[0].minutes).toBe(60);
  });

  it("starts the first day after the flight lands and ends the last before it leaves", () => {
    const view = buildPlanView(
      state(),
      context({
        commitments: [
          commitment({
            id: "in",
            kind: "TRANSPORT",
            title: "Flight in",
            date: "2027-05-09",
            startTime: "11:30",
            endDate: "2027-05-10",
            endTime: "14:35",
          }),
          commitment({
            id: "out",
            kind: "TRANSPORT",
            title: "Flight out",
            date: "2027-05-12",
            startTime: "18:00",
            endDate: "2027-05-12",
            endTime: "17:10",
          }),
        ],
      }),
    );
    // Landing at 14:35 leaves room from 15:35: the afternoon slot is too early.
    expect(view.days[0].entries).toMatchObject([
      { type: "commitment", title: "Flight in", start: "14:35" },
      { type: "allowance", way: "from", start: "14:35", minutes: 60 },
      { type: "open", kind: "afternoon-2", start: "16:00" },
      { type: "open", kind: "dinner" },
    ]);
    // Leaving at 18:00 ends the day at 16:00: no late afternoon, no dinner.
    expect(kinds(view.days[2].entries)).toEqual([
      "morning",
      "lunch",
      "wander",
      "afternoon",
      "allowance",
      "commitment",
    ]);
    expect(view.unplaced).toEqual([]);
  });

  it("gives a slot to a commitment with a time and keeps it exactly there", () => {
    const view = buildPlanView(
      state(),
      context({
        commitments: [
          commitment({
            date: "2027-05-11",
            startTime: "19:00",
            endTime: "21:00",
          }),
        ],
      }),
    );
    const evening = view.days[1].entries.slice(-2);
    expect(evening).toMatchObject([
      { type: "open", kind: "afternoon-2" },
      {
        type: "commitment",
        title: "Dinner at Den",
        start: "19:00",
        minutes: 120,
      },
    ]);
    expect(kinds(view.days[1].entries)).not.toContain("dinner");
  });

  it("fits a must-include with no time before anything optional, in the same slot every time", () => {
    const must = commitment({
      id: "m",
      kind: "MUST_SEE",
      title: "teamLab",
      date: "2027-05-11",
    });
    const undated = commitment({ id: "u", kind: "MUST_SEE", title: "Skytree" });
    const booking = commitment({
      id: "r",
      kind: "RESERVATION",
      title: "Sushi",
      date: "2027-05-11",
    });
    const ctx = context({
      commitments: [must, booking, undated],
      places: { p: place("p") },
    });

    const view = buildPlanView(state(), ctx);
    const held = (day: number) =>
      found(view.days[day].entries, "commitment").map((entry) => [
        entry.title,
        entry.slotId,
      ]);
    expect(held(1)).toEqual([
      ["teamLab", "d2-morning"],
      ["Sushi", "d2-dinner"],
    ]);
    expect(held(0)).toEqual([["Skytree", "d1-morning"]]);

    // A pick made earlier in that slot is not consulted; it moves to the shelf.
    const withPick = buildPlanView(
      state({ picks: { "d2-morning": { placeId: "p", minutes: null } } }),
      ctx,
    );
    expect(found(withPick.days[1].entries, "commitment")[0].slotId).toBe(
      "d2-morning",
    );
    expect(withPick.shelf).toEqual([
      { placeId: "p", reason: "Its slot is no longer free in the plan." },
    ]);
  });

  it("never drops a commitment it cannot fit or whose date is outside the trip", () => {
    const many = ["a", "b", "c", "d"].map((id) =>
      commitment({ id, kind: "MUST_SEE", title: id, date: "2027-05-11" }),
    );
    const late = commitment({
      id: "late",
      title: "Later",
      date: "2027-06-01",
      startTime: "10:00",
    });
    const view = buildPlanView(
      state({ pace: "relaxed" }),
      context({ commitments: [...many, late] }),
    );
    expect(view.unplaced.map((u) => u.commitmentId).sort()).toEqual([
      "c",
      "d",
      "late",
    ]);
  });

  it("lists a stay with no time on its day without giving it a slot", () => {
    const view = buildPlanView(
      state(),
      context({
        commitments: [
          commitment({
            id: "h",
            kind: "STAY",
            title: "Hotel",
            date: "2027-05-10",
          }),
        ],
      }),
    );
    expect(view.days[0].entries[0]).toMatchObject({
      type: "commitment",
      title: "Hotel",
      start: null,
      slotId: null,
    });
    expect(kinds(view.days[0].entries)).toContain("morning");
  });
});

describe("a picked place", () => {
  const places = {
    museum: place("museum"),
    shrine: place("shrine", {
      kind: "temple",
      latitude: 35.7202,
      longitude: 139.7607,
      openingHours: null,
    }),
    closed: place("closed", { openingHours: "Mo off; Tu-Su 09:00-17:00" }),
    kyotoTemple: place("kyotoTemple", {
      kind: "temple",
      cityKey: "kyoto|japan",
      latitude: 35.0,
      longitude: 135.77,
    }),
    noPosition: place("noPosition", {
      origin: "USER",
      latitude: null,
      longitude: null,
      openingHours: null,
    }),
  };
  const pick = (id: string, minutes: number | null = null) => ({
    placeId: id,
    minutes,
  });

  it("starts at its slot, lasts the standard visit, and is marked as an estimate", () => {
    const view = buildPlanView(
      state({ picks: { "d2-morning": pick("museum") } }),
      context({ places }),
    );
    expect(found(view.days[1].entries, "place")[0]).toEqual({
      type: "place",
      slotId: "d2-morning",
      kind: "morning",
      cityKey: "tokyo|japan",
      placeId: "museum",
      start: "09:30",
      minutes: 120,
      minutesEstimated: true,
      travelIn: null,
      flags: [],
    });
  });

  it("uses the traveller's own visit length when they set one", () => {
    const view = buildPlanView(
      state({ picks: { "d2-morning": pick("museum", 45) } }),
      context({ places }),
    );
    expect(found(view.days[1].entries, "place")[0]).toMatchObject({
      minutes: 45,
      minutesEstimated: false,
    });
  });

  it("leaves the travel time and the pace buffer before the next item", () => {
    const view = buildPlanView(
      state({
        pace: "packed",
        picks: { "d2-morning": pick("museum"), "d2-morning-2": pick("shrine") },
      }),
      context({ places }),
    );
    const [first, second] = found(view.days[1].entries, "place");
    // 09:00 + 120 minutes, then an estimated walk and the packed buffer of 10.
    expect(first.start).toBe("09:00");
    expect(second.travelIn).toMatchObject({ means: "walk" });
    expect(second.start).toBe(
      `11:${String(second.travelIn!.minutes + 10).padStart(2, "0")}`,
    );
  });

  it("times a leg by the stated means", () => {
    const picks = {
      "d2-morning": pick("museum"),
      "d2-morning-2": pick("shrine"),
    };
    const leg = (means?: "walk" | "transit" | "drive") =>
      found(
        buildPlanView(
          state({ pace: "packed", picks }),
          context({ places, means }),
        ).days[1].entries,
        "place",
      )[1].travelIn;
    // About a kilometre apart: walked unless the traveller said otherwise.
    expect(leg()?.means).toBe("walk");
    expect(leg("drive")?.means).toBe("drive");
    expect(leg("transit")?.means).toBe("transit");
  });

  it("flags a place that is closed, and one whose hours are unknown", () => {
    const view = buildPlanView(
      state({
        picks: { "d1-morning": pick("closed"), "d2-morning": pick("shrine") },
      }),
      context({ places }),
    );
    expect(found(view.days[0].entries, "place")[0].flags).toMatchObject([
      { rule: "closed" },
    ]);
    expect(found(view.days[1].entries, "place")[0].flags).toEqual([
      {
        rule: "hours-unknown",
        message: "Opening hours are not known. Check before you go.",
        fix: null,
      },
    ]);
  });

  it("flags a visit that runs into a fixed commitment, and leaves the commitment alone", () => {
    const view = buildPlanView(
      state({ picks: { "d2-afternoon": pick("museum", 240) } }),
      context({
        places,
        commitments: [
          commitment({
            date: "2027-05-11",
            startTime: "17:00",
            endTime: "18:00",
          }),
        ],
      }),
    );
    // Time to wander pushes the visit to 14:45, so it also outlasts the museum's hours.
    expect(found(view.days[1].entries, "place")[0].flags).toContainEqual({
      rule: "overlap",
      message: "Runs into Dinner at Den at 17:00.",
      fix: "Shorten the visit, move it earlier, or swap it.",
    });
    expect(found(view.days[1].entries, "commitment")[0]).toMatchObject({
      start: "17:00",
      minutes: 60,
    });
  });

  it("flags a place in another city, and a visit that ends after the day", () => {
    const view = buildPlanView(
      state({
        picks: {
          "d2-morning": pick("kyotoTemple"),
          "d2-dinner": pick("museum", 200),
        },
      }),
      context({ places }),
    );
    const [morning, dinner] = found(view.days[1].entries, "place");
    expect(morning.flags.map((flag) => flag.rule)).toContain("city");
    expect(dinner.flags.map((flag) => flag.rule)).toContain("day");
  });

  it("shows no travel time to or from a place with no known position", () => {
    const view = buildPlanView(
      state({
        pace: "packed",
        picks: {
          "d2-morning": pick("museum"),
          "d2-morning-2": pick("noPosition"),
        },
      }),
      context({ places }),
    );
    expect(found(view.days[1].entries, "place")[1].travelIn).toBeNull();
  });

  it("gives the same plan for the same choices, every time", () => {
    const s = state({
      picks: { "d2-morning": pick("museum"), "d2-afternoon": pick("shrine") },
    });
    expect(buildPlanView(s, context({ places }))).toEqual(
      buildPlanView(s, context({ places })),
    );
  });
});

describe("a trip across cities", () => {
  const facts = {
    cities: [
      { city: tokyo, nights: 2 },
      { city: kyoto, nights: 1 },
    ],
    startDate: "2027-05-10",
    endDate: null,
    lengthNights: null,
    timeOfYear: null,
  };

  it("adds an assumed transfer at midday on the day the city changes", () => {
    const view = buildPlanView(state(), context({ facts }));
    expect(view.days.map((day) => day.city)).toEqual([
      "Tokyo",
      "Tokyo",
      "Tokyo",
      "Kyoto",
    ]);
    const day3 = view.days[2].entries;
    const transfer = found(day3, "transfer")[0];
    expect(transfer).toMatchObject({
      from: "Tokyo",
      to: "Kyoto",
      start: "12:00",
    });
    expect(transfer.minutes).toBeGreaterThan(240);
    // Morning in Tokyo before leaving; nothing while travelling.
    expect(kinds(day3)[0]).toBe("morning");
    expect(kinds(day3)).not.toContain("lunch");
  });

  it("lets the traveller move the assumed transfer", () => {
    const view = buildPlanView(
      state({ transferTimes: { "3": "08:00" } }),
      context({ facts }),
    );
    expect(found(view.days[2].entries, "transfer")[0].start).toBe("08:00");
    expect(kinds(view.days[2].entries)).toContain("dinner");
  });

  it("uses the traveller's ticket in place of the assumed transfer", () => {
    const view = buildPlanView(
      state(),
      context({
        facts,
        commitments: [
          commitment({
            id: "t",
            kind: "TRANSPORT",
            title: "Shinkansen",
            date: "2027-05-12",
            startTime: "09:00",
            endDate: "2027-05-12",
            endTime: "11:15",
            transport: {
              mode: "TRAIN",
              origin: "Tokyo",
              destination: "Kyoto",
              originZone: "Asia/Tokyo",
              destinationZone: "Asia/Tokyo",
            },
          }),
        ],
      }),
    );
    const day3 = view.days[2].entries;
    expect(found(day3, "transfer")).toEqual([]);
    expect(day3[1]).toMatchObject({
      type: "commitment",
      title: "Shinkansen",
      start: "09:00",
      minutes: 135,
    });
    // 30 minutes before, 20 after: in Kyoto from 11:35, lunch and the afternoon are there.
    expect(kinds(day3)).toEqual([
      "allowance",
      "commitment",
      "allowance",
      "lunch",
      "wander",
      "afternoon",
      "afternoon-2",
      "dinner",
    ]);
  });
});

describe("provisional dates and slot fit", () => {
  it("assumes the second Monday of the month, in the first year still ahead", () => {
    const facts = { startDate: null, lengthNights: 5, timeOfYear: 5 };
    expect(provisionalStart(facts, "2026-11-18")).toBe("2027-05-10");
    expect(provisionalStart(facts, "2027-05-10")).toBe("2028-05-08");
    expect(
      provisionalStart({ ...facts, startDate: "2027-01-01" }, "2026-11-18"),
    ).toBeNull();
    expect(
      provisionalStart({ ...facts, timeOfYear: null }, "2026-11-18"),
    ).toBeNull();
  });

  it("marks dates as provisional and lays the days out from them", () => {
    const view = buildPlanView(
      state({ provisionalStart: "2027-05-10" }),
      context({
        facts: {
          cities: [{ city: tokyo, nights: null }],
          startDate: null,
          endDate: null,
          lengthNights: 3,
          timeOfYear: 5,
        },
      }),
    );
    expect(view.provisionalDates).toBe(true);
    expect(view.days).toHaveLength(4);
  });

  it("puts meals at meal times and everything else between", () => {
    expect(kindSuitsSlot("restaurant", "dinner")).toBe(true);
    expect(kindSuitsSlot("cafe", "dinner")).toBe(false);
    expect(kindSuitsSlot("cafe", "lunch")).toBe(true);
    expect(kindSuitsSlot("museum", "lunch")).toBe(false);
    expect(kindSuitsSlot("museum", "morning")).toBe(true);
    expect(kindSuitsSlot("restaurant", "afternoon")).toBe(false);
    expect(slotId(2, "afternoon-2")).toBe("d2-afternoon-2");
  });
});

describe("the shape of the day", () => {
  const starts = (view: ReturnType<typeof buildPlanView>, day = 0) =>
    view.days[day].entries.flatMap((entry) =>
      entry.type === "open" ? [`${entry.kind} ${entry.start}`] : [],
    );
  const minutes = (clock: string) =>
    Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));

  it("leaves the day where it was when nothing is said", () => {
    expect(starts(buildPlanView(emptyPlanState, context()))).toEqual(
      starts(buildPlanView(emptyPlanState, context({ dayShift: 0 }))),
    );
  });

  it("moves the whole day an hour earlier for early starts and an hour later for late nights", () => {
    const usual = starts(buildPlanView(emptyPlanState, context()));
    const early = starts(
      buildPlanView(emptyPlanState, context({ dayShift: -60 })),
    );
    const late = starts(
      buildPlanView(emptyPlanState, context({ dayShift: 60 })),
    );
    expect(early).toHaveLength(usual.length);
    expect(late).toHaveLength(usual.length);
    usual.forEach((slot, index) => {
      const [kind, clock] = slot.split(" ");
      expect(early[index]).toBe(
        `${kind} ${clock.replace(/^\d\d/, (h) => String(Number(h) - 1).padStart(2, "0"))}`,
      );
      expect(late[index]).toBe(
        `${kind} ${clock.replace(/^\d\d/, (h) => String(Number(h) + 1).padStart(2, "0"))}`,
      );
    });
  });

  it("keeps lunch and dinner inside their hours at every pace, either way", () => {
    for (const pace of ["relaxed", "balanced", "packed"] as const) {
      for (const dayShift of [-60, 0, 60]) {
        const view = buildPlanView(
          { ...emptyPlanState, pace },
          context({ dayShift }),
        );
        for (const slot of starts(view)) {
          const [kind, clock] = slot.split(" ");
          const label = `${pace} ${dayShift} ${slot}`;
          if (kind === "lunch") {
            expect(minutes(clock), label).toBeGreaterThanOrEqual(11 * 60 + 30);
            expect(minutes(clock), label).toBeLessThanOrEqual(14 * 60);
          }
          if (kind === "dinner") {
            expect(minutes(clock), label).toBeGreaterThanOrEqual(18 * 60);
            expect(minutes(clock), label).toBeLessThanOrEqual(21 * 60);
          }
        }
      }
    }
  });

  it("starts a packed day at eight for an early riser", () => {
    const view = buildPlanView(
      { ...emptyPlanState, pace: "packed" },
      context({ dayShift: -60 }),
    );
    expect(starts(view)[0]).toBe("morning 08:00");
  });

  it("never moves what is already decided", () => {
    const booked = commitment({
      kind: "RESERVATION",
      date: "2027-05-10",
      startTime: "13:00",
      endTime: "14:30",
    });
    for (const dayShift of [-60, 60]) {
      const view = buildPlanView(
        emptyPlanState,
        context({ commitments: [booked], dayShift }),
      );
      const kept = view.days[0].entries.find(
        (entry) => entry.type === "commitment",
      );
      expect(kept).toMatchObject({ start: "13:00", minutes: 90 });
      // No open slot overlaps it.
      for (const entry of view.days[0].entries) {
        if (entry.type !== "open") continue;
        const at = minutes(entry.start);
        expect(
          at + 60 <= 13 * 60 || at >= 14 * 60 + 30,
          `${dayShift} ${entry.kind} ${entry.start}`,
        ).toBe(true);
      }
    }
  });

  it("moves a chosen place with its slot, and flags it if it is then closed", () => {
    // Open from nine: fine at the usual time, closed an hour earlier.
    const state: PlanState = {
      ...emptyPlanState,
      pace: "packed",
      picks: { "d1-morning": { placeId: "museum", minutes: null } },
    };
    const places = { museum: place("museum") };
    const flagsAt = (dayShift: number) =>
      buildPlanView(
        state,
        context({ places, dayShift }),
      ).days[0].entries.flatMap((entry) =>
        entry.type === "place"
          ? [`${entry.start} ${entry.flags.map((flag) => flag.rule).join(",")}`]
          : [],
      );
    expect(flagsAt(0)).toEqual(["09:00 "]);
    expect(flagsAt(-60)).toEqual(["08:00 closed"]);
  });
});

describe("the time lunch takes", () => {
  const minutesOf = (clock: string) =>
    Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));

  it("is kept free while lunch is still open, so what follows is laid out as it will be", () => {
    // At a packed pace nothing follows lunch but the afternoon. The late
    // morning runs to 13:15 here, so lunch cannot begin before then.
    const view = buildPlanView(
      state({
        pace: "packed",
        picks: {
          "d2-morning-2": { placeId: "museum", minutes: 150 },
          "d2-afternoon": { placeId: "shrine", minutes: null },
        },
      }),
      context({
        places: {
          museum: place("museum"),
          shrine: place("shrine", { latitude: 35.7202, longitude: 139.7607 }),
        },
      }),
    );
    const entries = view.days[1].entries;
    const lunch = entries.find(
      (entry) => entry.type === "open" && entry.kind === "lunch",
    )!;
    const afternoon = found(entries, "place")[1];
    expect(lunch.start).toBe("13:15");
    // 75 minutes for lunch, then the way there and the packed buffer of 10.
    expect(minutesOf(afternoon.start)).toBe(
      minutesOf("13:15") + 75 + afternoon.travelIn!.minutes + 10,
    );
  });

  it("is followed by time to wander only as far as the next thing decided", () => {
    const wanderWith = (startTime: string) =>
      found(
        buildPlanView(
          state({ pace: "relaxed" }),
          context({
            commitments: [
              commitment({ date: "2027-05-11", startTime, endTime: "17:30" }),
            ],
          }),
        ).days[1].entries,
        "wander",
      ).map((entry) => `${entry.start} ${entry.minutes}`);
    // Lunch ends at 13:45. Two hours to wander would run into 15:00.
    expect(wanderWith("15:00")).toEqual(["13:45 75"]);
    expect(wanderWith("17:00")).toEqual(["13:45 120"]);
    // A quarter of an hour is not time to wander.
    expect(wanderWith("14:00")).toEqual([]);
  });
});

describe("breakfast", () => {
  const first = (entries: PlanEntry[]) =>
    entries.filter((entry) => entry.type !== "commitment");
  const withBreakfast = (
    breakfast: PlanContext["breakfast"],
    over: Partial<PlanContext> = {},
    pace: Pace = "balanced",
  ) => buildPlanView(state({ pace }), context({ breakfast, ...over }));

  it("lays a 45-minute slot at the start of the day when asked to suggest, and the first stop moves later", () => {
    const view = withBreakfast("suggest", {}, "packed");
    const [breakfast, morning] = first(view.days[1].entries);
    expect(breakfast).toMatchObject({
      type: "open",
      kind: "breakfast",
      start: "09:00",
    });
    expect(morning).toMatchObject({
      type: "open",
      kind: "morning",
      start: "09:45",
    });
    expect(slotId(2, "breakfast")).toBe("d2-breakfast");
    // Every day has one.
    expect(
      view.days.every((day) => kinds(day.entries).includes("breakfast")),
    ).toBe(true);
  });

  it("starts the place picked for breakfast after the day starts and travels on from it", () => {
    const cafe = place("c", {
      kind: "cafe",
      latitude: 35.68,
      longitude: 139.76,
    });
    const view = buildPlanView(
      state({ picks: { "d1-breakfast": { placeId: "c", minutes: null } } }),
      context({ breakfast: "suggest", places: { c: cafe } }),
    );
    expect(view.days[0].entries[0]).toMatchObject({
      type: "place",
      kind: "breakfast",
      start: "09:00",
      minutes: 45,
    });
  });

  it("has no slot when the day starts after ten, as on a landing at eleven", () => {
    const landing = commitment({
      id: "t",
      kind: "TRANSPORT",
      title: "Flight",
      date: "2027-05-10",
      startTime: "08:00",
      endTime: "11:00",
    });
    const view = withBreakfast("suggest", { commitments: [landing] });
    expect(kinds(view.days[0].entries)).not.toContain("breakfast");
    expect(kinds(view.days[1].entries)).toContain("breakfast");
  });

  it("starts at ten for late nights, and is gone when the day starts later still", () => {
    const view = withBreakfast("suggest", { dayShift: 60 });
    expect(view.days[0].entries[0]).toMatchObject({
      kind: "breakfast",
      start: "10:00",
    });
    expect(
      kinds(withBreakfast("suggest", { dayShift: 61 }).days[0].entries),
    ).not.toContain("breakfast");
  });

  it("gives a quiet row and no slot when it comes with the stay, but not on the first day", () => {
    const view = withBreakfast("included");
    expect(kinds(view.days[0].entries)).not.toContain("breakfast-at-stay");
    expect(view.days[1].entries[0]).toEqual({
      type: "breakfast-at-stay",
      start: "09:00",
      minutes: 45,
    });
    for (const day of view.days) {
      expect(kinds(day.entries)).not.toContain("breakfast");
    }
  });

  it("gives the included row its 45 minutes, so the first stop starts after it, and a booking over it suppresses it", () => {
    const view = withBreakfast("included", {}, "packed");
    const [row, morning] = view.days[1].entries;
    expect(row).toMatchObject({ type: "breakfast-at-stay", start: "09:00" });
    expect(morning).toMatchObject({ kind: "morning", start: "09:45" });
    const booked = commitment({
      id: "b",
      title: "Tour",
      date: "2027-05-11",
      startTime: "08:30",
      endTime: "09:30",
    });
    const day = withBreakfast("included", {
      commitments: [booked],
      dayShift: -30,
    }).days[1];
    expect(kinds(day.entries)).not.toContain("breakfast-at-stay");
  });

  it("gives neither when there is none or it is not said", () => {
    for (const breakfast of ["none", undefined] as const) {
      const view = withBreakfast(breakfast);
      for (const day of view.days) {
        expect(kinds(day.entries)).not.toContain("breakfast");
        expect(kinds(day.entries)).not.toContain("breakfast-at-stay");
      }
    }
  });

  it("leaves a morning booking where it is and never gives breakfast to a must-see", () => {
    const booked = commitment({
      id: "b",
      title: "Tour",
      date: "2027-05-11",
      startTime: "09:00",
      endTime: "10:00",
    });
    const view = withBreakfast("suggest", { commitments: [booked] });
    expect(
      view.days[1].entries.find((entry) => entry.type === "commitment"),
    ).toMatchObject({ start: "09:00" });
    const seen = commitment({
      id: "m",
      kind: "MUST_SEE",
      title: "Castle",
      date: "2027-05-11",
    });
    const day = withBreakfast("suggest", { commitments: [seen] }).days[1];
    expect(
      day.entries.find(
        (entry) => entry.type === "commitment" && entry.slotId !== null,
      ),
    ).toMatchObject({ slotId: "d2-morning" });
  });

  it("suits a breakfast slot with a cafe or a bakery only", () => {
    expect(kindSuitsSlot("cafe", "breakfast")).toBe(true);
    expect(kindSuitsSlot("bakery", "breakfast")).toBe(true);
    expect(kindSuitsSlot("restaurant", "breakfast")).toBe(false);
    expect(kindSuitsSlot("museum", "breakfast")).toBe(false);
    expect(kindSuitsSlot("bakery", "lunch")).toBe(false);
    expect(kindSuitsSlot("bakery", "dinner")).toBe(false);
    expect(kindSuitsSlot("bakery", "morning")).toBe(false);
    expect(kindSuitsSlot("cafe", "lunch")).toBe(true);
    expect(kindSuitsSlot("restaurant", "lunch")).toBe(true);
  });
});

describe("the time allowed at an airport or station", () => {
  const ticket = (over: Partial<CommitmentDto>): CommitmentDto =>
    commitment({
      id: "t",
      kind: "TRANSPORT",
      title: "Ticket",
      transport: {
        mode: "FLIGHT",
        origin: "London",
        destination: "Tokyo",
        originZone: "Europe/London",
        destinationZone: "Asia/Tokyo",
      },
      ...over,
    });
  const train = (over: Partial<CommitmentDto> = {}) =>
    ticket({
      date: "2027-05-12",
      startTime: "10:30",
      endDate: "2027-05-12",
      endTime: "12:45",
      transport: {
        mode: "TRAIN",
        origin: "Tokyo",
        destination: "Kyoto",
        originZone: "Asia/Tokyo",
        destinationZone: "Asia/Tokyo",
      },
      ...over,
    });
  const acrossCities = {
    cities: [
      { city: tokyo, nights: 2 },
      { city: kyoto, nights: 1 },
    ],
    startDate: "2027-05-10",
    endDate: null,
    lengthNights: null,
    timeOfYear: null,
  };

  it("shows 60 minutes after a landing on day 1, and starts the day after them", () => {
    const view = buildPlanView(
      state(),
      context({
        commitments: [
          ticket({
            date: "2027-05-09",
            startTime: "11:30",
            endDate: "2027-05-10",
            endTime: "14:35",
          }),
        ],
      }),
    );
    expect(view.days[0].entries).toMatchObject([
      { type: "commitment", start: "14:35" },
      {
        type: "allowance",
        way: "from",
        mode: "FLIGHT",
        start: "14:35",
        minutes: 60,
      },
      { type: "open", kind: "afternoon-2", start: "16:00" },
      { type: "open", kind: "dinner" },
    ]);
  });

  it("shows 120 minutes before a last-day flight, before the ticket, and ends the day there", () => {
    const view = buildPlanView(
      state(),
      context({
        commitments: [
          ticket({
            date: "2027-05-12",
            startTime: "18:00",
            endDate: "2027-05-12",
            endTime: "21:00",
          }),
        ],
      }),
    );
    expect(view.days[2].entries.slice(-2)).toMatchObject([
      {
        type: "allowance",
        way: "to",
        mode: "FLIGHT",
        start: "16:00",
        minutes: 120,
      },
      { type: "commitment", start: "18:00" },
    ]);
  });

  it("still shows a last-day flight in the early morning, with nothing else that day", () => {
    const view = buildPlanView(
      state(),
      context({
        commitments: [
          ticket({
            date: "2027-05-12",
            startTime: "08:00",
            endDate: "2027-05-12",
            endTime: "11:00",
          }),
        ],
      }),
    );
    expect(kinds(view.days[2].entries)).toEqual(["allowance", "commitment"]);
    expect(found(view.days[2].entries, "allowance")[0].start).toBe("06:00");
  });

  it("gives a mid-trip train 30 minutes before and 20 after, and breakfast still follows", () => {
    const view = buildPlanView(
      state(),
      context({
        facts: acrossCities,
        commitments: [train()],
        breakfast: "suggest",
      }),
    );
    const day3 = view.days[2].entries;
    expect(found(day3, "transfer")).toEqual([]);
    expect(found(day3, "allowance")).toEqual([
      {
        type: "allowance",
        way: "to",
        mode: "TRAIN",
        start: "10:00",
        minutes: 30,
      },
      {
        type: "allowance",
        way: "from",
        mode: "TRAIN",
        start: "12:45",
        minutes: 20,
      },
    ]);
    expect(kinds(day3)).toContain("breakfast");
    // Kyoto starts at 13:05: lunch is still there.
    const lunch = day3.find((e) => e.type === "open" && e.kind === "lunch");
    expect(lunch).toMatchObject({ cityKey: "kyoto|japan", start: "13:05" });
  });

  it("uses the flight values for a mid-trip flight, and keeps 60 and 30 for an assumed transfer", () => {
    const flight = buildPlanView(
      state(),
      context({
        facts: acrossCities,
        commitments: [
          train({
            transport: {
              mode: "FLIGHT",
              origin: "Tokyo",
              destination: "Kyoto",
              originZone: "Asia/Tokyo",
              destinationZone: "Asia/Tokyo",
            },
          }),
        ],
      }),
    );
    expect(
      found(flight.days[2].entries, "allowance").map((a) => a.minutes),
    ).toEqual([120, 60]);
    const assumed = buildPlanView(state(), context({ facts: acrossCities }));
    expect(found(assumed.days[2].entries, "allowance")).toEqual([]);
  });

  it("shows 60 minutes after a night flight lands today", () => {
    const view = buildPlanView(
      state(),
      context({
        commitments: [
          ticket({
            date: "2027-05-09",
            startTime: "22:00",
            endDate: "2027-05-10",
            endTime: "06:00",
          }),
        ],
      }),
    );
    expect(found(view.days[0].entries, "allowance")).toEqual([
      {
        type: "allowance",
        way: "from",
        mode: "FLIGHT",
        start: "06:00",
        minutes: 60,
      },
    ]);
  });

  it("shows a landing late in the evening as it is, and leaves no slot after it", () => {
    const view = buildPlanView(
      state(),
      context({
        commitments: [
          ticket({
            date: "2027-05-10",
            startTime: "15:00",
            endDate: "2027-05-10",
            endTime: "22:30",
          }),
        ],
      }),
    );
    expect(found(view.days[0].entries, "allowance")[0]).toMatchObject({
      way: "from",
      start: "22:30",
      minutes: 60,
    });
    expect(view.days[0].entries.at(-1)).toMatchObject({ type: "allowance" });
  });

  it("bounds the departure day by a city-changing ticket with no arrival time, with no row after it", () => {
    const view = buildPlanView(
      state(),
      context({
        facts: acrossCities,
        commitments: [train({ endDate: null, endTime: null })],
      }),
    );
    const day3 = view.days[2].entries;
    expect(found(day3, "allowance").map((a) => a.way)).toEqual(["to"]);
    expect(
      day3.filter((e) => "cityKey" in e && e.cityKey === "kyoto|japan"),
    ).toEqual([]);
    expect(view.days[3].city).toBe("Kyoto");
  });

  it("drops a lunch that would start after the lunch window, and keeps one that fits", () => {
    const landing = (endTime: string) =>
      buildPlanView(
        state(),
        context({
          commitments: [
            ticket({
              date: "2027-05-10",
              startTime: "10:00",
              endDate: "2027-05-10",
              endTime,
            }),
          ],
        }),
      ).days[0].entries;
    expect(kinds(landing("13:00"))).not.toContain("lunch");
    expect(kinds(landing("12:00"))).toContain("lunch");
  });

  it("keeps the flight allowance for a ticket with no details, and never calls it a flight", () => {
    const view = buildPlanView(
      state(),
      context({
        commitments: [
          ticket({
            transport: null,
            date: "2027-05-09",
            startTime: "11:30",
            endDate: "2027-05-10",
            endTime: "14:35",
          }),
          ticket({
            id: "out",
            transport: null,
            date: "2027-05-12",
            startTime: "18:00",
            endDate: "2027-05-12",
            endTime: "21:00",
          }),
        ],
      }),
    );
    expect(found(view.days[0].entries, "allowance")).toEqual([
      {
        type: "allowance",
        way: "from",
        mode: null,
        start: "14:35",
        minutes: 60,
      },
    ]);
    expect(found(view.days[2].entries, "allowance")).toEqual([
      {
        type: "allowance",
        way: "to",
        mode: null,
        start: "16:00",
        minutes: 120,
      },
    ]);
  });

  it("shows one row after a landing when the first day is also the day the city changes", () => {
    const view = buildPlanView(
      state(),
      context({
        facts: {
          cities: [
            { city: tokyo, nights: 0 },
            { city: kyoto, nights: 1 },
          ],
          startDate: "2027-05-10",
          endDate: null,
          lengthNights: null,
          timeOfYear: null,
        },
        commitments: [
          ticket({
            date: "2027-05-10",
            startTime: "08:00",
            endDate: "2027-05-10",
            endTime: "11:00",
          }),
        ],
      }),
    );
    expect(
      found(view.days[0].entries, "allowance").filter((a) => a.way === "from"),
    ).toHaveLength(1);
  });

  it("shows a flight in the small hours with the time that is really before it", () => {
    const view = buildPlanView(
      state(),
      context({
        commitments: [
          ticket({
            date: "2027-05-12",
            startTime: "01:30",
            endDate: "2027-05-12",
            endTime: "05:00",
          }),
        ],
      }),
    );
    expect(found(view.days[2].entries, "allowance")).toEqual([
      {
        type: "allowance",
        way: "to",
        mode: "FLIGHT",
        start: "00:00",
        minutes: 90,
      },
    ]);
  });
});

describe("where you stay", () => {
  const toMinutes = (clock: string) =>
    Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
  const toClock = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  const home = { latitude: 35.69, longitude: 139.7 };
  const museum = place("m"); // 35.7188, 139.7765
  const stay = (over: Partial<CommitmentDto> = {}): CommitmentDto =>
    commitment({
      id: "s1",
      kind: "STAY",
      title: "Hotel Aurora",
      date: "2027-05-10",
      endDate: "2027-05-12",
      located: {
        ...home,
        ref: "way/1",
        address: "Hotel Aurora, Tokyo, Japan",
      },
      ...over,
    });
  const toMuseum = (means?: PlanContext["means"]) =>
    travelEstimate(home, { latitude: 35.7188, longitude: 139.7765 }, means);
  const pick = (slot: string) => ({ [slot]: { placeId: "m", minutes: null } });
  const placed = (picks: PlanState["picks"], over: Partial<PlanContext> = {}) =>
    buildPlanView(
      state({ picks }),
      context({ commitments: [stay()], places: { m: museum }, ...over }),
    );
  const placeOf = (entries: PlanEntry[], slot: string) =>
    found(entries, "place").find((entry) => entry.slotId === slot)!;

  it("starts the day's first leg at the stay, timed by the stated means", () => {
    for (const means of ["walk", "drive"] as const) {
      const view = placed(pick("d2-morning"), { means });
      const first = placeOf(view.days[1].entries, "d2-morning");
      const leg = toMuseum(means);
      expect(first.travelIn).toEqual({
        means: leg.means,
        minutes: leg.minutes,
      });
      // The day starts at nine; the leg and the buffer come before the visit.
      expect(first.start).toBe(
        `${String(Math.floor((540 + leg.minutes + 20) / 60)).padStart(2, "0")}:${String((540 + leg.minutes + 20) % 60).padStart(2, "0")}`,
      );
    }
  });

  it("comes from the stay after breakfast that is included, and for a suggested breakfast cafe", () => {
    const included = placed(pick("d2-morning"), { breakfast: "included" });
    expect(
      placeOf(included.days[1].entries, "d2-morning").travelIn,
    ).not.toBeNull();

    const cafe = place("c", {
      kind: "cafe",
      latitude: 35.7,
      longitude: 139.71,
    });
    const suggest = placed(
      { "d2-breakfast": { placeId: "c", minutes: null } },
      { breakfast: "suggest", places: { c: cafe } },
    );
    expect(placeOf(suggest.days[1].entries, "d2-breakfast").travelIn).toEqual(
      expect.objectContaining({ minutes: expect.any(Number) }),
    );
  });

  it("ends the day with a row for the way back, from the last place, after everything else", () => {
    const view = placed(pick("d2-dinner"), {
      places: { m: place("m", { kind: "restaurant", openingHours: null }) },
    });
    const entries = view.days[1].entries;
    const last = entries[entries.length - 1];
    const back = travelEstimate(
      { latitude: 35.7188, longitude: 139.7765 },
      home,
    );
    const visit = placeOf(entries, "d2-dinner");
    expect(last).toEqual({
      type: "return",
      stay: "Hotel Aurora",
      start: toClock(toMinutes(visit.start) + visit.minutes),
      travel: { means: back.means, minutes: back.minutes },
    });
  });

  it("adds no way back while an open slot still follows the last place, so the row is never out of time order", () => {
    const view = placed(pick("d2-morning"));
    const entries = view.days[1].entries;
    expect(kinds(entries)).not.toContain("return");
    expect(kinds(entries).at(-1)).toBe("dinner");
  });

  it("flags the last place when the way back ends after the day", () => {
    const late = placed(
      { "d2-dinner": { placeId: "r", minutes: 145 } },
      {
        places: { r: place("r", { kind: "restaurant", openingHours: null }) },
      },
    );
    const dinner = placeOf(late.days[1].entries, "d2-dinner");
    expect(dinner.flags.map((flag) => flag.rule)).toContain("day");
    expect(dinner.flags.find((flag) => flag.rule === "day")?.message).toMatch(
      /way back to Hotel Aurora/,
    );

    // Without a stay the same dinner has nothing to flag.
    const unknown = buildPlanView(
      state({ picks: { "d2-dinner": { placeId: "r", minutes: 145 } } }),
      context({
        places: { r: place("r", { kind: "restaurant", openingHours: null }) },
      }),
    );
    expect(
      placeOf(unknown.days[1].entries, "d2-dinner").flags.map((f) => f.rule),
    ).not.toContain("day");
  });

  it("does not flag a place before the check-in, and lays the check-in after the place, its leg and the time it takes", () => {
    const view = placed(
      { "d1-afternoon": { placeId: "m", minutes: 30 } },
      { commitments: [stay({ startTime: "15:00" })] },
    );
    const entries = view.days[0].entries;
    const visit = placeOf(entries, "d1-afternoon");
    const checkIn = entries.find(
      (entry) => entry.type === "commitment",
    ) as Extract<PlanEntry, { type: "commitment" }>;
    const back = travelEstimate(
      { latitude: 35.7188, longitude: 139.7765 },
      home,
    );
    expect(visit.flags).toEqual([]);
    expect(entries.indexOf(checkIn)).toBeGreaterThan(entries.indexOf(visit));
    expect(checkIn).toMatchObject({
      title: "Check in at Hotel Aurora",
      travelIn: { means: back.means, minutes: back.minutes },
    });
    // It cannot start before the visit ends and the leg and buffer are travelled.
    expect(toMinutes(checkIn.start!)).toBeGreaterThanOrEqual(
      Math.max(900, toMinutes(visit.start) + visit.minutes + back.minutes + 20),
    );
  });

  it("says a missing stay once on the first day of a run, and again for another city", () => {
    const none = buildPlanView(
      state({
        picks: {
          "d1-morning": { placeId: "m", minutes: null },
          "d2-morning": { placeId: "m2", minutes: null },
          "d3-morning": { placeId: "m3", minutes: null },
        },
      }),
      context({
        places: { m: museum, m2: place("m2"), m3: place("m3") },
      }),
    );
    expect(none.days.map((day) => day.stayNote)).toEqual([
      "Travel from where you stay is not counted.",
      null,
      null,
    ]);

    const two = buildPlanView(
      state({
        picks: {
          "d1-morning": { placeId: "m", minutes: null },
          "d2-morning": { placeId: "m2", minutes: null },
          "d4-morning": { placeId: "k", minutes: null },
        },
      }),
      context({
        facts: {
          cities: [
            { city: tokyo, nights: 2 },
            { city: kyoto, nights: 1 },
          ],
          startDate: "2027-05-10",
          endDate: null,
          lengthNights: null,
          timeOfYear: null,
        },
        places: {
          m: museum,
          m2: place("m2"),
          k: place("k", {
            cityKey: "kyoto|japan",
            latitude: 35.0116,
            longitude: 135.7681,
          }),
        },
      }),
    );
    expect(two.days.map((day) => day.stayNote)).toEqual([
      "Travel from where you stay is not counted.",
      null,
      null,
      "Travel from where you stay is not counted.",
    ]);
  });

  it("keeps the stay's own title when it has no check-in time or no position", () => {
    const noTime = placed(pick("d1-morning"));
    expect(
      noTime.days[0].entries.find((entry) => entry.type === "commitment"),
    ).toMatchObject({ title: "Hotel Aurora" });
    const unknownSpot = placed(pick("d1-morning"), {
      commitments: [stay({ startTime: "15:00", located: null })],
    });
    const row = unknownSpot.days[0].entries.find(
      (entry) => entry.type === "commitment",
    );
    expect(row).toMatchObject({ title: "Hotel Aurora" });
    expect(row).not.toHaveProperty("travelIn");
  });

  it("has no legs and a quiet note without a confirmed stay", () => {
    const unconfirmed = placed(pick("d2-morning"), {
      commitments: [stay({ located: null })],
    });
    const day = unconfirmed.days[1];
    expect(placeOf(day.entries, "d2-morning").travelIn).toBeNull();
    expect(kinds(day.entries)).not.toContain("return");
    expect(day.stayNote).toBe(
      "Travel from where you stay is not counted. Add its address.",
    );

    const none = placed(pick("d2-morning"), { commitments: [] });
    expect(none.days[1].stayNote).toBe(
      "Travel from where you stay is not counted.",
    );
  });

  it("adds no note on a day with no chosen place, or with a confirmed stay", () => {
    const empty = buildPlanView(state(), context({ commitments: [stay()] }));
    expect(empty.days.every((day) => day.stayNote === null)).toBe(true);
    expect(empty.days.flatMap((day) => kinds(day.entries))).not.toContain(
      "return",
    );
    expect(placed(pick("d2-morning")).days[1].stayNote).toBeNull();
  });

  it("covers only the check-in night when the stay has no end date", () => {
    const view = placed(
      { ...pick("d2-morning"), ...pick("d3-morning") },
      { commitments: [stay({ endDate: null })] },
    );
    expect(placeOf(view.days[1].entries, "d2-morning").travelIn).not.toBeNull();
    expect(placeOf(view.days[2].entries, "d3-morning").travelIn).toBeNull();
    expect(view.days[2].stayNote).toBe(
      "Travel from where you stay is not counted.",
    );
  });

  it("uses the stay of the night before in the morning and of the night itself in the evening, where the city changes", () => {
    const kyotoStay = stay({
      id: "s2",
      title: "Kyoto Inn",
      date: "2027-05-12",
      endDate: "2027-05-13",
      located: {
        latitude: 35.0116,
        longitude: 135.7681,
        ref: "way/2",
        address: "Kyoto Inn, Kyoto, Japan",
      },
    });
    const view = placed(pick("d3-morning"), {
      facts: {
        cities: [
          { city: tokyo, nights: 2 },
          { city: kyoto, nights: 1 },
        ],
        startDate: "2027-05-10",
        endDate: null,
        lengthNights: null,
        timeOfYear: null,
      },
      commitments: [stay({ endDate: "2027-05-12" }), kyotoStay],
    });
    const day3 = view.days[2].entries;
    // The first leg is from the Tokyo stay; the transfer follows, so no way back.
    expect(placeOf(day3, "d3-morning").travelIn).not.toBeNull();
    expect(kinds(day3)).not.toContain("return");
    expect(view.days[2].stayNote).toBeNull();
  });
});

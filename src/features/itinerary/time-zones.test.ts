import { describe, expect, it } from "vitest";

import type { PlaceDto } from "@/features/places/contracts";
import type { CommitmentDto } from "@/features/trips/contracts";
import { inZone, SERVER_ZONES } from "@/lib/in-zone";

import { emptyPlanState, type PlanEntry, type PlanState } from "./contracts";
import { buildPlanView, provisionalStart, type PlanContext } from "./day-plan";

// TB-ITN-16: all times are stored and shown in the local time of the place,
// and are correct across time zones and clock changes. A plan holds calendar
// dates and wall-clock times of the place, so these tests move the server's
// clock, cross a clock change, and cross from one zone into another.

const city = (
  name: string,
  latitude: number,
  longitude: number,
  timeZone: string | null,
) => ({ name, region: null, country: name, latitude, longitude, timeZone });
const tokyo = city("Tokyo", 35.6769, 139.7639, "Asia/Tokyo");
const honolulu = city("Honolulu", 21.3069, -157.8583, "Pacific/Honolulu");
const london = city("London", 51.5074, -0.1278, "Europe/London");
const newYork = city("New York", 40.7128, -74.006, "America/New_York");

const place = (
  id: string,
  at: typeof tokyo,
  openingHours: string | null,
): PlaceDto => ({
  id,
  origin: "SAMPLE",
  name: id,
  kind: "museum",
  cityKey: `${at.name.toLowerCase()}|${at.country.toLowerCase()}`,
  latitude: at.latitude,
  longitude: at.longitude,
  address: null,
  openingHours,
  notable: true,
  serves: [],
  servesNot: [],
  originRef: null,
  tags: {},
  lastEditedAt: null,
  fetchedAt: null,
  hoursDoubt: null,
});
const commitment = (over: Partial<CommitmentDto>): CommitmentDto => ({
  id: over.title ?? "c",
  kind: "RESERVATION",
  title: "Booked",
  date: null,
  startTime: null,
  endDate: null,
  endTime: null,
  reference: null,
  note: null,
  transport: null,
  ...over,
});
const trip = (
  cities: { city: typeof tokyo; nights: number | null }[],
  startDate: string,
  endDate: string,
  over: Partial<PlanContext> = {},
): PlanContext => ({
  facts: { cities, startDate, endDate, lengthNights: null, timeOfYear: null },
  commitments: [],
  places: {},
  ...over,
});
const state = (over: Partial<PlanState> = {}): PlanState => ({
  ...emptyPlanState,
  ...over,
});
const pick = (placeId: string) => ({ placeId, minutes: null });
const slots = (entries: PlanEntry[]) =>
  entries.flatMap((entry) =>
    entry.type === "open" || entry.type === "place"
      ? [`${entry.kind} ${entry.start}`]
      : [],
  );
const flags = (entries: PlanEntry[]) =>
  entries.flatMap((entry) =>
    entry.type === "place" ? entry.flags.map((flag) => flag.rule) : [],
  );

describe("a plan, wherever the server's clock is", () => {
  it("is tested by a runner that can move its clock", () => {
    expect(
      inZone("Pacific/Kiritimati", () =>
        new Date(2027, 0, 1).getTimezoneOffset(),
      ),
    ).toBe(-840);
    expect(
      inZone("America/Los_Angeles", () =>
        new Date(2027, 0, 1).getTimezoneOffset(),
      ),
    ).toBe(480);
  });

  it("has the same days, dates, times and flags for a trip in Tokyo and one in Honolulu", () => {
    for (const where of [tokyo, honolulu]) {
      const build = () =>
        buildPlanView(
          state({
            pace: "packed",
            // Monday 10 May 2027: closed on Mondays, so the pick is flagged.
            picks: {
              "d1-afternoon": pick("museum"),
              "d2-morning": pick("museum-2"),
            },
          }),
          trip([{ city: where, nights: null }], "2027-05-10", "2027-05-13", {
            places: {
              museum: place("museum", where, "Tu-Su 09:00-17:00; Mo off"),
              "museum-2": place("museum-2", where, "Tu-Su 09:00-17:00; Mo off"),
            },
            commitments: [
              commitment({
                title: "Flight in",
                kind: "TRANSPORT",
                date: "2027-05-10",
                startTime: "07:10",
                endTime: "08:25",
              }),
              commitment({
                title: "Dinner",
                date: "2027-05-11",
                startTime: "19:00",
                endTime: "21:00",
              }),
              commitment({
                title: "Flight out",
                kind: "TRANSPORT",
                date: "2027-05-13",
                startTime: "23:30",
                endDate: "2027-05-14",
                endTime: "06:00",
              }),
            ],
          }),
        );
      const usual = inZone("UTC", build);
      expect(usual.days.map((day) => day.date)).toEqual([
        "2027-05-10",
        "2027-05-11",
        "2027-05-12",
        "2027-05-13",
      ]);
      expect(flags(usual.days[0].entries)).toContain("closed");
      expect(flags(usual.days[1].entries)).not.toContain("closed");
      for (const zone of SERVER_ZONES) {
        expect(inZone(zone, build), `${where.name}, server in ${zone}`).toEqual(
          usual,
        );
      }
    }
  });

  it("assumes the same first day for a trip that has only a length and a month", () => {
    const facts = { startDate: null, lengthNights: 3, timeOfYear: 5 };
    for (const zone of SERVER_ZONES) {
      inZone(zone, () => {
        // The second Monday of May 2027.
        expect(provisionalStart(facts, "2027-01-15"), zone).toBe("2027-05-10");
        expect(provisionalStart(facts, "2027-05-10"), zone).toBe("2028-05-08");
      });
    }
  });
});

describe("a trip across a clock change", () => {
  it("has one day for each date, and every day has the same hours", () => {
    // London goes forward on Sunday 28 March 2027; New York goes back on Sunday 7 November 2027.
    for (const [where, first, last, dates] of [
      [
        london,
        "2027-03-26",
        "2027-03-30",
        ["2027-03-26", "2027-03-27", "2027-03-28", "2027-03-29", "2027-03-30"],
      ],
      [
        newYork,
        "2027-11-05",
        "2027-11-09",
        ["2027-11-05", "2027-11-06", "2027-11-07", "2027-11-08", "2027-11-09"],
      ],
    ] as const) {
      // The server's own clock changes on the same night, or on another, or never.
      for (const zone of ["Europe/London", "America/New_York", "UTC"]) {
        const view = inZone(zone, () =>
          buildPlanView(
            state(),
            trip([{ city: where, nights: null }], first, last),
          ),
        );
        expect(
          view.days.map((day) => day.date),
          `${where.name}, server in ${zone}`,
        ).toEqual(dates);
        expect(
          new Set(view.days.map((day) => slots(day.entries).join())).size,
        ).toBe(1);
        expect(slots(view.days[2].entries)).toEqual([
          "morning 09:30",
          "lunch 12:30",
          "afternoon 14:45",
          "afternoon-2 16:00",
          "dinner 19:00",
        ]);
      }
    }
  });

  it("still knows which day of the week it is", () => {
    const view = inZone("Europe/London", () =>
      buildPlanView(
        state({
          picks: { "d3-morning": pick("shop"), "d4-morning": pick("shop-2") },
        }),
        trip([{ city: london, nights: null }], "2027-03-26", "2027-03-30", {
          places: {
            shop: place("shop", london, "Mo-Sa 09:00-18:00; Su off"),
            "shop-2": place("shop-2", london, "Mo-Sa 09:00-18:00; Su off"),
          },
        }),
      ),
    );
    // Sunday 28 March, the day the clocks change, and the Monday after.
    expect(flags(view.days[2].entries)).toEqual(["closed"]);
    expect(flags(view.days[3].entries)).toEqual([]);
  });
});

describe("travel between two cities whose clocks differ", () => {
  // Two towns an hour and a half apart, on either side of a border.
  const west = city("Vila Real", 37.19, -7.42, "Europe/Lisbon");
  const east = city("Huelva", 37.26, -6.95, "Europe/Madrid");
  const day2 = (from: typeof west, to: typeof west) =>
    buildPlanView(
      state(),
      trip(
        [
          { city: from, nights: 1 },
          { city: to, nights: 1 },
        ],
        "2027-05-10",
        "2027-05-12",
      ),
    ).days[1].entries;
  const transfer = (entries: PlanEntry[]) =>
    entries.find((entry) => entry.type === "transfer") as Extract<
      PlanEntry,
      { type: "transfer" }
    >;
  const after = (entries: PlanEntry[]) =>
    slots(
      entries.slice(
        entries.findIndex((entry) => entry.type === "transfer") + 1,
      ),
    );

  it("arrives by the clock of the city it arrives in", () => {
    // Leaves at 12:00 and takes an hour and a half. Spain is an hour ahead.
    const eastward = day2(west, east);
    expect(transfer(eastward)).toMatchObject({
      start: "12:00",
      minutes: 90,
      arriveLocal: "14:30",
    });
    expect(after(eastward)[0]).toBe("afternoon 15:00");
    // The other way the clock goes back an hour.
    const westward = day2(east, west);
    expect(transfer(westward)).toMatchObject({
      start: "12:00",
      minutes: 90,
      arriveLocal: "12:30",
    });
    // Arriving at 12:30 there, half an hour later lunch is still to be had.
    expect(after(westward)[0]).toBe("lunch 13:00");
  });

  it("is laid out as before when the clocks agree, or one of them is not known", () => {
    for (const to of [
      { ...east, timeZone: "Europe/Lisbon" },
      { ...east, timeZone: null },
    ]) {
      const entries = day2(west, to);
      expect(transfer(entries)).toMatchObject({
        start: "12:00",
        minutes: 90,
        arriveLocal: null,
      });
      expect(after(entries)[0]).toBe("lunch 14:00");
    }
  });

  it("never arrives before it leaves, even across the date line", () => {
    const entries = day2(
      { ...west, timeZone: "Asia/Tokyo" },
      { ...east, timeZone: "Pacific/Honolulu" },
    );
    expect(transfer(entries)).toMatchObject({
      start: "12:00",
      minutes: 90,
      arriveLocal: null,
    });
    expect(after(entries)[0]).toBe("lunch 12:30");
  });
});

describe("a ticket that lands the day after it leaves", () => {
  it("keeps the landing day free until an hour after it has landed", () => {
    // London on Monday, a night flight on Tuesday, Tokyo from Wednesday afternoon.
    const view = buildPlanView(
      state(),
      trip(
        [
          { city: london, nights: 1 },
          { city: tokyo, nights: 2 },
        ],
        "2027-05-10",
        "2027-05-13",
        {
          commitments: [
            commitment({
              title: "Flight",
              kind: "TRANSPORT",
              date: "2027-05-11",
              startTime: "19:00",
              endDate: "2027-05-12",
              endTime: "15:00",
            }),
          ],
        },
      ),
    );
    // Tuesday: London until an hour before the flight, then nothing.
    expect(slots(view.days[1].entries)).toEqual([
      "morning 09:30",
      "lunch 12:30",
      "afternoon 14:45",
      "afternoon-2 16:00",
    ]);
    // Wednesday: nothing in Tokyo before 16:00, an hour after landing at 15:00.
    expect(slots(view.days[2].entries)).toEqual([
      "afternoon-2 16:00",
      "dinner 19:00",
    ]);
    // Thursday is a whole day.
    expect(slots(view.days[3].entries)).toHaveLength(5);
  });
});

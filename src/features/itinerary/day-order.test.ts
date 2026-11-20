import { describe, expect, it } from "vitest";

import {
  cityKeyOf,
  type City,
  type PlaceDto,
} from "@/features/places/contracts";
import type { CommitmentDto } from "@/features/trips/contracts";

import {
  emptyPlanState,
  type Pace,
  type PlanEntry,
  type PlanState,
  type PlanView,
} from "./contracts";
import { buildPlanView, type PlanContext } from "./day-plan";

// A day is read top to bottom: whatever the trip, its rows never go back in
// time. Across the date line the clock of the city of arrival can read
// earlier than the one left behind, so there each part of the day is in order.

const city = (
  name: string,
  country: string,
  latitude: number,
  longitude: number,
  timeZone: string,
): City => ({ name, region: null, country, latitude, longitude, timeZone });
const lisbon = city("Lisbon", "Portugal", 38.7223, -9.1393, "Europe/Lisbon");
const porto = city("Porto", "Portugal", 41.1579, -8.6291, "Europe/Lisbon");
const tokyo = city("Tokyo", "Japan", 35.6769, 139.7639, "Asia/Tokyo");
const honolulu = city(
  "Honolulu",
  "United States",
  21.3069,
  -157.8583,
  "Pacific/Honolulu",
);
const london = city("London", "United Kingdom", 51.5, -0.12, "Europe/London");

const kindsOfPlace = [
  ["museum", 0.01, 0.01],
  ["restaurant", 0.004, -0.003],
  ["cafe", -0.002, 0.003],
] as const;
const places: Record<string, PlaceDto> = Object.fromEntries(
  [lisbon, porto, tokyo, honolulu].flatMap((at) =>
    kindsOfPlace.map(([kind, dLat, dLon]) => {
      const id = `${at.name}-${kind}`;
      const place: PlaceDto = {
        id,
        origin: "SAMPLE",
        name: id,
        kind,
        cityKey: cityKeyOf(at),
        latitude: at.latitude! + dLat,
        longitude: at.longitude! + dLon,
        address: null,
        openingHours: "Mo-Su 07:00-23:00",
        notable: false,
        serves: [],
        servesNot: [],
        originRef: null,
        tags: {},
        lastEditedAt: null,
        fetchedAt: null,
        hoursDoubt: null,
      };
      return [id, place];
    }),
  ),
);

const base: CommitmentDto = {
  id: "",
  kind: "OTHER",
  title: "",
  date: null,
  startTime: null,
  endDate: null,
  endTime: null,
  reference: null,
  note: null,
  located: null,
  transport: null,
};
const ticket = (
  mode: "FLIGHT" | "TRAIN",
  from: City,
  to: City,
  [date, startTime]: [string, string],
  [endDate, endTime]: [string, string],
): CommitmentDto => ({
  ...base,
  id: `${mode}-${from.name}-${to.name}-${date}`,
  kind: "TRANSPORT",
  title: `${mode} to ${to.name}`,
  date,
  startTime,
  endDate,
  endTime,
  transport: {
    mode,
    origin: from.name,
    destination: to.name,
    originZone: from.timeZone,
    destinationZone: to.timeZone,
  },
});
type Stays = "confirmed" | "unconfirmed" | "none";
const stay = (
  at: City,
  [date, endDate]: [string, string],
  startTime: string | null,
  stays: Stays,
): CommitmentDto[] =>
  stays === "none"
    ? []
    : [
        {
          ...base,
          id: `stay-${at.name}`,
          kind: "STAY",
          title: `Hotel ${at.name}`,
          date,
          endDate,
          startTime,
          located:
            stays === "confirmed"
              ? {
                  latitude: at.latitude! + 0.003,
                  longitude: at.longitude! - 0.002,
                  ref: `way/${at.name}`,
                  address: `Hotel ${at.name}`,
                }
              : null,
        },
      ];

type Scenario = {
  name: string;
  cities: [City, number][];
  commitments: (stays: Stays) => CommitmentDto[];
  /** Split each day after its tickets, for a day across the date line. */
  perSegment?: boolean;
};
const scenarios: Scenario[] = [
  {
    name: "a landing after the check-in time, and a flight home",
    cities: [[lisbon, 3]],
    commitments: (stays) => [
      ticket(
        "FLIGHT",
        london,
        lisbon,
        ["2027-05-10", "13:00"],
        ["2027-05-10", "16:00"],
      ),
      ticket(
        "FLIGHT",
        lisbon,
        london,
        ["2027-05-13", "18:00"],
        ["2027-05-13", "20:30"],
      ),
      ...stay(lisbon, ["2027-05-10", "2027-05-13"], "15:00", stays),
    ],
  },
  {
    name: "a night flight that lands at six",
    cities: [[lisbon, 2]],
    commitments: (stays) => [
      ticket(
        "FLIGHT",
        london,
        lisbon,
        ["2027-05-09", "22:00"],
        ["2027-05-10", "06:00"],
      ),
      ...stay(lisbon, ["2027-05-10", "2027-05-12"], "14:00", stays),
    ],
  },
  {
    name: "a train to another city, with a check-in before it leaves",
    cities: [
      [lisbon, 2],
      [porto, 1],
    ],
    commitments: (stays) => [
      ticket(
        "TRAIN",
        lisbon,
        porto,
        ["2027-05-12", "16:00"],
        ["2027-05-12", "19:00"],
      ),
      ...stay(lisbon, ["2027-05-10", "2027-05-12"], "15:00", stays),
      ...stay(porto, ["2027-05-12", "2027-05-13"], "15:00", stays),
    ],
  },
  {
    name: "another city with no ticket",
    cities: [
      [lisbon, 2],
      [porto, 1],
    ],
    commitments: (stays) => [
      ...stay(lisbon, ["2027-05-10", "2027-05-12"], "15:00", stays),
      ...stay(porto, ["2027-05-12", "2027-05-13"], "13:00", stays),
    ],
  },
  {
    name: "a night train",
    cities: [
      [lisbon, 0],
      [porto, 2],
    ],
    commitments: (stays) => [
      ticket(
        "TRAIN",
        lisbon,
        porto,
        ["2027-05-10", "22:00"],
        ["2027-05-11", "06:00"],
      ),
      ...stay(porto, ["2027-05-11", "2027-05-12"], "15:00", stays),
    ],
  },
  {
    name: "a booking before breakfast",
    cities: [[lisbon, 2]],
    commitments: (stays) => [
      {
        ...base,
        id: "tour",
        kind: "RESERVATION",
        title: "Sunrise tour",
        date: "2027-05-11",
        startTime: "07:00",
        endTime: "08:00",
      },
      ...stay(lisbon, ["2027-05-10", "2027-05-12"], "15:00", stays),
    ],
  },
  {
    name: "a night flight in, and a train to another city the same day",
    cities: [
      [lisbon, 2],
      [porto, 1],
    ],
    commitments: (stays) => [
      ticket(
        "FLIGHT",
        london,
        lisbon,
        ["2027-05-11", "22:00"],
        ["2027-05-12", "05:00"],
      ),
      ticket(
        "TRAIN",
        lisbon,
        porto,
        ["2027-05-12", "12:00"],
        ["2027-05-12", "15:00"],
      ),
      ...stay(lisbon, ["2027-05-10", "2027-05-12"], "15:00", stays),
      ...stay(porto, ["2027-05-12", "2027-05-13"], "15:00", stays),
    ],
  },
  {
    name: "a booking soon after the check-in time",
    cities: [[lisbon, 2]],
    commitments: (stays) => [
      {
        ...base,
        id: "tasting",
        kind: "RESERVATION",
        title: "Wine tasting",
        date: "2027-05-10",
        startTime: "15:15",
        endTime: "16:00",
      },
      ...stay(lisbon, ["2027-05-10", "2027-05-12"], "15:00", stays),
    ],
  },
  {
    name: "a flight in the small hours on the day the city changes",
    cities: [
      [lisbon, 2],
      [porto, 1],
    ],
    commitments: (stays) => [
      ticket(
        "FLIGHT",
        lisbon,
        porto,
        ["2027-05-12", "01:00"],
        ["2027-05-12", "02:00"],
      ),
      ...stay(porto, ["2027-05-12", "2027-05-13"], "15:00", stays),
    ],
  },
  {
    name: "a flight across the date line",
    cities: [
      [tokyo, 1],
      [honolulu, 2],
    ],
    perSegment: true,
    commitments: (stays) => [
      ticket(
        "FLIGHT",
        tokyo,
        honolulu,
        ["2027-05-11", "18:00"],
        ["2027-05-11", "06:30"],
      ),
      ...stay(tokyo, ["2027-05-10", "2027-05-11"], "15:00", stays),
      ...stay(honolulu, ["2027-05-11", "2027-05-13"], "15:00", stays),
    ],
  },
  {
    name: "a first day that starts with a flight across the date line",
    cities: [[honolulu, 2]],
    perSegment: true,
    commitments: (stays) => [
      ticket(
        "FLIGHT",
        tokyo,
        honolulu,
        ["2027-05-10", "18:00"],
        ["2027-05-10", "06:30"],
      ),
      ...stay(honolulu, ["2027-05-10", "2027-05-12"], "15:00", stays),
    ],
  },
];

const broken = (view: PlanView) =>
  view.days
    .flatMap((day) => day.entries)
    .flatMap((entry) => (entry.type === "place" ? entry.flags : []))
    .filter((flag) => flag.rule !== "hours-unknown").length;

/**
 * The plan with each open slot, in turn, given a place of its city, as long
 * as the pick breaks no new rule: only such a card is offered. Legs, check-in
 * legs and the way back then show.
 */
function planned(context: PlanContext, pace: Pace, picking: boolean) {
  let state: PlanState = { ...emptyPlanState, pace };
  let view = buildPlanView(state, context);
  const tried = new Set<string>();
  for (;;) {
    const open = view.days
      .flatMap((day) => day.entries)
      .find((e) => e.type === "open" && !tried.has(e.slotId));
    if (!picking || open?.type !== "open") return view;
    tried.add(open.slotId);
    const kind =
      open.kind === "breakfast"
        ? "cafe"
        : open.kind === "lunch" || open.kind === "dinner"
          ? "restaurant"
          : "museum";
    const place = Object.values(places).find(
      (p) => p.cityKey === open.cityKey && p.kind === kind,
    );
    if (!place) continue;
    const next = {
      ...state,
      picks: {
        ...state.picks,
        [open.slotId]: { placeId: place.id, minutes: null },
      },
    };
    const after = buildPlanView(next, context);
    if (broken(after) <= broken(view)) {
      state = next;
      view = after;
    }
  }
}

/** The clock times of a day's rows, part by part. */
function parts(entries: PlanEntry[], perSegment: boolean): string[][] {
  const out: string[][] = [[]];
  for (const entry of entries) {
    if (entry.start !== null) out.at(-1)!.push(entry.start);
    if (perSegment && entry.type === "commitment" && entry.ticket) {
      out.push([]);
    }
  }
  return out;
}

describe("every day of a plan", () => {
  it("lists its rows in time order", () => {
    let days = 0;
    for (const scenario of scenarios) {
      for (const stays of ["confirmed", "unconfirmed", "none"] as const) {
        for (const breakfast of [undefined, "included", "suggest"] as const) {
          for (const [pace, picking] of [
            ["relaxed", false],
            ["balanced", false],
            ["packed", false],
            ["relaxed", true],
            ["balanced", true],
            ["packed", true],
          ] as const) {
            const view = planned(
              {
                facts: {
                  cities: scenario.cities.map(([at, nights]) => ({
                    city: at,
                    nights,
                  })),
                  startDate: "2027-05-10",
                  endDate: null,
                  lengthNights: null,
                  timeOfYear: null,
                },
                commitments: scenario.commitments(stays),
                places,
                breakfast,
              },
              pace,
              picking,
            );
            for (const day of view.days) {
              days += 1;
              for (const times of parts(
                day.entries,
                scenario.perSegment ?? false,
              )) {
                expect(
                  times,
                  `${scenario.name}, stays ${stays}, breakfast ${breakfast}, ${pace}${picking ? " with picks" : ""}, day ${day.day}`,
                ).toEqual([...times].sort());
              }
            }
          }
        }
      }
    }
    expect(days).toBeGreaterThan(1000);
  });
});

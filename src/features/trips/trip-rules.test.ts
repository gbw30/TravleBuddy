import { describe, expect, it } from "vitest";

import { findClashes } from "./clashes";
import {
  commitmentInputSchema,
  ticketInputSchema,
  tripActionSchema,
  tripFactsSchema,
  type TicketInput,
  type TripFacts,
} from "./contracts";
import { factsFromTickets, ticketTitle } from "./tickets";
import { missingFacts, todayIn, tripState } from "./trip-state";

const ticket = (over: Partial<TicketInput>): TicketInput => ({
  mode: "FLIGHT",
  from: "New York (JFK)",
  to: "Tokyo (HND)",
  departDate: "2027-05-09",
  departTime: "11:30",
  arriveDate: "2027-05-10",
  arriveTime: "14:35",
  reference: null,
  ...over,
});

describe("factsFromTickets", () => {
  it("decides nothing without tickets", () => {
    expect(factsFromTickets([])).toEqual({
      startDate: null,
      endDate: null,
      stops: [],
    });
  });

  it("starts the trip when a single ticket arrives and leaves the end open", () => {
    expect(factsFromTickets([ticket({})])).toEqual({
      startDate: "2027-05-10",
      endDate: null,
      stops: [{ place: "Tokyo", nights: null }],
    });
  });

  it("ends the trip when the last ticket leaves for home", () => {
    const facts = factsFromTickets([
      // Given out of order on purpose.
      ticket({
        from: "Kyoto",
        to: "new york",
        departDate: "2027-05-17",
        departTime: "18:00",
        arriveDate: "2027-05-17",
        arriveTime: "17:10",
      }),
      ticket({}),
      ticket({
        mode: "TRAIN",
        from: "Tokyo",
        to: "Kyoto",
        departDate: "2027-05-14",
        departTime: "09:00",
        arriveDate: "2027-05-14",
        arriveTime: "11:15",
      }),
    ]);
    expect(facts).toEqual({
      startDate: "2027-05-10",
      endDate: "2027-05-17",
      stops: [
        { place: "Tokyo", nights: 4 },
        { place: "Kyoto", nights: 3 },
      ],
    });
  });

  it("names a ticket by its kind and places", () => {
    expect(ticketTitle(ticket({}))).toBe(
      "Flight · New York (JFK) → Tokyo (HND)",
    );
  });
});

describe("ticketInputSchema", () => {
  it("accepts a flight west that lands a calendar day before it leaves", () => {
    const parsed = ticketInputSchema.safeParse(
      ticket({
        from: "Auckland",
        to: "Honolulu",
        departDate: "2027-05-10",
        departTime: "23:00",
        arriveDate: "2027-05-10",
        arriveTime: "09:30",
      }),
    );
    expect(parsed.success).toBe(true);
    expect(
      ticketInputSchema.safeParse(
        ticket({ departDate: "2027-05-10", arriveDate: "2027-05-09" }),
      ).success,
    ).toBe(true);
  });

  it("refuses an arrival days before the departure, and a date that does not exist", () => {
    expect(
      ticketInputSchema.safeParse(
        ticket({ departDate: "2027-05-10", arriveDate: "2027-05-07" }),
      ).success,
    ).toBe(false);
    expect(
      ticketInputSchema.safeParse(ticket({ departDate: "2027-13-40" })).success,
    ).toBe(false);
  });
});

describe("commitmentInputSchema", () => {
  const base = { kind: "RESERVATION", title: " Dinner at Den " };

  it("trims text and turns empty optional text into null", () => {
    expect(commitmentInputSchema.parse({ ...base, reference: "  " })).toEqual({
      kind: "RESERVATION",
      title: "Dinner at Den",
      date: null,
      startTime: null,
      endDate: null,
      endTime: null,
      reference: null,
      note: null,
    });
  });

  it("needs a date for a time, and an end after the start", () => {
    const bad = [
      { ...base, startTime: "19:00" },
      { ...base, date: "2027-05-11", endTime: "21:00" },
      { ...base, date: "2027-05-11", startTime: "19:00", endTime: "18:00" },
      { ...base, date: "2027-05-11", endDate: "2027-05-10" },
      { ...base, title: "   " },
    ];
    for (const input of bad) {
      expect(
        commitmentInputSchema.safeParse(input).success,
        JSON.stringify(input),
      ).toBe(false);
    }
    expect(
      commitmentInputSchema.safeParse({
        ...base,
        date: "2027-05-11",
        startTime: "23:00",
        endDate: "2027-05-12",
        endTime: "01:00",
      }).success,
    ).toBe(true);
  });
});

describe("tripFactsSchema and tripActionSchema", () => {
  it("accepts a partial save and refuses a trip that ends before it starts", () => {
    expect(tripFactsSchema.parse({ adults: 2 })).toEqual({ adults: 2 });
    expect(
      tripFactsSchema.safeParse({
        startDate: "2027-05-12",
        endDate: "2027-05-10",
      }).success,
    ).toBe(false);
  });

  it("refuses a day the month does not have, which parsing alone would roll into the next month", () => {
    for (const startDate of ["2027-02-30", "2027-04-31", "2027-02-29"]) {
      expect(tripFactsSchema.safeParse({ startDate }).success, startDate).toBe(
        false,
      );
    }
    expect(tripFactsSchema.safeParse({ startDate: "2028-02-29" }).success).toBe(
      true,
    );
  });

  it("needs an operation id and the expected revision on every change", () => {
    const operationId = "3f0f0d4c-6f0e-4c58-9d3e-6a3f1f2b7c11";
    expect(
      tripActionSchema.safeParse({
        action: "rename",
        title: "Tokyo",
        operationId,
        expectedRevision: 0,
      }).success,
    ).toBe(true);
    expect(
      tripActionSchema.safeParse({ action: "rename", title: "Tokyo" }).success,
    ).toBe(false);
    expect(
      tripActionSchema.safeParse({
        action: "explode",
        operationId,
        expectedRevision: 0,
      }).success,
    ).toBe(false);
  });
});

describe("tripState", () => {
  it("is planning until the plan is finished, whatever the dates", () => {
    expect(
      tripState({ planFinished: false, endDate: "2020-01-01" }, "2027-05-10"),
    ).toBe("planning");
  });

  it("is upcoming through the last day and past the day after", () => {
    const trip = { planFinished: true, endDate: "2027-05-12" };
    expect(tripState(trip, "2027-05-12")).toBe("upcoming");
    expect(tripState(trip, "2027-05-13")).toBe("past");
    expect(tripState({ planFinished: true, endDate: null }, "2027-05-13")).toBe(
      "upcoming",
    );
  });

  it("takes today in the trip's time zone", () => {
    const now = new Date("2027-05-12T20:00:00Z");
    expect(todayIn("Asia/Tokyo", now)).toBe("2027-05-13");
    expect(todayIn("America/New_York", now)).toBe("2027-05-12");
    expect(todayIn(null, now)).toBe("2027-05-12");
    expect(todayIn("Not/AZone", now)).toBe("2027-05-12");
  });
});

describe("missingFacts", () => {
  const empty: TripFacts = {
    cities: [],
    startDate: null,
    endDate: null,
    lengthNights: null,
    timeOfYear: null,
    datesFirmness: null,
    adults: null,
    children: null,
    budgetAmount: null,
    budgetCurrency: null,
    budgetBasis: null,
    budgetFirmness: null,
    purpose: null,
  };

  it("lists what a plan cannot start without", () => {
    expect(missingFacts(empty)).toEqual(["where", "when", "who", "budget"]);
  });

  it("takes a length with a rough time of year as a when", () => {
    expect(
      missingFacts({ ...empty, lengthNights: 5, timeOfYear: 10, adults: 2 }),
    ).toEqual(["where", "budget"]);
  });
});

describe("findClashes", () => {
  const at = (
    id: string,
    startTime: string | null,
    endTime: string | null = null,
    over: object = {},
  ) => ({
    id,
    kind: "RESERVATION" as const,
    date: "2027-05-11",
    startTime,
    endDate: null,
    endTime,
    ...over,
  });

  it("finds overlapping times and leaves both alone", () => {
    expect(
      findClashes([at("a", "19:00", "21:00"), at("b", "20:30", "22:00")]),
    ).toEqual([{ first: "a", second: "b" }]);
  });

  it("does not count times that only touch, other days, or commitments without a time", () => {
    expect(
      findClashes([
        at("a", "19:00", "21:00"),
        at("b", "21:00", "22:00"),
        at("c", "19:30", "20:00", { date: "2027-05-12" }),
        at("d", null),
      ]),
    ).toEqual([]);
  });

  it("counts two things starting at the same moment, and something inside a longer one", () => {
    expect(findClashes([at("a", "19:00"), at("b", "19:00")])).toHaveLength(1);
    expect(
      findClashes([at("a", "10:00", "16:00"), at("b", "12:00")]),
    ).toHaveLength(1);
  });

  it("never counts a stay", () => {
    expect(
      findClashes([
        at("hotel", "15:00", "11:00", { kind: "STAY", endDate: "2027-05-14" }),
        at("dinner", "19:00", "21:00"),
      ]),
    ).toEqual([]);
  });

  it("follows an overnight ticket into the next day", () => {
    expect(
      findClashes([
        at("train", "22:00", "06:00", { endDate: "2027-05-12" }),
        at("breakfast", "05:30", "06:30", { date: "2027-05-12" }),
      ]),
    ).toHaveLength(1);
  });
});

import { describe, expect, it } from "vitest";

import { tasteInUse } from "@/features/memory";
import type { ProfileEntry } from "@/features/memory/contracts";
import type {
  CommitmentDto,
  TripDetail,
  TripFacts,
} from "@/features/trips/contracts";

import { briefOf } from "./brief";
import { step1Problems } from "./brief-view";

const city = (name: string) => ({
  name,
  region: null,
  country: "Japan",
  latitude: 35.6,
  longitude: 139.7,
  timeZone: "Asia/Tokyo",
});
const noFacts: TripFacts = {
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
const tokyoInMay: TripFacts = {
  ...noFacts,
  cities: [{ city: city("Tokyo"), nights: 4 }],
  startDate: "2027-05-10",
  endDate: "2027-05-14",
  adults: 2,
  children: 0,
};
const trip = (facts: TripFacts, commitments: CommitmentDto[] = []) =>
  ({
    id: "trip-1",
    revision: 7,
    title: "Tokyo in May",
    facts,
    commitments,
    clashes: [],
  }) as unknown as TripDetail;
const decided = (title: string): CommitmentDto => ({
  id: title,
  kind: "RESERVATION",
  title,
  date: null,
  startTime: null,
  endDate: null,
  endTime: null,
  reference: null,
  note: null,
  transport: null,
});
const problems = (facts: TripFacts) =>
  step1Problems(facts).map(({ field, message }) => `${field}: ${message}`);

describe("the checks on the first step of the brief", () => {
  it("find nothing wrong with a city, its dates and who is travelling", () => {
    expect(step1Problems(tokyoInMay)).toEqual([]);
    // A length with a rough time of year is enough of a "when".
    expect(
      step1Problems({
        ...tokyoInMay,
        startDate: null,
        endDate: null,
        lengthNights: 5,
        timeOfYear: 10,
      }),
    ).toEqual([]);
  });

  it("say everything that is missing from an empty brief, in plain words", () => {
    expect(problems(noFacts)).toEqual([
      "cities: Add at least one city.",
      "dates: Give the dates, or a length and a rough time of year.",
      "who: Say how many of you are travelling.",
    ]);
  });

  it("explain an end date before the start date", () => {
    expect(problems({ ...tokyoInMay, endDate: "2027-05-09" })).toEqual([
      "dates: The trip ends before it starts.",
    ]);
  });

  it("ask for the nights in each city when there are several", () => {
    const two = {
      ...tokyoInMay,
      cities: [
        { city: city("Tokyo"), nights: 4 },
        { city: city("Kyoto"), nights: null },
        { city: city("Osaka"), nights: null },
      ],
    };
    expect(problems(two)).toEqual([
      "nights: Say how many nights you spend in Kyoto and Osaka.",
    ]);
  });

  it("ask how long a one-city trip is when only its start is known", () => {
    const open = {
      ...tokyoInMay,
      cities: [{ city: city("Tokyo"), nights: null }],
      endDate: null,
    };
    expect(problems(open)).toEqual([
      "dates: Give the end date, or how many nights.",
    ]);
    expect(step1Problems({ ...open, lengthNights: 4 })).toEqual([]);
    expect(step1Problems({ ...open, cities: tokyoInMay.cities })).toEqual([]);
  });
});

describe("the brief of a trip", () => {
  const fromLisbon: ProfileEntry = {
    topic: "pace",
    value: "relaxed",
    sureness: "think",
    source: { type: "trip", tripId: "t0", tripTitle: "Lisbon, April 2027" },
  };
  const stated = (
    topic: ProfileEntry["topic"],
    value: string,
  ): ProfileEntry => ({
    topic,
    value,
    sureness: "always",
    source: { type: "told" },
  });
  const personal = [
    fromLisbon,
    stated("dietary_rules", "vegetarian"),
    stated("allergies", "shellfish"),
  ];
  const said = {
    interests: { values: ["museums", "views"], source: "told" as const },
  };
  const brief = briefOf(trip(tokyoInMay), tasteInUse(personal, said), personal);
  const answer = (topic: string) =>
    brief.style.find((item) => item.topic === topic)!;

  it("carries the trip's own facts and can be built once step 1 is complete", () => {
    expect(brief).toMatchObject({
      tripId: "trip-1",
      revision: 7,
      canBuild: true,
      problems: [],
    });
    expect(brief.facts).toBe(tokyoInMay);
    expect(briefOf(trip(noFacts), {}, []).canBuild).toBe(false);
  });

  it("fills in what the personal profile knows and says where it comes from", () => {
    expect(answer("pace")).toMatchObject({
      values: ["relaxed"],
      from: "profile",
      source: "from your trip “Lisbon, April 2027”",
      several: false,
    });
    expect(answer("food")).toMatchObject({
      values: ["vegetarian"],
      from: "profile",
      source: "you told me",
    });
    // Allergies are hard limits of the traveller's, shown with the brief.
    expect(brief.allergies).toEqual(["shellfish"]);
  });

  it("shows what was said for this trip without a source, and what is not answered with what will be assumed", () => {
    expect(answer("interests")).toMatchObject({
      values: ["museums", "views"],
      from: "trip",
      source: null,
      several: true,
    });
    expect(answer("atmosphere")).toMatchObject({
      values: [],
      from: "none",
      assumes: "I will mix lively and quiet places.",
    });
    expect(answer("pace").choices.map((choice) => choice.value)).toEqual([
      "relaxed",
      "balanced",
      "packed",
    ]);
    expect(brief.style).toHaveLength(8);
  });

  it("writes the whole brief in plain sentences, one part per step", () => {
    const full = briefOf(
      trip(
        {
          ...tokyoInMay,
          cities: [
            { city: city("Tokyo"), nights: 3 },
            { city: city("Kyoto"), nights: 1 },
          ],
          children: 1,
          purpose: "Honeymoon",
          budgetAmount: 300000,
          budgetCurrency: "JPY",
          budgetBasis: "TRIP",
          budgetFirmness: "FLEXIBLE",
          datesFirmness: "FIXED",
        },
        [decided("Flight to Tokyo"), decided("teamLab Planets")],
      ),
      tasteInUse(personal, said),
      personal,
    );
    expect(full.review.map((part) => [part.step, part.title])).toEqual([
      [1, "Where and when"],
      [2, "Already decided"],
      [3, "This trip"],
      [4, "Your style"],
    ]);
    expect(full.review[0].lines).toEqual([
      "Tokyo for 3 nights, then Kyoto for 1 night.",
      "From Mon, 10 May 2027 to Fri, 14 May 2027.",
      "2 adults and 1 child.",
    ]);
    expect(full.review[1].lines).toEqual([
      "2 things are already decided: Flight to Tokyo and teamLab Planets.",
    ]);
    expect(full.review[2].lines).toEqual([
      "The trip is for: Honeymoon.",
      "A budget of 300,000 JPY for the trip, which can stretch.",
      "The dates are fixed.",
    ]);
    expect(full.review[3].lines.slice(0, 5)).toEqual([
      "Pace: relaxed (from your trip “Lisbon, April 2027”).",
      "Shape of the day: I will start the days at about nine.",
      "Interests: museums and exhibitions and views.",
      "Atmosphere: I will mix lively and quiet places.",
      "Food: vegetarian (you told me).",
    ]);
  });

  it("says plainly what is not given, and what it will assume instead", () => {
    const bare = briefOf(
      trip({ ...noFacts, lengthNights: 5, timeOfYear: 10 }),
      {},
      [],
    );
    expect(bare.review[0].lines).toEqual(["About 5 nights in October."]);
    expect(bare.review[1].lines).toEqual(["Nothing is decided yet."]);
    expect(bare.review[2].lines).toEqual([
      "No purpose given: I will plan it as a holiday.",
      "No budget given: I will leave costs for you to judge.",
      "I will treat the dates as fixed.",
    ]);
    expect(bare.review[3].lines[0]).toBe("Pace: I will keep a balanced pace.");
  });

  it("names five decided things and counts the rest", () => {
    const many = briefOf(
      trip(tokyoInMay, ["a", "b", "c", "d", "e", "f", "g"].map(decided)),
      {},
      [],
    );
    expect(many.review[1].lines).toEqual([
      "7 things are already decided: a, b, c, d and e, and 2 more.",
    ]);
  });

  it("treats a skipped question as an assumption, not as an answer", () => {
    const skipped = briefOf(
      trip(tokyoInMay),
      tasteInUse([], { pace: { values: ["balanced"], source: "default" } }),
      [],
    );
    expect(skipped.style[0]).toMatchObject({
      values: ["balanced"],
      from: "default",
    });
    expect(skipped.review[3].lines[0]).toBe(
      "Pace: I will keep a balanced pace.",
    );
  });
});

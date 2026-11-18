import { describe, expect, it } from "vitest";

import type { PlanDay } from "@/features/itinerary/contracts";
import type { CommitmentDto, TripFacts } from "@/features/trips/contracts";

import { emptyTripProfile, type Intent } from "./contracts";
import { QUESTIONS, readiness, type ScriptState } from "./script";
import {
  decide,
  decideDifference,
  intentOfTap,
  labelsOf,
  nightsWithoutStay,
  readinessNote,
  stateAfter,
  type DecideInput,
} from "./turn";

const city = (name: string, country = "Japan") => ({
  name,
  region: null,
  country,
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
};
const stay = (date: string | null, endDate: string | null): CommitmentDto => ({
  id: `stay-${date}`,
  kind: "STAY",
  title: "Hotel",
  date,
  startTime: null,
  endDate,
  endTime: null,
  reference: null,
  note: null,
  transport: null,
});
const days: PlanDay[] = [1, 2, 3].map((number) => ({
  day: number,
  date: `2027-05-1${number - 1}`,
  city: "Tokyo",
  entries: [
    number === 1
      ? {
          type: "place",
          slotId: "d1-morning",
          kind: "morning",
          cityKey: "tokyo|japan",
          placeId: "p1",
          start: "09:00",
          minutes: 90,
          minutesEstimated: true,
          travelIn: null,
          flags: [],
        }
      : {
          type: "open",
          slotId: `d${number}-morning`,
          kind: "morning",
          start: "09:00",
          cityKey: "tokyo|japan",
        },
    {
      type: "open",
      slotId: `d${number}-lunch`,
      kind: "lunch",
      start: "12:30",
      cityKey: "tokyo|japan",
    },
  ],
}));

const run = (intent: Intent, over: Partial<DecideInput> = {}) =>
  decide({
    intent,
    waiting: null,
    trip: { facts: noFacts, commitments: [] },
    cities: [],
    days: [],
    limited: false,
    ...over,
  });

describe("tapped choices", () => {
  it("become a taste answer made of the question's own values", () => {
    expect(
      intentOfTap(QUESTIONS.interests, [
        "museums",
        "views",
        "museums",
        "casinos",
      ]),
    ).toEqual({
      type: "taste",
      topic: "interests",
      values: ["museums", "views"],
    });
    expect(intentOfTap(QUESTIONS.pace, ["relaxed", "packed"])).toMatchObject({
      values: ["relaxed"],
    });
    expect(intentOfTap(QUESTIONS.pace, ["warp speed"])).toEqual({
      type: "none",
    });
  });

  it("become facts for a fact question", () => {
    expect(intentOfTap(QUESTIONS.who, ["2+1"])).toEqual({
      type: "facts",
      adults: 2,
      children: 1,
    });
    expect(intentOfTap(QUESTIONS.firmness, ["FLEXIBLE+FIXED"])).toEqual({
      type: "facts",
      datesFirmness: "FLEXIBLE",
      budgetFirmness: "FIXED",
    });
    expect(intentOfTap(QUESTIONS.purpose, ["Honeymoon"])).toEqual({
      type: "facts",
      purpose: "Honeymoon",
    });
    expect(intentOfTap(QUESTIONS.decided, ["nothing"])).toEqual({
      type: "skip",
    });
  });

  it("are shown by their labels", () => {
    expect(labelsOf(QUESTIONS.interests, ["museums", "views"])).toEqual([
      "Museums and exhibitions",
      "Views",
    ]);
  });
});

describe("a skip", () => {
  it("uses the default for a taste question and says so", () => {
    expect(run({ type: "skip" }, { waiting: QUESTIONS.pace })).toEqual({
      change: {
        type: "taste",
        topic: "pace",
        answer: { values: ["balanced"], source: "default" },
      },
      says: "I will keep a balanced pace.",
    });
  });

  it("goes by what is remembered when the profile can answer, kept as a default", () => {
    const waiting = {
      ...QUESTIONS.interests,
      remembered: ["museums", "views"],
    };
    expect(run({ type: "skip" }, { waiting })).toEqual({
      change: {
        type: "taste",
        topic: "interests",
        answer: { values: ["museums", "views"], source: "default" },
      },
      says: "I will go with what I remember: museums and exhibitions and views.",
    });
  });

  it("remembers a skipped fact question and says what it will assume", () => {
    expect(run({ type: "skip" }, { waiting: QUESTIONS.who })).toEqual({
      change: { type: "skip_fact", topic: "who" },
      says: "I will plan for two adults until you tell me otherwise.",
    });
  });

  it("changes nothing when no question is waiting", () => {
    expect(run({ type: "skip" })).toMatchObject({
      change: null,
    });
  });
});

describe("a taste answer", () => {
  it("is saved as told, in the traveller's words back", () => {
    expect(
      run(
        { type: "taste", topic: "interests", values: ["museums", "views"] },
        { waiting: QUESTIONS.interests },
      ),
    ).toEqual({
      change: {
        type: "taste",
        topic: "interests",
        answer: { values: ["museums", "views"], source: "told" },
      },
      says: "Noted: museums and exhibitions and views.",
    });
  });

  it("is saved even when a different question is waiting", () => {
    const decision = run(
      { type: "taste", topic: "food", values: ["vegetarian"] },
      { waiting: QUESTIONS.pace },
    );
    expect(decision.change).toMatchObject({ type: "taste", topic: "food" });
  });

  it("says how many nights have no booked stay when the stay question is answered", () => {
    const trip = {
      facts: tokyoInMay,
      commitments: [stay("2027-05-10", "2027-05-12")],
    };
    expect(
      run({ type: "taste", topic: "stay", values: ["hotel"] }, { trip }).says,
    ).toBe(
      "Noted: a hotel. 2 nights have no booked stay yet. Add a stay under Already decided when you book one.",
    );
  });
});

describe("nights without a booked stay", () => {
  it("counts the nights no stay covers", () => {
    const of = (...commitments: CommitmentDto[]) =>
      nightsWithoutStay({ facts: tokyoInMay, commitments });
    expect(of()).toBe(4);
    expect(of(stay("2027-05-10", "2027-05-14"))).toBe(0);
    expect(
      of(stay("2027-05-10", "2027-05-11"), stay("2027-05-13", "2027-05-14")),
    ).toBe(2);
    // A stay with no dates covers nothing that can be counted.
    expect(of(stay(null, null))).toBe(4);
  });

  it("goes by the length when there are no dates, and cannot tell once a stay exists", () => {
    const rough = { ...noFacts, lengthNights: 5 };
    expect(nightsWithoutStay({ facts: rough, commitments: [] })).toBe(5);
    expect(
      nightsWithoutStay({ facts: rough, commitments: [stay(null, null)] }),
    ).toBeNull();
    expect(nightsWithoutStay({ facts: noFacts, commitments: [] })).toBeNull();
  });
});

describe("facts", () => {
  it("sets the cities of a trip that has none, once each is found", () => {
    const decision = run(
      { type: "facts", cities: ["tokyo", "kyoto"] },
      { waiting: QUESTIONS.where, cities: [city("Tokyo"), city("Kyoto")] },
    );
    expect(decision.change).toEqual({
      type: "facts",
      facts: {
        cities: [
          { city: city("Tokyo"), nights: null },
          { city: city("Kyoto"), nights: null },
        ],
      },
    });
    expect(decision.says).toBe(
      "Got it: Tokyo, Japan, then Kyoto, Japan. Set the nights in each city under the facts.",
    );
  });

  it("saves no city when one of them was not found, and says which", () => {
    expect(
      run(
        { type: "facts", cities: ["Tokyo", "Atlantis"] },
        { waiting: QUESTIONS.where, cities: [city("Tokyo"), null] },
      ),
    ).toEqual({
      change: null,
      says: 'I could not find "Atlantis". Please pick it under the facts.',
    });
  });

  it("does not replace cities a trip already has, but saves the other facts", () => {
    const decision = run(
      { type: "facts", cities: ["Kyoto"], adults: 2, children: 0 },
      { trip: { facts: tokyoInMay, commitments: [] }, cities: [city("Kyoto")] },
    );
    expect(decision.change).toEqual({
      type: "facts",
      facts: { adults: 2, children: 0 },
    });
    expect(decision.says).toBe(
      "Got it: 2 adults. The cities are already set. You can change them under the facts.",
    );
  });

  it("says so when the city lookup cannot be reached", () => {
    expect(
      run({ type: "facts", cities: ["Tokyo"] }, { cities: "unavailable" }),
    ).toMatchObject({
      change: null,
      says: "I cannot look up cities right now. Please add them under the facts.",
    });
  });

  it("saves dates, and refuses dates that would end the trip before it starts", () => {
    expect(
      run(
        { type: "facts", startDate: "2027-05-10", endDate: "2027-05-14" },
        { waiting: QUESTIONS.when },
      ),
    ).toEqual({
      change: {
        type: "facts",
        facts: { startDate: "2027-05-10", endDate: "2027-05-14" },
      },
      says: "Got it: Mon, 10 May 2027 to Fri, 14 May 2027.",
    });
    // The trip already ends on 14 May; a new start after that is not saved.
    expect(
      run(
        { type: "facts", startDate: "2027-06-01" },
        { trip: { facts: tokyoInMay, commitments: [] } },
      ),
    ).toMatchObject({
      change: null,
      says: "Those dates would end the trip before it starts. Please give me both dates.",
    });
    expect(
      run({ type: "facts", startDate: "2027-05-14", endDate: "2027-05-10" })
        .change,
    ).toBeNull();
  });

  it("refuses a date that does not exist", () => {
    const decision = run({ type: "facts", startDate: "2027-02-30" });
    expect(decision.change).toBeNull();
    expect(decision.says).toMatch(/^That does not fit:/);
  });

  it("saves a length with a month, who is travelling, and a purpose", () => {
    expect(run({ type: "facts", lengthNights: 5, timeOfYear: 10 }).says).toBe(
      "Got it: 5 nights in October.",
    );
    expect(run({ type: "facts", adults: 2, children: 2 }).says).toBe(
      "Got it: 2 adults and 2 children.",
    );
    expect(run({ type: "facts", adults: 1, children: 0 }).says).toBe(
      "Got it: 1 adult.",
    );
    expect(
      run(
        { type: "facts", purpose: "Honeymoon" },
        { waiting: QUESTIONS.purpose },
      ),
    ).toMatchObject({
      says: "Got it: the trip is for: Honeymoon.",
    });
  });

  it("saves a budget for the trip unless it is per day, and asks the currency when there is none", () => {
    expect(
      run({ type: "facts", budgetAmount: 300000, budgetCurrency: "JPY" }),
    ).toMatchObject({
      change: {
        facts: {
          budgetAmount: 300000,
          budgetCurrency: "JPY",
          budgetBasis: "TRIP",
        },
      },
      says: "Got it: a budget of 300,000 JPY for the trip.",
    });
    expect(
      run({
        type: "facts",
        budgetAmount: 150,
        budgetCurrency: "EUR",
        budgetBasis: "DAY",
      }).says,
    ).toBe("Got it: a budget of 150 EUR a day.");
    expect(run({ type: "facts", budgetAmount: 2000 })).toEqual({
      change: null,
      says: "Which currency is that budget in?",
    });
    // A new amount keeps the currency the trip already has.
    const trip = {
      facts: {
        ...noFacts,
        budgetCurrency: "USD" as const,
        budgetBasis: "DAY" as const,
      },
      commitments: [],
    };
    expect(run({ type: "facts", budgetAmount: 90 }, { trip }).change).toEqual({
      type: "facts",
      facts: { budgetAmount: 90, budgetBasis: "DAY" },
    });
  });
});

describe("a commitment told in conversation", () => {
  it("is checked like the form's and added with its day and time", () => {
    expect(
      run(
        {
          type: "commitment",
          kind: "RESERVATION",
          title: "teamLab Planets",
          date: "2027-05-13",
          startTime: "15:00",
        },
        { waiting: QUESTIONS.decided },
      ),
    ).toEqual({
      change: {
        type: "commitment",
        commitment: {
          kind: "RESERVATION",
          title: "teamLab Planets",
          date: "2027-05-13",
          startTime: "15:00",
          endDate: null,
          endTime: null,
          reference: null,
          note: null,
        },
      },
      says: "Added to what is already decided: teamLab Planets on Thu, 13 May 2027 at 15:00.",
    });
  });

  it("is added without a day when none was given, and says so", () => {
    expect(
      run({ type: "commitment", kind: "MUST_SEE", title: "Ghibli Museum" })
        .says,
    ).toBe(
      "Added to what is already decided: Ghibli Museum. It has no day yet. Set one under Already decided.",
    );
  });

  it("is refused with the form's own message when it does not fit", () => {
    expect(
      run({
        type: "commitment",
        kind: "RESERVATION",
        title: "Dinner",
        startTime: "19:00",
      }),
    ).toEqual({
      change: null,
      says: "I could not add that: A time needs a date. You can add it under Already decided.",
    });
  });
});

describe("a day to work on", () => {
  it("points at the day's first open slot, or the part named", () => {
    expect(run({ type: "go_to", day: 2 }, { days })).toEqual({
      change: { type: "go_to", slotId: "d2-morning" },
      says: "Day 2 it is.",
    });
    expect(run({ type: "go_to", day: 1 }, { days }).change).toEqual({
      type: "go_to",
      slotId: "d1-lunch",
    });
    expect(
      run({ type: "go_to", day: 1, part: "morning" }, { days }),
    ).toMatchObject({
      change: { slotId: "d1-morning" },
      says: "Day 1 it is, morning.",
    });
  });

  it("says how long the trip is when the day does not exist, and what is missing when no day does", () => {
    expect(run({ type: "go_to", day: 9 }, { days })).toMatchObject({
      change: null,
      says: "This trip has 3 days.",
    });
    expect(run({ type: "go_to", day: 1 }).says).toBe(
      "I cannot lay out the days yet. I need to know where you are going and when.",
    );
  });
});

describe("a message the agent cannot act on", () => {
  it("is answered with what the traveller can do, and with the limited mode named when it applies", () => {
    expect(run({ type: "none" }, { waiting: QUESTIONS.pace }).says).toBe(
      "I did not catch that. You can tap a choice, type a short answer, or skip the question.",
    );
    expect(run({ type: "none" }).says).toMatch(
      /^I did not catch that\. You can tell me a fact/,
    );
    expect(
      run({ type: "none" }, { waiting: QUESTIONS.pace, limited: true }).says,
    ).toMatch(/^I am in a limited mode/);
    expect(run({ type: "none" }, { limited: true })).toMatchObject({
      change: null,
    });
  });
});

describe("an answer to why this trip is different", () => {
  const question = QUESTIONS.difference;

  it("marks the trip as different with the purpose tapped", () => {
    expect(
      decideDifference(question, { type: "answer", values: ["Honeymoon"] }),
    ).toEqual({
      said: "Yes, it is a honeymoon",
      change: { type: "difference", because: "Honeymoon" },
      says: "Understood: this trip is different. I will plan it your way, and I will not take it as your usual.",
    });
  });

  it("leaves it an ordinary trip for 'no', a skip, or a typed no", () => {
    const ordinary = {
      change: { type: "difference", because: null },
      says: "Understood. I will treat it as an ordinary trip.",
    };
    expect(
      decideDifference(question, { type: "answer", values: ["ordinary"] }),
    ).toMatchObject({ ...ordinary, said: "No, just this once" });
    expect(decideDifference(question, { type: "skip" })).toMatchObject({
      ...ordinary,
      said: "Skip",
    });
    for (const text of ["No", "not really, same as usual", "It isn't"]) {
      expect(
        decideDifference(question, { type: "say", text }),
        text,
      ).toMatchObject(ordinary);
    }
  });

  it("takes typed words as the traveller's own reason", () => {
    expect(
      decideDifference(question, {
        type: "say",
        text: " We are travelling with my parents ",
      }),
    ).toMatchObject({
      said: "We are travelling with my parents",
      change: {
        type: "difference",
        because: "We are travelling with my parents",
      },
    });
    expect(
      (
        decideDifference(question, { type: "say", text: "x".repeat(200) })
          ?.change as { because: string }
      ).because,
    ).toHaveLength(120);
  });

  it("is null for a tapped value that is not one of the choices", () => {
    expect(
      decideDifference(question, { type: "answer", values: ["Holiday"] }),
    ).toBeNull();
  });

  it("settles the question in the script's state", () => {
    const state = {
      facts: noFacts,
      commitments: { count: 0, hasStay: false },
      profile: emptyTripProfile,
    };
    expect(
      stateAfter(state, { type: "difference", because: "Work" }).differs,
    ).toBe(true);
    expect(
      stateAfter(state, { type: "difference", because: null }).differs,
    ).toBe(false);
  });
});

describe("saying when a topic becomes ready", () => {
  const state = (over: Partial<ScriptState> = {}): ScriptState => ({
    facts: noFacts,
    commitments: { count: 0, hasStay: false },
    profile: emptyTripProfile,
    ...over,
  });
  const note = (
    before: ScriptState,
    intent: Intent,
    over: Partial<DecideInput> = {},
  ) => {
    const { change } = run(intent, {
      trip: { facts: before.facts, commitments: [] },
      ...over,
    });
    return readinessNote(
      readiness(before),
      readiness(stateAfter(before, change)),
      change,
    );
  };

  it("says what is still needed after a fact that is not enough", () => {
    expect(
      note(
        state(),
        { type: "facts", cities: ["Tokyo"] },
        { cities: [city("Tokyo")] },
      ),
    ).toBe("Before I can suggest places I still need when, or for how long.");
  });

  it("says when it can start suggesting places, and when it can suggest meals", () => {
    const withCity = state({
      facts: { ...noFacts, cities: tokyoInMay.cities },
    });
    expect(
      note(withCity, {
        type: "facts",
        startDate: "2027-05-10",
        endDate: "2027-05-14",
      }),
    ).toBe("I know enough to start suggesting places for your days.");
    const ready = state({ facts: tokyoInMay });
    expect(
      note(ready, { type: "taste", topic: "food", values: ["vegetarian"] }),
    ).toBe("I think I know enough to suggest places to eat.");
    expect(
      note(ready, { type: "taste", topic: "pace", values: ["relaxed"] }),
    ).toBe("");
  });

  it("moves the script on after a skipped fact and after a commitment", () => {
    const skipped = stateAfter(state(), { type: "skip_fact", topic: "budget" });
    expect(skipped.profile.skippedFacts).toEqual(["budget"]);
    const added = stateAfter(
      state(),
      run({ type: "commitment", kind: "STAY", title: "Hotel" }).change,
    );
    expect(added.commitments.count).toBe(1);
  });
});

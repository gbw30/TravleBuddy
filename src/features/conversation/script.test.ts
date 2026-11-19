import { describe, expect, it } from "vitest";

import type { TripFacts } from "@/features/trips/contracts";

import {
  emptyTripProfile,
  FACT_TOPICS,
  intentSchema,
  TASTE_TOPICS,
  type Intent,
  type TripProfile,
} from "./contracts";
import { readAnswerByRule } from "./read-answer";
import {
  allowedValues,
  nextQuestion,
  QUESTIONS,
  readiness,
  TASTE_DEFAULTS,
  type ScriptState,
} from "./script";

const tokyo = {
  name: "Tokyo",
  region: null,
  country: "Japan",
  latitude: 35.6769,
  longitude: 139.7639,
  timeZone: "Asia/Tokyo",
};
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
const allFacts: TripFacts = {
  ...noFacts,
  cities: [{ city: tokyo, nights: 4 }],
  startDate: "2027-05-10",
  endDate: "2027-05-14",
  datesFirmness: "FIXED",
  adults: 2,
  children: 0,
  budgetAmount: 300000,
  budgetCurrency: "JPY",
  budgetBasis: "TRIP",
  budgetFirmness: "FLEXIBLE",
  purpose: "Holiday",
};
const state = (over: Partial<ScriptState> = {}): ScriptState => ({
  facts: noFacts,
  commitments: { count: 0, hasStay: false },
  profile: emptyTripProfile,
  ...over,
});
const told = (values: string[]) => ({ values, source: "told" as const });

describe("the script", () => {
  it("has a question for every topic, each answerable by tapping or typing", () => {
    for (const topic of [...FACT_TOPICS, ...TASTE_TOPICS]) {
      const question = QUESTIONS[topic];
      expect(question.topic).toBe(topic);
      expect(
        question.prompt.endsWith("?") || question.prompt.endsWith("."),
      ).toBe(true);
      expect(question.skipSays.length).toBeGreaterThan(10);
      // Open text is typed; every other form offers choices to tap.
      expect(
        question.form === "open_text" || question.choices.length >= 2,
        topic,
      ).toBe(true);
    }
  });

  it("asks about breakfast with three choices, and a skip says so and stores none", () => {
    const question = QUESTIONS.breakfast;
    expect(question.prompt).toBe("Breakfast?");
    expect(question.form).toBe("pick_one");
    expect(question.choices).toEqual([
      { value: "included", label: "It comes with where I stay" },
      { value: "suggest", label: "Suggest somewhere" },
      { value: "none", label: "No breakfast, thanks" },
    ]);
    expect(question.skipSays).toBe(
      "I will leave breakfast out; tell me if you want some.",
    );
    expect(TASTE_DEFAULTS.breakfast).toEqual(["none"]);
    expect(TASTE_TOPICS.indexOf("breakfast")).toBe(
      TASTE_TOPICS.indexOf("food") + 1,
    );
  });

  it("asks the facts first, in order, and only those it does not have", () => {
    expect(nextQuestion(state())?.topic).toBe("where");
    // Tickets already gave the city and the dates.
    const fromTickets = state({
      facts: {
        ...noFacts,
        cities: allFacts.cities,
        startDate: "2027-05-10",
        datesFirmness: "FIXED",
      },
      commitments: { count: 2, hasStay: false },
    });
    expect(nextQuestion(fromTickets)?.topic).toBe("who");
  });

  it("does not ask how firm a budget is when there is no budget", () => {
    const s = state({
      facts: { ...allFacts, budgetAmount: null, budgetFirmness: null },
      commitments: { count: 1, hasStay: false },
      profile: { taste: {}, skippedFacts: ["budget"] },
    });
    expect(nextQuestion(s)?.topic).toBe("pace");
  });

  it("asks whether anything is decided unless a commitment already exists", () => {
    const facts = { ...allFacts, purpose: null };
    expect(nextQuestion(state({ facts }))?.topic).toBe("decided");
    expect(
      nextQuestion(state({ facts, commitments: { count: 1, hasStay: true } }))
        ?.topic,
    ).toBe("purpose");
  });

  it("moves on from a skipped fact and never asks it again", () => {
    const s = state({
      profile: { taste: {}, skippedFacts: ["where", "when", "who"] },
    });
    expect(nextQuestion(s)?.topic).toBe("budget");
  });

  it("then covers taste one topic at a time, and finishes", () => {
    const done = { count: 1, hasStay: false };
    const asked: string[] = [];
    let profile: TripProfile = emptyTripProfile;
    for (;;) {
      const question = nextQuestion(
        state({ facts: allFacts, commitments: done, profile }),
      );
      if (!question) break;
      asked.push(question.topic);
      profile = {
        ...profile,
        taste: { ...profile.taste, [question.topic]: told(["x"]) },
      };
    }
    expect(asked).toEqual([...TASTE_TOPICS]);
  });
});

describe("a traveller the site already knows", () => {
  const facts = allFacts;
  const done = { count: 1, hasStay: false };
  const fromTokyo = (topic: "pace" | "interests", value: string) => ({
    topic,
    value,
    sureness: "think" as const,
    source: { type: "trip" as const, tripId: "t1", tripTitle: "Tokyo in May" },
  });
  const said = (
    topic: "interests" | "dietary_rules" | "atmosphere",
    value: string,
  ) => ({
    topic,
    value,
    sureness: "always" as const,
    source: { type: "told" as const },
  });

  it("is asked to confirm a remembered answer, with the trip it comes from", () => {
    const question = nextQuestion(
      state({
        facts,
        commitments: done,
        remembered: [fromTokyo("pace", "relaxed")],
      }),
    );
    expect(question).toMatchObject({
      topic: "pace",
      prompt:
        "Pace: from your trip “Tokyo in May” I remember relaxed. Same for this trip?",
      remembered: ["relaxed"],
    });
    // The other choices stay, to answer differently for this trip.
    expect(question?.choices.map((choice) => choice.value)).toEqual([
      "relaxed",
      "balanced",
      "packed",
    ]);
  });

  it("is told plainly when the memory is something they said themselves", () => {
    const profile = {
      taste: { pace: told(["relaxed"]), day_shape: told(["early"]) },
      skippedFacts: [],
    };
    const question = nextQuestion(
      state({
        facts,
        commitments: done,
        profile,
        remembered: [
          said("interests", "museums"),
          said("interests", "views"),
          said("interests", "markets"),
        ],
      }),
    );
    expect(question).toMatchObject({
      topic: "interests",
      prompt:
        "Interests: you told me museums and exhibitions, views and markets and shopping. Same for this trip?",
      remembered: ["museums", "views", "markets"],
    });
  });

  it("is asked the plain question where nothing is remembered, or the memory is not a value the question knows", () => {
    const remembered = [said("atmosphere", "candlelit")];
    const profile = {
      taste: {
        pace: told(["relaxed"]),
        day_shape: told(["early"]),
        interests: told(["views"]),
      },
      skippedFacts: [],
    };
    expect(
      nextQuestion(state({ facts, commitments: done, remembered })),
    ).toEqual(QUESTIONS.pace);
    expect(
      nextQuestion(state({ facts, commitments: done, profile, remembered })),
    ).toEqual(QUESTIONS.atmosphere);
  });

  it("has the food question answered by remembered dietary rules, which also make meals ready", () => {
    const remembered = [said("dietary_rules", "vegetarian")];
    const before = {
      taste: {
        pace: told(["relaxed"]),
        day_shape: told(["early"]),
        interests: told(["views"]),
        atmosphere: told(["quiet"]),
      },
      skippedFacts: [],
    };
    expect(
      nextQuestion(
        state({ facts, commitments: done, profile: before, remembered }),
      ),
    ).toMatchObject({
      topic: "food",
      prompt: "Food: you told me vegetarian. Same for this trip?",
      remembered: ["vegetarian"],
    });
    expect(readiness(state({ facts, remembered })).meals).toBe(true);
    expect(readiness(state({ facts })).meals).toBe(false);
  });

  it("is not asked again about a topic answered the same way for this trip", () => {
    const profile = { taste: { pace: told(["relaxed"]) }, skippedFacts: [] };
    expect(
      nextQuestion(
        state({
          facts,
          commitments: done,
          profile,
          remembered: [fromTokyo("pace", "relaxed")],
        }),
      )?.topic,
    ).toBe("day_shape");
  });

  it("is asked once why this trip is different when an answer goes against the memory", () => {
    const profile = { taste: { pace: told(["packed"]) }, skippedFacts: [] };
    const remembered = [fromTokyo("pace", "relaxed")];
    const question = nextQuestion(
      state({ facts, commitments: done, profile, remembered }),
    );
    expect(question).toMatchObject({
      topic: "difference",
      stage: "memory",
      prompt:
        "Pace: you chose packed for this trip, and I remember relaxed. Is this trip different from your usual?",
    });
    expect(question?.choices.map((choice) => choice.value)).toEqual([
      "Honeymoon",
      "Family visit",
      "Celebration",
      "Work",
      "ordinary",
    ]);
    // Once answered, either way, the script moves on and does not ask again.
    for (const differs of [true, false]) {
      expect(
        nextQuestion(
          state({ facts, commitments: done, profile, remembered, differs }),
        )?.topic,
      ).toBe("day_shape");
    }
  });

  it("does not take a skipped question, or an answer that shares a value, as going against the memory", () => {
    const remembered = [
      fromTokyo("pace", "relaxed"),
      said("interests", "museums"),
    ];
    const skipped = {
      taste: { pace: { values: ["balanced"], source: "default" as const } },
      skippedFacts: [],
    };
    expect(
      nextQuestion(
        state({ facts, commitments: done, profile: skipped, remembered }),
      )?.topic,
    ).toBe("day_shape");
    const overlap = {
      taste: {
        pace: told(["relaxed"]),
        day_shape: told(["early"]),
        interests: told(["museums", "markets"]),
      },
      skippedFacts: [],
    };
    expect(
      nextQuestion(
        state({ facts, commitments: done, profile: overlap, remembered }),
      )?.topic,
    ).toBe("atmosphere");
  });

  it("asks about the difference before going on with the facts-free questions, but after the facts", () => {
    const profile = { taste: { pace: told(["packed"]) }, skippedFacts: [] };
    const remembered = [fromTokyo("pace", "relaxed")];
    expect(
      nextQuestion(
        state({
          facts: { ...facts, purpose: null },
          commitments: done,
          profile,
          remembered,
        }),
      )?.topic,
    ).toBe("purpose");
  });
});

describe("readiness", () => {
  it("says what is still needed before anything can be proposed", () => {
    expect(readiness(state())).toEqual({
      sights: false,
      meals: false,
      needs: ["where you are going", "when, or for how long"],
    });
  });

  it("is ready for sights as soon as the days can be laid out, before any taste is known", () => {
    expect(readiness(state({ facts: allFacts }))).toEqual({
      sights: true,
      meals: false,
      needs: [],
    });
    const rough = {
      ...noFacts,
      cities: allFacts.cities,
      lengthNights: 5,
      timeOfYear: 10,
    };
    expect(readiness(state({ facts: rough })).sights).toBe(true);
  });

  it("is ready for meals once food is answered or skipped, whatever else is open", () => {
    const answered = {
      taste: { food: told(["vegetarian"]) },
      skippedFacts: [],
    };
    const skipped = {
      taste: {
        food: { values: TASTE_DEFAULTS.food, source: "default" as const },
      },
      skippedFacts: [],
    };
    expect(readiness(state({ facts: allFacts, profile: answered })).meals).toBe(
      true,
    );
    expect(readiness(state({ facts: allFacts, profile: skipped })).meals).toBe(
      true,
    );
  });
});

describe("reading a typed answer by rule", () => {
  const read = (topic: keyof typeof QUESTIONS, text: string) =>
    readAnswerByRule(QUESTIONS[topic], text);
  const valid = (intent: Intent) => intentSchema.safeParse(intent).success;

  it("reads where as a list of cities in order", () => {
    expect(read("where", "Tokyo")).toEqual({
      type: "facts",
      cities: ["Tokyo"],
    });
    expect(read("where", "Tokyo, then Kyoto and Osaka")).toEqual({
      type: "facts",
      cities: ["Tokyo", "Kyoto", "Osaka"],
    });
  });

  it("reads dates in common forms, and a length with a month", () => {
    expect(read("when", "2027-05-10 to 2027-05-14")).toEqual({
      type: "facts",
      startDate: "2027-05-10",
      endDate: "2027-05-14",
    });
    expect(read("when", "10 May 2027")).toEqual({
      type: "facts",
      startDate: "2027-05-10",
    });
    expect(read("when", "From May 10th, 2027 until 14 May 2027.")).toEqual({
      type: "facts",
      startDate: "2027-05-10",
      endDate: "2027-05-14",
    });
    expect(read("when", "5 nights in October")).toEqual({
      type: "facts",
      lengthNights: 5,
      timeOfYear: 10,
    });
    expect(read("when", "a week in may")).toEqual({
      type: "facts",
      lengthNights: 7,
      timeOfYear: 5,
    });
  });

  it("does not accept a date that does not exist, or a length with no month", () => {
    expect(read("when", "30 February 2027")).toEqual({ type: "none" });
    expect(read("when", "five nights")).toEqual({ type: "none" });
    expect(read("when", "soon")).toEqual({ type: "none" });
  });

  it("reads who is travelling from a choice or a phrase", () => {
    expect(read("who", "Just me")).toEqual({
      type: "facts",
      adults: 1,
      children: 0,
    });
    expect(read("who", "Two adults and two children")).toEqual({
      type: "facts",
      adults: 2,
      children: 2,
    });
    expect(read("who", "3 adults and a child")).toEqual({
      type: "facts",
      adults: 3,
      children: 1,
    });
    expect(read("who", "me and my wife")).toEqual({
      type: "facts",
      adults: 2,
      children: 0,
    });
    expect(read("who", "4")).toEqual({ type: "facts", adults: 4, children: 0 });
    expect(read("who", "everyone")).toEqual({ type: "none" });
  });

  it("reads a budget with its currency and whether it is per day", () => {
    expect(read("budget", "300,000 JPY for the trip")).toEqual({
      type: "facts",
      budgetAmount: 300000,
      budgetCurrency: "JPY",
      budgetBasis: "TRIP",
    });
    expect(read("budget", "€150 a day")).toEqual({
      type: "facts",
      budgetAmount: 150,
      budgetCurrency: "EUR",
      budgetBasis: "DAY",
    });
    expect(read("budget", "2k dollars")).toEqual({
      type: "facts",
      budgetAmount: 2000,
      budgetCurrency: "USD",
      budgetBasis: "TRIP",
    });
    // An amount with no currency is not guessed.
    expect(read("budget", "about 2000")).toEqual({ type: "none" });
  });

  it("reads firmness, purpose and whether anything is decided", () => {
    expect(read("firmness", "Dates fixed, budget can stretch")).toEqual({
      type: "facts",
      datesFirmness: "FIXED",
      budgetFirmness: "FLEXIBLE",
    });
    expect(read("purpose", "A honeymoon")).toEqual({
      type: "facts",
      purpose: "Honeymoon",
    });
    expect(read("purpose", "My sister's wedding")).toEqual({
      type: "facts",
      purpose: "My sister's wedding",
    });
    expect(read("decided", "Nothing yet")).toEqual({ type: "skip" });
    expect(read("decided", "I booked teamLab for Thursday at 3")).toEqual({
      type: "none",
    });
  });

  it("reads taste answers by the question's own choices, one or several", () => {
    expect(read("pace", "relaxed")).toEqual({
      type: "taste",
      topic: "pace",
      values: ["relaxed"],
    });
    expect(read("pace", "Packed!")).toEqual({
      type: "taste",
      topic: "pace",
      values: ["packed"],
    });
    expect(read("interests", "museums, parks and views")).toEqual({
      type: "taste",
      topic: "interests",
      values: ["museums", "nature", "views"],
    });
    expect(read("food", "vegetarian and gluten-free")).toEqual({
      type: "taste",
      topic: "food",
      values: ["vegetarian", "gluten-free"],
    });
    expect(read("getting_around", "public transport")).toEqual({
      type: "taste",
      topic: "getting_around",
      values: ["transit"],
    });
    expect(read("pace", "like a snail")).toEqual({ type: "none" });
  });

  it("reads yes to a remembered answer as the same again", () => {
    const question = {
      ...QUESTIONS.interests,
      remembered: ["museums", "views"],
    };
    for (const text of ["Yes", "same again", "Sure."]) {
      expect(readAnswerByRule(question, text), text).toEqual({
        type: "taste",
        topic: "interests",
        values: ["museums", "views"],
      });
    }
    // Another choice still answers differently, and a bare yes means nothing without a memory.
    expect(readAnswerByRule(question, "markets")).toEqual({
      type: "taste",
      topic: "interests",
      values: ["markets"],
    });
    expect(read("interests", "yes")).toEqual({ type: "none" });
  });

  it("reads a skip in plain words, and nothing from an empty message", () => {
    for (const text of ["skip", "Not sure.", "you choose", "I don't know"]) {
      expect(read("pace", text), text).toEqual({ type: "skip" });
    }
    expect(read("pace", "   ")).toEqual({ type: "none" });
  });

  it("only ever returns an intent that passes the schema, with values the script allows", () => {
    const samples: [keyof typeof QUESTIONS, string][] = [
      ["where", "Tokyo, Kyoto"],
      ["when", "10 May 2027"],
      ["who", "2 adults and 1 child"],
      ["budget", "£900"],
      ["interests", "museums and markets"],
      ["stay", "a hotel"],
      ["budget_priorities", "evenly"],
    ];
    for (const [topic, text] of samples) {
      const intent = read(topic, text);
      expect(valid(intent), `${topic}: ${text}`).toBe(true);
      if (intent.type === "taste") {
        expect(
          intent.values.every((value) =>
            allowedValues(intent.topic).includes(value),
          ),
        ).toBe(true);
      }
    }
  });
});

import { conflicts, rememberedFor } from "@/features/memory";
import {
  sourceWords,
  TOPIC_NAMES,
  type ProfileEntry,
} from "@/features/memory/contracts";
import type { TripFacts } from "@/features/trips/contracts";

import {
  FACT_TOPICS,
  TASTE_TOPICS,
  type FactTopic,
  type Question,
  type TasteTopic,
  type Topic,
  type TripProfile,
} from "./contracts";

// The fixed script of guided planning (PRD 7.2, 7.3, 7.7). It decides what to
// ask next and when a topic is ready for proposals. Pure: it needs no AI
// model, which is what keeps the conversation working when the model is off.

const choices = (...pairs: [string, string][]) =>
  pairs.map(([value, label]) => ({ value, label }));

export const QUESTIONS: Record<Topic, Question> = {
  where: {
    topic: "where",
    stage: "facts",
    form: "open_text",
    prompt: "Where are you going? Name the city, or the cities in order.",
    choices: [],
    skipSays:
      "I cannot plan without a city. Add it under the facts when you know.",
  },
  when: {
    topic: "when",
    stage: "facts",
    form: "open_text",
    prompt:
      "When are you going? Give me the dates, or a length and a rough month.",
    choices: [],
    skipSays:
      "I cannot lay out the days without a date or a length. Add it under the facts when you know.",
  },
  who: {
    topic: "who",
    stage: "facts",
    form: "pick_one",
    prompt: "Who is travelling?",
    choices: choices(
      ["1+0", "Just me"],
      ["2+0", "Two adults"],
      ["2+1", "Two adults and a child"],
      ["2+2", "Two adults and two children"],
    ),
    skipSays: "I will plan for two adults until you tell me otherwise.",
  },
  budget: {
    topic: "budget",
    stage: "facts",
    form: "open_text",
    prompt:
      "What is your budget? An amount and a currency, for the trip or per day.",
    choices: [],
    skipSays: "I will plan without a budget and leave costs for you to judge.",
  },
  firmness: {
    topic: "firmness",
    stage: "facts",
    form: "pick_one",
    prompt: "How firm are the dates and the budget?",
    choices: choices(
      ["FIXED+FIXED", "Both are fixed"],
      ["FIXED+FLEXIBLE", "Dates fixed, budget can stretch"],
      ["FLEXIBLE+FIXED", "Dates can move, budget fixed"],
      ["FLEXIBLE+FLEXIBLE", "Both can move"],
    ),
    skipSays: "I will treat the dates as fixed and the budget as flexible.",
  },
  decided: {
    topic: "decided",
    stage: "facts",
    form: "this_or_that",
    prompt:
      "Is anything already decided: a hotel, a reservation, a sight you will not miss?",
    choices: choices(
      ["nothing", "Nothing yet"],
      ["something", "Yes, I will add it"],
    ),
    skipSays:
      "I will assume nothing else is decided. Add anything later under Already decided.",
  },
  purpose: {
    topic: "purpose",
    stage: "facts",
    form: "pick_one",
    prompt: "What is the trip for?",
    choices: choices(
      ["Holiday", "A holiday"],
      ["Honeymoon", "A honeymoon"],
      ["Family visit", "A family visit"],
      ["Celebration", "A celebration"],
      ["Work", "Work"],
    ),
    skipSays: "I will plan it as a holiday.",
  },
  pace: {
    topic: "pace",
    stage: "taste",
    form: "pick_one",
    prompt: "How packed should the days be?",
    choices: choices(
      ["relaxed", "Relaxed"],
      ["balanced", "Balanced"],
      ["packed", "Packed"],
    ),
    skipSays: "I will keep a balanced pace.",
  },
  day_shape: {
    topic: "day_shape",
    stage: "taste",
    form: "this_or_that",
    prompt: "Early starts, or late nights?",
    choices: choices(
      ["early", "Early starts"],
      ["late", "Late nights"],
      ["neither", "Neither"],
    ),
    skipSays: "I will start the days at about nine.",
  },
  interests: {
    topic: "interests",
    stage: "taste",
    form: "pick_several",
    prompt: "What do you most want to see and do?",
    choices: choices(
      ["museums", "Museums and exhibitions"],
      ["history", "Temples, shrines and history"],
      ["nature", "Parks and nature"],
      ["views", "Views"],
      ["markets", "Markets and shopping"],
      ["activities", "Activities"],
    ),
    skipSays: "I will mix a little of everything.",
  },
  atmosphere: {
    topic: "atmosphere",
    stage: "taste",
    form: "this_or_that",
    prompt: "Lively places, or quiet ones?",
    choices: choices(
      ["lively", "Lively"],
      ["quiet", "Quiet"],
      ["either", "Either"],
    ),
    skipSays: "I will mix lively and quiet places.",
  },
  food: {
    topic: "food",
    stage: "taste",
    form: "pick_several",
    prompt: "Anything I should know about food?",
    choices: choices(
      ["none", "No restrictions"],
      ["vegetarian", "Vegetarian"],
      ["vegan", "Vegan"],
      ["halal", "Halal"],
      ["kosher", "Kosher"],
      ["gluten-free", "Gluten-free"],
    ),
    skipSays: "I will assume no restrictions.",
  },
  getting_around: {
    topic: "getting_around",
    stage: "taste",
    form: "pick_one",
    prompt: "How do you like to get around?",
    choices: choices(
      ["walk", "Mostly on foot"],
      ["transit", "Public transport"],
      ["drive", "Taxis or a car"],
    ),
    skipSays: "I will walk short hops and use public transport for the rest.",
  },
  stay: {
    topic: "stay",
    stage: "taste",
    form: "pick_one",
    prompt: "Where do you like to stay?",
    choices: choices(
      ["hotel", "A hotel"],
      ["apartment", "An apartment"],
      ["guesthouse", "A guesthouse or inn"],
      ["hostel", "A hostel"],
      ["booked", "It is already booked"],
    ),
    skipSays: "I will leave where to stay to you.",
  },
  budget_priorities: {
    topic: "budget_priorities",
    stage: "taste",
    form: "pick_one",
    prompt: "How should the budget be spent?",
    choices: choices(
      ["food", "Save on stays, spend on food"],
      ["stays", "Spend on where we stay"],
      ["even", "Evenly"],
      ["low", "Keep everything low"],
    ),
    skipSays: "I will spread the budget evenly.",
  },
  // Asked once, when an answer goes against the personal profile. Its
  // wording is filled in with the answer and the memory (PRD 7.6).
  difference: {
    topic: "difference",
    stage: "memory",
    form: "pick_one",
    prompt: "Is this trip different from your usual?",
    choices: choices(
      ["Honeymoon", "Yes, it is a honeymoon"],
      ["Family visit", "Yes, it is a family visit"],
      ["Celebration", "Yes, it is a celebration"],
      ["Work", "Yes, it is for work"],
      ["ordinary", "No, just this once"],
    ),
    skipSays: "I will treat it as an ordinary trip.",
  },
};

export type ScriptState = {
  facts: TripFacts;
  /** How many fixed commitments the trip has, and whether one is a stay. */
  commitments: { count: number; hasStay: boolean };
  profile: TripProfile;
  /** The traveller's personal profile: what is remembered from before this trip. */
  remembered?: ProfileEntry[];
  /** Whether the traveller marked this trip as different. Null or absent: not asked yet. */
  differs?: boolean | null;
};

/** Whether a fact is already known from the trip, its tickets or what was typed (TB-AGT-03). */
function factKnown(topic: FactTopic, state: ScriptState): boolean {
  const { facts } = state;
  switch (topic) {
    case "where":
      return facts.cities.length > 0;
    case "when":
      return Boolean(
        facts.startDate || (facts.lengthNights && facts.timeOfYear),
      );
    case "who":
      return facts.adults !== null;
    case "budget":
      return facts.budgetAmount !== null;
    case "firmness":
      // Asked only when there is a budget whose firmness could be told.
      return (
        facts.datesFirmness !== null &&
        (facts.budgetAmount === null || facts.budgetFirmness !== null)
      );
    case "decided":
      return state.commitments.count > 0;
    case "purpose":
      return facts.purpose !== null;
  }
}

/**
 * The next question to ask, or null when the script is finished. Facts come
 * first and only when missing; then taste, one topic at a time.
 */
export function nextQuestion(state: ScriptState): Question | null {
  const fact = FACT_TOPICS.find(
    (topic) =>
      !factKnown(topic, state) && !state.profile.skippedFacts.includes(topic),
  );
  if (fact) return QUESTIONS[fact];
  const difference = state.differs == null ? differenceQuestion(state) : null;
  if (difference) return difference;
  const taste = TASTE_TOPICS.find((topic) => !state.profile.taste[topic]);
  return taste ? confirming(QUESTIONS[taste], state.remembered ?? []) : null;
}

const words = (labels: string[]) =>
  labels.length < 3
    ? labels.join(" and ")
    : `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;

/**
 * "Is this trip different?", for the first topic where what was said for
 * this trip goes against what is remembered; null when nothing does
 * (TB-AGT-12). It is asked once: the answer settles `differs`.
 */
function differenceQuestion(state: ScriptState): Question | null {
  for (const topic of TASTE_TOPICS) {
    const answer = state.profile.taste[topic];
    const remembered = rememberedFor(state.remembered ?? [], topic);
    if (answer?.source !== "told" || !conflicts(answer.values, remembered)) {
      continue;
    }
    const label = (value: string) =>
      (
        QUESTIONS[topic].choices.find((choice) => choice.value === value)
          ?.label ?? value
      ).toLowerCase();
    return {
      ...QUESTIONS.difference,
      prompt: `${TOPIC_NAMES[topic]}: you chose ${words(answer.values.map(label))} for this trip, and I remember ${words(remembered.map((entry) => label(entry.value)))}. Is this trip different from your usual?`,
    };
  }
  return null;
}

/**
 * The question as asked of a traveller the site already knows: where the
 * personal profile holds an answer the question understands, it asks to
 * confirm that answer and says where it comes from (TB-AGT-06, TB-MEM-06).
 */
function confirming(question: Question, personal: ProfileEntry[]): Question {
  const known = rememberedFor(personal, question.topic as TasteTopic).filter(
    (entry) => question.choices.some((choice) => choice.value === entry.value),
  );
  if (known.length === 0) return question;
  const labels = known.map((entry) =>
    question.choices
      .find((choice) => choice.value === entry.value)!
      .label.toLowerCase(),
  );
  const remembered = words(labels);
  // The trip of the first learned entry is named; stated ones need no trip.
  const source = (
    known.find((entry) => entry.source.type === "trip") ?? known[0]
  ).source;
  return {
    ...question,
    prompt: `${TOPIC_NAMES[question.topic as TasteTopic]}: ${
      source.type === "trip"
        ? `${sourceWords(source)} I remember ${remembered}`
        : `you told me ${remembered}`
    }. Same for this trip?`,
    remembered: known.map((entry) => entry.value),
  };
}

export type Readiness = {
  /** Sights and activities can be proposed. */
  sights: boolean;
  /** Meals can be proposed. */
  meals: boolean;
  /** What the agent still needs before it can propose anything (TB-AGT-08). */
  needs: string[];
};

/**
 * Readiness is judged per topic (PRD 7.4): sights as soon as the days can be
 * laid out, meals once the food question is answered or skipped.
 */
export function readiness(state: ScriptState): Readiness {
  const needs: string[] = [];
  if (!factKnown("where", state)) needs.push("where you are going");
  if (!factKnown("when", state)) needs.push("when, or for how long");
  const days = needs.length === 0;
  return {
    sights: days,
    // Remembered dietary rules are enough to start on meals.
    meals:
      days &&
      (state.profile.taste.food !== undefined ||
        rememberedFor(state.remembered ?? [], "food").length > 0),
    needs,
  };
}

/** The values an answer about taste may take: the question's own choices. */
export function allowedValues(topic: TasteTopic): string[] {
  return QUESTIONS[topic].choices.map((choice) => choice.value);
}

/** The default used when a taste question is skipped, taken from its first sensible choice. */
export const TASTE_DEFAULTS: Record<TasteTopic, string[]> = {
  pace: ["balanced"],
  day_shape: ["neither"],
  interests: [],
  atmosphere: ["either"],
  food: ["none"],
  getting_around: [],
  stay: [],
  budget_priorities: ["even"],
};

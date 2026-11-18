import type { PlanDay } from "@/features/itinerary/contracts";
import { cityLabel, type City } from "@/features/places/contracts";
import {
  commitmentInputSchema,
  tripFactsSchema,
  type CommitmentInput,
  type TripDetail,
  type TripFacts,
  type TripFactsInput,
} from "@/features/trips/contracts";

import type {
  FactTopic,
  Intent,
  Question,
  TasteTopic,
  TripAnswer,
} from "./contracts";
import { readAnswerByRule } from "./read-answer";
import {
  allowedValues,
  QUESTIONS,
  TASTE_DEFAULTS,
  type Readiness,
  type ScriptState,
} from "./script";

// What a turn of the conversation leads to. Pure: it decides the one change
// to make and what the agent says back; the use case makes the change through
// the same service functions the forms use (TB-AGT-14, TB-TRU-03).

type Trip = Pick<TripDetail, "facts" | "commitments">;

export type Change =
  | { type: "facts"; facts: TripFactsInput }
  | { type: "taste"; topic: TasteTopic; answer: TripAnswer }
  | { type: "skip_fact"; topic: FactTopic }
  | { type: "commitment"; commitment: CommitmentInput }
  | { type: "go_to"; slotId: string }
  /** The answer to "is this trip different?". `because` is null for an ordinary trip. */
  | { type: "difference"; because: string | null }
  | null;

export type Decision = {
  change: Change;
  /** What the agent says back. */
  says: string;
};

export type DecideInput = {
  intent: Intent;
  waiting: Question | null;
  trip: Trip;
  /**
   * The cities a facts intent names, looked up in order: null for one that
   * was not found, "unavailable" when the lookup could not be reached.
   */
  cities: (City | null)[] | "unavailable";
  /** The plan's days, for "let's do day 4". */
  days: PlanDay[];
  /** The AI model is not reading this turn. */
  limited: boolean;
};

const list = (items: string[]) =>
  items.length < 3
    ? items.join(" and ")
    : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
const count = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;
const day = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
const month = (number: number) =>
  new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2000, number - 1, 1)),
  );
const nextDay = (iso: string) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);

/** The labels of a question's choices, for showing what was tapped. */
export function labelsOf(question: Question, values: string[]): string[] {
  return values.map(
    (value) =>
      question.choices.find((choice) => choice.value === value)?.label ?? value,
  );
}

/** What tapped choices mean. Only the question's own choices count. */
export function intentOfTap(question: Question, values: string[]): Intent {
  if (question.stage === "facts") {
    return readAnswerByRule(question, values[0]);
  }
  const topic = question.topic as TasteTopic;
  const kept = [...new Set(values)].filter((value) =>
    allowedValues(topic).includes(value),
  );
  if (kept.length === 0) return { type: "none" };
  return {
    type: "taste",
    topic,
    values: question.form === "pick_several" ? kept : kept.slice(0, 1),
  };
}

/**
 * Nights of the trip with no booked stay, or null when that cannot be told
 * (PRD 7.5: where to stay comes right after fixed commitments).
 */
export function nightsWithoutStay(trip: Trip): number | null {
  const { startDate, endDate, lengthNights } = trip.facts;
  const stays = trip.commitments.filter((item) => item.kind === "STAY");
  if (!startDate || !endDate) {
    return stays.length === 0 ? lengthNights : null;
  }
  const booked = new Set<string>();
  for (const stay of stays) {
    if (!stay.date || !stay.endDate) continue;
    for (let night = stay.date; night < stay.endDate; night = nextDay(night)) {
      booked.add(night);
    }
  }
  let open = 0;
  for (let night = startDate; night < endDate; night = nextDay(night)) {
    if (!booked.has(night)) open += 1;
  }
  return open;
}

function stayNote(trip: Trip): string {
  const open = nightsWithoutStay(trip);
  if (open === null) return "";
  return open === 0
    ? " Every night has a booked stay."
    : ` ${count(open, "night has", "nights have")} no booked stay yet. Add a stay under Already decided when you book one.`;
}

const nothing = (says: string): Decision => ({ change: null, says });

function skip(waiting: Question | null): Decision {
  if (!waiting) return nothing("There is no question waiting just now.");
  if (waiting.stage === "facts") {
    return {
      change: { type: "skip_fact", topic: waiting.topic as FactTopic },
      says: waiting.skipSays,
    };
  }
  const topic = waiting.topic as TasteTopic;
  // A skipped question the profile can answer goes by what is remembered
  // (TB-AGT-02). It is kept as a default: skipping is not saying it again.
  if (waiting.remembered?.length) {
    return {
      change: {
        type: "taste",
        topic,
        answer: { values: waiting.remembered, source: "default" },
      },
      says: `I will go with what I remember: ${list(labelsOf(QUESTIONS[topic], waiting.remembered)).toLowerCase()}.`,
    };
  }
  return {
    change: {
      type: "taste",
      topic,
      answer: { values: TASTE_DEFAULTS[topic], source: "default" },
    },
    says: waiting.skipSays,
  };
}

function summary(facts: TripFactsInput): string {
  const parts: string[] = [];
  if (facts.cities?.length) {
    parts.push(facts.cities.map(({ city }) => cityLabel(city)).join(", then "));
  }
  if (facts.startDate && facts.endDate) {
    parts.push(`${day(facts.startDate)} to ${day(facts.endDate)}`);
  } else if (facts.startDate) {
    parts.push(`from ${day(facts.startDate)}`);
  } else if (facts.endDate) {
    parts.push(`until ${day(facts.endDate)}`);
  }
  if (facts.lengthNights) {
    parts.push(
      count(facts.lengthNights, "night") +
        (facts.timeOfYear ? ` in ${month(facts.timeOfYear)}` : ""),
    );
  } else if (facts.timeOfYear) {
    parts.push(`in ${month(facts.timeOfYear)}`);
  }
  if (facts.adults != null) {
    parts.push(
      count(facts.adults, "adult") +
        (facts.children
          ? ` and ${count(facts.children, "child", "children")}`
          : ""),
    );
  }
  if (facts.budgetAmount != null) {
    parts.push(
      `a budget of ${facts.budgetAmount.toLocaleString("en-GB")} ${facts.budgetCurrency ?? ""} ${facts.budgetBasis === "DAY" ? "a day" : "for the trip"}`.replace(
        /\s+/g,
        " ",
      ),
    );
  }
  if (facts.datesFirmness) {
    parts.push(`dates ${facts.datesFirmness.toLowerCase()}`);
  }
  if (facts.budgetFirmness) {
    parts.push(`budget ${facts.budgetFirmness.toLowerCase()}`);
  }
  if (facts.purpose) parts.push(`the trip is for: ${facts.purpose}`);
  return parts.join("; ");
}

function facts(
  intent: Extract<Intent, { type: "facts" }>,
  { trip, cities }: DecideInput,
): Decision {
  const named = intent.cities;
  const input: TripFactsInput = Object.fromEntries(
    Object.entries(intent).filter(
      ([key]) => key !== "type" && key !== "cities",
    ),
  );
  const notes: string[] = [];

  if (named?.length) {
    // The conversation only sets the cities of a trip that has none: saving
    // them replaces the whole list, and a typed "also Kyoto" must not do that.
    if (trip.facts.cities.length > 0) {
      notes.push(
        "The cities are already set. You can change them under the facts.",
      );
    } else if (cities === "unavailable") {
      notes.push(
        "I cannot look up cities right now. Please add them under the facts.",
      );
    } else {
      const missing = named.filter((_, index) => !cities[index]);
      if (missing.length > 0) {
        notes.push(
          `I could not find ${list(missing.map((name) => `"${name}"`))}. Please pick ${missing.length > 1 ? "them" : "it"} under the facts.`,
        );
      } else {
        input.cities = cities.map((city) => ({ city: city!, nights: null }));
        if (cities.length > 1) {
          notes.push("Set the nights in each city under the facts.");
        }
      }
    }
  }

  if (input.budgetAmount != null) {
    if (!(input.budgetCurrency ?? trip.facts.budgetCurrency)) {
      delete input.budgetAmount;
      delete input.budgetBasis;
      notes.push("Which currency is that budget in?");
    } else {
      input.budgetBasis ??= trip.facts.budgetBasis ?? "TRIP";
    }
  }

  // A save names only some facts, so the dates are checked against the ones
  // the trip already has.
  const start = input.startDate ?? trip.facts.startDate;
  const end = input.endDate ?? trip.facts.endDate;
  if ((input.startDate || input.endDate) && start && end && end < start) {
    delete input.startDate;
    delete input.endDate;
    notes.push(
      "Those dates would end the trip before it starts. Please give me both dates.",
    );
  }

  if (Object.keys(input).length === 0) {
    return nothing(notes.join(" ") || "I did not find a fact in that.");
  }
  const checked = tripFactsSchema.safeParse(input);
  if (!checked.success) {
    return nothing(
      `That does not fit: ${checked.error.issues[0].message} You can set it under the facts.`,
    );
  }
  return {
    change: { type: "facts", facts: checked.data },
    says: [`Got it: ${summary(checked.data)}.`, ...notes].join(" "),
  };
}

function commitment(intent: Extract<Intent, { type: "commitment" }>): Decision {
  // The schema drops the intent's own "type" field.
  const checked = commitmentInputSchema.safeParse(intent);
  if (!checked.success) {
    return nothing(
      `I could not add that: ${checked.error.issues[0].message} You can add it under Already decided.`,
    );
  }
  const { title, date, startTime } = checked.data;
  return {
    change: { type: "commitment", commitment: checked.data },
    says:
      `Added to what is already decided: ${title}` +
      (date ? ` on ${day(date)}` : "") +
      (startTime ? ` at ${startTime}` : "") +
      "." +
      (date ? "" : " It has no day yet. Set one under Already decided."),
  };
}

function goTo(
  intent: Extract<Intent, { type: "go_to" }>,
  days: PlanDay[],
): Decision {
  if (days.length === 0) {
    return nothing(
      "I cannot lay out the days yet. I need to know where you are going and when.",
    );
  }
  const wanted = days.find((item) => item.day === intent.day);
  if (!wanted) return nothing(`This trip has ${count(days.length, "day")}.`);
  const slots = wanted.entries.filter(
    (entry) => entry.type === "open" || entry.type === "place",
  );
  const slot =
    (intent.part && slots.find((entry) => entry.kind === intent.part)) ||
    slots.find((entry) => entry.type === "open") ||
    slots[0];
  if (!slot) return nothing(`Day ${wanted.day} has no slot to fill.`);
  return {
    change: { type: "go_to", slotId: slot.slotId },
    says: `Day ${wanted.day} it is${intent.part ? `, ${intent.part}` : ""}.`,
  };
}

export function decide(input: DecideInput): Decision {
  const { intent, waiting, trip, limited } = input;
  switch (intent.type) {
    case "skip":
      return skip(waiting);
    case "taste":
      return {
        change: {
          type: "taste",
          topic: intent.topic,
          answer: { values: intent.values, source: "told" },
        },
        says:
          `Noted: ${list(labelsOf(QUESTIONS[intent.topic], intent.values)).toLowerCase()}.` +
          (intent.topic === "stay" ? stayNote(trip) : ""),
      };
    case "facts":
      return facts(intent, input);
    case "commitment":
      return commitment(intent);
    case "go_to":
      return goTo(intent, input.days);
    case "none": {
      const ways = waiting
        ? "You can tap a choice, type a short answer, or skip the question."
        : "You can change the facts, what is already decided and the plan on this page.";
      return nothing(
        limited
          ? `I am in a limited mode and can only read simple answers. ${ways}`
          : `I did not catch that. ${waiting ? ways : "You can tell me a fact about the trip, something you have booked, or a day to work on."}`,
      );
    }
  }
}

const NOT_DIFFERENT =
  /^(no|nope|not really|it is not|it isn'?t|same as usual|as usual|just this once|ordinary)\b/i;

/**
 * What an answer to "is this trip different?" leads to (TB-AGT-12). A tapped
 * choice is a purpose or "no"; typed words are the traveller's own reason. A
 * skip, or a plain no, leaves it an ordinary trip. Null when a tapped value
 * is not one of the choices.
 */
export function decideDifference(
  question: Question,
  answer:
    | { type: "answer"; values: string[] }
    | { type: "skip" }
    | { type: "say"; text: string },
): (Decision & { said: string }) | null {
  let because: string | null;
  let said: string;
  if (answer.type === "skip") {
    because = null;
    said = "Skip";
  } else if (answer.type === "say") {
    const text = answer.text.trim();
    because = NOT_DIFFERENT.test(text) ? null : text.slice(0, 120);
    said = text;
  } else {
    const choice = question.choices.find(
      (item) => item.value === answer.values[0],
    );
    if (!choice) return null;
    because = choice.value === "ordinary" ? null : choice.value;
    said = choice.label;
  }
  return {
    said,
    change: { type: "difference", because },
    says:
      because === null
        ? "Understood. I will treat it as an ordinary trip."
        : "Understood: this trip is different. I will plan it your way, and I will not take it as your usual.",
  };
}

/** The script's state once a change is made, to see whether a topic became ready. */
export function stateAfter(state: ScriptState, change: Change): ScriptState {
  switch (change?.type) {
    case "facts":
      return {
        ...state,
        facts: { ...state.facts, ...change.facts } as TripFacts,
      };
    case "taste":
      return {
        ...state,
        profile: {
          ...state.profile,
          taste: { ...state.profile.taste, [change.topic]: change.answer },
        },
      };
    case "skip_fact":
      return {
        ...state,
        profile: {
          ...state.profile,
          skippedFacts: [...state.profile.skippedFacts, change.topic],
        },
      };
    case "commitment":
      return {
        ...state,
        commitments: {
          ...state.commitments,
          count: state.commitments.count + 1,
        },
      };
    case "difference":
      return { ...state, differs: change.because !== null };
    default:
      return state;
  }
}

/** What the agent says when a topic becomes ready, or what it still needs (PRD 7.4). */
export function readinessNote(
  before: Readiness,
  after: Readiness,
  change: Change,
): string {
  if (!before.sights && after.sights) {
    return "I know enough to start suggesting places for your days.";
  }
  if (!before.meals && after.meals) {
    return "I think I know enough to suggest places to eat.";
  }
  if (!after.sights && change?.type === "facts") {
    return `Before I can suggest places I still need ${list(after.needs)}.`;
  }
  return "";
}

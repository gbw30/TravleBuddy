import {
  computed,
  fillAll,
  fixedSentence,
  fromTraveller,
  sentence,
  type Fact,
  type Sentence,
} from "@/lib/wording";
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
import { PREVIOUS } from "./conversation-store";
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
  /** Yes to an offer: these go into the personal profile (TB-MEM-07). */
  | { type: "remember"; texts: string[]; hard: boolean }
  | null;

export type Decision = {
  change: Change;
  /** What the agent says back: the filled sentences. */
  says: string;
  /** The named templates `says` is made of, with the facts in their gaps. */
  sentences: Sentence[];
  /**
   * Something worth remembering for every trip. The agent asks, and it is
   * saved only when the traveller says yes (TB-MEM-07).
   */
  offer?: { texts: string[]; hard: boolean };
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
  /** The dietary rules the personal profile already holds. */
  knownRules?: string[];
};

/** A value the traveller gave in the message this turn answers. */
const told = (gap: string, value: string): Fact =>
  fromTraveller(gap, value, PREVIOUS);
/** An answer saved to the trip's taste. */
const tasteOf = (gap: string, value: string, topic: string): Fact =>
  fromTraveller(gap, value, `trip-taste:${topic}`);
const reply = (...sentences: Sentence[]) => ({
  says: fillAll(sentences),
  sentences,
});
// Refusals, questions, instructions that name a label and the traveller's own
// words are never reworded: they are fixed sentences. Acknowledgements are free.
/** A sentence with no fact in it, shown word for word. */
const fixed = (template: string, text: string) => fixedSentence(template, text);
const problem = (template: string, text: string, why: string, issue: string) =>
  fixedSentence(template, text, [
    computed("reason", why, "validation", { issue }),
  ]);

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

function stayNote(trip: Trip): Sentence[] {
  const open = nightsWithoutStay(trip);
  if (open === null) return [];
  return open === 0
    ? [sentence("stay-all-booked", "Every night has a booked stay.")]
    : [
        sentence("stay-nights-open", "{nights} no booked stay yet.", [
          computed(
            "nights",
            count(open, "night has", "nights have"),
            "nights-without-stay",
            { open },
          ),
        ]),
        fixed(
          "stay-add",
          "Add a stay under Already decided when you book one.",
        ),
      ];
}

const nothing = (...sentences: Sentence[]): Decision => ({
  change: null,
  ...reply(...sentences),
});

function skip(waiting: Question | null): Decision {
  if (!waiting) {
    return nothing(
      fixed("skip-none", "There is no question waiting just now."),
    );
  }
  // The question's own words for a skip are fixed text.
  const skipped = fixed(`skip-${waiting.topic}`, waiting.skipSays);
  if (waiting.stage === "facts") {
    return {
      change: { type: "skip_fact", topic: waiting.topic as FactTopic },
      ...reply(skipped),
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
      ...reply(
        sentence(
          "skip-remembered",
          "I will go with what I remember: {answers}.",
          [
            tasteOf(
              "answers",
              list(
                labelsOf(QUESTIONS[topic], waiting.remembered),
              ).toLowerCase(),
              topic,
            ),
          ],
        ),
      ),
    };
  }
  return {
    change: {
      type: "taste",
      topic,
      answer: { values: TASTE_DEFAULTS[topic], source: "default" },
    },
    ...reply(skipped),
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
  const notes: Sentence[] = [];

  if (named?.length) {
    // The conversation only sets the cities of a trip that has none: saving
    // them replaces the whole list, and a typed "also Kyoto" must not do that.
    if (trip.facts.cities.length > 0) {
      notes.push(
        fixed(
          "facts-cities-set",
          "The cities are already set. You can change them under the facts.",
        ),
      );
    } else if (cities === "unavailable") {
      notes.push(
        fixed(
          "facts-cities-unavailable",
          "I cannot look up cities right now. Please add them under the facts.",
        ),
      );
    } else {
      const missing = named.filter((_, index) => !cities[index]);
      if (missing.length > 0) {
        notes.push(
          fixedSentence(
            "facts-cities-not-found",
            "I could not find {names}. Please pick {them} under the facts.",
            [
              told("names", list(missing.map((name) => `"${name}"`))),
              computed("them", missing.length > 1 ? "them" : "it", "plural", {
                count: missing.length,
              }),
            ],
          ),
        );
      } else {
        input.cities = cities.map((city) => ({ city: city!, nights: null }));
        if (cities.length > 1) {
          notes.push(
            fixed(
              "facts-cities-nights",
              "Set the nights in each city under the facts.",
            ),
          );
        }
      }
    }
  }

  if (input.budgetAmount != null) {
    if (!(input.budgetCurrency ?? trip.facts.budgetCurrency)) {
      delete input.budgetAmount;
      delete input.budgetBasis;
      notes.push(fixed("facts-currency", "Which currency is that budget in?"));
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
      fixed(
        "facts-dates-backwards",
        "Those dates would end the trip before it starts. Please give me both dates.",
      ),
    );
  }

  if (Object.keys(input).length === 0) {
    return nothing(
      ...(notes.length > 0
        ? notes
        : [fixed("facts-none", "I did not find a fact in that.")]),
    );
  }
  const checked = tripFactsSchema.safeParse(input);
  if (!checked.success) {
    const [issue] = checked.error.issues;
    return nothing(
      problem(
        "facts-invalid",
        "That does not fit: {reason} You can set it under the facts.",
        issue.message,
        issue.path.join("."),
      ),
    );
  }
  return {
    change: { type: "facts", facts: checked.data },
    ...reply(
      sentence("facts-saved", "Got it: {summary}.", [
        told("summary", summary(checked.data)),
      ]),
      ...notes,
    ),
  };
}

function commitment(intent: Extract<Intent, { type: "commitment" }>): Decision {
  // The schema drops the intent's own "type" field.
  const checked = commitmentInputSchema.safeParse(intent);
  if (!checked.success) {
    const [issue] = checked.error.issues;
    return nothing(
      problem(
        "commitment-invalid",
        "I could not add that: {reason} You can add it under Already decided.",
        issue.message,
        issue.path.join("."),
      ),
    );
  }
  const { title, date, startTime } = checked.data;
  return {
    change: { type: "commitment", commitment: checked.data },
    ...reply(
      sentence(
        `commitment-added${date ? "-day" : ""}${startTime ? "-time" : ""}`,
        `Added to what is already decided: {title}${date ? " on {day}" : ""}${startTime ? " at {time}" : ""}.`,
        [
          told("title", title),
          ...(date ? [told("day", day(date))] : []),
          ...(startTime ? [told("time", startTime)] : []),
        ],
      ),
      ...(date
        ? []
        : [
            fixed(
              "commitment-no-day",
              "It has no day yet. Set one under Already decided.",
            ),
          ]),
    ),
  };
}

function goTo(
  intent: Extract<Intent, { type: "go_to" }>,
  days: PlanDay[],
): Decision {
  if (days.length === 0) {
    return nothing(
      fixed(
        "go-to-no-days",
        "I cannot lay out the days yet. I need to know where you are going and when.",
      ),
    );
  }
  const wanted = days.find((item) => item.day === intent.day);
  if (!wanted) {
    return nothing(
      fixedSentence("go-to-no-such-day", "This trip has {days}.", [
        computed("days", count(days.length, "day"), "days-in-plan", {
          days: days.length,
        }),
      ]),
    );
  }
  const slots = wanted.entries.filter(
    (entry) => entry.type === "open" || entry.type === "place",
  );
  const slot =
    (intent.part && slots.find((entry) => entry.kind === intent.part)) ||
    slots.find((entry) => entry.type === "open") ||
    slots[0];
  const dayFact = computed("day", String(wanted.day), "day-of-plan", {
    day: wanted.day,
  });
  if (!slot) {
    return nothing(
      fixedSentence("go-to-full", "Day {day} has no slot to fill.", [dayFact]),
    );
  }
  return {
    change: { type: "go_to", slotId: slot.slotId },
    ...reply(
      intent.part
        ? sentence("go-to-part", "Day {day} it is, {part}.", [
            dayFact,
            told("part", intent.part),
          ])
        : sentence("go-to", "Day {day} it is.", [dayFact]),
    ),
  };
}

export function decide(input: DecideInput): Decision {
  const { intent, waiting, trip, limited } = input;
  switch (intent.type) {
    case "skip":
      return skip(waiting);
    case "taste": {
      // A dietary rule given for one trip is offered for every trip, unless
      // the personal profile already holds it.
      const rules =
        intent.topic === "food"
          ? intent.values.filter(
              (value) =>
                value !== "none" && !(input.knownRules ?? []).includes(value),
            )
          : [];
      return {
        change: {
          type: "taste",
          topic: intent.topic,
          answer: { values: intent.values, source: "told" },
        },
        ...reply(
          sentence("taste-noted", "Noted: {answers}.", [
            tasteOf(
              "answers",
              list(
                labelsOf(QUESTIONS[intent.topic], intent.values),
              ).toLowerCase(),
              intent.topic,
            ),
          ]),
          ...(intent.topic === "stay" ? stayNote(trip) : []),
        ),
        ...(rules.length > 0
          ? {
              offer: { texts: labelsOf(QUESTIONS.food, rules), hard: true },
            }
          : {}),
      };
    }
    case "statement":
      return {
        change: null,
        ...reply(
          fixedSentence("statement-said", "You said: “{text}”.", [
            told("text", intent.text),
          ]),
        ),
        offer: { texts: [intent.text], hard: intent.rule ?? false },
      };
    case "facts":
      return facts(intent, input);
    case "commitment":
      return commitment(intent);
    case "go_to":
      return goTo(intent, input.days);
    case "none": {
      const ways = waiting
        ? fixed(
            "ways-waiting",
            "You can tap a choice, type a short answer, or skip the question.",
          )
        : fixed(
            "ways-free",
            "You can change the facts, what is already decided and the plan on this page.",
          );
      if (limited) {
        return nothing(
          fixed(
            "limited-mode",
            "I am in a limited mode and can only read simple answers.",
          ),
          ways,
        );
      }
      return nothing(
        fixed("not-understood", "I did not catch that."),
        waiting
          ? ways
          : fixed(
              "ways-tell",
              "You can tell me a fact about the trip, something you have booked, or a day to work on.",
            ),
      );
    }
  }
}

/** The question that goes with an offer, said last in the agent's reply. */
export const OFFER_ASKS = "Should I remember that for every trip?";
export const OFFER_ASK = fixed("offer-ask", OFFER_ASKS);

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
    ...reply(
      because === null
        ? fixed(
            "difference-ordinary",
            "Understood. I will treat it as an ordinary trip.",
          )
        : fixed(
            "difference-different",
            "Understood: this trip is different. I will plan it your way, and I will not take it as your usual.",
          ),
    ),
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
): Sentence[] {
  if (!before.sights && after.sights) {
    return [
      sentence(
        "ready-sights",
        "I know enough to start suggesting places for your days.",
      ),
    ];
  }
  if (!before.meals && after.meals) {
    return [
      sentence(
        "ready-meals",
        "I think I know enough to suggest places to eat.",
      ),
    ];
  }
  if (!after.sights && change?.type === "facts") {
    return [
      sentence(
        "needs-more",
        "Before I can suggest places I still need {needs}.",
        [
          computed("needs", list(after.needs), "readiness", {
            needs: after.needs.join(","),
          }),
        ],
      ),
    ];
  }
  return [];
}

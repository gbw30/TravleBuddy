import { z } from "zod";

import { allowedValues, QUESTIONS } from "@/features/conversation";
import type { TasteInUse } from "@/features/memory";
import {
  fileUnder,
  MULTI_TOPICS,
  sourceWords,
  TASTE_TOPICS,
  TOPIC_NAMES,
  type ProfileEntry,
  type ProfileTopicInfo,
  type TasteTopic,
} from "@/features/memory/contracts";
import {
  tripFactsSchema,
  type TripDetail,
  type TripFacts,
} from "@/features/trips/contracts";

import {
  BRIEF_STEPS,
  step1Problems,
  type BriefAnswer,
  type BriefSaid,
  type BriefSave,
  type BriefView,
} from "./brief-view";

// The trip brief of Quick plan (PRD 11). It stores nothing of its own: its
// answers are the trip's facts and fixed commitments (Trips), and its taste
// (Memory), with the words for each choice from the conversation's script.
// That is why the conversation knows everything entered here (TB-QPL-12).

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

/** The "Your style" answers, each with the value in use and where it comes from. */
function styleOf(taste: TasteInUse): BriefAnswer[] {
  return TASTE_TOPICS.map((topic) => {
    const question = QUESTIONS[topic];
    const inUse = taste[topic];
    // The trip a learned memory comes from is named; a stated one says so.
    const remembered =
      inUse?.entries.find((entry) => entry.source.type === "trip") ??
      inUse?.entries[0];
    return {
      topic,
      name: TOPIC_NAMES[topic],
      several: MULTI_TOPICS.includes(topic),
      choices: question.choices,
      values: inUse?.values ?? [],
      from: inUse?.from ?? "none",
      source:
        inUse?.from === "profile" && remembered
          ? sourceWords(remembered.source)
          : null,
      assumes: question.skipSays,
    };
  });
}

function whereAndWhen(facts: TripFacts): string[] {
  const lines: string[] = [];
  if (facts.cities.length > 0) {
    lines.push(
      `${facts.cities
        .map(
          ({ city, nights }) =>
            city.name + (nights ? ` for ${count(nights, "night")}` : ""),
        )
        .join(", then ")}.`,
    );
  }
  if (facts.startDate && facts.endDate) {
    lines.push(`From ${day(facts.startDate)} to ${day(facts.endDate)}.`);
  } else if (facts.startDate) {
    lines.push(`From ${day(facts.startDate)}.`);
  } else if (facts.lengthNights && facts.timeOfYear) {
    lines.push(
      `About ${count(facts.lengthNights, "night")} in ${month(facts.timeOfYear)}.`,
    );
  }
  if (facts.adults) {
    lines.push(
      `${count(facts.adults, "adult")}${
        facts.children
          ? ` and ${count(facts.children, "child", "children")}`
          : ""
      }.`,
    );
  }
  return lines;
}

function thisTrip(facts: TripFacts): string[] {
  const firm = (value: string | null) =>
    value === "FLEXIBLE" ? "can move" : "fixed";
  return [
    facts.purpose
      ? `The trip is for: ${facts.purpose}.`
      : "No purpose given: I will plan it as a holiday.",
    facts.budgetAmount && facts.budgetCurrency
      ? `A budget of ${facts.budgetAmount.toLocaleString("en-GB")} ${facts.budgetCurrency} ${
          facts.budgetBasis === "DAY" ? "a day" : "for the trip"
        }${facts.budgetFirmness ? `, ${facts.budgetFirmness === "FLEXIBLE" ? "which can stretch" : "which is fixed"}` : ""}.`
      : "No budget given: I will leave costs for you to judge.",
    facts.datesFirmness
      ? `The dates ${firm(facts.datesFirmness) === "fixed" ? "are fixed" : "can move"}.`
      : "I will treat the dates as fixed.",
  ];
}

function styleLines(style: BriefAnswer[]): string[] {
  return style.map((answer) => {
    if (answer.from === "none" || answer.from === "default") {
      return `${answer.name}: ${answer.assumes}`;
    }
    const each = answer.values.map(
      (value) =>
        answer.choices
          .find((choice) => choice.value === value)
          ?.label.toLowerCase() ?? value,
    );
    // "museums and exhibitions and views" would read as three things.
    const labels = each.some((label) => label.includes(" and "))
      ? each.join("; ")
      : list(each);
    return `${answer.name}: ${labels}${answer.source ? ` (${answer.source})` : ""}.`;
  });
}

const styleSchema = z
  .partialRecord(z.enum(TASTE_TOPICS), z.array(z.string()).max(8))
  .refine(
    (style) =>
      TASTE_TOPICS.every((topic) => {
        const values = style[topic] ?? [];
        return (
          values.every((value) => allowedValues(topic).includes(value)) &&
          new Set(values).size === values.length &&
          (values.length <= 1 || MULTI_TOPICS.includes(topic))
        );
      }),
    { message: "An answer is not one of its question's choices." },
  );

/** What one save of the brief may carry. */
export const briefSaveSchema = z.object({
  facts: tripFactsSchema.optional(),
  style: styleSchema.optional(),
  said: z.string().max(600).nullable().optional(),
}) satisfies z.ZodType<BriefSave>;

/** What free words may name for a trip: each taste topic's own choices. */
const SAYABLE: ProfileTopicInfo[] = TASTE_TOPICS.map((topic) => ({
  topic,
  name: TOPIC_NAMES[topic],
  kind: "taste",
  several: MULTI_TOPICS.includes(topic),
  // "No restrictions" is the absence of a rule, not something to file.
  choices: QUESTIONS[topic].choices.filter((choice) => choice.value !== "none"),
  freeText: false,
}));

/**
 * Reads the "anything else" box by the rule of the profile page. A sentence
 * is understood only when all of it plainly names answers: "museums and
 * markets" is two interests, "no museums and markets" is kept as said,
 * because reading half of it would say the opposite of what was meant.
 */
export function readSaid(
  typed: string | null,
  taste: TasteInUse,
): BriefSaid | null {
  const text = typed?.trim();
  if (!text) return null;
  const said: BriefSaid = { text, understood: [], unused: [], allergies: [] };
  const sentences = text
    .split(/[.;!?\n]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  for (const sentence of sentences) {
    const whole = fileUnder(sentence, false, SAYABLE);
    const parts =
      whole.type === "entry"
        ? [whole]
        : sentence
            .split(/,|&|\band\b/i)
            .filter((part) => part.trim())
            .map((part) => fileUnder(part, false, SAYABLE));
    if (parts.length === 0 || parts.some((part) => part.type !== "entry")) {
      said.unused.push(sentence);
      continue;
    }
    for (const part of parts) {
      if (part.type !== "entry") continue;
      if (part.topic === "allergies") {
        if (!said.allergies.includes(part.value))
          said.allergies.push(part.value);
        continue;
      }
      const topic = part.topic as TasteTopic;
      if (
        said.understood.some(
          (item) => item.topic === topic && item.value === part.value,
        )
      ) {
        continue;
      }
      said.understood.push({
        topic,
        name: TOPIC_NAMES[topic],
        value: part.value,
        label:
          QUESTIONS[topic].choices.find((choice) => choice.value === part.value)
            ?.label ?? part.value,
        inUse: taste[topic]?.values.includes(part.value) ?? false,
      });
    }
  }
  return said;
}

/**
 * The brief of a trip: its facts and commitments, its style with the source
 * of each answer, the review in plain sentences, and what is still wrong
 * with step 1. Pure.
 */
export function briefOf(
  trip: TripDetail,
  taste: TasteInUse,
  personal: ProfileEntry[],
  /** The "anything else" box as saved. */
  typed: string | null = null,
): BriefView {
  const style = styleOf(taste);
  const problems = step1Problems(trip.facts);
  const decided = trip.commitments.map((item) => item.title);
  return {
    tripId: trip.id,
    revision: trip.revision,
    title: trip.title,
    facts: trip.facts,
    commitments: trip.commitments,
    clashes: trip.clashes,
    style,
    allergies: personal
      .filter((entry) => entry.topic === "allergies")
      .map((entry) => entry.value),
    said: readSaid(typed, taste),
    review: [
      { step: 1, title: BRIEF_STEPS[0], lines: whereAndWhen(trip.facts) },
      {
        step: 2,
        title: BRIEF_STEPS[1],
        lines: [
          decided.length === 0
            ? "Nothing is decided yet."
            : `${count(decided.length, "thing is", "things are")} already decided: ${list(
                decided.slice(0, 5),
              )}${decided.length > 5 ? `, and ${decided.length - 5} more` : ""}.`,
        ],
      },
      { step: 3, title: BRIEF_STEPS[2], lines: thisTrip(trip.facts) },
      { step: 4, title: BRIEF_STEPS[3], lines: styleLines(style) },
    ],
    problems,
    canBuild: problems.length === 0,
  };
}

// The trip brief of Quick plan (PRD 11) as the screen sees it, and the
// checks on its first step. Safe to import in the browser: this file imports
// only contracts.
import type { DailyBudget, TasteTopic } from "@/features/memory/contracts";
import type {
  Clash,
  CommitmentDto,
  TripFacts,
  TripFactsInput,
} from "@/features/trips/contracts";

export const BRIEF_STEPS = [
  "Where and when",
  "Already decided",
  "This trip",
  "Your style",
  "Review",
] as const;

/** One answer of the "Your style" step, with where it comes from (TB-QPL-03). */
export type BriefAnswer = {
  topic: TasteTopic;
  name: string;
  /** The question, as the agent asks it in conversation. */
  asks: string;
  /** Whether the topic holds several values at once. */
  several: boolean;
  choices: { value: string; label: string }[];
  /** The answer in use for this trip. Empty when nothing is known. */
  values: string[];
  /**
   * "trip": said for this trip. "profile": filled in from the personal
   * profile. "default": a skipped question. "none": not answered yet.
   */
  from: "trip" | "profile" | "default" | "none";
  /** For a remembered answer: "from your trip “Tokyo, May 2027”" or "you told me". */
  source: string | null;
  /** What the agent will assume when the answer is left empty. */
  assumes: string;
};

/** A problem with an answer of step 1, said beside the field it is about (TB-QPL-05). */
export type BriefProblem = {
  field: "cities" | "nights" | "dates" | "who";
  message: string;
};

/**
 * What the traveller typed under "anything else", and what the site makes of
 * it. A part is used only once the traveller confirms it (TB-QPL-06).
 */
export type BriefSaid = {
  /** The words as typed. */
  text: string;
  /** Sentences that plainly name answers. `inUse` once the trip goes by it. */
  understood: {
    topic: TasteTopic;
    name: string;
    value: string;
    label: string;
    inUse: boolean;
  }[];
  /** Sentences kept as said. They affect nothing. */
  unused: string[];
  /** Allergies named here. They hold for every trip, so the profile page sets them. */
  allergies: string[];
};

/** One save of the brief. A part left out is not changed. */
export type BriefSave = {
  facts?: TripFactsInput;
  /** Per topic, the values for this trip. An empty list takes the trip's own answer away. */
  style?: Partial<Record<TasteTopic, string[]>>;
  /** The "anything else" box as typed. Null or empty forgets it. */
  said?: string | null;
};

export type BriefView = {
  tripId: string;
  revision: number;
  title: string;
  /** An archived trip refuses changes, so its brief cannot be filled in. */
  archived: boolean;
  facts: TripFacts;
  commitments: CommitmentDto[];
  clashes: Clash[];
  style: BriefAnswer[];
  /** Allergies from the personal profile: hard limits, changed on the profile page. */
  allergies: string[];
  /**
   * The usual daily budget from the personal profile, when this trip has no
   * budget of its own. The brief fills it in, labelled with its source.
   */
  rememberedBudget: (DailyBudget & { source: string }) | null;
  /** The "anything else" box; null when it is empty. */
  said: BriefSaid | null;
  /** The whole brief in plain sentences, one part per step (TB-QPL-07). */
  review: { step: number; title: string; lines: string[] }[];
  problems: BriefProblem[];
  /** Only the first step is required (TB-QPL-02). */
  canBuild: boolean;
};

/**
 * What is wrong with the first step, in plain words. They are the same
 * things the itinerary needs before it can lay out the days: where, for how
 * long in each place, when, and who.
 */
export function step1Problems(facts: TripFacts): BriefProblem[] {
  const problems: BriefProblem[] = [];
  const { cities, startDate, endDate, lengthNights, timeOfYear } = facts;

  if (cities.length === 0) {
    problems.push({ field: "cities", message: "Add at least one city." });
  }
  const unset = cities.filter((entry) => entry.nights === null);
  if (cities.length > 1 && unset.length > 0) {
    problems.push({
      field: "nights",
      message: `Say how many nights you spend in ${unset.map((entry) => entry.city.name).join(" and ")}.`,
    });
  }

  if (startDate && endDate && endDate < startDate) {
    problems.push({
      field: "dates",
      message: "The trip ends before it starts.",
    });
  } else if (!startDate && !(lengthNights && timeOfYear)) {
    problems.push({
      field: "dates",
      message: "Give the dates, or a length and a rough time of year.",
    });
  } else if (
    startDate &&
    !endDate &&
    !lengthNights &&
    cities.length === 1 &&
    cities[0].nights === null
  ) {
    problems.push({
      field: "dates",
      message: "Give the end date, or how many nights.",
    });
  }

  if (!facts.adults) {
    problems.push({
      field: "who",
      message: "Say how many of you are travelling.",
    });
  }
  return problems;
}

/** The facts that differ from the saved ones: a save names only these. */
export function changedFacts(
  saved: TripFacts,
  draft: TripFacts,
): TripFactsInput {
  const changed: Record<string, unknown> = {};
  for (const key of Object.keys(draft) as (keyof TripFacts)[]) {
    if (JSON.stringify(draft[key]) !== JSON.stringify(saved[key])) {
      changed[key] = draft[key];
    }
  }
  return changed as TripFactsInput;
}

/**
 * A style answer after a chip is pressed. A topic that holds one value
 * swaps it; pressing the chosen value again takes the answer away. "No
 * restrictions" and a food rule cannot both be chosen.
 */
export function toggleStyle(
  answer: Pick<BriefAnswer, "several">,
  selected: string[],
  value: string,
): string[] {
  if (selected.includes(value))
    return selected.filter((item) => item !== value);
  if (!answer.several || value === "none") return [value];
  return [...selected.filter((item) => item !== "none"), value];
}

/**
 * The step the brief opens at, counted from 0. The review when step 1 is
 * complete, unless the address names another step; step 1 otherwise.
 */
export function openingStep(
  brief: Pick<BriefView, "canBuild">,
  asked?: string,
): number {
  if (!brief.canBuild) return 0;
  const step = Number(asked);
  return Number.isInteger(step) && step >= 1 && step <= BRIEF_STEPS.length
    ? step - 1
    : BRIEF_STEPS.length - 1;
}

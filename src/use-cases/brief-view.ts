// The trip brief of Quick plan (PRD 11) as the screen sees it, and the
// checks on its first step. Safe to import in the browser: this file imports
// only contracts.
import type { TasteTopic } from "@/features/memory/contracts";
import type {
  Clash,
  CommitmentDto,
  TripFacts,
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

export type BriefView = {
  tripId: string;
  revision: number;
  title: string;
  facts: TripFacts;
  commitments: CommitmentDto[];
  clashes: Clash[];
  style: BriefAnswer[];
  /** Allergies from the personal profile: hard limits, changed on the profile page. */
  allergies: string[];
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

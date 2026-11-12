import type { ProfileEntry } from "./sample-home";

export type Brief = {
  cities: { name: string; nights: number }[];
  startDate: string | null;
  endDate: string | null;
  travellers: number;
  children: number;
  purpose: string | null;
  budget: number | null;
  currency: string;
  datesFirm: boolean | null;
  budgetFirm: boolean | null;
  pace: "packed" | "balanced" | "relaxed" | null;
  interests: string[];
  food: string[];
  gettingAround: string | null;
  stay: string | null;
  anythingElse: string;
};

export const BRIEF_STEPS = [
  "Where and when",
  "Already decided",
  "This trip",
  "Your style",
  "Review",
] as const;

export function emptyBrief(): Brief {
  return {
    cities: [{ name: "", nights: 1 }],
    startDate: null,
    endDate: null,
    travellers: 1,
    children: 0,
    purpose: null,
    budget: null,
    currency: "USD",
    datesFirm: null,
    budgetFirm: null,
    pace: null,
    interests: [],
    food: [],
    gettingAround: null,
    stay: null,
    anythingElse: "",
  };
}

export function validateBrief(
  brief: Brief,
): Partial<Record<keyof Brief, string>> {
  const errors: Partial<Record<keyof Brief, string>> = {};
  if (brief.startDate && brief.endDate && brief.endDate < brief.startDate) {
    errors.endDate = "The end date is before the start date.";
  }
  if (brief.travellers < 1) {
    errors.travellers = "At least one traveller is needed.";
  }
  if (brief.cities.some((city) => city.nights < 1)) {
    errors.cities = "Each city needs at least one night.";
  }
  return errors;
}

/** Only the first step is required (PRD 11.1). */
export function canBuild(brief: Brief): boolean {
  return (
    brief.cities.some((city) => city.name.trim() !== "") &&
    brief.startDate !== null &&
    Object.keys(validateBrief(brief)).length === 0
  );
}

const assumed = "I'll use your profile or a sensible default.";
const list = (label: string, values: string[]) =>
  `${label}: ${values.length > 0 ? `${values.join(", ")}.` : assumed}`;

/** The brief in plain sentences, grouped by the step that edits each part. */
export function briefSections(
  brief: Brief,
): { step: number; lines: string[] }[] {
  const plural = (n: number, word: string) =>
    `${n} ${word}${n === 1 ? "" : "s"}`;
  return [
    {
      step: 0,
      lines: [
        ...brief.cities
          .filter((city) => city.name.trim() !== "")
          .map(
            (city) => `${plural(city.nights, "night")} in ${city.name.trim()}.`,
          ),
        ...(brief.startDate
          ? [
              `Starting on ${brief.startDate}${brief.endDate ? `, leaving on ${brief.endDate}` : ""}.`,
            ]
          : []),
        `${plural(brief.travellers, "traveller")}${brief.children > 0 ? `, including ${brief.children} ${brief.children === 1 ? "child" : "children"}` : ""}.`,
      ],
    },
    {
      step: 2,
      lines: [
        `Purpose: ${brief.purpose ? `${brief.purpose}.` : "not given, so I'll plan an ordinary holiday."}`,
        `Budget: ${brief.budget ? `${brief.budget} ${brief.currency}${brief.budgetFirm === false ? ", and it can stretch" : ""}.` : assumed}`,
        ...(brief.datesFirm === null
          ? []
          : [`Your dates ${brief.datesFirm ? "are fixed" : "can move"}.`]),
      ],
    },
    {
      step: 3,
      lines: [
        `Pace: ${brief.pace ? `${brief.pace}.` : assumed}`,
        list("Interests", brief.interests),
        list("Food", brief.food),
        list(
          "Getting around",
          brief.gettingAround ? [brief.gettingAround] : [],
        ),
        list("Where to stay", brief.stay ? [brief.stay] : []),
      ],
    },
  ];
}

export function briefSummary(brief: Brief): string[] {
  return briefSections(brief).flatMap((section) => section.lines);
}

/** Fills only unanswered parts, and reports where each filled answer came from. */
export function prefillFromProfile(
  brief: Brief,
  entries: ProfileEntry[],
): { brief: Brief; sources: Partial<Record<keyof Brief, string>> } {
  const next = { ...brief };
  const sources: Partial<Record<keyof Brief, string>> = {};
  const first = (topic: ProfileEntry["topic"]) =>
    entries.find((entry) => entry.topic === topic);

  const pace = first("pace");
  if (
    next.pace === null &&
    pace &&
    (pace.value === "packed" ||
      pace.value === "balanced" ||
      pace.value === "relaxed")
  ) {
    next.pace = pace.value;
    sources.pace = pace.source;
  }
  const food = entries.filter((entry) => entry.topic === "food");
  if (next.food.length === 0 && food.length > 0) {
    next.food = food.map((entry) => entry.value);
    sources.food = food[0].source;
  }
  const around = first("getting around");
  if (next.gettingAround === null && around) {
    next.gettingAround = around.value;
    sources.gettingAround = around.source;
  }
  const stay = first("stay");
  if (next.stay === null && stay) {
    next.stay = stay.value;
    sources.stay = stay.source;
  }
  return { brief: next, sources };
}

import { CURRENCIES } from "@/lib/currency";

import {
  FACT_TOPICS,
  type FactTopic,
  type Intent,
  type Question,
  type TasteTopic,
} from "./contracts";

// Reads a typed answer by simple rules, with no AI model (PRD 7.7). It knows
// only the question that was asked: numbers, dates, the question's choices,
// and a few plain phrases. Anything else is "none", and the agent says so.

const NONE: Intent = { type: "none" };
const numberWords: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  no: 0,
  zero: 0,
};
const months = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const symbols: Record<string, (typeof CURRENCIES)[number]> = {
  "¥": "JPY",
  $: "USD",
  "€": "EUR",
  "£": "GBP",
};
const SKIP =
  /^(skip|pass|no idea|not sure|don'?t know|i don'?t know|whatever|you choose)\.?$/;

const count = (word: string) =>
  /^\d+$/.test(word) ? Number(word) : numberWords[word];

/** A date written as 2027-05-10, 10 May 2027 or May 10, 2027. */
function readDate(text: string): string | null {
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  const worded =
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?,?\s+(\d{4})\b/.exec(text) ??
    /\b([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/.exec(text);
  let year: number, month: number, day: number;
  if (iso) {
    [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (worded) {
    const dayFirst = /^\d/.test(worded[1]);
    const name = (dayFirst ? worded[2] : worded[1]).slice(0, 3);
    month = months.findIndex((m) => m.startsWith(name)) + 1;
    day = Number(dayFirst ? worded[1] : worded[2]);
    year = Number(worded[3]);
  } else {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  const real =
    month >= 1 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  return real ? date.toISOString().slice(0, 10) : null;
}

function readWhen(text: string): Intent {
  const dates = [
    ...text.matchAll(
      /\d{4}-\d{2}-\d{2}|\d{1,2}(?:st|nd|rd|th)?\s+[a-z]+\.?,?\s+\d{4}|[a-z]+\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}/g,
    ),
  ]
    .map((match) => readDate(match[0]))
    .filter((date): date is string => date !== null);
  if (dates.length > 0) {
    const [startDate, endDate] = dates;
    return endDate && endDate >= startDate
      ? { type: "facts", startDate, endDate }
      : { type: "facts", startDate };
  }
  // "5 nights in October", "a week in May"
  const nights = /\b(\d+|[a-z]+)\s+(night|day|week)s?\b/.exec(text);
  const month = months.findIndex((name) =>
    new RegExp(`\\b${name.slice(0, 3)}[a-z]*\\b`).test(text),
  );
  const amount = nights ? count(nights[1]) : undefined;
  if (!nights || !amount || month < 0) return NONE;
  const lengthNights =
    nights[2] === "week"
      ? amount * 7
      : nights[2] === "day"
        ? amount - 1
        : amount;
  return lengthNights >= 1
    ? { type: "facts", lengthNights, timeOfYear: month + 1 }
    : NONE;
}

function readWho(text: string): Intent {
  if (/\b(just me|only me|myself|alone|solo)\b/.test(text)) {
    return { type: "facts", adults: 1, children: 0 };
  }
  if (
    /\b(two of us|both of us|me and my (wife|husband|partner|friend))\b/.test(
      text,
    )
  ) {
    return { type: "facts", adults: 2, children: 0 };
  }
  const adults =
    /\b(\d+|[a-z]+)\s+(adult|grown-?up|people|person|of us)s?\b/.exec(text);
  const children = /\b(\d+|[a-z]+)\s+(child|children|kid)s?\b/.exec(text);
  const adultCount = adults
    ? count(adults[1])
    : /^\d+$/.test(text)
      ? Number(text)
      : undefined;
  const childCount = children ? count(children[1]) : 0;
  if (!adultCount || adultCount > 20 || childCount === undefined) return NONE;
  return { type: "facts", adults: adultCount, children: childCount };
}

function readBudget(text: string): Intent {
  const amount = /(\d[\d,. ]*\d|\d)\s*(k)?\b/.exec(
    text.replace(/(\d)\s(?=\d{3}\b)/g, "$1"),
  );
  if (!amount) return NONE;
  const value = Number(amount[1].replace(/[, ]/g, "")) * (amount[2] ? 1000 : 1);
  const code = CURRENCIES.find((currency) =>
    new RegExp(`\\b${currency}\\b`, "i").test(text),
  );
  const symbol = Object.keys(symbols).find((mark) => text.includes(mark));
  const budgetCurrency =
    code ??
    (symbol ? symbols[symbol] : undefined) ??
    (/\byen\b/.test(text)
      ? "JPY"
      : /\b(euro|euros)\b/.test(text)
        ? "EUR"
        : /\bdollars?\b/.test(text)
          ? "USD"
          : /\bpounds?\b/.test(text)
            ? "GBP"
            : undefined);
  if (!Number.isFinite(value) || value <= 0 || !budgetCurrency) return NONE;
  return {
    type: "facts",
    budgetAmount: value,
    budgetCurrency,
    budgetBasis: /\b(a|per|each)\s+day\b|\bdaily\b/.test(text) ? "DAY" : "TRIP",
  };
}

/** The choices a typed answer names, by label or value. */
function matchChoices(question: Question, text: string): string[] {
  const parts =
    question.form === "pick_several" ? text.split(/,|\band\b|\+|\//) : [text];
  const found = new Set<string>();
  for (const part of parts.map((p) => p.trim()).filter(Boolean)) {
    const choice = question.choices.find((c) => {
      const label = c.label.toLowerCase();
      const value = c.value.toLowerCase();
      return (
        part === label ||
        part === value ||
        label.startsWith(part) ||
        (part.length >= 4 && label.includes(part)) ||
        part.includes(value)
      );
    });
    if (choice) found.add(choice.value);
  }
  return [...found];
}

function readFact(
  topic: FactTopic,
  question: Question,
  raw: string,
  text: string,
): Intent {
  switch (topic) {
    case "where": {
      const cities = raw
        .split(/,|\bthen\b|\band\b|->|→/i)
        .map((city) => city.trim())
        .filter((city) => city.length >= 2 && city.length <= 80);
      return cities.length > 0 && cities.length <= 12
        ? { type: "facts", cities }
        : NONE;
    }
    case "when":
      return readWhen(text);
    case "who": {
      const [tapped] = matchChoices(question, text);
      if (tapped) {
        const [adults, children] = tapped.split("+").map(Number);
        return { type: "facts", adults, children };
      }
      return readWho(text);
    }
    case "budget":
      return readBudget(text);
    case "firmness": {
      const [tapped] = matchChoices(question, text);
      if (!tapped) return NONE;
      const [datesFirmness, budgetFirmness] = tapped.split("+") as (
        | "FIXED"
        | "FLEXIBLE"
      )[];
      return { type: "facts", datesFirmness, budgetFirmness };
    }
    case "decided":
      // "Nothing yet" settles the question; anything decided is added as a commitment.
      return /^(no|nope|nothing|none|not yet|nothing yet)\b/.test(text)
        ? { type: "skip" }
        : NONE;
    case "purpose": {
      const [tapped] = matchChoices(question, text);
      const purpose = tapped ?? raw.trim();
      return purpose.length >= 2 && purpose.length <= 120
        ? { type: "facts", purpose }
        : NONE;
    }
  }
}

/**
 * What a typed answer to `question` means. "skip" uses the question's default;
 * "none" means the rules could not read it.
 */
export function readAnswerByRule(question: Question, typed: string): Intent {
  const raw = typed.trim().slice(0, 600);
  const text = raw.toLowerCase().replace(/[.!?]+$/, "");
  if (!text) return NONE;
  if (SKIP.test(text)) return { type: "skip" };

  if ((FACT_TOPICS as readonly string[]).includes(question.topic)) {
    return readFact(question.topic as FactTopic, question, raw, text);
  }
  // "Yes" to a remembered answer means the same again.
  const same =
    question.remembered?.length &&
    /^(yes|yep|yeah|same|same again|the same|sure|ok|okay)$/.test(text);
  const values = same ? question.remembered! : matchChoices(question, text);
  return values.length > 0
    ? { type: "taste", topic: question.topic as TasteTopic, values }
    : NONE;
}

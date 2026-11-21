// The check a reworded sentence passes before it is shown (TB-TRU-04). The
// model is given a template with its gaps still open, so a fact can only
// change by being written into the fixed text or by moving a gap. This
// rejects both.

/**
 * Words that claim something about a place the data does not say. A claim
 * word is rejected only when the template's own fixed text lacks it.
 * The developer reviews this list.
 */
export const CLAIM_WORDS = [
  "quiet",
  "lively",
  "popular",
  "famous",
  "best",
  "top",
  "hidden",
  "authentic",
  "local",
  "cheap",
  "expensive",
  "romantic",
  "family",
  "busy",
  "crowded",
  "must",
  "guaranteed",
  "always",
  "never",
] as const;

export type WordingCheck =
  | "gaps"
  | "digit"
  | "number"
  | "negation"
  | "url"
  | "email"
  | "capital"
  | "claim"
  | "length"
  | "alphabet";

const GAP = /\{(\w+)\}/g;
const MAX_LENGTH_RATIO = 1.5;

/** Spelled-out amounts. A version may use one only when the fixed text has it. */
const NUMBER_WORDS = new Set(
  (
    "zero one two three four five six seven eight nine ten eleven twelve " +
    "thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty " +
    "thirty forty fifty sixty seventy eighty ninety hundred thousand dozen " +
    "half once twice couple"
  ).split(" "),
);
const NEGATION =
  /\b(?:not|no|never|cannot|without|unknown|nothing|none)\b|n['’]t\b/gi;

/** A word that says what a gap is to the sentence; swapping it swaps the facts. */
const DIRECTION = /\b(from|to|into|towards|before|after)\s+$/i;

/** Each gap with the direction word right before it, if any, in order. */
const gapRoles = (text: string): string =>
  [...text.matchAll(GAP)]
    .map(
      ({ 1: gap, index }) =>
        `${DIRECTION.exec(text.slice(0, index))?.[1].toLowerCase() ?? ""}:${gap}`,
    )
    .join();

/** The text with each gap replaced by a mark that is neither a letter nor a digit. */
const fixedText = (text: string) => text.replace(GAP, "\u0001");

/** The whole tokens `pattern` finds, without trailing punctuation. */
const tokens = (pattern: RegExp, text: string, fold = false): Set<string> =>
  new Set(
    (text.match(pattern) ?? []).map((hit) => {
      const bare = hit.replace(/[.,;:!?)"'’]+$/, "");
      return fold ? bare.toLowerCase() : bare;
    }),
  );

/** Whether `version` has a whole token that `template` lacks. */
const adds = (
  pattern: RegExp,
  version: string,
  template: string,
  fold = false,
  allowed: (token: string) => boolean = () => true,
) => {
  const known = tokens(pattern, template, fold);
  return [...tokens(pattern, version, fold)].some(
    (token) => allowed(token) && !known.has(token),
  );
};

const URL_PATTERN =
  /(?:https?:\/\/|www\.)\S+|\b(?:[\w-]+\.)+(?:com|net|org|io|co|uk|app|me)\b(?:\.[a-z]{2,})*/gi;

/** The first check the version fails, or null when it may be shown. */
export function checkWording(
  template: string,
  version: string,
): WordingCheck | null {
  // The same gaps, each as often as in the template, and in the same order.
  if (gapRoles(template) !== gapRoles(version)) return "gaps";

  const fixed = fixedText(template);
  const words = fixedText(version);
  if (adds(/\d+(?:[.,:]\d+)*/g, words, fixed)) return "digit";
  if (adds(/[^\s@]+@[^\s@]+/g, words, fixed, true)) return "email";
  if (adds(URL_PATTERN, words, fixed, true)) return "url";

  const letters = /\p{L}+(?:['’]\p{L}+)?/gu;
  if (adds(letters, words, fixed, true, (word) => NUMBER_WORDS.has(word)))
    return "number";

  for (const { 0: word, index } of words.matchAll(/\p{Lu}[\p{L}'’-]*/gu)) {
    const before = words.slice(0, index).trimEnd();
    const startsSentence = before === "" || /[.!?]$/.test(before);
    if (
      !startsSentence &&
      !/^I(?:['’]\w+)?$/.test(word) &&
      !tokens(/\p{Lu}[\p{L}'’-]*/gu, fixed).has(word)
    )
      return "capital";
  }

  if (
    adds(letters, words, fixed, true, (word) =>
      (CLAIM_WORDS as readonly string[]).includes(word),
    )
  )
    return "claim";
  // Adding a "not" or dropping one turns a fact into its opposite.
  if (
    (words.match(NEGATION) ?? []).length !==
    (fixed.match(NEGATION) ?? []).length
  )
    return "negation";

  if (
    version.trim() === "" ||
    version.length > template.length * MAX_LENGTH_RATIO
  )
    return "length";
  if (/[^\P{L}\p{Script=Latin}]/u.test(words)) return "alphabet";
  return null;
}

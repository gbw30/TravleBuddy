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
  | "url"
  | "email"
  | "capital"
  | "claim"
  | "length"
  | "alphabet";

const GAP = /\{(\w+)\}/g;
const MAX_LENGTH_RATIO = 1.5;

const gapCounts = (text: string): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const [, gap] of text.matchAll(GAP))
    counts.set(gap, (counts.get(gap) ?? 0) + 1);
  return counts;
};

/** The text with each gap replaced by a mark that is neither a letter nor a digit. */
const fixedText = (text: string) => text.replace(GAP, "\u0001");

/** Every match of `pattern` in `version` that `template` does not contain. */
const unknownIn = (pattern: RegExp, version: string, template: string) =>
  (version.match(pattern) ?? []).some((hit) => !template.includes(hit));

/** The first check the version fails, or null when it may be shown. */
export function checkWording(
  template: string,
  version: string,
): WordingCheck | null {
  const want = gapCounts(template);
  const have = gapCounts(version);
  if (
    want.size !== have.size ||
    [...want].some(([gap, count]) => have.get(gap) !== count)
  )
    return "gaps";

  const fixed = fixedText(template);
  const words = fixedText(version);
  if (unknownIn(/\S*\d\S*/g, words, fixed)) return "digit";
  if (unknownIn(/\S+@\S+/g, words, fixed)) return "email";
  if (
    unknownIn(
      /(?:https?:\/\/|www\.)\S+|\b[\w-]+\.(?:com|net|org|io|co|uk|app|me)\b/gi,
      words,
      fixed,
    )
  )
    return "url";

  for (const { 0: word, index } of words.matchAll(/\p{Lu}[\p{L}'’-]*/gu)) {
    const before = words.slice(0, index).trimEnd();
    const startsSentence = before === "" || /[.!?]$/.test(before);
    if (
      !startsSentence &&
      !/^I(?:['’]\w+)?$/.test(word) &&
      !fixed.includes(word)
    )
      return "capital";
  }

  const has = (text: string, claim: string) =>
    new RegExp(`\\b${claim}\\b`, "i").test(text);
  if (CLAIM_WORDS.some((claim) => has(words, claim) && !has(fixed, claim)))
    return "claim";

  if (
    version.trim() === "" ||
    version.length > template.length * MAX_LENGTH_RATIO
  )
    return "length";
  if (/[^\P{L}\p{Script=Latin}]/u.test(words)) return "alphabet";
  return null;
}

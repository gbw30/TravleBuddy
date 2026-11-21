import {
  checkWording,
  MODEL,
  readWordings,
  recordWordings,
  wordingMode,
  wordSentences,
  WORDING_BUDGET_MS,
  type TokenUsage,
  type WordingRow,
} from "@/features/conversation";
import { db } from "@/lib/db";
import { factsKeyOf, fill, type Sentence } from "@/lib/wording";

import { modelGate, payForModel } from "./model-gate";

/** Fallbacks that mean "try again on the next read"; any other is a settled answer. */
const RETRIED = ["off", "cap", "timeout", "error"];

/**
 * The words to show for each subject, and the record of them. The words are
 * the filled templates, unless `word` asks for the model's wording and the
 * model is on, under the cap, and answers within the budget with versions
 * that pass the check. Called outside any transaction, and always awaited
 * before the response: a record that cannot be written fails the read, as any
 * read of a trip that is gone does.
 */
export async function shownWords(
  tripId: string,
  items: { subject: string; sentences: Sentence[] }[],
  options: { word?: boolean } = {},
): Promise<string[]> {
  const shown = items.map(({ sentences }) => sentences.map(fill).join(" "));
  const keys = items.map(({ sentences }) => factsKeyOf(sentences));
  const template = (i: number, fallback: string): WordingRow => ({
    subject: items[i].subject,
    factsKey: keys[i],
    sentences: items[i].sentences,
    shown: shown[i],
    wordedBy: "template",
    fallback,
  });
  const all = items.map((_, i) => i);

  // Off means the templates, even where a model row from before exists.
  if (!options.word || wordingMode() === "off") {
    await recordWordings(
      db,
      tripId,
      all.map((i) => template(i, "off")),
    );
    return shown;
  }

  // The same facts are never worded twice: a model row is reused, and a
  // version the check rejected is not paid for again.
  const known = await readWordings(
    db,
    tripId,
    items.map(({ subject }) => subject),
  );
  const unsettled = all.filter((i) => {
    const rows = known.filter(
      (row) => row.subject === items[i].subject && row.factsKey === keys[i],
    );
    const model = rows.find((row) => row.wordedBy === "model");
    if (model) shown[i] = model.shown;
    return (
      !model &&
      !rows.some((row) => row.fallback && !RETRIED.includes(row.fallback))
    );
  });
  // A reason of cautions only has nothing to word; its record says so, once.
  const free = (i: number) => items[i].sentences.filter(({ fixed }) => !fixed);
  const pending = unsettled.filter((i) => free(i).length > 0);
  const settled = unsettled
    .filter((i) => free(i).length === 0)
    .map((i) => template(i, "fixed"));
  if (pending.length === 0) {
    if (settled.length > 0) await recordWordings(db, tripId, settled);
    return shown;
  }

  const { outcomes, usage } = await rewordAll(
    pending.map((i) => items[i].sentences),
  );
  const rows = pending.map((i, k): WordingRow => {
    const outcome = outcomes[k];
    if ("fallback" in outcome) return template(i, outcome.fallback);
    shown[i] = outcome.shown;
    return {
      ...template(i, ""),
      shown: shown[i],
      wordedBy: "model",
      fallback: null,
      model: MODEL,
    };
  });
  // The call's tokens are recorded once, on its first row.
  if (usage) {
    rows[0].inputTokens = usage.inputTokens;
    rows[0].outputTokens = usage.outputTokens;
  }
  await recordWordings(db, tripId, [...settled, ...rows]);
  return shown;
}

/** What the model's wording of one text came to: the words shown, or why the template stays. */
export type Reworded = { shown: string } | { fallback: string };

/**
 * One model call for all the texts, each checked, and paid for. A text
 * reworded keeps its cautions word for word, in place. Texts need at least
 * one sentence that is not fixed. Never throws for a model that fails.
 */
async function rewordAll(
  texts: Sentence[][],
): Promise<{ outcomes: Reworded[]; usage?: TokenUsage }> {
  const now = new Date();
  const gate = await modelGate(now, "on");
  if (typeof gate === "string")
    return { outcomes: texts.map(() => ({ fallback: gate })) };

  const free = (text: Sentence[]) => text.filter(({ fixed }) => !fixed);
  const signal = AbortSignal.timeout(WORDING_BUDGET_MS);
  const wording = await wordSentences(texts.map(free), gate, signal);
  if (wording.usage) await payForModel(wording.usage, now);

  const outcomes = texts.map((text, k): Reworded => {
    if (wording.status !== "worded") {
      return {
        fallback:
          wording.status === "discarded"
            ? "unusable"
            : signal.aborted
              ? "timeout"
              : "error",
      };
    }
    const versions = wording.versions[k];
    const failed = free(text)
      .map(({ text }, j) => checkWording(text, versions[j]))
      .find((check) => check !== null);
    if (failed) return { fallback: failed };
    // Cautions keep their own words, in their place among the worded sentences.
    let next = 0;
    return {
      shown: text
        .map((made) =>
          made.fixed ? fill(made) : fill({ ...made, text: versions[next++] }),
        )
        .join(" "),
    };
  });
  return { outcomes, usage: wording.usage };
}

/**
 * The model's wording of one message the agent says, or why its template
 * stays. Called outside any transaction. Costs nothing, and calls nothing,
 * when wording is off or the text is all cautions and refusals.
 */
export async function wordMessage(
  sentences: Sentence[],
): Promise<Reworded & { usage?: TokenUsage }> {
  if (wordingMode() === "off") return { fallback: "off" };
  if (sentences.every(({ fixed }) => fixed)) return { fallback: "fixed" };
  const { outcomes, usage } = await rewordAll([sentences]);
  return { ...outcomes[0], usage };
}

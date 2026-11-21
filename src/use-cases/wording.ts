import {
  checkWording,
  MODEL,
  readWordings,
  recordWordings,
  wordingMode,
  wordSentences,
  WORDING_BUDGET_MS,
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
  const pending = all.filter((i) => {
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
  if (pending.length === 0) return shown;

  const now = new Date();
  const gate = await modelGate(now, "on");
  if (typeof gate === "string") {
    await recordWordings(
      db,
      tripId,
      pending.map((i) => template(i, gate)),
    );
    return shown;
  }

  const signal = AbortSignal.timeout(WORDING_BUDGET_MS);
  const wording = await wordSentences(
    pending.map((i) => items[i].sentences),
    gate,
    signal,
  );
  if (wording.usage) await payForModel(wording.usage, now);

  const rows = pending.map((i, k): WordingRow => {
    if (wording.status !== "worded") {
      return template(
        i,
        wording.status === "discarded"
          ? "unusable"
          : signal.aborted
            ? "timeout"
            : "error",
      );
    }
    const versions = wording.versions[k];
    const failed = items[i].sentences
      .map(({ text }, j) => checkWording(text, versions[j]))
      .find((check) => check !== null);
    if (failed) return template(i, failed);
    shown[i] = items[i].sentences
      .map((made, j) => fill({ ...made, text: versions[j] }))
      .join(" ");
    return {
      ...template(i, ""),
      shown: shown[i],
      wordedBy: "model",
      fallback: null,
      model: MODEL,
    };
  });
  // The call's tokens are recorded once, on its first row.
  if (wording.usage) {
    rows[0].inputTokens = wording.usage.inputTokens;
    rows[0].outputTokens = wording.usage.outputTokens;
  }
  await recordWordings(db, tripId, rows);
  return shown;
}

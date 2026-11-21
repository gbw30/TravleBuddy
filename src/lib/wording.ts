import { createHash } from "node:crypto";

// A sentence is a named template with a gap for every value that is a fact,
// and each fact names where it comes from. What the traveller is shown is
// recorded as these sentences, so a reworded text can be checked against the
// facts it was made from.

export type FactSource =
  | {
      type: "place";
      placeId: string;
      tag: string | null;
      fetchedAt: string | null;
    }
  | {
      type: "computation";
      name: string;
      inputs: Record<string, string | number>;
    }
  // "profile:<entryId>", "trip-taste:<topic>", "message:<id>". A fact resting on several sources joins their refs with commas.
  | { type: "traveller"; ref: string };

export type Fact = { gap: string; value: string; source: FactSource };

export type Sentence = {
  template: string;
  version: number;
  /** The words, with each gap written as {name}. */
  text: string;
  facts: Fact[];
};

const GAP = /\{(\w+)\}/g;

/** The sentence with every gap filled. Throws on a gap with no fact or a fact with no gap. */
export function fill(sentence: Sentence): string {
  const values = new Map<string, string>();
  for (const fact of sentence.facts) {
    if (values.has(fact.gap))
      throw new Error(`${sentence.template}: two facts for {${fact.gap}}`);
    values.set(fact.gap, fact.value);
  }
  const used = new Set<string>();
  // One pass, so a value that holds braces is never read as a gap.
  const text = sentence.text.replace(GAP, (_, gap: string) => {
    const value = values.get(gap);
    if (value === undefined)
      throw new Error(`${sentence.template}: no fact for {${gap}}`);
    used.add(gap);
    return value;
  });
  for (const gap of values.keys())
    if (!used.has(gap))
      throw new Error(`${sentence.template}: no gap for fact ${gap}`);
  return text;
}

export const fillAll = (sentences: Sentence[]): string =>
  sentences.map(fill).join(" ");

export const sentence = (
  template: string,
  text: string,
  facts: Fact[] = [],
  version = 1,
): Sentence => ({ template, version, text, facts });

export const fromTraveller = (
  gap: string,
  value: string,
  ref: string,
): Fact => ({
  gap,
  value,
  source: { type: "traveller", ref },
});

export const fromPlace = (
  gap: string,
  value: string,
  place: { id: string; fetchedAt: string | null },
  tag: string | null,
): Fact => ({
  gap,
  value,
  source: {
    type: "place",
    placeId: place.id,
    tag,
    fetchedAt: place.fetchedAt,
  },
});

export const computed = (
  gap: string,
  value: string,
  name: string,
  inputs: Record<string, string | number> = {},
): Fact => ({ gap, value, source: { type: "computation", name, inputs } });

/** The same templates, versions, fact values and sources give the same key. */
export const factsKeyOf = (sentences: Sentence[]): string =>
  createHash("sha256")
    .update(
      JSON.stringify(
        sentences.map(({ template, version, facts }) => [
          template,
          version,
          facts,
        ]),
      ),
    )
    .digest("hex");

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
  | { type: "traveller"; ref: string }; // "profile:<entryId>", "trip-taste:<topic>", "message:<id>"

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

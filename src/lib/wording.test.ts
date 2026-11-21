import { describe, expect, it } from "vitest";

import { fill, type Sentence } from "./wording";

const fact = (gap: string, value: string) => ({
  gap,
  value,
  source: { type: "traveller" as const, ref: "trip-taste:food" },
});
const sentence = (text: string, facts: Sentence["facts"]): Sentence => ({
  template: "t",
  version: 1,
  text,
  facts,
});

describe("fill", () => {
  it("fills every gap", () => {
    expect(
      fill(
        sentence("You eat {a} and {b}, {a}.", [fact("a", "x"), fact("b", "y")]),
      ),
    ).toBe("You eat x and y, x.");
  });
  it("does not read braces inside a value as a gap", () => {
    expect(fill(sentence("Try {a}.", [fact("a", "{b}")]))).toBe("Try {b}.");
  });
  it("throws on a gap with no fact", () => {
    expect(() => fill(sentence("You eat {a}.", []))).toThrow(/no fact/);
  });
  it("throws on a fact with no gap", () => {
    expect(() => fill(sentence("Hello.", [fact("a", "x")]))).toThrow(/no gap/);
  });
});

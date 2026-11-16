import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";

describe("contrastRatio", () => {
  it("is 21 for black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
  });

  it("is 1 for identical colours and symmetric", () => {
    expect(contrastRatio("#b4542f", "#b4542f")).toBeCloseTo(1, 5);
    expect(contrastRatio("#2b2622", "#d9c3a0")).toBeCloseTo(
      contrastRatio("#d9c3a0", "#2b2622"),
      5,
    );
  });
});

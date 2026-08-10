import { describe, expect, it } from "vitest";
import { scoreReplacementCandidate } from "./scoring";

describe("scoreReplacementCandidate", () => {
  it("rewards lower price levels more as price sensitivity rises", () => {
    const lowSensitivity = scoreReplacementCandidate({
      rating: 4.5,
      priceLevel: 1,
      priceSensitivity: 0,
    });
    const highSensitivity = scoreReplacementCandidate({
      rating: 4.5,
      priceLevel: 1,
      priceSensitivity: 1,
    });

    expect(highSensitivity.score).toBeGreaterThan(lowSensitivity.score);
    expect(highSensitivity.explanation).toContain("affordability");
  });

  it("keeps missing provider facts neutral and the total bounded", () => {
    expect(
      scoreReplacementCandidate({
        rating: null,
        priceLevel: null,
        priceSensitivity: 0.5,
      }),
    ).toMatchObject({
      score: 46.25,
      ratingPoints: 35,
      affordabilityPoints: 11.25,
    });
  });
});

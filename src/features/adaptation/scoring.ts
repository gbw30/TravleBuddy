export type ReplacementScoreBreakdown = {
  score: number;
  ratingPoints: number;
  affordabilityPoints: number;
  priceSensitivity: number;
  explanation: string;
};

function rounded(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * A small, inspectable score used only for the first replacement policy.
 * Rating contributes at most 70 points and affordability at most 30. Missing
 * values receive neutral points, keeping ordering stable without inventing
 * provider facts.
 */
export function scoreReplacementCandidate(input: {
  rating: number | null;
  priceLevel: number | null;
  priceSensitivity: number;
}): ReplacementScoreBreakdown {
  const sensitivity = Math.min(1, Math.max(0, input.priceSensitivity));
  const ratingPoints =
    input.rating === null ? 35 : Math.min(70, Math.max(0, input.rating * 14));
  const rawAffordability =
    input.priceLevel === null
      ? 15
      : Math.min(30, Math.max(0, (4 - input.priceLevel) * 7.5));
  const affordabilityPoints = rawAffordability * (0.5 + sensitivity / 2);
  const score = rounded(
    Math.min(100, Math.max(0, ratingPoints + affordabilityPoints)),
  );

  return {
    score,
    ratingPoints: rounded(ratingPoints),
    affordabilityPoints: rounded(affordabilityPoints),
    priceSensitivity: rounded(sensitivity),
    explanation:
      "Ranked from provider rating and affordability, weighted by the active price-sensitivity signal.",
  };
}

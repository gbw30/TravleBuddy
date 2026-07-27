import {
  scoreReplacementCandidate,
  type ReplacementScoreBreakdown,
} from "./scoring";

type NumberLike = number | { toString: () => string };

export type ScorableCandidate = {
  id: string;
  rating: NumberLike | null;
  priceLevel: number | null;
};

export type RescoredCandidate<TCandidate extends ScorableCandidate> = {
  candidate: TCandidate;
  scoring: ReplacementScoreBreakdown;
};

export type ActivationConflict = {
  type: string;
  severity: string;
  metadata: unknown;
};

export type EstimatedCostItem = {
  estimatedCostAmount: NumberLike | null;
  estimatedCostCurrency: string | null;
};

export type AdaptiveActivationOutcome =
  | "REPLACED"
  | "NO_REPLACEMENT"
  | "VALIDATION_BLOCKED";

function numberValue(value: NumberLike | null) {
  if (value === null) return null;

  const parsed = typeof value === "number" ? value : Number(value.toString());

  return Number.isFinite(parsed) ? parsed : null;
}

function metadataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function metadataDayNumber(value: unknown) {
  const dayNumber = metadataRecord(value)?.dayNumber;

  if (
    typeof dayNumber === "number" &&
    Number.isInteger(dayNumber) &&
    dayNumber > 0
  ) {
    return dayNumber;
  }

  if (
    typeof dayNumber === "string" &&
    /^\d+$/.test(dayNumber) &&
    Number(dayNumber) > 0
  ) {
    return Number(dayNumber);
  }

  return null;
}

function blockingConflictKey(
  conflict: ActivationConflict,
  affectedDay: number,
) {
  if (conflict.severity !== "HIGH") return null;

  const metadata = metadataRecord(conflict.metadata);
  const dayNumber = metadataDayNumber(conflict.metadata);

  // A high-severity conflict explicitly tied to another unchanged day cannot
  // have been introduced by this item-level copy-on-write update.
  if (dayNumber !== null && dayNumber !== affectedDay) return null;

  const rule =
    typeof metadata?.rule === "string" && metadata.rule.trim()
      ? metadata.rule.trim()
      : "unspecified";

  return `${conflict.type}\u0000${rule}\u0000${dayNumber ?? "trip"}`;
}

/**
 * Mutable PlaceSuggestion statuses are only a projection of the active
 * itinerary. Feedback remains the immutable rejection/exclusion source, so a
 * failed or unavailable successor must not make that projection contradict
 * the still-active itinerary.
 */
export function suggestionProjectionMutationForOutcome(
  outcome: AdaptiveActivationOutcome,
) {
  return outcome === "REPLACED"
    ? {
        rejectedSuggestionStatus: "REJECTED" as const,
        replacementSuggestionStatus: "SELECTED" as const,
      }
    : {
        rejectedSuggestionStatus: null,
        replacementSuggestionStatus: null,
      };
}

/**
 * Re-scores every persisted or freshly fetched candidate from one resolved
 * preference snapshot. The original records stay immutable so persistence can
 * decide separately which score metadata should be refreshed.
 */
export function rescoreReplacementCandidates<
  TCandidate extends ScorableCandidate,
>(
  candidates: readonly TCandidate[],
  priceSensitivity: number,
): RescoredCandidate<TCandidate>[] {
  return candidates.map((candidate) => ({
    candidate,
    scoring: scoreReplacementCandidate({
      rating: numberValue(candidate.rating),
      priceLevel: candidate.priceLevel,
      priceSensitivity,
    }),
  }));
}

/**
 * Returns only net-new blocking conflicts caused by the proposed affected-day
 * update. Existing HIGH conflicts with the same stable rule/day identity are
 * tolerated, as are warnings and conflicts explicitly tied to unchanged days.
 */
export function findNewBlockingHighConflicts<
  TConflict extends ActivationConflict,
>(input: {
  baseline: readonly TConflict[];
  proposed: readonly TConflict[];
  affectedDay: number;
}) {
  const toleratedCounts = new Map<string, number>();

  for (const conflict of input.baseline) {
    const key = blockingConflictKey(conflict, input.affectedDay);
    if (!key) continue;

    toleratedCounts.set(key, (toleratedCounts.get(key) ?? 0) + 1);
  }

  return input.proposed.filter((conflict) => {
    const key = blockingConflictKey(conflict, input.affectedDay);
    if (!key) return false;

    const tolerated = toleratedCounts.get(key) ?? 0;
    if (tolerated === 0) return true;

    toleratedCounts.set(key, tolerated - 1);
    return false;
  });
}

/**
 * Recomputes the affected day's persisted aggregate from its effective items.
 * Mixed currencies are never silently added together. A declared day currency
 * remains authoritative; without one, a total is emitted only when every
 * priced item uses the same currency.
 */
export function recomputeAffectedDayEstimatedCost(input: {
  items: readonly EstimatedCostItem[];
  declaredCurrency: string | null;
}) {
  const priced = input.items.flatMap((item) => {
    const amount = numberValue(item.estimatedCostAmount);

    return amount === null || !item.estimatedCostCurrency
      ? []
      : [
          {
            amount,
            currency: item.estimatedCostCurrency,
          },
        ];
  });
  const currencies = [...new Set(priced.map((item) => item.currency))].sort();
  const currency =
    input.declaredCurrency ?? (currencies.length === 1 ? currencies[0] : null);

  if (!currency) {
    return {
      estimatedCostAmount: null,
      estimatedCostCurrency: null,
    };
  }

  const matching = priced.filter((item) => item.currency === currency);

  return {
    estimatedCostAmount:
      matching.length === 0
        ? null
        : Math.round(
            matching.reduce((total, item) => total + item.amount, 0) * 100,
          ) / 100,
    estimatedCostCurrency: currency,
  };
}

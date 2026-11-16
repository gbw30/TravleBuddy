import {
  replacementCandidateFilterSchema,
  type ParsedReplacementCandidateFilter,
  type ReplacementCandidate,
  type ReplacementCandidateFilter,
} from "./schemas";

function descendingNullableNumber(left: number | null, right: number | null) {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}

function compareText(left: string, right: string) {
  const normalizedLeft = left.trim().toLowerCase();
  const normalizedRight = right.trim().toLowerCase();

  if (normalizedLeft < normalizedRight) return -1;
  if (normalizedLeft > normalizedRight) return 1;
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function normalizedIdentityText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function semanticPlaceFingerprint(input: {
  name: string;
  category: string;
  city?: string | null;
  country?: string | null;
}) {
  return [input.country, input.city, input.category, input.name]
    .map(normalizedIdentityText)
    .join("|");
}

export type CheaperComparison = {
  cheaper: boolean;
  basis: "EXACT_COST" | "PRICE_LEVEL" | "UNKNOWN";
  cheaperBy: number | null;
  priceTierDelta: number | null;
};

export function compareCandidateAffordability(
  candidate: Pick<
    ReplacementCandidate,
    "estimatedCostAmount" | "estimatedCostCurrency" | "priceLevel"
  >,
  target: NonNullable<ParsedReplacementCandidateFilter["cheaperThan"]>,
): CheaperComparison {
  const candidateCurrency = candidate.estimatedCostCurrency?.toUpperCase();
  const targetCurrency = target.estimatedCostCurrency?.toUpperCase();

  if (
    candidate.estimatedCostAmount != null &&
    target.estimatedCostAmount != null &&
    candidateCurrency &&
    targetCurrency &&
    candidateCurrency === targetCurrency
  ) {
    const difference =
      target.estimatedCostAmount - candidate.estimatedCostAmount;
    return {
      cheaper: difference > 0,
      basis: "EXACT_COST",
      cheaperBy: Math.round(difference * 100) / 100,
      priceTierDelta: null,
    };
  }

  if (candidate.priceLevel != null && target.priceLevel != null) {
    const difference = target.priceLevel - candidate.priceLevel;
    return {
      cheaper: difference > 0,
      basis: "PRICE_LEVEL",
      cheaperBy: null,
      priceTierDelta: difference,
    };
  }

  return {
    cheaper: false,
    basis: "UNKNOWN",
    cheaperBy: null,
    priceTierDelta: null,
  };
}

/** Higher scores and ratings win; provider IDs and names are stable tie-breakers. */
export function compareReplacementCandidates(
  left: ReplacementCandidate,
  right: ReplacementCandidate,
) {
  const scoreDifference = descendingNullableNumber(left.score, right.score);
  if (scoreDifference !== 0) return scoreDifference;

  const ratingDifference = descendingNullableNumber(left.rating, right.rating);
  if (ratingDifference !== 0) return ratingDifference;

  const providerIdDifference = compareText(
    left.providerPlaceId,
    right.providerPlaceId,
  );
  if (providerIdDifference !== 0) return providerIdDifference;

  return compareText(left.name, right.name);
}

export type ReplacementCandidateDiagnostics = {
  total: number;
  eligible: number;
  excludedIncompatible: number;
  excludedSamePlace: number;
  excludedNotCheaper: number;
};

export function evaluateReplacementCandidates(
  candidates: readonly ReplacementCandidate[],
  filterInput: ReplacementCandidateFilter,
) {
  const filter = replacementCandidateFilterSchema.parse(filterInput);
  const selectedCandidateIds = new Set(filter.selectedCandidateIds);
  const selectedProviderPlaceIds = new Set(filter.selectedProviderPlaceIds);
  const rejectedCandidateIds = new Set(filter.rejectedCandidateIds);
  const rejectedProviderPlaceIds = new Set(filter.rejectedProviderPlaceIds);
  const excludedFingerprints = new Set(filter.excludedSemanticFingerprints);
  const diagnostics: ReplacementCandidateDiagnostics = {
    total: candidates.length,
    eligible: 0,
    excludedIncompatible: 0,
    excludedSamePlace: 0,
    excludedNotCheaper: 0,
  };
  const eligible: ReplacementCandidate[] = [];

  for (const candidate of candidates) {
    if (
      candidate.destinationId !== filter.destinationId ||
      candidate.category !== filter.category
    ) {
      diagnostics.excludedIncompatible += 1;
      continue;
    }

    const fingerprint = semanticPlaceFingerprint(candidate);
    if (
      selectedCandidateIds.has(candidate.id) ||
      selectedProviderPlaceIds.has(candidate.providerPlaceId) ||
      rejectedCandidateIds.has(candidate.id) ||
      rejectedProviderPlaceIds.has(candidate.providerPlaceId) ||
      excludedFingerprints.has(fingerprint)
    ) {
      diagnostics.excludedSamePlace += 1;
      continue;
    }

    if (
      filter.cheaperThan &&
      !compareCandidateAffordability(candidate, filter.cheaperThan).cheaper
    ) {
      diagnostics.excludedNotCheaper += 1;
      continue;
    }

    eligible.push(candidate);
  }

  const ranked = eligible.sort(compareReplacementCandidates);
  const seenProviderIds = new Set<string>();
  const seenFingerprints = new Set<string>();
  const rankedCandidates = ranked.filter((candidate) => {
    const fingerprint = semanticPlaceFingerprint(candidate);
    if (
      seenProviderIds.has(candidate.providerPlaceId) ||
      seenFingerprints.has(fingerprint)
    ) {
      diagnostics.excludedSamePlace += 1;
      return false;
    }

    seenProviderIds.add(candidate.providerPlaceId);
    seenFingerprints.add(fingerprint);
    return true;
  });
  diagnostics.eligible = rankedCandidates.length;

  return { rankedCandidates, diagnostics };
}

export function rankReplacementCandidates(
  candidates: readonly ReplacementCandidate[],
  filterInput: ReplacementCandidateFilter,
) {
  return evaluateReplacementCandidates(candidates, filterInput)
    .rankedCandidates;
}

export function replacementCandidatesNeedProviderFetch(
  candidates: readonly ReplacementCandidate[],
  filter: ReplacementCandidateFilter,
) {
  return (
    evaluateReplacementCandidates(candidates, filter).rankedCandidates
      .length === 0
  );
}

export function selectReplacementCandidate(
  candidates: readonly ReplacementCandidate[],
  filter: ReplacementCandidateFilter,
) {
  return rankReplacementCandidates(candidates, filter)[0] ?? null;
}

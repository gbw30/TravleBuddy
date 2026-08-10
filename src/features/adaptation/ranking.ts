import {
  replacementCandidateFilterSchema,
  type ParsedReplacementCandidateFilter,
  type ReplacementCandidate,
  type ReplacementCandidateFilter,
} from "./schemas";

function descendingNullableNumber(left: number | null, right: number | null) {
  if (left === right) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return right - left;
}

function compareText(left: string, right: string) {
  const normalizedLeft = left.trim().toLowerCase();
  const normalizedRight = right.trim().toLowerCase();

  if (normalizedLeft < normalizedRight) {
    return -1;
  }

  if (normalizedLeft > normalizedRight) {
    return 1;
  }

  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

/**
 * Total ordering used after eligibility filtering. Higher scores and ratings
 * win; provider IDs and names use locale-independent ascending order.
 */
export function compareReplacementCandidates(
  left: ReplacementCandidate,
  right: ReplacementCandidate,
) {
  const scoreDifference = descendingNullableNumber(left.score, right.score);

  if (scoreDifference !== 0) {
    return scoreDifference;
  }

  const ratingDifference = descendingNullableNumber(left.rating, right.rating);

  if (ratingDifference !== 0) {
    return ratingDifference;
  }

  const providerIdDifference = compareText(
    left.providerPlaceId,
    right.providerPlaceId,
  );

  if (providerIdDifference !== 0) {
    return providerIdDifference;
  }

  return compareText(left.name, right.name);
}

function eligibleCandidates(
  candidates: readonly ReplacementCandidate[],
  filter: ParsedReplacementCandidateFilter,
) {
  const selectedCandidateIds = new Set(filter.selectedCandidateIds);
  const selectedProviderPlaceIds = new Set(filter.selectedProviderPlaceIds);
  const rejectedCandidateIds = new Set(filter.rejectedCandidateIds);
  const rejectedProviderPlaceIds = new Set(filter.rejectedProviderPlaceIds);

  return candidates.filter(
    (candidate) =>
      candidate.destinationId === filter.destinationId &&
      candidate.category === filter.category &&
      !selectedCandidateIds.has(candidate.id) &&
      !selectedProviderPlaceIds.has(candidate.providerPlaceId) &&
      !rejectedCandidateIds.has(candidate.id) &&
      !rejectedProviderPlaceIds.has(candidate.providerPlaceId),
  );
}

/**
 * Returns a new, deterministic array and keeps the input untouched. Duplicate
 * provider IDs are collapsed after sorting so the best normalized record wins.
 */
export function rankReplacementCandidates(
  candidates: readonly ReplacementCandidate[],
  filterInput: ReplacementCandidateFilter,
) {
  const filter = replacementCandidateFilterSchema.parse(filterInput);
  const ranked = [...eligibleCandidates(candidates, filter)].sort(
    compareReplacementCandidates,
  );
  const seenProviderIds = new Set<string>();

  return ranked.filter((candidate) => {
    if (seenProviderIds.has(candidate.providerPlaceId)) {
      return false;
    }

    seenProviderIds.add(candidate.providerPlaceId);
    return true;
  });
}

export function selectReplacementCandidate(
  candidates: readonly ReplacementCandidate[],
  filter: ReplacementCandidateFilter,
) {
  return rankReplacementCandidates(candidates, filter)[0] ?? null;
}

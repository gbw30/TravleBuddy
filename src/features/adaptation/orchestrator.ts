import {
  createItemReplacementProposal,
  type CopyOnWriteDay,
  type CopyOnWriteItem,
  type CopyOnWriteItinerary,
} from "./itinerary-copy";
import { classifyAdaptationImpact } from "./impact";
import {
  applyFeedbackPreferencePolicy,
  type PreferencePolicyResult,
} from "./preferences";
import { rankReplacementCandidates } from "./ranking";
import type {
  AdaptationFeedback,
  AdaptivePreferenceSnapshot,
  ReplacementCandidate,
  ReplacementCandidateFilter,
} from "./schemas";

export type AdaptiveReplacementResult<TItinerary, TDay, TItem> =
  | {
      status: "PROPOSED";
      preference: PreferencePolicyResult;
      impact: ReturnType<typeof classifyAdaptationImpact>;
      candidate: ReplacementCandidate;
      rankedCandidates: readonly ReplacementCandidate[];
      itinerary: TItinerary;
      affectedDay: TDay;
      replacedItem: TItem;
      replacementItem: TItem;
    }
  | {
      status: "NO_REPLACEMENT";
      preference: PreferencePolicyResult;
      impact: ReturnType<typeof classifyAdaptationImpact>;
      rankedCandidates: readonly [];
      itinerary: TItinerary;
    }
  | {
      status: "TARGET_NOT_FOUND";
      preference: PreferencePolicyResult;
      impact: ReturnType<typeof classifyAdaptationImpact>;
      targetItemId: string;
      itinerary: TItinerary;
    }
  | {
      status: "INVALID_REPLACEMENT";
      preference: PreferencePolicyResult;
      impact: ReturnType<typeof classifyAdaptationImpact>;
      candidate: ReplacementCandidate;
      reason:
        | "AMBIGUOUS_TARGET"
        | "ITEM_ID_CONFLICT"
        | "PLACE_ALREADY_SELECTED";
      itinerary: TItinerary;
    };

/**
 * Pure first-slice orchestrator. Database/application code owns authorization,
 * event idempotency, version checks, transaction boundaries, persistence, and
 * conflict validation. This function owns the deterministic domain decision.
 */
export function buildAdaptiveReplacementProposal<
  TItem extends CopyOnWriteItem,
  TDay extends CopyOnWriteDay<TItem>,
  TItinerary extends CopyOnWriteItinerary<TDay>,
>(input: {
  preference: AdaptivePreferenceSnapshot;
  feedback: AdaptationFeedback;
  preferencePolicyResult?: PreferencePolicyResult;
  itinerary: TItinerary;
  targetItemId: string;
  candidates: readonly ReplacementCandidate[];
  candidateFilter: ReplacementCandidateFilter;
  createReplacementItem: (
    candidate: ReplacementCandidate,
    replacedItem: TItem,
  ) => TItem;
}): AdaptiveReplacementResult<TItinerary, TDay, TItem> {
  const preference =
    input.preferencePolicyResult ??
    applyFeedbackPreferencePolicy(input.preference, input.feedback);
  const impact = classifyAdaptationImpact("REJECT_ITINERARY_ITEM");
  const target = input.itinerary.days
    .flatMap((day) => day.items)
    .find((item) => item.id === input.targetItemId);

  if (!target) {
    return {
      status: "TARGET_NOT_FOUND",
      preference,
      impact,
      targetItemId: input.targetItemId,
      itinerary: input.itinerary,
    };
  }

  const selectedCandidateIds = input.itinerary.days
    .flatMap((day) => day.items)
    .filter((item) => item.id !== input.targetItemId)
    .map((item) => item.placeSuggestionId)
    .filter((id): id is string => Boolean(id));
  const targetCandidateId = target.placeSuggestionId;
  const rankedCandidates = rankReplacementCandidates(input.candidates, {
    ...input.candidateFilter,
    selectedCandidateIds: [
      ...(input.candidateFilter.selectedCandidateIds ?? []),
      ...selectedCandidateIds,
    ],
    rejectedCandidateIds: [
      ...(input.candidateFilter.rejectedCandidateIds ?? []),
      ...(targetCandidateId ? [targetCandidateId] : []),
    ],
  });
  const candidate = rankedCandidates[0];

  if (!candidate) {
    return {
      status: "NO_REPLACEMENT",
      preference,
      impact,
      rankedCandidates: [],
      itinerary: input.itinerary,
    };
  }

  const replacement = input.createReplacementItem(candidate, target);
  const proposal = createItemReplacementProposal<TItem, TDay, TItinerary>(
    input.itinerary,
    {
      targetItemId: input.targetItemId,
      replacement,
    },
  );

  if (proposal.status === "TARGET_NOT_FOUND") {
    return {
      status: "TARGET_NOT_FOUND",
      preference,
      impact,
      targetItemId: proposal.targetItemId,
      itinerary: proposal.itinerary,
    };
  }

  if (proposal.status === "INVALID_REPLACEMENT") {
    return {
      status: "INVALID_REPLACEMENT",
      preference,
      impact,
      candidate,
      reason: proposal.reason,
      itinerary: proposal.itinerary,
    };
  }

  return {
    status: "PROPOSED",
    preference,
    impact,
    candidate,
    rankedCandidates,
    itinerary: proposal.itinerary,
    affectedDay: proposal.affectedDay,
    replacedItem: proposal.replacedItem,
    replacementItem: proposal.replacementItem,
  };
}

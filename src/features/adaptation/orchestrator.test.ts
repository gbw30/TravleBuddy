import { describe, expect, it } from "vitest";
import type {
  AdaptivePreferenceSnapshot,
  ReplacementCandidate,
} from "./schemas";
import { buildAdaptiveReplacementProposal } from "./orchestrator";
import { applyFeedbackPreferencePolicy } from "./preferences";

const observedAt = "2026-07-26T12:00:00.000Z";

function preference(
  source: "DEFAULT" | "INFERRED" | "EXPLICIT" = "INFERRED",
): AdaptivePreferenceSnapshot {
  return {
    schemaVersion: 1,
    interests: {
      MUSEUMS: {
        weight: 0.8,
        confidence: 0.8,
        source: "EXPLICIT",
        observedAt,
      },
    },
    priceSensitivity: {
      weight: 0.5,
      confidence: 0.4,
      source,
      observedAt,
    },
    pace: null,
  };
}

function candidate(
  id: string,
  score: number,
  overrides: Partial<ReplacementCandidate> = {},
): ReplacementCandidate {
  return {
    id,
    providerPlaceId: `provider-${id}`,
    destinationId: "destination-1",
    category: "ACTIVITY",
    name: `Candidate ${id}`,
    score,
    rating: 4.5,
    ...overrides,
  };
}

function itinerary() {
  return {
    id: "itinerary-v1",
    days: [
      {
        id: "day-1",
        dayNumber: 1,
        items: [
          {
            id: "item-1",
            placeSuggestionId: "place-1",
            sortOrder: 0,
            title: "Keep",
          },
        ],
      },
      {
        id: "day-2",
        dayNumber: 2,
        items: [
          {
            id: "item-2",
            placeSuggestionId: "place-rejected",
            sortOrder: 3,
            title: "Rejected",
          },
        ],
      },
    ],
  };
}

function buildInput(
  overrides: Partial<
    Parameters<typeof buildAdaptiveReplacementProposal>[0]
  > = {},
) {
  return {
    preference: preference(),
    feedback: {
      eventId: "feedback-1",
      action: "REJECT" as const,
      reason: "TOO_EXPENSIVE" as const,
      observedAt: "2026-07-26T13:00:00.000Z",
    },
    itinerary: itinerary(),
    targetItemId: "item-2",
    candidates: [candidate("lower", 80), candidate("higher", 95)],
    candidateFilter: {
      destinationId: "destination-1",
      category: "ACTIVITY" as const,
      selectedProviderPlaceIds: ["place-1"],
      rejectedProviderPlaceIds: ["place-rejected"],
    },
    createReplacementItem: (
      replacement: ReplacementCandidate,
      replaced: { sortOrder: number },
    ) => ({
      id: `replacement-${replacement.id}`,
      placeSuggestionId: replacement.id,
      sortOrder: replaced.sortOrder,
      title: replacement.name,
    }),
    ...overrides,
  };
}

describe("adaptive replacement orchestrator", () => {
  it("builds a deterministic low-impact replacement proposal", () => {
    const input = buildInput();
    const result = buildAdaptiveReplacementProposal(input);

    expect(result.status).toBe("PROPOSED");

    if (result.status !== "PROPOSED") {
      throw new Error("Expected an adaptive replacement proposal.");
    }

    expect(result.candidate.id).toBe("higher");
    expect(result.rankedCandidates.map(({ id }) => id)).toEqual([
      "higher",
      "lower",
    ]);
    expect(result.impact).toMatchObject({ level: "LOW", scope: "ITEM" });
    expect(result.preference.status).toBe("UPDATED");
    expect(result.preference.snapshot.priceSensitivity).toMatchObject({
      weight: 0.6,
      confidence: 0.5,
      source: "INFERRED",
    });
    expect(result.itinerary.days[0]).toBe(input.itinerary.days[0]);
    expect(result.itinerary.days[1].items[0]).toMatchObject({
      id: "replacement-higher",
      placeSuggestionId: "higher",
      sortOrder: 3,
    });
  });

  it("keeps the preference update when no compatible replacement exists", () => {
    const input = buildInput({
      candidates: [
        candidate("wrong-destination", 100, {
          destinationId: "destination-2",
        }),
      ],
    });
    const result = buildAdaptiveReplacementProposal(input);

    expect(result).toMatchObject({
      status: "NO_REPLACEMENT",
      itinerary: input.itinerary,
      rankedCandidates: [],
      preference: {
        status: "UPDATED",
      },
    });
  });

  it("automatically excludes the rejected and already-selected places", () => {
    const input = buildInput({
      candidates: [
        candidate("rejected", 100, { id: "place-rejected" }),
        candidate("selected", 99, { id: "place-1" }),
        candidate("eligible", 90),
      ],
      candidateFilter: {
        destinationId: "destination-1",
        category: "ACTIVITY",
      },
    });
    const result = buildAdaptiveReplacementProposal(input);

    expect(result.status).toBe("PROPOSED");

    if (result.status !== "PROPOSED") {
      throw new Error("Expected an adaptive replacement proposal.");
    }

    expect(result.candidate.id).toBe("eligible");
    expect(result.rankedCandidates.map(({ id }) => id)).toEqual(["eligible"]);
  });

  it("protects explicit preference state while still replacing the item", () => {
    const explicit = preference("EXPLICIT");
    const result = buildAdaptiveReplacementProposal(
      buildInput({ preference: explicit }),
    );

    expect(result.status).toBe("PROPOSED");
    expect(result.preference).toMatchObject({
      status: "NO_CHANGE",
      snapshot: explicit,
      reason: "EXPLICIT_PREFERENCE_PROTECTED",
    });
  });

  it("uses a pre-resolved policy result without applying feedback twice", () => {
    const input = buildInput();
    const resolvedPreference = applyFeedbackPreferencePolicy(
      input.preference,
      input.feedback,
    );
    const result = buildAdaptiveReplacementProposal({
      ...input,
      preferencePolicyResult: resolvedPreference,
    });

    expect(result.preference.snapshot.priceSensitivity).toMatchObject({
      weight: 0.6,
      confidence: 0.5,
    });
  });

  it("returns target-not-found before creating a replacement item", () => {
    let factoryCalls = 0;
    const input = buildInput({
      targetItemId: "missing",
      createReplacementItem: (replacement: ReplacementCandidate) => {
        factoryCalls += 1;
        return {
          id: `replacement-${replacement.id}`,
          placeSuggestionId: replacement.id,
          sortOrder: 0,
          title: replacement.name,
        };
      },
    });

    expect(buildAdaptiveReplacementProposal(input)).toMatchObject({
      status: "TARGET_NOT_FOUND",
      targetItemId: "missing",
      itinerary: input.itinerary,
    });
    expect(factoryCalls).toBe(0);
  });

  it("surfaces an invalid candidate-to-item mapping", () => {
    const input = buildInput({
      createReplacementItem: (replacement: ReplacementCandidate) => ({
        id: "item-1",
        placeSuggestionId: replacement.id,
        sortOrder: 0,
        title: replacement.name,
      }),
    });

    expect(buildAdaptiveReplacementProposal(input)).toMatchObject({
      status: "INVALID_REPLACEMENT",
      reason: "ITEM_ID_CONFLICT",
      candidate: { id: "higher" },
      itinerary: input.itinerary,
    });
  });

  it("does not infer unsupported preference changes", () => {
    const input = buildInput({
      feedback: {
        eventId: "feedback-2",
        action: "REJECT",
        reason: "WRONG_VIBE",
        observedAt: "2026-07-26T13:00:00.000Z",
      },
    });
    const result = buildAdaptiveReplacementProposal(input);

    expect(result.preference).toMatchObject({
      status: "NO_CHANGE",
      snapshot: input.preference,
      reason: "UNSUPPORTED_FEEDBACK",
    });
    expect(result.status).toBe("PROPOSED");
  });
});

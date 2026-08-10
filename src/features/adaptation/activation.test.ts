import { describe, expect, it } from "vitest";
import {
  findNewBlockingHighConflicts,
  recomputeAffectedDayEstimatedCost,
  rescoreReplacementCandidates,
  suggestionProjectionMutationForOutcome,
} from "./activation";

describe("suggestionProjectionMutationForOutcome", () => {
  it("preserves the current selection projection when no replacement exists", () => {
    expect(suggestionProjectionMutationForOutcome("NO_REPLACEMENT")).toEqual({
      rejectedSuggestionStatus: null,
      replacementSuggestionStatus: null,
    });
  });

  it("preserves the current selection projection when validation blocks the draft", () => {
    expect(
      suggestionProjectionMutationForOutcome("VALIDATION_BLOCKED"),
    ).toEqual({
      rejectedSuggestionStatus: null,
      replacementSuggestionStatus: null,
    });
  });

  it("transitions both suggestion statuses only after activation", () => {
    expect(suggestionProjectionMutationForOutcome("REPLACED")).toEqual({
      rejectedSuggestionStatus: "REJECTED",
      replacementSuggestionStatus: "SELECTED",
    });
  });
});

describe("rescoreReplacementCandidates", () => {
  it("uses the resolved post-feedback sensitivity for every candidate", () => {
    const rescored = rescoreReplacementCandidates(
      [
        {
          id: "expensive",
          rating: 4.5,
          priceLevel: 4,
        },
        {
          id: "affordable",
          rating: 3.28,
          priceLevel: 1,
        },
      ],
      0.6,
    );

    expect(
      rescored.map(({ candidate, scoring }) => ({
        id: candidate.id,
        sensitivity: scoring.priceSensitivity,
        score: scoring.score,
      })),
    ).toEqual([
      {
        id: "expensive",
        sensitivity: 0.6,
        score: 63,
      },
      {
        id: "affordable",
        sensitivity: 0.6,
        score: 63.92,
      },
    ]);
  });
});

describe("findNewBlockingHighConflicts", () => {
  it("permits warnings, unrelated days, and pre-existing affected-day blockers", () => {
    const existingOverlap = {
      type: "TIME",
      severity: "HIGH",
      metadata: {
        rule: "time_overlap",
        dayNumber: 2,
      },
    };

    expect(
      findNewBlockingHighConflicts({
        baseline: [existingOverlap],
        proposed: [
          existingOverlap,
          {
            type: "DISTANCE",
            severity: "MEDIUM",
            metadata: {
              rule: "distance",
              dayNumber: 2,
            },
          },
          {
            type: "TIME",
            severity: "HIGH",
            metadata: {
              rule: "time_overlap",
              dayNumber: 3,
            },
          },
        ],
        affectedDay: 2,
      }),
    ).toEqual([]);
  });

  it("blocks a net-new HIGH rule on the affected day or trip aggregate", () => {
    const proposed = [
      {
        type: "TIME",
        severity: "HIGH",
        metadata: {
          rule: "time_overlap",
          dayNumber: 2,
        },
      },
      {
        type: "BUDGET",
        severity: "HIGH",
        metadata: {
          rule: "trip_budget",
        },
      },
    ];

    expect(
      findNewBlockingHighConflicts({
        baseline: [],
        proposed,
        affectedDay: 2,
      }),
    ).toEqual(proposed);
  });
});

describe("recomputeAffectedDayEstimatedCost", () => {
  it("replaces the rejected cost in the affected day's aggregate", () => {
    expect(
      recomputeAffectedDayEstimatedCost({
        declaredCurrency: "USD",
        items: [
          {
            estimatedCostAmount: 25,
            estimatedCostCurrency: "USD",
          },
          {
            estimatedCostAmount: 30,
            estimatedCostCurrency: "USD",
          },
        ],
      }),
    ).toEqual({
      estimatedCostAmount: 55,
      estimatedCostCurrency: "USD",
    });
  });

  it("does not combine mixed currencies when no day currency is declared", () => {
    expect(
      recomputeAffectedDayEstimatedCost({
        declaredCurrency: null,
        items: [
          {
            estimatedCostAmount: 20,
            estimatedCostCurrency: "USD",
          },
          {
            estimatedCostAmount: 15,
            estimatedCostCurrency: "EUR",
          },
        ],
      }),
    ).toEqual({
      estimatedCostAmount: null,
      estimatedCostCurrency: null,
    });
  });
});

import { describe, expect, it } from "vitest";
import type { ReplacementCandidate } from "./schemas";
import {
  compareReplacementCandidates,
  rankReplacementCandidates,
  selectReplacementCandidate,
} from "./ranking";

function candidate(
  id: string,
  overrides: Partial<ReplacementCandidate> = {},
): ReplacementCandidate {
  return {
    id,
    providerPlaceId: `provider-${id}`,
    destinationId: "destination_1",
    category: "ACTIVITY",
    name: `Place ${id}`,
    score: 80,
    rating: 4.5,
    ...overrides,
  };
}

const baseFilter = {
  destinationId: "destination_1",
  category: "ACTIVITY" as const,
};

describe("replacement candidate ranking", () => {
  it("orders by score, rating, provider ID, then name", () => {
    const candidates = [
      candidate("low-score", { score: 79, rating: 5 }),
      candidate("low-rating", {
        score: 90,
        rating: 4.6,
        providerPlaceId: "provider-z",
      }),
      candidate("provider-b", {
        score: 90,
        rating: 4.8,
        providerPlaceId: "provider-b",
        name: "A name",
      }),
      candidate("provider-a-z", {
        score: 90,
        rating: 4.8,
        providerPlaceId: "provider-a",
        name: "Zulu",
      }),
      candidate("provider-a-a", {
        score: 90,
        rating: 4.8,
        providerPlaceId: "provider-a-2",
        name: "Alpha",
      }),
    ];

    expect(
      rankReplacementCandidates(candidates, baseFilter).map(({ id }) => id),
    ).toEqual([
      "provider-a-z",
      "provider-a-a",
      "provider-b",
      "low-rating",
      "low-score",
    ]);
  });

  it("uses name only when earlier keys tie", () => {
    const alpha = candidate("alpha", {
      providerPlaceId: "same-provider",
      name: "Alpha",
    });
    const zulu = candidate("zulu", {
      providerPlaceId: "same-provider",
      name: "Zulu",
    });

    expect(compareReplacementCandidates(zulu, alpha)).toBeGreaterThan(0);
  });

  it("puts null scores and ratings last while retaining tie-breakers", () => {
    const ranked = rankReplacementCandidates(
      [
        candidate("null-all-b", {
          score: null,
          rating: null,
          providerPlaceId: "b",
        }),
        candidate("zero", { score: 0, rating: 0 }),
        candidate("null-score", { score: null, rating: 5 }),
        candidate("null-all-a", {
          score: null,
          rating: null,
          providerPlaceId: "a",
        }),
      ],
      baseFilter,
    );

    expect(ranked.map(({ id }) => id)).toEqual([
      "zero",
      "null-score",
      "null-all-a",
      "null-all-b",
    ]);
  });

  it("requires destination and category compatibility", () => {
    const ranked = rankReplacementCandidates(
      [
        candidate("eligible"),
        candidate("other-destination", {
          destinationId: "destination_2",
          score: 100,
        }),
        candidate("other-category", {
          category: "RESTAURANT",
          score: 100,
        }),
      ],
      baseFilter,
    );

    expect(ranked.map(({ id }) => id)).toEqual(["eligible"]);
  });

  it("excludes selected and rejected internal or provider identities", () => {
    const ranked = rankReplacementCandidates(
      [
        candidate("eligible"),
        candidate("selected-id"),
        candidate("selected-provider", {
          providerPlaceId: "provider-selected",
        }),
        candidate("rejected-id"),
        candidate("rejected-provider", {
          providerPlaceId: "provider-rejected",
        }),
      ],
      {
        ...baseFilter,
        selectedCandidateIds: ["selected-id"],
        selectedProviderPlaceIds: ["provider-selected"],
        rejectedCandidateIds: ["rejected-id"],
        rejectedProviderPlaceIds: ["provider-rejected"],
      },
    );

    expect(ranked.map(({ id }) => id)).toEqual(["eligible"]);
  });

  it("deduplicates a provider place after selecting its best record", () => {
    const ranked = rankReplacementCandidates(
      [
        candidate("stale", {
          providerPlaceId: "provider-duplicate",
          score: 70,
        }),
        candidate("fresh", {
          providerPlaceId: "provider-duplicate",
          score: 95,
        }),
      ],
      baseFilter,
    );

    expect(ranked.map(({ id }) => id)).toEqual(["fresh"]);
  });

  it("is independent of input order and never mutates the input", () => {
    const first = candidate("first", { score: 91 });
    const second = candidate("second", { score: 88 });
    const original = [second, first];
    const copy = [...original];

    const forward = rankReplacementCandidates(original, baseFilter);
    const reverse = rankReplacementCandidates(
      [...original].reverse(),
      baseFilter,
    );

    expect(forward.map(({ id }) => id)).toEqual(["first", "second"]);
    expect(reverse.map(({ id }) => id)).toEqual(["first", "second"]);
    expect(original).toEqual(copy);
  });

  it("selects the first eligible candidate or null", () => {
    expect(
      selectReplacementCandidate(
        [candidate("lower", { score: 80 }), candidate("higher", { score: 90 })],
        baseFilter,
      )?.id,
    ).toBe("higher");
    expect(selectReplacementCandidate([], baseFilter)).toBeNull();
  });
});

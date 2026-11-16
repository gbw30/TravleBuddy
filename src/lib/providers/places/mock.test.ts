import { describe, expect, it } from "vitest";
import { getMockPlacesForCityCategory } from "@/features/recommendations/mock-places";
import { semanticPlaceFingerprint } from "@/features/adaptation/ranking";
import { MockPlacesProvider } from "./mock";

const categories = [
  "HOTEL",
  "ATTRACTION",
  "RESTAURANT",
  "ACTIVITY",
  "LANDMARK",
  "ENTERTAINMENT",
] as const;

describe("canonical mock place provider", () => {
  it.each(categories)(
    "provides at least four stable %s candidates without semantic duplicates",
    async (category) => {
      const canonical = getMockPlacesForCityCategory(
        "Bogota",
        "Colombia",
        category,
        20,
      );
      const outcome = await new MockPlacesProvider().search({
        query: category.toLocaleLowerCase(),
        destination: { city: "Bogota", country: "Colombia" },
        category,
        maxResults: 20,
      });

      expect(canonical.length).toBeGreaterThanOrEqual(4);
      expect(outcome.status).toBe("success");
      if (outcome.status !== "success") return;

      expect(outcome.places.map((place) => place.providerPlaceId)).toEqual(
        canonical.map((place) => place.id),
      );
      expect(outcome.places[0]).toMatchObject({
        name: canonical[0].name,
        estimatedCostAmount: canonical[0].estimatedCostAmount,
        estimatedCostCurrency: canonical[0].estimatedCostCurrency,
      });
      const fingerprints = outcome.places.map(semanticPlaceFingerprint);
      expect(new Set(fingerprints).size).toBe(fingerprints.length);
    },
  );
});

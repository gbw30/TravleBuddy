import { describe, expect, it } from "vitest";
import { getContinueTripCreationMissingRequirements } from "./schemas";

describe("new trip continue readiness", () => {
  it("reports missing fields for incomplete continuation", () => {
    expect(
      getContinueTripCreationMissingRequirements({
        title: "",
        destinations: [],
        startDate: "",
        endDate: "",
        budgetAmount: "",
        budgetCurrency: "",
        travelStyle: "",
      }),
    ).toEqual([
      "trip title",
      "at least one destination",
      "valid date range",
      "trip-level budget amount and currency",
      "travel style",
    ]);
  });

  it("allows continuation when all required planning fields are present", () => {
    expect(
      getContinueTripCreationMissingRequirements({
        title: "European route",
        destinations: [{ city: "Barcelona", country: "Spain" }],
        startDate: "2026-07-01",
        endDate: "2026-07-20",
        budgetAmount: "3200",
        budgetCurrency: "EUR",
        travelStyle: "BALANCED",
      }),
    ).toEqual([]);
  });
});

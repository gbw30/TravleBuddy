import { describe, expect, it } from "vitest";
import {
  canUseDiscovery,
  canUseFullPlanning,
  getTripReadiness,
  type TripReadinessInput,
} from "./readiness";

const completePlanningTrip = {
  status: "PLANNING",
  startDate: new Date("2026-07-01"),
  endDate: new Date("2026-07-08"),
  budgetAmount: "2500.00",
  budgetCurrency: "USD",
  travelStyle: "BALANCED",
  destinations: [{ city: "Paris", country: "France" }],
} satisfies TripReadinessInput;

describe("trip readiness", () => {
  it("allows draft trips to use discovery", () => {
    expect(canUseDiscovery({ status: "DRAFT" })).toBe(true);
  });

  it("does not allow draft trips to use full planning", () => {
    expect(
      canUseFullPlanning({
        ...completePlanningTrip,
        status: "DRAFT",
      }),
    ).toBe(false);
  });

  it("does not allow full planning when dates are missing", () => {
    expect(
      canUseFullPlanning({
        ...completePlanningTrip,
        startDate: null,
      }),
    ).toBe(false);
  });

  it("does not allow full planning when budget is missing", () => {
    expect(
      canUseFullPlanning({
        ...completePlanningTrip,
        budgetAmount: null,
      }),
    ).toBe(false);
  });

  it("does not allow full planning when budget is not positive", () => {
    expect(
      canUseFullPlanning({
        ...completePlanningTrip,
        budgetAmount: "0.00",
      }),
    ).toBe(false);

    expect(
      canUseFullPlanning({
        ...completePlanningTrip,
        budgetAmount: "-100.00",
      }),
    ).toBe(false);
  });

  it("does not allow full planning when budget is not numeric", () => {
    expect(
      canUseFullPlanning({
        ...completePlanningTrip,
        budgetAmount: "not-a-budget",
      }),
    ).toBe(false);
  });

  it("does not allow full planning when currency is missing", () => {
    expect(
      canUseFullPlanning({
        ...completePlanningTrip,
        budgetCurrency: null,
      }),
    ).toBe(false);
  });

  it("does not allow full planning when destinations are missing", () => {
    expect(
      canUseFullPlanning({
        ...completePlanningTrip,
        destinations: [],
      }),
    ).toBe(false);
  });

  it("does not allow full planning when travel pace/style is missing", () => {
    expect(
      canUseFullPlanning({
        ...completePlanningTrip,
        travelStyle: null,
      }),
    ).toBe(false);
  });

  it("accepts travel pace from the persisted preference relation", () => {
    expect(
      canUseFullPlanning({
        ...completePlanningTrip,
        travelStyle: null,
        preference: { pace: "RELAXED" },
      }),
    ).toBe(true);
  });

  it("allows full planning when status, dates, budget, currency, destinations, and pace exist", () => {
    expect(canUseFullPlanning(completePlanningTrip)).toBe(true);
  });

  it("returns missing requirements for UI and engine guidance", () => {
    expect(
      getTripReadiness({
        status: "DRAFT",
      }).missingRequirements,
    ).toEqual([
      "planning status",
      "at least one destination",
      "valid date range",
      "trip-level budget amount and currency",
      "travel pace/style",
    ]);
  });
});

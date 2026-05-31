import { describe, expect, it } from "vitest";
import {
  createTripInputSchema,
  deriveTripStatusFromDetails,
  getContinueTripCreationMissingRequirements,
  mergeTripPatchForValidation,
  patchTripInputSchema,
  supportedBudgetCurrencies,
  updateTripInputSchema,
} from "./schemas";

function dateInputFromOffset(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

describe("trip Stage 4 schemas", () => {
  it("allows title-only draft trip creation", () => {
    const parsed = createTripInputSchema.parse({
      title: "Summer research trip",
    });

    expect(parsed).toEqual({
      title: "Summer research trip",
      intent: "draft",
    });
  });

  it("allows full planning-ready creation details", () => {
    const parsed = createTripInputSchema.parse({
      intent: "continue",
      title: "European route",
      departureCity: "Bogota",
      departureCountry: "Colombia",
      destinations: [
        { city: "Barcelona", country: "Spain" },
        { city: "Madrid", country: "Spain" },
        { city: "Amsterdam", country: "Netherlands" },
      ],
      startDate: "2026-07-01",
      endDate: "2026-07-20",
      budgetAmount: "3200",
      budgetCurrency: "EUR",
      travelStyle: "BALANCED",
    });

    expect(parsed.destinations).toEqual([
      { city: "Barcelona", country: "Spain" },
      { city: "Madrid", country: "Spain" },
      { city: "Amsterdam", country: "Netherlands" },
    ]);
    expect(parsed.departureTimeZone).toBe("America/Bogota");
    expect(parsed.startDate).toEqual(new Date("2026-07-01T00:00:00.000Z"));
    expect(parsed.intent).toBe("continue");
  });

  it("parses the new-trip preference autofill option", () => {
    expect(
      createTripInputSchema.parse({
        title: "Profile-backed trip",
        useProfilePreferences: "on",
      }),
    ).toMatchObject({
      title: "Profile-backed trip",
      useProfilePreferences: true,
    });
  });

  it("rejects invalid city and country catalog pairs", () => {
    expect(() =>
      createTripInputSchema.parse({
        title: "Bad pair",
        destinations: [{ city: "Barcelona", country: "France" }],
      }),
    ).toThrow();
  });

  it("requires complete details when continuing trip creation", () => {
    expect(() =>
      createTripInputSchema.parse({
        intent: "continue",
        title: "Incomplete",
        destinations: [{ city: "Barcelona", country: "Spain" }],
      }),
    ).toThrow();

    expect(
      getContinueTripCreationMissingRequirements({
        title: "Incomplete",
        destinations: [{ city: "Barcelona", country: "Spain" }],
      }),
    ).toEqual([
      "valid date range",
      "trip-level budget amount and currency",
      "travel style",
    ]);
  });

  it("supports only USD and EUR budget currencies for Stage 4", () => {
    expect(supportedBudgetCurrencies).toEqual(["USD", "EUR"]);

    expect(() =>
      updateTripInputSchema.parse({
        title: "Paris",
        budgetAmount: "1200",
        budgetCurrency: "EUR",
      }),
    ).not.toThrow();

    expect(() =>
      updateTripInputSchema.parse({
        title: "Bogota",
        budgetAmount: "1200",
        budgetCurrency: "COP",
      }),
    ).toThrow();
  });

  it("rejects partial date ranges", () => {
    expect(() =>
      updateTripInputSchema.parse({
        title: "Madrid",
        startDate: "2026-07-01",
      }),
    ).toThrow();
  });

  it("rejects an end date before the start date", () => {
    expect(() =>
      updateTripInputSchema.parse({
        title: "Madrid",
        startDate: "2026-07-10",
        endDate: "2026-07-01",
      }),
    ).toThrow();
  });

  it("rejects trip dates before the current day", () => {
    const yesterday = dateInputFromOffset(-1);
    const tomorrow = dateInputFromOffset(1);

    expect(() =>
      createTripInputSchema.parse({
        intent: "continue",
        title: "Past trip",
        destinations: [{ city: "Barcelona", country: "Spain" }],
        startDate: yesterday,
        endDate: tomorrow,
        budgetAmount: "1200",
        budgetCurrency: "EUR",
        travelStyle: "BALANCED",
      }),
    ).toThrow();

    expect(() =>
      updateTripInputSchema.parse({
        title: "Past trip",
        startDate: yesterday,
        endDate: tomorrow,
      }),
    ).toThrow();
  });

  it("accepts strict YYYY-MM-DD date strings", () => {
    const parsed = updateTripInputSchema.parse({
      title: "Madrid",
      startDate: "2026-07-10",
      endDate: "2026-07-12",
    });

    expect(parsed.startDate).toEqual(new Date("2026-07-10T00:00:00.000Z"));
    expect(parsed.endDate).toEqual(new Date("2026-07-12T00:00:00.000Z"));
  });

  it("rejects impossible calendar dates instead of normalizing them", () => {
    expect(() =>
      updateTripInputSchema.parse({
        title: "Madrid",
        startDate: "2026-02-31",
        endDate: "2026-03-05",
      }),
    ).toThrow();
  });

  it("rejects partial destination details", () => {
    expect(() =>
      updateTripInputSchema.parse({
        title: "Lisbon",
        destinationCity: "Lisbon",
      }),
    ).toThrow();
  });

  it("treats blank optional form fields as omitted", () => {
    const parsed = updateTripInputSchema.parse({
      title: "Lisbon",
      destinationCity: "",
      destinationCountry: "",
      startDate: "",
      endDate: "",
      budgetAmount: "",
      budgetCurrency: "",
      travelStyle: "",
    });

    expect(parsed).toEqual({
      title: "Lisbon",
      destinationCity: undefined,
      destinationCountry: undefined,
      startDate: undefined,
      endDate: undefined,
      budgetAmount: undefined,
      budgetCurrency: undefined,
      travelStyle: undefined,
    });
  });

  it("allows true partial PATCH payloads", () => {
    expect(patchTripInputSchema.parse({ title: "Updated title" })).toEqual({
      title: "Updated title",
    });

    expect(patchTripInputSchema.parse({ budgetAmount: "900" })).toEqual({
      budgetAmount: 900,
    });
  });

  it("rejects empty PATCH payloads", () => {
    expect(() => patchTripInputSchema.parse({})).toThrow();
  });

  it("validates destination, date, and budget pairs after merging a patch", () => {
    expect(() =>
      mergeTripPatchForValidation(
        {
          title: "Patch me",
          destinationCity: "Paris",
          destinationCountry: "France",
          startDate: new Date("2026-07-01T00:00:00.000Z"),
          endDate: new Date("2026-07-07T00:00:00.000Z"),
          budgetAmount: 1200,
          budgetCurrency: "USD",
        },
        {
          budgetCurrency: null,
        },
      ),
    ).toThrow();

    expect(
      mergeTripPatchForValidation(
        {
          title: "Patch me",
          destinationCity: "Paris",
          destinationCountry: "France",
          startDate: new Date("2026-07-01T00:00:00.000Z"),
          endDate: new Date("2026-07-07T00:00:00.000Z"),
          budgetAmount: 1200,
          budgetCurrency: "USD",
        },
        {
          budgetAmount: 900,
        },
      ).budgetAmount,
    ).toBe(900);
  });

  it("derives draft status until full planning details exist", () => {
    expect(
      deriveTripStatusFromDetails({
        startDate: null,
        endDate: null,
        budgetAmount: null,
        budgetCurrency: null,
        destinations: [],
      }),
    ).toBe("DRAFT");
  });

  it("derives planning status when destination, dates, and budget exist", () => {
    expect(
      deriveTripStatusFromDetails({
        startDate: new Date("2026-07-01"),
        endDate: new Date("2026-07-07"),
        budgetAmount: "1500",
        budgetCurrency: "USD",
        destinations: [{ city: "New York", country: "United States" }],
      }),
    ).toBe("PLANNING");
  });

  it("preserves archived status during status derivation", () => {
    expect(
      deriveTripStatusFromDetails({
        status: "ARCHIVED",
        startDate: new Date("2026-07-01"),
        endDate: new Date("2026-07-07"),
        budgetAmount: "1500",
        budgetCurrency: "USD",
        destinations: [{ city: "New York", country: "United States" }],
      }),
    ).toBe("ARCHIVED");
  });
});

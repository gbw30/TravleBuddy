import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: {
    requireUser: vi.fn(),
  },
  itinerary: {
    getItinerary: vi.fn(),
  },
}));

vi.mock("@/lib/authorization", () => ({
  requireUser: mocks.auth.requireUser,
}));

vi.mock("@/features/itinerary/builder", () => ({
  getItinerary: mocks.itinerary.getItinerary,
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not-found");
  },
}));

import ItineraryPage from "./page";

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(textContent).join("");
  }

  if (!isValidElement(node)) {
    return "";
  }

  return textContent((node as { props: { children?: ReactNode } }).props.children);
}

function walk(
  node: ReactNode,
  visit: (element: { props: Record<string, unknown>; type: unknown }) => void,
) {
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit));
    return;
  }

  if (!isValidElement(node)) {
    return;
  }

  const element = node as { props: Record<string, unknown>; type: unknown };

  visit(element);
  walk(element.props.children as ReactNode, visit);
}

describe("ItineraryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.requireUser.mockResolvedValue("user_1");
    mocks.itinerary.getItinerary.mockResolvedValue({
      status: "ok",
      itinerary: {
        days: [
          {
            id: "day_1",
            dayNumber: 1,
            date: "2026-07-01",
            title: "Day 1",
            notes: null,
            itemCount: 1,
            estimatedCostAmount: 120,
            estimatedCostCurrency: "EUR",
            items: [
              {
                id: "item_1",
                placeSuggestionId: "suggestion_1",
                title: "Sagrada Familia",
                description: null,
                category: "LANDMARK",
                city: "Barcelona",
                country: "Spain",
                sortOrder: 0,
                estimatedCostAmount: 120,
                estimatedCostCurrency: "EUR",
              },
            ],
          },
        ],
        totals: {
          itemCount: 1,
          estimatedCostAmount: 120,
          estimatedCostCurrency: "EUR",
        },
        conflicts: [],
        conflictSummary: {
          total: 0,
          low: 0,
          medium: 0,
          high: 0,
        },
      },
    });
  });

  it("renders the read-only generated itinerary and links back to planning", async () => {
    const page = await ItineraryPage({
      params: Promise.resolve({ tripId: "trip_1" }),
    });

    const text = textContent(page);

    expect(mocks.itinerary.getItinerary).toHaveBeenCalledWith(
      "user_1",
      "trip_1",
    );
    expect(text).toContain("Generated itinerary");
    expect(text).toContain("Day 1");
    expect(text).toContain("Sagrada Familia");
    expect(text).toContain("Barcelona, Spain");
    expect(text).toContain("Back to planning");
  });

  it("renders empty guidance when no selected places have produced a draft", async () => {
    mocks.itinerary.getItinerary.mockResolvedValue({
      status: "ok",
      itinerary: {
        days: [],
        totals: {
          itemCount: 0,
          estimatedCostAmount: null,
          estimatedCostCurrency: null,
        },
        conflicts: [],
        conflictSummary: {
          total: 0,
          low: 0,
          medium: 0,
          high: 0,
        },
      },
    });

    const page = await ItineraryPage({
      params: Promise.resolve({ tripId: "trip_1" }),
    });

    expect(textContent(page)).toContain("Select places in planning first");
  });

  it("renders open itinerary conflicts", async () => {
    mocks.itinerary.getItinerary.mockResolvedValue({
      status: "ok",
      itinerary: {
        days: [],
        totals: {
          itemCount: 0,
          estimatedCostAmount: null,
          estimatedCostCurrency: null,
        },
        conflicts: [
          {
            id: "conflict_1",
            itineraryItemId: "item_1",
            type: "MISSING_DURATION",
            severity: "LOW",
            status: "OPEN",
            message: "Sagrada Familia is missing a planned duration.",
            recommendation: "Add a duration before detailed scheduling.",
            metadata: { rule: "missing_duration" },
          },
        ],
        conflictSummary: {
          total: 1,
          low: 1,
          medium: 0,
          high: 0,
        },
      },
    });

    const page = await ItineraryPage({
      params: Promise.resolve({ tripId: "trip_1" }),
    });

    const text = textContent(page);

    expect(text).toContain("Conflict check");
    expect(text).toContain("1 open issue");
    expect(text).toContain("Sagrada Familia is missing a planned duration.");
    expect(text).toContain("Add a duration before detailed scheduling.");
  });

  it("uses severity-specific background colors for open conflicts", async () => {
    mocks.itinerary.getItinerary.mockResolvedValue({
      status: "ok",
      itinerary: {
        days: [],
        totals: {
          itemCount: 0,
          estimatedCostAmount: null,
          estimatedCostCurrency: null,
        },
        conflicts: [
          {
            id: "conflict_low",
            itineraryItemId: null,
            type: "MISSING_DURATION",
            severity: "LOW",
            status: "OPEN",
            message: "Low issue.",
            recommendation: null,
            metadata: {},
          },
          {
            id: "conflict_medium",
            itineraryItemId: null,
            type: "DISTANCE",
            severity: "MEDIUM",
            status: "OPEN",
            message: "Medium issue.",
            recommendation: null,
            metadata: {},
          },
          {
            id: "conflict_high",
            itineraryItemId: null,
            type: "BUDGET",
            severity: "HIGH",
            status: "OPEN",
            message: "High issue.",
            recommendation: null,
            metadata: {},
          },
        ],
        conflictSummary: {
          total: 3,
          low: 1,
          medium: 1,
          high: 1,
        },
      },
    });
    const page = await ItineraryPage({
      params: Promise.resolve({ tripId: "trip_1" }),
    });
    const classNames: string[] = [];

    walk(page, (element) => {
      if (typeof element.props.className === "string") {
        classNames.push(element.props.className);
      }
    });

    expect(classNames).toContain("rounded-md border border-sky-200 bg-sky-50 p-4");
    expect(classNames).toContain("rounded-md border border-amber-200 bg-amber-50 p-4");
    expect(classNames).toContain("rounded-md border border-red-200 bg-red-50 p-4");
  });
});

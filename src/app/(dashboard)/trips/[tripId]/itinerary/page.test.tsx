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
      },
    });

    const page = await ItineraryPage({
      params: Promise.resolve({ tripId: "trip_1" }),
    });

    expect(textContent(page)).toContain("Select places in planning first");
  });
});

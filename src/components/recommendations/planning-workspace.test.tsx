import { isValidElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/recommendations/service", () => ({
  addUserPlanningPlaceFormAction: vi.fn(),
  deselectRecommendationFormAction: vi.fn(),
  generateRecommendationsFormAction: vi.fn(),
  recordPlanningMessageFormAction: vi.fn(),
  refreshRecommendationsFormAction: vi.fn(),
  rejectRecommendationFormAction: vi.fn(),
  selectRecommendationFormAction: vi.fn(),
}));

import { PlanningWorkspace } from "./planning-workspace";

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

describe("PlanningWorkspace", () => {
  it("renders reject controls, remove controls, timeline, and itinerary handoff", () => {
    const workspace = PlanningWorkspace({
      trip: {
        id: "trip_1",
        title: "Barcelona",
        destinations: [{ city: "Barcelona", country: "Spain" }],
      },
      preference: {
        budgetLevel: "MODERATE",
        pace: "RELAXED",
        interests: ["MUSEUMS"],
        transportationModes: ["WALKING"],
        accommodationTypes: ["HOTEL"],
        hotelPriority: null,
        walkingToleranceKm: null,
        customPreferences: ["Quiet hotels"],
        mustAvoid: [],
      },
      selectedPlaces: [
        {
          id: "suggestion_1",
          name: "Barcelona Gallery Quarter Hotel",
          category: "HOTEL",
          city: "Barcelona",
          country: "Spain",
          latitude: 41.391,
          longitude: 2.164,
        },
      ],
      recommendations: [
        {
          id: "suggestion_2",
          tripId: "trip_1",
          topic: "HOTEL_BASE",
          name: "Barcelona Design Stay",
          category: "HOTEL",
          status: "PENDING",
          description: null,
          explanation: "Recommended because it matches your interests.",
          city: "Barcelona",
          country: "Spain",
          score: 84,
          rating: 4.6,
          estimatedCostAmount: 260,
          estimatedCostCurrency: "EUR",
        },
        {
          id: "suggestion_3",
          tripId: "trip_1",
          topic: "HOTEL_BASE",
          name: "Rejected Hotel",
          category: "HOTEL",
          status: "REJECTED",
          description: null,
          explanation: "Rejected.",
          city: "Barcelona",
          country: "Spain",
          score: 50,
          rating: 4.1,
          estimatedCostAmount: 300,
          estimatedCostCurrency: "EUR",
        },
      ],
      timelineEvents: [
        {
          id: "event_1",
          actor: "USER",
          type: "USER_FEEDBACK",
          title: "Recommendation rejected",
          message: "Rejected Barcelona Design Stay because it was too expensive.",
          createdAt: "2026-05-31T12:00:00.000Z",
        },
      ],
      placeActionLog: [
        {
          id: "feedback_1",
          action: "REJECT",
          reason: "TOO_EXPENSIVE",
          note: "Misclicked this one.",
          createdAt: "2026-05-31T12:00:00.000Z",
          place: {
            id: "suggestion_3",
            name: "Rejected Hotel",
            category: "HOTEL",
            status: "REJECTED",
            city: "Barcelona",
            country: "Spain",
          },
        },
      ],
      activeTopic: "HOTEL_BASE",
    });

    const text = textContent(workspace);

    expect(text).toContain("Reject");
    expect(text).toContain("Remove");
    expect(text).toContain("Planning timeline");
    expect(text).toContain("Show place log");
    expect(text).toContain("Rejected Hotel");
    expect(text).toContain("Pick again");
    expect(text).toContain("Ready for itinerary handoff");
    expect(text).toContain("Recommendation rejected");
  });
});

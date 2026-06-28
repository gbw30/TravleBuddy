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

describe("PlanningWorkspace", () => {
  it("renders reject controls, remove controls, timeline, and itinerary handoff", () => {
    const workspace = PlanningWorkspace({
      trip: {
        id: "trip_1",
        title: "Barcelona",
        budgetCurrency: "EUR",
        destinations: [
          { id: "destination_1", city: "Barcelona", country: "Spain" },
          { id: "destination_2", city: "Madrid", country: "Spain" },
        ],
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
        {
          id: "suggestion_4",
          name: "Madrid Market Walk",
          category: "ACTIVITY",
          city: "Madrid",
          country: "Spain",
          latitude: 40.4168,
          longitude: -3.7038,
        },
      ],
      recommendations: [
        {
          id: "suggestion_2",
          tripId: "trip_1",
          destinationId: "destination_1",
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
          destinationId: "destination_1",
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
      itineraryPreview: {
        days: [
          {
            id: "day_1",
            dayNumber: 1,
            date: "2026-07-01",
            title: "Day 1",
            notes: null,
            itemCount: 1,
            estimatedCostAmount: 300,
            estimatedCostCurrency: "EUR",
            cityWindows: [],
            timeSlots: [],
            items: [
              {
                id: "item_1",
                placeSuggestionId: "suggestion_1",
                title: "Barcelona Gallery Quarter Hotel",
                description: null,
                category: "HOTEL",
                city: "Barcelona",
                country: "Spain",
                sortOrder: 0,
                estimatedCostAmount: 300,
                estimatedCostCurrency: "EUR",
              },
            ],
          },
        ],
        totals: {
          itemCount: 1,
          estimatedCostAmount: 300,
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
      activeTopic: "HOTEL_BASE",
      activeDestinationId: "destination_1",
      activeDayNumber: 1,
    });

    const text = textContent(workspace);

    expect(text).toContain("Reject");
    expect(text).toContain("Remove");
    expect(text).toContain("Planning timeline");
    expect(text).toContain("Planning context");
    expect(text).toContain("Madrid");
    expect(text).toContain("Show place log");
    expect(text).toContain("Rejected Hotel");
    expect(text).toContain("Pick again");
    expect(text).toContain("Ready for itinerary handoff");
    expect(text).toContain("Itinerary draft");
    expect(text).toContain("Day 1");
    expect(text).toContain("Trip estimate");
    expect(text).toContain("Barcelona, Spain");
    expect(text).toContain("Madrid, Spain");
    expect(text).toContain("Recommendation rejected");
  });

  it("keeps the planning columns aligned to the top to avoid stretched cards", () => {
    const workspace = PlanningWorkspace({
      trip: {
        id: "trip_1",
        title: "Tokyo",
        budgetCurrency: "JPY",
        destinations: [{ id: "destination_1", city: "Tokyo", country: "Japan" }],
      },
      preference: {
        budgetLevel: "MODERATE",
        pace: "BALANCED",
        interests: [],
        transportationModes: [],
        accommodationTypes: [],
        hotelPriority: null,
        walkingToleranceKm: null,
        customPreferences: [],
        mustAvoid: [],
      },
      selectedPlaces: [],
      recommendations: [],
      timelineEvents: [],
      placeActionLog: [],
      itineraryPreview: {
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
      activeTopic: "HOTEL_BASE",
    });
    const classNames: string[] = [];

    walk(workspace, (element) => {
      if (typeof element.props.className === "string") {
        classNames.push(element.props.className);
      }
    });

    expect(classNames).toContain(
      "grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]",
    );
  });

  it("shows every trip day from settings even before selected places create itinerary days", () => {
    const workspace = PlanningWorkspace({
      trip: {
        id: "trip_1",
        title: "USA",
        budgetCurrency: "USD",
        startDate: "2026-07-01",
        endDate: "2026-07-05",
        destinations: [
          { id: "destination_1", city: "Los Angeles", country: "United States" },
          { id: "destination_2", city: "New York", country: "United States" },
        ],
      },
      preference: {
        budgetLevel: "MODERATE",
        pace: "BALANCED",
        interests: [],
        transportationModes: [],
        accommodationTypes: [],
        hotelPriority: null,
        walkingToleranceKm: null,
        customPreferences: [],
        mustAvoid: [],
      },
      selectedPlaces: [],
      recommendations: [],
      timelineEvents: [],
      placeActionLog: [],
      itineraryPreview: {
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
      activeTopic: "ACTIVITIES",
      activeDayNumber: 4,
    });

    const text = textContent(workspace);

    expect(text).toContain("Day 1");
    expect(text).toContain("Day 4");
    expect(text).toContain("Day 5");
  });
});

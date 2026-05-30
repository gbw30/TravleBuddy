import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: {
    requireUser: vi.fn(),
  },
  planning: {
    getPlanningWorkspace: vi.fn(),
  },
}));

vi.mock("@/lib/authorization", () => ({
  requireUser: mocks.auth.requireUser,
}));

vi.mock("@/features/recommendations/service", () => ({
  getPlanningWorkspace: mocks.planning.getPlanningWorkspace,
  addUserPlanningPlaceFormAction: vi.fn(),
  generateRecommendationsFormAction: vi.fn(),
  recordPlanningMessageFormAction: vi.fn(),
  refreshRecommendationsFormAction: vi.fn(),
  selectRecommendationFormAction: vi.fn(),
}));

vi.mock("@/components/recommendations/planning-workspace", () => ({
  PlanningWorkspace: "planning-workspace",
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not-found");
  },
}));

import PlanningPage from "./page";

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

function elementTypes(node: ReactNode) {
  const values: string[] = [];

  walk(node, (element) => {
    if (typeof element.type === "string") {
      values.push(element.type);
    }
  });

  return values;
}

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

describe("PlanningPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.requireUser.mockResolvedValue("user_1");
    mocks.planning.getPlanningWorkspace.mockResolvedValue({
      status: "ok",
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
      selectedPlaces: [],
      recommendations: [],
    });
  });

  it("renders the planning workspace for an owned planning-ready trip", async () => {
    const page = await PlanningPage({
      params: Promise.resolve({ tripId: "trip_1" }),
      searchParams: Promise.resolve({ topic: "HOTEL_BASE" }),
    });

    expect(elementTypes(page)).toContain("planning-workspace");
    expect(mocks.planning.getPlanningWorkspace).toHaveBeenCalledWith(
      "user_1",
      "trip_1",
    );
  });

  it("renders locked-state guidance when full planning is not ready", async () => {
    mocks.planning.getPlanningWorkspace.mockResolvedValue({
      status: "not_ready",
      missingRequirements: ["valid date range"],
    });

    const page = await PlanningPage({
      params: Promise.resolve({ tripId: "trip_1" }),
      searchParams: Promise.resolve({}),
    });

    expect(textContent(page)).toContain("Planning loop is locked");
    expect(textContent(page)).toContain("valid date range");
  });
});

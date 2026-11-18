import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: {
    requireUser: vi.fn(),
  },
  trips: {
    getTripByIdForUser: vi.fn(),
  },
  preferences: {
    getTripPreferenceForUser: vi.fn(),
  },
}));

vi.mock("@/lib/authorization", () => ({
  requireUser: mocks.auth.requireUser,
}));

vi.mock("@/features/trips/queries", () => ({
  getTripByIdForUser: mocks.trips.getTripByIdForUser,
}));

vi.mock("@/features/preferences/queries", () => ({
  getTripPreferenceForUser: mocks.preferences.getTripPreferenceForUser,
}));

vi.mock("@/features/preferences/actions", () => ({
  saveTripPreferenceFormAction: vi.fn(),
}));

vi.mock("@/components/trips/trip-settings-form", () => ({
  TripSettingsForm: "trip-details-form",
}));

vi.mock("@/components/preferences/preference-form", () => ({
  PreferenceForm: "preference-form",
}));

vi.mock("@/components/preferences/preference-summary", () => ({
  PreferenceSummary: "preference-summary",
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not-found");
  },
}));

import TripSettingsPage from "./page";

const trip = {
  id: "trip_1",
  title: "Barcelona",
  status: "PLANNING",
  destinationSearchText: null,
  departureCity: null,
  departureCountry: null,
  departureTimeZone: null,
  startDate: "2026-07-01T00:00:00.000Z",
  endDate: "2026-07-07T00:00:00.000Z",
  budgetAmount: "1500",
  budgetCurrency: "EUR",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  destinations: [{ city: "Barcelona", country: "Spain" }],
  travelStyle: "BALANCED",
  readiness: {
    canUseDiscovery: true,
    canUseFullPlanning: true,
    missingFullPlanningRequirements: [],
  },
};

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

function hrefs(node: ReactNode) {
  const values: string[] = [];

  walk(node, (element) => {
    if (typeof element.props.href === "string") {
      values.push(element.props.href);
    }
  });

  return values;
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

describe("TripSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.requireUser.mockResolvedValue("user_1");
    mocks.trips.getTripByIdForUser.mockResolvedValue(trip);
    mocks.preferences.getTripPreferenceForUser.mockResolvedValue({
      status: "ok",
      trip: {
        id: "trip_1",
        title: "Barcelona",
        status: "PLANNING",
        travelStyle: "BALANCED",
      },
      preference: null,
    });
  });

  it("exposes a separate preferences tab in trip settings", async () => {
    const page = await TripSettingsPage({
      params: Promise.resolve({ tripId: "trip_1" }),
      searchParams: Promise.resolve({}),
    });

    expect(hrefs(page)).toContain("/trips/trip_1/settings?tab=preferences");
    expect(elementTypes(page)).toContain("trip-details-form");
  });

  it("renders preference editing when the preferences tab is active", async () => {
    const page = await TripSettingsPage({
      params: Promise.resolve({ tripId: "trip_1" }),
      searchParams: Promise.resolve({ tab: "preferences" }),
    });

    expect(elementTypes(page)).toContain("preference-form");
    expect(elementTypes(page)).toContain("preference-summary");
  });
});

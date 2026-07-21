import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: {
    requireUser: vi.fn(),
  },
  logistics: {
    getTripLogisticsWorkspace: vi.fn(),
  },
}));

vi.mock("@/lib/authorization", () => ({
  requireUser: mocks.auth.requireUser,
}));

vi.mock("@/features/trips/logistics", () => ({
  getTripLogisticsWorkspace: mocks.logistics.getTripLogisticsWorkspace,
  saveTripLogisticsModeFormAction: vi.fn(),
  addTripTravelSegmentFormAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not-found");
  },
}));

import LogisticsPage from "./page";

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

describe("LogisticsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.requireUser.mockResolvedValue("user_1");
    mocks.logistics.getTripLogisticsWorkspace.mockResolvedValue({
      status: "ok",
      trip: {
        id: "trip_1",
        title: "USA",
        logisticsMode: "FLEXIBLE",
        startDate: "2026-07-01",
        endDate: "2026-07-03",
        destinations: [
          {
            id: "destination_1",
            city: "Los Angeles",
            country: "United States",
            sortOrder: 0,
          },
          {
            id: "destination_2",
            city: "New York",
            country: "United States",
            sortOrder: 1,
          },
        ],
      },
      travelSegments: [],
    });
  });

  it("renders ticketed and flexible planning choices before the planning loop", async () => {
    const page = await LogisticsPage({
      params: Promise.resolve({ tripId: "trip_1" }),
    });

    const text = textContent(page);

    expect(text).toContain("Before planning");
    expect(text).toContain("I have tickets/timing");
    expect(text).toContain("I\u2019ll decide city timing while planning");
    expect(text).toContain("Los Angeles");
    expect(text).toContain("New York");
  });
});

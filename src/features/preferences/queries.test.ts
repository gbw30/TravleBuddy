import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    trip: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({
  db: mocks.db,
}));

import { getTripPreferenceForUser } from "./queries";

describe("preference queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an owned planning-ready trip preference", async () => {
    mocks.db.trip.findFirst.mockResolvedValue({
      id: "trip_1",
      title: "Barcelona",
      status: "PLANNING",
      startDate: new Date("2026-07-01T00:00:00.000Z"),
      endDate: new Date("2026-07-07T00:00:00.000Z"),
      budgetAmount: "1500",
      budgetCurrency: "EUR",
      destinations: [{ city: "Barcelona", country: "Spain" }],
      preference: {
        id: "preference_1",
        tripId: "trip_1",
        budgetLevel: "MODERATE",
        pace: "BALANCED",
        interests: ["FOOD"],
        transportationModes: ["WALKING"],
        accommodationTypes: ["HOTEL"],
        hotelPriority: 8,
        walkingToleranceKm: { toString: () => "6.5" },
        dietaryRestrictions: ["vegetarian"],
        accessibilityNeeds: ["step-free access"],
        mustAvoid: ["crowds"],
        customNotes: "Stay central.",
        metadata: {
          customPreferences: ["quiet mornings", "local markets"],
        },
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
    });

    await expect(getTripPreferenceForUser("user_1", "trip_1")).resolves.toEqual({
      status: "ok",
      trip: expect.objectContaining({
        id: "trip_1",
        title: "Barcelona",
      }),
      preference: expect.objectContaining({
        id: "preference_1",
        walkingToleranceKm: 6.5,
        dietaryRestrictions: ["vegetarian"],
        customPreferences: ["quiet mornings", "local markets"],
      }),
    });
  });

  it("returns not_ready with missing requirements for incomplete trips", async () => {
    mocks.db.trip.findFirst.mockResolvedValue({
      id: "trip_1",
      title: "Draft",
      status: "DRAFT",
      startDate: null,
      endDate: null,
      budgetAmount: null,
      budgetCurrency: null,
      destinations: [],
      preference: null,
    });

    await expect(getTripPreferenceForUser("user_1", "trip_1")).resolves.toEqual({
      status: "not_ready",
      missingRequirements: expect.arrayContaining(["valid date range"]),
    });
  });
});

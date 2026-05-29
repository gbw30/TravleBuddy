import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    user: {
      findUnique: vi.fn(),
    },
    userTravelPreference: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({
  db: mocks.db,
}));

import {
  getProfileForUser,
  getUserTravelPreferenceForUser,
} from "./queries";

describe("profile queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads the editable profile for the authenticated user", async () => {
    mocks.db.user.findUnique.mockResolvedValue({
      id: "user_1",
      name: "Gabriel",
      email: "gabriel@example.com",
      image: null,
    });

    await expect(getProfileForUser("user_1")).resolves.toEqual({
      id: "user_1",
      name: "Gabriel",
      email: "gabriel@example.com",
      image: null,
    });
  });

  it("loads saved user travel preferences for autofill", async () => {
    mocks.db.userTravelPreference.findUnique.mockResolvedValue({
      id: "user_pref_1",
      userId: "user_1",
      budgetLevel: "MODERATE",
      pace: "BALANCED",
      interests: ["FOOD", "ART"],
      transportationModes: ["WALKING"],
      accommodationTypes: ["HOTEL"],
      hotelPriority: 7,
      walkingToleranceKm: { toString: () => "8.5" },
      dietaryRestrictions: ["vegetarian"],
      accessibilityNeeds: [],
      mustAvoid: ["crowds"],
      customPreferences: ["quiet mornings"],
      metadata: {
        sourceTripId: "trip_1",
      },
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    });

    await expect(getUserTravelPreferenceForUser("user_1")).resolves.toMatchObject({
      id: "user_pref_1",
      budgetLevel: "MODERATE",
      pace: "BALANCED",
      walkingToleranceKm: 8.5,
      customPreferences: ["quiet mornings"],
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "@/lib/authorization";

const mocks = vi.hoisted(() => ({
  auth: {
    assertAuthenticatedApiUser: vi.fn(),
  },
  actions: {
    saveTripPreference: vi.fn(),
  },
  queries: {
    getTripPreferenceForUser: vi.fn(),
  },
}));

vi.mock("@/lib/authorization", () => ({
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor() {
      super("Unauthorized");
      this.name = "UnauthorizedError";
    }
  },
  assertAuthenticatedApiUser: mocks.auth.assertAuthenticatedApiUser,
}));

vi.mock("@/features/preferences/actions", () => ({
  saveTripPreference: mocks.actions.saveTripPreference,
}));

vi.mock("@/features/preferences/queries", () => ({
  getTripPreferenceForUser: mocks.queries.getTripPreferenceForUser,
}));

import { GET, PUT } from "./route";

const context = {
  params: Promise.resolve({
    tripId: "trip_1",
  }),
};

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/trips/trip_1/preferences", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

const preference = {
  id: "preference_1",
  tripId: "trip_1",
  budgetLevel: "MODERATE",
  pace: "BALANCED",
  interests: ["FOOD"],
  transportationModes: ["WALKING"],
  accommodationTypes: [],
  hotelPriority: null,
  walkingToleranceKm: null,
  dietaryRestrictions: [],
  accessibilityNeeds: [],
  mustAvoid: [],
  customNotes: null,
  customPreferences: ["quiet mornings"],
  metadata: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const completePreferencePayload = {
  budgetLevel: "MODERATE",
  pace: "BALANCED",
  interests: ["FOOD"],
  transportationModes: ["WALKING"],
  customPreferences: ["quiet mornings"],
};

describe("/api/trips/[tripId]/preferences route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.assertAuthenticatedApiUser.mockResolvedValue("user_1");
  });

  it("returns a preference profile for an owned planning-ready trip", async () => {
    mocks.queries.getTripPreferenceForUser.mockResolvedValue({
      status: "ok",
      preference,
    });

    const response = await GET(new Request("http://localhost"), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ preference });
  });

  it("maps GET auth, ownership, and readiness failures", async () => {
    mocks.auth.assertAuthenticatedApiUser.mockRejectedValueOnce(
      new UnauthorizedError(),
    );
    expect((await GET(new Request("http://localhost"), context)).status).toBe(401);

    mocks.auth.assertAuthenticatedApiUser.mockResolvedValue("user_1");
    mocks.queries.getTripPreferenceForUser.mockResolvedValueOnce({
      status: "not_found",
    });
    expect((await GET(new Request("http://localhost"), context)).status).toBe(404);

    mocks.queries.getTripPreferenceForUser.mockResolvedValueOnce({
      status: "not_ready",
      missingRequirements: ["valid date range"],
    });
    expect((await GET(new Request("http://localhost"), context)).status).toBe(409);

    mocks.queries.getTripPreferenceForUser.mockResolvedValueOnce({
      status: "archived",
    });
    expect((await GET(new Request("http://localhost"), context)).status).toBe(409);
  });

  it("upserts a complete preference profile", async () => {
    mocks.actions.saveTripPreference.mockResolvedValue({
      status: "saved",
      operation: "created",
      preference,
    });

    const response = await PUT(
      jsonRequest(completePreferencePayload),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.actions.saveTripPreference).toHaveBeenCalledWith(
      "user_1",
      "trip_1",
      expect.objectContaining({
        budgetLevel: "MODERATE",
        pace: "BALANCED",
        customPreferences: ["quiet mornings"],
      }),
    );
  });

  it("maps PUT validation and access failures", async () => {
    expect((await PUT(jsonRequest({}), context)).status).toBe(400);

    mocks.auth.assertAuthenticatedApiUser.mockRejectedValueOnce(
      new UnauthorizedError(),
    );
    expect((await PUT(jsonRequest(completePreferencePayload), context)).status).toBe(
      401,
    );

    mocks.actions.saveTripPreference.mockResolvedValueOnce({ status: "not_found" });
    expect(
      (await PUT(jsonRequest(completePreferencePayload), context)).status,
    ).toBe(404);

    mocks.actions.saveTripPreference.mockResolvedValueOnce({
      status: "archived",
    });
    expect(
      (await PUT(jsonRequest(completePreferencePayload), context)).status,
    ).toBe(409);

    mocks.actions.saveTripPreference.mockResolvedValueOnce({
      status: "not_ready",
      missingRequirements: ["valid date range"],
    });
    expect(
      (await PUT(jsonRequest(completePreferencePayload), context)).status,
    ).toBe(409);
  });
});

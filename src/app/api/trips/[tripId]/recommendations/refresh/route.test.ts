import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: {
    assertAuthenticatedApiUser: vi.fn(),
  },
  service: {
    refreshRecommendations: vi.fn(),
  },
}));

vi.mock("@/lib/authorization", () => ({
  UnauthorizedError: class UnauthorizedError extends Error {},
  assertAuthenticatedApiUser: mocks.auth.assertAuthenticatedApiUser,
}));

vi.mock("@/features/recommendations/service", () => ({
  refreshRecommendations: mocks.service.refreshRecommendations,
}));

import { POST } from "./route";

const context = {
  params: Promise.resolve({
    tripId: "trip_1",
  }),
};

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/trips/trip_1/recommendations/refresh", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("/api/trips/[tripId]/recommendations/refresh route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.assertAuthenticatedApiUser.mockResolvedValue("user_1");
  });

  it("records a refinement note and refreshes a recommendation batch", async () => {
    mocks.service.refreshRecommendations.mockResolvedValue({
      status: "generated",
      recommendations: [{ id: "suggestion_2" }],
    });

    const response = await POST(
      jsonRequest({ topic: "HOTEL_BASE", note: "Less expensive and quieter." }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.service.refreshRecommendations).toHaveBeenCalledWith(
      "user_1",
      "trip_1",
      {
        topic: "HOTEL_BASE",
        note: "Less expensive and quieter.",
      },
    );
  });

  it("returns 400 when the refresh note is missing", async () => {
    const response = await POST(jsonRequest({ topic: "HOTEL_BASE" }), context);

    expect(response.status).toBe(400);
  });
});

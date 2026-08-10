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

const mutationControl = {
  expectedRevision: 0,
  operationId: "00000000-0000-4000-8000-000000000004",
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
      jsonRequest({
        topic: "HOTEL_BASE",
        note: "Less expensive and quieter.",
        ...mutationControl,
      }),
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
      expect.objectContaining({
        ...mutationControl,
        mutationKind: "recommendations_refresh",
        requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it("returns 400 when the refresh note is missing", async () => {
    const response = await POST(
      jsonRequest({ topic: "HOTEL_BASE", ...mutationControl }),
      context,
    );

    expect(response.status).toBe(400);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: {
    assertAuthenticatedApiUser: vi.fn(),
  },
  service: {
    generateRecommendations: vi.fn(),
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

vi.mock("@/features/recommendations/service", () => ({
  generateRecommendations: mocks.service.generateRecommendations,
}));

import { POST } from "./route";

const context = {
  params: Promise.resolve({
    tripId: "trip_1",
  }),
};

function jsonRequest(body: unknown) {
  return new Request(
    "http://localhost/api/trips/trip_1/recommendations/generate",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

describe("/api/trips/[tripId]/recommendations/generate route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.assertAuthenticatedApiUser.mockResolvedValue("user_1");
  });

  it("generates a topic-specific recommendation batch", async () => {
    mocks.service.generateRecommendations.mockResolvedValue({
      status: "generated",
      recommendations: [{ id: "suggestion_1" }],
    });

    const response = await POST(jsonRequest({ topic: "HOTEL_BASE" }), context);

    expect(response.status).toBe(200);
    expect(mocks.service.generateRecommendations).toHaveBeenCalledWith(
      "user_1",
      "trip_1",
      { topic: "HOTEL_BASE" },
    );
  });

  it("returns 409 when more topic context is needed", async () => {
    mocks.service.generateRecommendations.mockResolvedValue({
      status: "needs_more_context",
      readiness: {
        isReady: false,
        signalCount: 1,
        missingSignalCount: 1,
      },
    });

    const response = await POST(jsonRequest({ topic: "HOTEL_BASE" }), context);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "More preference context is needed.",
      details: {
        readiness: {
          isReady: false,
          signalCount: 1,
          missingSignalCount: 1,
        },
      },
    });
  });

  it("returns 400 for invalid payloads", async () => {
    const response = await POST(jsonRequest({ topic: "UNKNOWN" }), context);

    expect(response.status).toBe(400);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "@/lib/authorization";

const mocks = vi.hoisted(() => ({
  auth: {
    assertAuthenticatedApiUser: vi.fn(),
  },
  service: {
    listRecommendations: vi.fn(),
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
  listRecommendations: mocks.service.listRecommendations,
}));

import { GET } from "./route";

const context = {
  params: Promise.resolve({
    tripId: "trip_1",
  }),
};

describe("/api/trips/[tripId]/recommendations route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.assertAuthenticatedApiUser.mockResolvedValue("user_1");
  });

  it("lists topic recommendations for an owned planning-ready trip", async () => {
    mocks.service.listRecommendations.mockResolvedValue({
      status: "ok",
      recommendations: [{ id: "suggestion_1" }],
    });

    const response = await GET(
      new Request(
        "http://localhost/api/trips/trip_1/recommendations?topic=HOTEL_BASE",
      ),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.service.listRecommendations).toHaveBeenCalledWith(
      "user_1",
      "trip_1",
      "HOTEL_BASE",
    );
    await expect(response.json()).resolves.toEqual({
      recommendations: [{ id: "suggestion_1" }],
    });
  });

  it("maps auth and access failures", async () => {
    mocks.auth.assertAuthenticatedApiUser.mockRejectedValueOnce(
      new UnauthorizedError(),
    );
    expect(
      (await GET(new Request("http://localhost/api/trips/trip_1/recommendations"), context))
        .status,
    ).toBe(401);

    mocks.auth.assertAuthenticatedApiUser.mockResolvedValue("user_1");
    mocks.service.listRecommendations.mockResolvedValueOnce({
      status: "not_found",
    });
    expect(
      (await GET(new Request("http://localhost/api/trips/trip_1/recommendations"), context))
        .status,
    ).toBe(404);

    mocks.service.listRecommendations.mockResolvedValueOnce({
      status: "not_ready",
      missingRequirements: ["valid date range"],
    });
    expect(
      (await GET(new Request("http://localhost/api/trips/trip_1/recommendations"), context))
        .status,
    ).toBe(409);
  });
});

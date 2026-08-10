import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "@/lib/authorization";

const mocks = vi.hoisted(() => ({
  auth: {
    assertAuthenticatedApiUser: vi.fn(),
  },
  itinerary: {
    getItinerary: vi.fn(),
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

vi.mock("@/features/itinerary/builder", () => ({
  getItinerary: mocks.itinerary.getItinerary,
}));

import { GET } from "./route";

const context = {
  params: Promise.resolve({
    tripId: "trip_1",
  }),
};

describe("/api/trips/[tripId]/itinerary route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.assertAuthenticatedApiUser.mockResolvedValue("user_1");
  });

  it("returns persisted itinerary days for an owned planning-ready trip", async () => {
    mocks.itinerary.getItinerary.mockResolvedValue({
      status: "ok",
      itinerary: {
        days: [{ id: "day_1", dayNumber: 1, items: [] }],
        totals: { itemCount: 0 },
      },
    });

    const response = await GET(
      new Request("http://localhost/api/trips/trip_1/itinerary"),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.itinerary.getItinerary).toHaveBeenCalledWith(
      "user_1",
      "trip_1",
      undefined,
    );
    await expect(response.json()).resolves.toEqual({
      itinerary: {
        days: [{ id: "day_1", dayNumber: 1, items: [] }],
        totals: { itemCount: 0 },
      },
    });
  });

  it("loads a positive numeric historical version", async () => {
    mocks.itinerary.getItinerary.mockResolvedValue({
      status: "ok",
      itinerary: {
        version: { id: "version_2", version: 2 },
        days: [],
      },
    });

    const response = await GET(
      new Request("http://localhost/api/trips/trip_1/itinerary?version=2"),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.itinerary.getItinerary).toHaveBeenCalledWith(
      "user_1",
      "trip_1",
      2,
    );
  });

  it("rejects malformed or repeated version queries before reading data", async () => {
    expect(
      (
        await GET(
          new Request(
            "http://localhost/api/trips/trip_1/itinerary?version=1.5",
          ),
          context,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await GET(
          new Request(
            "http://localhost/api/trips/trip_1/itinerary?version=1&version=2",
          ),
          context,
        )
      ).status,
    ).toBe(400);
    expect(mocks.itinerary.getItinerary).not.toHaveBeenCalled();
  });

  it("maps auth and access failures", async () => {
    mocks.auth.assertAuthenticatedApiUser.mockRejectedValueOnce(
      new UnauthorizedError(),
    );
    expect((await GET(new Request("http://localhost"), context)).status).toBe(
      401,
    );

    mocks.auth.assertAuthenticatedApiUser.mockResolvedValue("user_1");
    mocks.itinerary.getItinerary.mockResolvedValueOnce({ status: "not_found" });
    expect((await GET(new Request("http://localhost"), context)).status).toBe(
      404,
    );

    mocks.itinerary.getItinerary.mockResolvedValueOnce({
      status: "version_not_found",
    });
    expect(
      (await GET(new Request("http://localhost?version=999"), context)).status,
    ).toBe(404);

    mocks.itinerary.getItinerary.mockResolvedValueOnce({
      status: "invalid_version",
    });
    expect((await GET(new Request("http://localhost"), context)).status).toBe(
      400,
    );

    mocks.itinerary.getItinerary.mockResolvedValueOnce({
      status: "not_ready",
      missingRequirements: ["valid date range"],
    });
    expect((await GET(new Request("http://localhost"), context)).status).toBe(
      409,
    );
  });
});

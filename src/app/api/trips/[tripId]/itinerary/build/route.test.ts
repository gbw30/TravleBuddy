import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "@/lib/authorization";

const mocks = vi.hoisted(() => ({
  auth: {
    assertAuthenticatedApiUser: vi.fn(),
  },
  itinerary: {
    rebuildItinerary: vi.fn(),
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
  rebuildItinerary: mocks.itinerary.rebuildItinerary,
}));

import { POST } from "./route";

const context = {
  params: Promise.resolve({
    tripId: "trip_1",
  }),
};

describe("/api/trips/[tripId]/itinerary/build route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.assertAuthenticatedApiUser.mockResolvedValue("user_1");
  });

  it("rebuilds the itinerary for an owned planning-ready trip", async () => {
    mocks.itinerary.rebuildItinerary.mockResolvedValue({
      status: "rebuilt",
      itinerary: {
        days: [{ id: "day_1", dayNumber: 1, items: [] }],
        totals: { itemCount: 0 },
      },
    });

    const response = await POST(new Request("http://localhost"), context);

    expect(response.status).toBe(200);
    expect(mocks.itinerary.rebuildItinerary).toHaveBeenCalledWith(
      "user_1",
      "trip_1",
    );
    await expect(response.json()).resolves.toEqual({
      rebuilt: true,
      itinerary: {
        days: [{ id: "day_1", dayNumber: 1, items: [] }],
        totals: { itemCount: 0 },
      },
    });
  });

  it("returns a clear no-selected-places status", async () => {
    mocks.itinerary.rebuildItinerary.mockResolvedValue({
      status: "no_selected_places",
      itinerary: {
        days: [],
        totals: {
          itemCount: 0,
          estimatedCostAmount: null,
          estimatedCostCurrency: null,
        },
      },
    });

    const response = await POST(new Request("http://localhost"), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      rebuilt: false,
      status: "no_selected_places",
      itinerary: {
        days: [],
        totals: {
          itemCount: 0,
          estimatedCostAmount: null,
          estimatedCostCurrency: null,
        },
      },
    });
  });

  it("maps auth and access failures", async () => {
    mocks.auth.assertAuthenticatedApiUser.mockRejectedValueOnce(
      new UnauthorizedError(),
    );
    expect((await POST(new Request("http://localhost"), context)).status).toBe(
      401,
    );

    mocks.auth.assertAuthenticatedApiUser.mockResolvedValue("user_1");
    mocks.itinerary.rebuildItinerary.mockResolvedValueOnce({
      status: "archived",
    });
    expect((await POST(new Request("http://localhost"), context)).status).toBe(
      409,
    );
  });
});

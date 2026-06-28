import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "@/lib/authorization";

const mocks = vi.hoisted(() => ({
  auth: {
    assertAuthenticatedApiUser: vi.fn(),
  },
  conflicts: {
    updateItineraryConflictStatus: vi.fn(),
  },
  cache: {
    revalidatePath: vi.fn(),
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

vi.mock("@/features/itinerary/conflict-engine", () => ({
  updateItineraryConflictStatus: mocks.conflicts.updateItineraryConflictStatus,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.cache.revalidatePath,
}));

import { PATCH } from "./route";

const context = {
  params: Promise.resolve({
    tripId: "trip_1",
    conflictId: "conflict_1",
  }),
};

describe("/api/trips/[tripId]/conflicts/[conflictId]/resolve route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.assertAuthenticatedApiUser.mockResolvedValue("user_1");
  });

  it("marks conflicts resolved by default", async () => {
    mocks.conflicts.updateItineraryConflictStatus.mockResolvedValue({
      status: "updated",
    });

    const response = await PATCH(new Request("http://localhost"), context);

    expect(response.status).toBe(200);
    expect(mocks.conflicts.updateItineraryConflictStatus).toHaveBeenCalledWith(
      "user_1",
      "trip_1",
      {
        conflictId: "conflict_1",
        status: "RESOLVED",
      },
    );
    expect(mocks.cache.revalidatePath).toHaveBeenCalledWith(
      "/trips/trip_1/itinerary",
    );
    await expect(response.json()).resolves.toEqual({
      updated: true,
      status: "RESOLVED",
    });
  });

  it("can mark conflicts ignored when requested", async () => {
    mocks.conflicts.updateItineraryConflictStatus.mockResolvedValue({
      status: "updated",
    });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ status: "IGNORED" }),
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.conflicts.updateItineraryConflictStatus).toHaveBeenCalledWith(
      "user_1",
      "trip_1",
      {
        conflictId: "conflict_1",
        status: "IGNORED",
      },
    );
  });

  it("maps auth and access failures", async () => {
    mocks.auth.assertAuthenticatedApiUser.mockRejectedValueOnce(
      new UnauthorizedError(),
    );
    expect((await PATCH(new Request("http://localhost"), context)).status).toBe(
      401,
    );

    mocks.auth.assertAuthenticatedApiUser.mockResolvedValue("user_1");
    mocks.conflicts.updateItineraryConflictStatus.mockResolvedValueOnce({
      status: "conflict_not_found",
    });
    expect((await PATCH(new Request("http://localhost"), context)).status).toBe(
      404,
    );

    mocks.conflicts.updateItineraryConflictStatus.mockResolvedValueOnce({
      status: "archived",
    });
    expect((await PATCH(new Request("http://localhost"), context)).status).toBe(
      409,
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "@/lib/authorization";

const mocks = vi.hoisted(() => ({
  auth: {
    assertAuthenticatedApiUser: vi.fn(),
  },
  actions: {
    updateTrip: vi.fn(),
    deleteTrip: vi.fn(),
  },
  queries: {
    getTripByIdForUser: vi.fn(),
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

vi.mock("@/features/trips/actions", () => ({
  updateTrip: mocks.actions.updateTrip,
  deleteTrip: mocks.actions.deleteTrip,
}));

vi.mock("@/features/trips/queries", () => ({
  getTripByIdForUser: mocks.queries.getTripByIdForUser,
}));

import { DELETE, GET, PATCH } from "./route";

const context = {
  params: Promise.resolve({
    tripId: "trip_1",
  }),
};

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/trips/trip_1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

describe("/api/trips/[tripId] route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.assertAuthenticatedApiUser.mockResolvedValue("user_1");
  });

  it("returns a trip owned by the authenticated user", async () => {
    mocks.queries.getTripByIdForUser.mockResolvedValue({ id: "trip_1" });

    const response = await GET(new Request("http://localhost"), context);

    expect(response.status).toBe(200);
    expect(mocks.queries.getTripByIdForUser).toHaveBeenCalledWith(
      "user_1",
      "trip_1",
    );
  });

  it("returns 404 when the trip is missing or non-owned", async () => {
    mocks.queries.getTripByIdForUser.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), context);

    expect(response.status).toBe(404);
  });

  it("returns 401 when the user is unauthenticated", async () => {
    mocks.auth.assertAuthenticatedApiUser.mockRejectedValue(new UnauthorizedError());

    const response = await GET(new Request("http://localhost"), context);

    expect(response.status).toBe(401);
  });

  it("accepts true partial PATCH payloads", async () => {
    mocks.actions.updateTrip.mockResolvedValue({
      status: "updated",
      trip: { id: "trip_1", budgetAmount: "900" },
    });

    const response = await PATCH(jsonRequest({ budgetAmount: "900" }), context);

    expect(response.status).toBe(200);
    expect(mocks.actions.updateTrip).toHaveBeenCalledWith("user_1", "trip_1", {
      budgetAmount: 900,
    });
  });

  it("returns 400 for empty PATCH payloads", async () => {
    const response = await PATCH(jsonRequest({}), context);

    expect(response.status).toBe(400);
  });

  it("returns 404 when PATCH targets a non-owned trip", async () => {
    mocks.actions.updateTrip.mockResolvedValue({ status: "not_found" });

    const response = await PATCH(jsonRequest({ title: "New title" }), context);

    expect(response.status).toBe(404);
  });

  it("returns 409 when PATCH targets an archived trip", async () => {
    mocks.actions.updateTrip.mockResolvedValue({ status: "archived" });

    const response = await PATCH(jsonRequest({ title: "New title" }), context);

    expect(response.status).toBe(409);
  });

  it("deletes an owned active trip", async () => {
    mocks.actions.deleteTrip.mockResolvedValue({ status: "deleted" });

    const response = await DELETE(new Request("http://localhost"), context);

    expect(response.status).toBe(200);
  });

  it("returns 404 when DELETE targets a non-owned trip", async () => {
    mocks.actions.deleteTrip.mockResolvedValue({ status: "not_found" });

    const response = await DELETE(new Request("http://localhost"), context);

    expect(response.status).toBe(404);
  });

  it("returns 409 when DELETE targets an archived trip", async () => {
    mocks.actions.deleteTrip.mockResolvedValue({ status: "archived" });

    const response = await DELETE(new Request("http://localhost"), context);

    expect(response.status).toBe(409);
  });
});

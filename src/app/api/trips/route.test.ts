import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "@/lib/authorization";

const mocks = vi.hoisted(() => ({
  auth: {
    assertAuthenticatedApiUser: vi.fn(),
  },
  actions: {
    createTrip: vi.fn(),
  },
  queries: {
    getTripsForUser: vi.fn(),
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
  createTrip: mocks.actions.createTrip,
}));

vi.mock("@/features/trips/queries", () => ({
  getTripsForUser: mocks.queries.getTripsForUser,
}));

import { GET, POST } from "./route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/trips", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("/api/trips route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.assertAuthenticatedApiUser.mockResolvedValue("user_1");
  });

  it("returns trips for the authenticated user", async () => {
    mocks.queries.getTripsForUser.mockResolvedValue([{ id: "trip_1" }]);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      trips: [{ id: "trip_1" }],
    });
    expect(mocks.queries.getTripsForUser).toHaveBeenCalledWith("user_1");
  });

  it("returns 401 when listing trips without auth", async () => {
    mocks.auth.assertAuthenticatedApiUser.mockRejectedValue(new UnauthorizedError());

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("creates a draft trip", async () => {
    mocks.actions.createTrip.mockResolvedValue({ id: "trip_1", title: "Paris" });

    const response = await POST(jsonRequest({ title: "Paris" }));

    expect(response.status).toBe(201);
    expect(mocks.actions.createTrip).toHaveBeenCalledWith("user_1", {
      title: "Paris",
      intent: "draft",
    });
  });

  it("creates a full planning-ready trip", async () => {
    mocks.actions.createTrip.mockResolvedValue({
      id: "trip_1",
      title: "European route",
      status: "PLANNING",
    });

    const response = await POST(
      jsonRequest({
        intent: "continue",
        title: "European route",
        departureCity: "Bogota",
        departureCountry: "Colombia",
        destinations: [
          { city: "Barcelona", country: "Spain" },
          { city: "Madrid", country: "Spain" },
        ],
        startDate: "2026-07-01",
        endDate: "2026-07-20",
        budgetAmount: "3200",
        budgetCurrency: "EUR",
        travelStyle: "BALANCED",
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.actions.createTrip).toHaveBeenCalledWith("user_1", {
      intent: "continue",
      title: "European route",
      departureCity: "Bogota",
      departureCountry: "Colombia",
      departureTimeZone: "America/Bogota",
      destinations: [
        { city: "Barcelona", country: "Spain" },
        { city: "Madrid", country: "Spain" },
      ],
      startDate: new Date("2026-07-01T00:00:00.000Z"),
      endDate: new Date("2026-07-20T00:00:00.000Z"),
      budgetAmount: 3200,
      budgetCurrency: "EUR",
      travelStyle: "BALANCED",
    });
  });

  it("returns 400 for invalid create payloads", async () => {
    const response = await POST(jsonRequest({ title: "" }));

    expect(response.status).toBe(400);
  });
});

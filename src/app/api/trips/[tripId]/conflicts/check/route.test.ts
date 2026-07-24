import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "@/lib/authorization";

const mocks = vi.hoisted(() => ({
  auth: {
    assertAuthenticatedApiUser: vi.fn(),
  },
  conflicts: {
    checkItineraryConflicts: vi.fn(),
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
  checkItineraryConflicts: mocks.conflicts.checkItineraryConflicts,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.cache.revalidatePath,
}));

import { POST } from "./route";

const context = {
  params: Promise.resolve({
    tripId: "trip_1",
  }),
};

const mutationControl = {
  expectedRevision: 0,
  operationId: "00000000-0000-4000-8000-000000000009",
};

function mutationRequest() {
  return new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify(mutationControl),
  });
}

describe("/api/trips/[tripId]/conflicts/check route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.assertAuthenticatedApiUser.mockResolvedValue("user_1");
  });

  it("checks conflicts for an owned planning-ready trip and revalidates only the itinerary page", async () => {
    mocks.conflicts.checkItineraryConflicts.mockResolvedValue({
      status: "checked",
      conflicts: [
        {
          id: "conflict_1",
          type: "MISSING_DURATION",
          severity: "LOW",
          status: "OPEN",
          message: "Museum is missing a planned duration.",
        },
      ],
      summary: {
        total: 1,
        low: 1,
        medium: 0,
        high: 0,
      },
    });

    const response = await POST(mutationRequest(), context);

    expect(response.status).toBe(200);
    expect(mocks.conflicts.checkItineraryConflicts).toHaveBeenCalledWith(
      "user_1",
      "trip_1",
      expect.objectContaining({
        ...mutationControl,
        mutationKind: "conflicts_check",
        requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(mocks.cache.revalidatePath).toHaveBeenCalledWith(
      "/trips/trip_1/itinerary",
    );
    expect(mocks.cache.revalidatePath).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toEqual({
      checked: true,
      conflicts: [
        {
          id: "conflict_1",
          type: "MISSING_DURATION",
          severity: "LOW",
          status: "OPEN",
          message: "Museum is missing a planned duration.",
        },
      ],
      summary: {
        total: 1,
        low: 1,
        medium: 0,
        high: 0,
      },
    });
  });

  it("maps auth and access failures", async () => {
    mocks.auth.assertAuthenticatedApiUser.mockRejectedValueOnce(
      new UnauthorizedError(),
    );
    expect((await POST(mutationRequest(), context)).status).toBe(
      401,
    );

    mocks.auth.assertAuthenticatedApiUser.mockResolvedValue("user_1");
    mocks.conflicts.checkItineraryConflicts.mockResolvedValueOnce({
      status: "not_found",
    });
    expect((await POST(mutationRequest(), context)).status).toBe(
      404,
    );

    mocks.conflicts.checkItineraryConflicts.mockResolvedValueOnce({
      status: "not_ready",
      missingRequirements: ["valid date range"],
    });
    expect((await POST(mutationRequest(), context)).status).toBe(
      409,
    );
  });
});

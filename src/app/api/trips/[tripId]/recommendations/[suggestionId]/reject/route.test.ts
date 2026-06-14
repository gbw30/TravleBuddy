import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: {
    assertAuthenticatedApiUser: vi.fn(),
  },
  service: {
    rejectRecommendation: vi.fn(),
  },
}));

vi.mock("@/lib/authorization", () => ({
  UnauthorizedError: class UnauthorizedError extends Error {},
  assertAuthenticatedApiUser: mocks.auth.assertAuthenticatedApiUser,
}));

vi.mock("@/features/recommendations/service", () => ({
  rejectRecommendation: mocks.service.rejectRecommendation,
}));

import { POST } from "./route";

const context = {
  params: Promise.resolve({
    tripId: "trip_1",
    suggestionId: "suggestion_1",
  }),
};

function jsonRequest(body: unknown) {
  return new Request(
    "http://localhost/api/trips/trip_1/recommendations/suggestion_1/reject",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

describe("/api/trips/[tripId]/recommendations/[suggestionId]/reject route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.assertAuthenticatedApiUser.mockResolvedValue("user_1");
  });

  it("rejects an owned recommendation with structured feedback", async () => {
    mocks.service.rejectRecommendation.mockResolvedValue({ status: "rejected" });

    const response = await POST(
      jsonRequest({
        reason: "TOO_EXPENSIVE",
        note: "Too much for this trip.",
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.service.rejectRecommendation).toHaveBeenCalledWith(
      "user_1",
      "trip_1",
      {
        suggestionId: "suggestion_1",
        reason: "TOO_EXPENSIVE",
        note: "Too much for this trip.",
      },
    );
  });

  it("returns 400 for non-recommendation feedback reasons", async () => {
    const response = await POST(jsonRequest({ reason: "GOOD_MATCH" }), context);

    expect(response.status).toBe(400);
    expect(mocks.service.rejectRecommendation).not.toHaveBeenCalled();
  });
});

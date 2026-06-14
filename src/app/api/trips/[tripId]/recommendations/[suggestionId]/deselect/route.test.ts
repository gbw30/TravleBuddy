import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: {
    assertAuthenticatedApiUser: vi.fn(),
  },
  service: {
    deselectRecommendation: vi.fn(),
  },
}));

vi.mock("@/lib/authorization", () => ({
  UnauthorizedError: class UnauthorizedError extends Error {},
  assertAuthenticatedApiUser: mocks.auth.assertAuthenticatedApiUser,
}));

vi.mock("@/features/recommendations/service", () => ({
  deselectRecommendation: mocks.service.deselectRecommendation,
}));

import { POST } from "./route";

const context = {
  params: Promise.resolve({
    tripId: "trip_1",
    suggestionId: "suggestion_1",
  }),
};

describe("/api/trips/[tripId]/recommendations/[suggestionId]/deselect route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.assertAuthenticatedApiUser.mockResolvedValue("user_1");
  });

  it("removes a selected place from the live plan without rejecting it", async () => {
    mocks.service.deselectRecommendation.mockResolvedValue({
      status: "deselected",
    });

    const response = await POST(new Request("http://localhost"), context);

    expect(response.status).toBe(200);
    expect(mocks.service.deselectRecommendation).toHaveBeenCalledWith(
      "user_1",
      "trip_1",
      { suggestionId: "suggestion_1" },
    );
  });

  it("returns 404 when the suggestion is missing", async () => {
    mocks.service.deselectRecommendation.mockResolvedValue({
      status: "suggestion_not_found",
    });

    const response = await POST(new Request("http://localhost"), context);

    expect(response.status).toBe(404);
  });
});

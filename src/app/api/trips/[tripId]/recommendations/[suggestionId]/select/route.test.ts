import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: {
    assertAuthenticatedApiUser: vi.fn(),
  },
  service: {
    selectRecommendation: vi.fn(),
  },
}));

vi.mock("@/lib/authorization", () => ({
  UnauthorizedError: class UnauthorizedError extends Error {},
  assertAuthenticatedApiUser: mocks.auth.assertAuthenticatedApiUser,
}));

vi.mock("@/features/recommendations/service", () => ({
  selectRecommendation: mocks.service.selectRecommendation,
}));

import { POST } from "./route";

const context = {
  params: Promise.resolve({
    tripId: "trip_1",
    suggestionId: "suggestion_1",
  }),
};

describe("/api/trips/[tripId]/recommendations/[suggestionId]/select route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.assertAuthenticatedApiUser.mockResolvedValue("user_1");
  });

  it("selects an owned recommendation", async () => {
    mocks.service.selectRecommendation.mockResolvedValue({ status: "selected" });

    const response = await POST(new Request("http://localhost"), context);

    expect(response.status).toBe(200);
    expect(mocks.service.selectRecommendation).toHaveBeenCalledWith(
      "user_1",
      "trip_1",
      { suggestionId: "suggestion_1" },
    );
  });

  it("returns 404 when the suggestion is missing", async () => {
    mocks.service.selectRecommendation.mockResolvedValue({
      status: "suggestion_not_found",
    });

    const response = await POST(new Request("http://localhost"), context);

    expect(response.status).toBe(404);
  });
});

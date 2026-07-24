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

const mutationControl = {
  expectedRevision: 0,
  operationId: "00000000-0000-4000-8000-000000000006",
};

function mutationRequest() {
  return new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify(mutationControl),
  });
}

describe("/api/trips/[tripId]/recommendations/[suggestionId]/deselect route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.assertAuthenticatedApiUser.mockResolvedValue("user_1");
  });

  it("removes a selected place from the live plan without rejecting it", async () => {
    mocks.service.deselectRecommendation.mockResolvedValue({
      status: "deselected",
    });

    const response = await POST(mutationRequest(), context);

    expect(response.status).toBe(200);
    expect(mocks.service.deselectRecommendation).toHaveBeenCalledWith(
      "user_1",
      "trip_1",
      { suggestionId: "suggestion_1" },
      expect.objectContaining({
        ...mutationControl,
        mutationKind: "recommendation_deselect",
        requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it("returns 404 when the suggestion is missing", async () => {
    mocks.service.deselectRecommendation.mockResolvedValue({
      status: "suggestion_not_found",
    });

    const response = await POST(mutationRequest(), context);

    expect(response.status).toBe(404);
  });
});

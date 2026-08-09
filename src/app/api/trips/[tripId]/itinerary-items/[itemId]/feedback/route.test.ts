import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: {
    assertAuthenticatedApiUser: vi.fn(),
  },
  adaptation: {
    captureItineraryItemFeedback: vi.fn(),
  },
}));

vi.mock("@/lib/authorization", () => ({
  UnauthorizedError: class UnauthorizedError extends Error {},
  assertAuthenticatedApiUser: mocks.auth.assertAuthenticatedApiUser,
}));

vi.mock("@/features/adaptation/service", () => ({
  captureItineraryItemFeedback: mocks.adaptation.captureItineraryItemFeedback,
}));

import { POST } from "./route";

const context = {
  params: Promise.resolve({
    tripId: "trip_1",
    itemId: "item_1",
  }),
};

const mutationControl = {
  expectedRevision: 7,
  operationId: "00000000-0000-4000-8000-000000000011",
};

function jsonRequest(body: unknown) {
  return new Request(
    "http://localhost/api/trips/trip_1/itinerary-items/item_1/feedback",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

describe("/api/trips/[tripId]/itinerary-items/[itemId]/feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.assertAuthenticatedApiUser.mockResolvedValue("user_1");
  });

  it("queues owned item feedback and returns a replay-safe 202 contract", async () => {
    mocks.adaptation.captureItineraryItemFeedback.mockResolvedValue({
      status: "queued",
      feedbackId: "feedback_1",
      jobId: "job_1",
      jobStatus: "PENDING",
      revision: 8,
    });

    const response = await POST(
      jsonRequest({
        action: "REQUEST_ALTERNATIVE",
        reason: "TOO_EXPENSIVE",
        userNote: "Keep this day affordable.",
        ...mutationControl,
      }),
      context,
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      feedbackId: "feedback_1",
      jobId: "job_1",
      revision: 8,
      status: "PENDING",
    });
    expect(mocks.adaptation.captureItineraryItemFeedback).toHaveBeenCalledWith(
      "user_1",
      "trip_1",
      "item_1",
      {
        action: "REQUEST_ALTERNATIVE",
        reason: "TOO_EXPENSIVE",
        userNote: "Keep this day affordable.",
      },
      expect.objectContaining({
        ...mutationControl,
        mutationKind: "itinerary_item_feedback",
        requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it("rejects invalid domain and mutation-control payloads", async () => {
    const invalidFeedback = await POST(
      jsonRequest({
        action: "SELECT",
        reason: "GOOD_MATCH",
        ...mutationControl,
      }),
      context,
    );
    expect(invalidFeedback.status).toBe(400);

    const invalidControl = await POST(
      jsonRequest({
        action: "REJECT",
        reason: "NOT_INTERESTED",
        expectedRevision: -1,
        operationId: "not-a-uuid",
      }),
      context,
    );
    expect(invalidControl.status).toBe(422);
    expect(
      mocks.adaptation.captureItineraryItemFeedback,
    ).not.toHaveBeenCalled();
  });

  it("keeps missing and cross-owner items non-disclosing", async () => {
    mocks.adaptation.captureItineraryItemFeedback
      .mockResolvedValueOnce({ status: "not_found" })
      .mockResolvedValueOnce({ status: "item_not_found" });

    expect(
      (
        await POST(
          jsonRequest({
            action: "REJECT",
            reason: "NOT_INTERESTED",
            ...mutationControl,
          }),
          context,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await POST(
          jsonRequest({
            action: "REJECT",
            reason: "NOT_INTERESTED",
            ...mutationControl,
          }),
          context,
        )
      ).status,
    ).toBe(404);
  });

  it("maps stale, archived, invalid, and authentication outcomes", async () => {
    mocks.adaptation.captureItineraryItemFeedback.mockResolvedValueOnce({
      status: "stale_revision",
      revision: 9,
      snapshot: { revision: 9 },
    });
    let response = await POST(
      jsonRequest({
        action: "REJECT",
        reason: "NOT_INTERESTED",
        ...mutationControl,
      }),
      context,
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      status: "stale_revision",
      revision: 9,
    });

    mocks.adaptation.captureItineraryItemFeedback.mockResolvedValueOnce({
      status: "archived",
    });
    response = await POST(
      jsonRequest({
        action: "REJECT",
        reason: "NOT_INTERESTED",
        ...mutationControl,
      }),
      context,
    );
    expect(response.status).toBe(409);

    mocks.adaptation.captureItineraryItemFeedback.mockResolvedValueOnce({
      status: "invalid",
    });
    response = await POST(
      jsonRequest({
        action: "REJECT",
        reason: "NOT_INTERESTED",
        ...mutationControl,
      }),
      context,
    );
    expect(response.status).toBe(422);

    const { UnauthorizedError } = await import("@/lib/authorization");
    mocks.auth.assertAuthenticatedApiUser.mockRejectedValueOnce(
      new UnauthorizedError(),
    );
    response = await POST(
      jsonRequest({
        action: "REJECT",
        reason: "NOT_INTERESTED",
        ...mutationControl,
      }),
      context,
    );
    expect(response.status).toBe(401);
  });

  it("logs a bounded diagnostic code without exposing the database error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const databaseError = Object.assign(
      new Error("sensitive database constraint details"),
      { code: "P2004" },
    );
    mocks.adaptation.captureItineraryItemFeedback.mockRejectedValueOnce(
      databaseError,
    );

    const response = await POST(
      new Request(
        "http://localhost/api/trips/trip_1/itinerary-items/item_1/feedback",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-vercel-id": "iad1::request_1",
          },
          body: JSON.stringify({
            action: "REJECT",
            reason: "NOT_INTERESTED",
            ...mutationControl,
          }),
        },
      ),
      context,
    );

    expect(response.status).toBe(500);
    expect(log).toHaveBeenCalledWith(
      JSON.stringify({
        event: "itinerary_feedback_failed",
        route: "/api/trips/[tripId]/itinerary-items/[itemId]/feedback",
        requestId: "iad1::request_1",
        errorCode: "P2004",
      }),
    );
    expect(log.mock.calls.flat().join(" ")).not.toContain(
      "sensitive database constraint details",
    );
    log.mockRestore();
  });
});

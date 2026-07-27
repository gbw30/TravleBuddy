import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    $transaction: vi.fn(),
  },
  tx: {
    trip: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    tripPreference: {
      findUnique: vi.fn(),
    },
    preferenceProfileVersion: {
      findFirst: vi.fn(),
    },
    planningMutation: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    itineraryItem: {
      findFirst: vi.fn(),
    },
    planningFeedback: {
      create: vi.fn(),
    },
    generationJob: {
      create: vi.fn(),
    },
    jobEvent: {
      create: vi.fn(),
    },
    planningEvent: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({
  db: mocks.db,
}));

import { captureItineraryItemFeedback } from "./service";

const control = {
  expectedRevision: 8,
  operationId: "00000000-0000-4000-8000-000000000101",
  mutationKind: "itinerary_item_feedback" as const,
  requestFingerprint: "a".repeat(64),
};

describe("captureItineraryItemFeedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.$transaction.mockImplementation((callback) => callback(mocks.tx));
    mocks.tx.trip.findFirst.mockResolvedValue({
      id: "trip_1",
      status: "PLANNING",
      planningRevision: 8,
      tripVersion: 4,
      activePreferenceProfileVersionId: "preference_version_1",
      activeItineraryVersionId: "itinerary_version_1",
      preference: {
        id: "preference_1",
      },
    });
    mocks.tx.planningMutation.findUnique.mockResolvedValue(null);
    mocks.tx.itineraryItem.findFirst.mockResolvedValue({
      id: "item_1",
      title: "Museum",
      placeSuggestionId: "suggestion_1",
      dayId: "day_1",
      day: {
        dayNumber: 2,
        itineraryVersionId: "itinerary_version_1",
      },
    });
    mocks.tx.preferenceProfileVersion.findFirst.mockResolvedValue({
      id: "preference_version_1",
      version: 1,
      snapshot: {
        schemaVersion: 1,
        interests: {},
        priceSensitivity: {
          weight: 0.5,
          confidence: 0,
          source: "DEFAULT",
          observedAt: "2026-07-26T12:00:00.000Z",
        },
        pace: null,
      },
    });
    mocks.tx.planningFeedback.create.mockResolvedValue({
      id: "feedback_1",
    });
    mocks.tx.generationJob.create.mockResolvedValue({
      id: "job_1",
      status: "PENDING",
    });
    mocks.tx.trip.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.trip.findUniqueOrThrow.mockResolvedValue({
      planningRevision: 9,
    });
  });

  it("captures feedback, job, initial event, and replay result in one transaction", async () => {
    await expect(
      captureItineraryItemFeedback(
        "user_1",
        "trip_1",
        "item_1",
        {
          action: "REQUEST_ALTERNATIVE",
          reason: "TOO_EXPENSIVE",
        },
        control,
      ),
    ).resolves.toEqual({
      status: "queued",
      feedbackId: "feedback_1",
      jobId: "job_1",
      jobStatus: "PENDING",
      revision: 9,
    });

    expect(mocks.db.$transaction).toHaveBeenCalledOnce();
    expect(mocks.tx.planningFeedback.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventKey: control.operationId,
        capturedTripVersion: 5,
        capturedPreferenceProfileVersionId: "preference_version_1",
        capturedItineraryVersionId: "itinerary_version_1",
        processingStatus: "QUEUED",
        action: "REQUEST_ALTERNATIVE",
        reason: "TOO_EXPENSIVE",
      }),
      select: {
        id: true,
      },
    });
    expect(mocks.tx.generationJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        feedbackId: "feedback_1",
        tripVersion: 5,
        preferenceProfileVersionId: "preference_version_1",
        parentItineraryVersionId: "itinerary_version_1",
        payload: expect.objectContaining({
          feedbackId: "feedback_1",
          operationId: control.operationId,
          tripVersion: 5,
        }),
      }),
      select: {
        id: true,
        status: true,
      },
    });
    expect(mocks.tx.jobEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobId: "job_1",
        type: "RECEIVED",
      }),
    });
    expect(mocks.tx.planningMutation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tripId: "trip_1",
        operationId: control.operationId,
        resultingRevision: 9,
        result: expect.objectContaining({
          feedbackId: "feedback_1",
          jobId: "job_1",
        }),
      }),
    });
  });

  it("returns a bound replay without duplicating the feedback or job", async () => {
    mocks.tx.planningMutation.findUnique.mockResolvedValue({
      kind: "itinerary_item_feedback",
      requestFingerprint: control.requestFingerprint,
      result: {
        status: "queued",
        feedbackId: "feedback_existing",
        jobId: "job_existing",
        jobStatus: "PENDING",
        revision: 9,
      },
    });

    await expect(
      captureItineraryItemFeedback(
        "user_1",
        "trip_1",
        "item_1",
        {
          action: "REQUEST_ALTERNATIVE",
          reason: "TOO_EXPENSIVE",
        },
        control,
      ),
    ).resolves.toMatchObject({
      feedbackId: "feedback_existing",
      jobId: "job_existing",
    });
    expect(mocks.tx.planningFeedback.create).not.toHaveBeenCalled();
    expect(mocks.tx.generationJob.create).not.toHaveBeenCalled();
  });
});

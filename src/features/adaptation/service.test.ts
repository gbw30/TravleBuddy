import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    $transaction: vi.fn(),
  },
  adaptation: {
    materialize: vi.fn(),
    persistPolicy: vi.fn(),
    refreshConflicts: vi.fn(),
  },
  tx: {
    $queryRawUnsafe: vi.fn(),
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
    itineraryVersion: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    placeSuggestion: {
      updateMany: vi.fn(),
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

vi.mock("@/features/itinerary/conflict-engine", () => ({
  refreshItineraryConflictsForTripTx: mocks.adaptation.refreshConflicts,
}));

vi.mock("./version-copy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./version-copy")>()),
  materializeAdaptiveItineraryVersionTx: mocks.adaptation.materialize,
}));

vi.mock("./persistence", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./persistence")>()),
  persistPreferencePolicyResultTx: mocks.adaptation.persistPolicy,
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
    mocks.tx.$queryRawUnsafe.mockResolvedValue([{ planningRevision: 8 }]);
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
      id: "trip_1",
      title: "QA trip",
      status: "PLANNING",
      startDate: new Date("2026-08-01T00:00:00.000Z"),
      endDate: new Date("2026-08-02T00:00:00.000Z"),
      budgetAmount: 500,
      budgetCurrency: "USD",
      destinations: [{ id: "destination_1" }],
      preference: { pace: "BALANCED" },
    });
    mocks.tx.itineraryVersion.findFirst.mockResolvedValue({
      id: "itinerary_version_1",
      version: 1,
      days: [
        {
          id: "day_1",
          dayNumber: 2,
          date: new Date("2026-08-02T00:00:00.000Z"),
          title: "Day 2",
          notes: null,
          estimatedCostAmount: 120,
          estimatedCostCurrency: "USD",
          cityWindows: [],
          items: [
            {
              id: "item_1",
              placeSuggestionId: "suggestion_1",
              title: "Museum",
            },
          ],
        },
      ],
    });
    mocks.adaptation.persistPolicy.mockResolvedValue({
      id: "preference_version_2",
      version: 2,
      created: true,
    });
    mocks.adaptation.materialize.mockResolvedValue({
      id: "itinerary_version_2",
      version: 2,
      affectedDay: 2,
      rejectedSuggestionId: "suggestion_1",
      replacementItemId: null,
    });
    mocks.adaptation.refreshConflicts.mockResolvedValue([]);
    mocks.tx.itineraryVersion.updateMany.mockResolvedValue({ count: 1 });
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
    const feedbackData = mocks.tx.planningFeedback.create.mock.calls[0]?.[0]
      .data as Record<string, unknown>;
    expect(mocks.tx.planningFeedback.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventKey: control.operationId,
        targetType: "ITINERARY_ITEM",
        targetId: "item_1",
        itineraryItemId: "item_1",
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
    expect(feedbackData).not.toHaveProperty("tripPreferenceId");
    expect(feedbackData).not.toHaveProperty("placeSuggestionId");
    expect(feedbackData).not.toHaveProperty("itineraryDayId");
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

  it("replays an immediate removal without creating another version", async () => {
    const removedResult = {
      status: "removed",
      feedbackId: "feedback_existing",
      revision: 9,
      affectedDay: 2,
      itineraryVersion: { id: "itinerary_version_2", version: 2 },
      preferenceDelta: null,
      preferenceExplanation: "Feedback recorded.",
    };
    mocks.tx.planningMutation.findUnique.mockResolvedValue({
      kind: "itinerary_item_feedback",
      requestFingerprint: control.requestFingerprint,
      result: removedResult,
    });

    await expect(
      captureItineraryItemFeedback(
        "user_1",
        "trip_1",
        "item_1",
        { action: "REJECT", reason: "OTHER" },
        control,
      ),
    ).resolves.toEqual(removedResult);
    expect(mocks.tx.$queryRawUnsafe).not.toHaveBeenCalled();
    expect(mocks.tx.planningFeedback.create).not.toHaveBeenCalled();
    expect(mocks.adaptation.materialize).not.toHaveBeenCalled();
  });

  it("removes immediately, learns from expensive feedback, and creates no job", async () => {
    await expect(
      captureItineraryItemFeedback(
        "user_1",
        "trip_1",
        "item_1",
        {
          action: "REJECT",
          reason: "TOO_EXPENSIVE",
        },
        control,
      ),
    ).resolves.toMatchObject({
      status: "removed",
      feedbackId: "feedback_1",
      revision: 9,
      affectedDay: 2,
      itineraryVersion: {
        id: "itinerary_version_2",
        version: 2,
      },
      preferenceDelta: {
        field: "priceSensitivity",
        weightChange: expect.closeTo(0.1, 10),
        confidenceChange: 0.1,
      },
    });

    expect(mocks.db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 5_000,
      timeout: 15_000,
    });
    expect(mocks.tx.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("FOR UPDATE"),
      "trip_1",
    );
    expect(mocks.tx.planningFeedback.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "REJECT",
        reason: "TOO_EXPENSIVE",
        processingStatus: "PROCESSED",
        processedAt: expect.any(Date),
      }),
      select: { id: true },
    });
    expect(mocks.adaptation.persistPolicy).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({
        policy: expect.objectContaining({
          status: "UPDATED",
          snapshot: expect.objectContaining({
            priceSensitivity: expect.objectContaining({
              weight: 0.6,
              confidence: 0.1,
              source: "INFERRED",
            }),
          }),
        }),
      }),
    );
    expect(mocks.adaptation.materialize).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({
        targetItemId: "item_1",
        change: { kind: "REMOVE" },
      }),
    );
    expect(mocks.tx.generationJob.create).not.toHaveBeenCalled();
    expect(mocks.tx.jobEvent.create).not.toHaveBeenCalled();
  });
});

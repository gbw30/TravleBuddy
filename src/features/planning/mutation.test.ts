import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    $transaction: vi.fn(),
  },
  workspace: vi.fn(),
  tx: {
    trip: {
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findFirst: vi.fn(),
    },
    planningMutation: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/features/recommendations/service", () => ({
  getPlanningWorkspace: mocks.workspace,
}));

import {
  executePlanningMutation,
  finalizePlanningMutationTx,
  getPlanningMutationReplayTx,
} from "./mutation";

const snapshot = {
  revision: 8,
  conversationId: null,
  context: {
    topic: "HOTEL_BASE",
    destinationId: "destination_1",
    planningDayNumber: 1,
  },
  preference: {
    budgetLevel: null,
    pace: null,
    interests: [],
    transportationModes: [],
    accommodationTypes: [],
    hotelPriority: null,
    walkingToleranceKm: null,
    customPreferences: [],
    mustAvoid: [],
  },
  readiness: {
    activeTopic: "HOTEL_BASE",
    isReady: false,
    missingQuestionKeys: ["accommodationTypes", "hotelPriority"],
  },
  recommendations: [],
  selectedPlaces: [],
  itinerary: {
    days: [],
    totals: {
      itemCount: 0,
      estimatedCostAmount: null,
      estimatedCostCurrency: null,
    },
    conflicts: [],
    conflictSummary: { total: 0, low: 0, medium: 0, high: 0 },
  },
};

describe("planning mutation finalizer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.$transaction.mockImplementation((callback) => callback(mocks.tx));
    mocks.tx.trip.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.trip.findUniqueOrThrow.mockResolvedValue({ planningRevision: 4 });
    mocks.tx.trip.findFirst.mockResolvedValue({
      id: "trip_1",
      status: "PLANNING",
    });
    mocks.tx.planningMutation.findUnique.mockResolvedValue(null);
    mocks.tx.planningMutation.create.mockResolvedValue({ id: "mutation_1" });
    mocks.workspace.mockResolvedValue({ status: "ok", snapshot });
  });

  it("increments once and stores a versioned compact replay result", async () => {
    const result = await finalizePlanningMutationTx(mocks.tx as never, {
      userId: "user_1",
      tripId: "trip_1",
      kind: "recommendation_select",
      control: { expectedRevision: 3, operationId: " operation_1 " },
      result: { status: "selected" as const },
    });

    expect(result).toEqual({ status: "selected", revision: 4 });
    expect(mocks.tx.trip.updateMany).toHaveBeenCalledOnce();
    expect(mocks.tx.trip.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "trip_1",
        userId: "user_1",
        planningRevision: 3,
      }),
      data: { planningRevision: { increment: 1 } },
    });
    expect(mocks.tx.planningMutation.create).toHaveBeenCalledWith({
      data: {
        tripId: "trip_1",
        operationId: "operation_1",
        kind: "recommendation_select",
        requestedRevision: 3,
        resultingRevision: 4,
        resultVersion: 1,
        result: { status: "selected", revision: 4 },
      },
    });
  });

  it("returns a sequential replay before evaluating an old revision", async () => {
    mocks.tx.planningMutation.findUnique.mockResolvedValue({
      result: { status: "selected", revision: 2 },
    });

    const result = await mocks.db.$transaction(async (tx: typeof mocks.tx) => {
      const replay = await getPlanningMutationReplayTx<{
        status: string;
        revision: number;
      }>(tx as never, "trip_1", {
        expectedRevision: 1,
        operationId: "operation_1",
      });

      if (replay) return replay;

      return finalizePlanningMutationTx(tx as never, {
        userId: "user_1",
        tripId: "trip_1",
        kind: "recommendation_select",
        result: { status: "selected" },
      });
    });

    expect(result).toEqual({ status: "selected", revision: 2 });
    expect(mocks.tx.trip.updateMany).not.toHaveBeenCalled();
  });

  it("returns the latest snapshot when the expected revision misses", async () => {
    mocks.tx.trip.updateMany.mockResolvedValue({ count: 0 });
    const domainWrite = vi.fn();

    const result = await executePlanningMutation({
      userId: "user_1",
      tripId: "trip_1",
      control: { expectedRevision: 7, operationId: "operation_2" },
      transaction: async (tx) => {
        domainWrite();
        return finalizePlanningMutationTx(tx, {
          userId: "user_1",
          tripId: "trip_1",
          kind: "recommendation_reject",
          control: { expectedRevision: 7, operationId: "operation_2" },
          result: { status: "rejected" },
        });
      },
    });

    expect(domainWrite).toHaveBeenCalledOnce();
    expect(mocks.tx.planningMutation.create).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "stale_revision",
      revision: 8,
      snapshot,
    });
  });

  it("recovers a committed replay after a concurrent operation-id collision", async () => {
    mocks.tx.planningMutation.create.mockRejectedValueOnce({ code: "P2002" });
    mocks.tx.planningMutation.findUnique.mockResolvedValueOnce({
      result: { status: "selected", revision: 4 },
      resultingRevision: 4,
    });
    const domainWrite = vi.fn();

    const result = await executePlanningMutation({
      userId: "user_1",
      tripId: "trip_1",
      control: { expectedRevision: 3, operationId: "operation_3" },
      transaction: async (tx) => {
        domainWrite();
        return finalizePlanningMutationTx(tx, {
          userId: "user_1",
          tripId: "trip_1",
          kind: "recommendation_select",
          control: { expectedRevision: 3, operationId: "operation_3" },
          result: { status: "selected" },
        });
      },
    });

    expect(domainWrite).toHaveBeenCalledOnce();
    expect(result).toEqual({ status: "selected", revision: 4 });
    expect(mocks.tx.trip.findFirst).toHaveBeenCalledBefore(
      mocks.tx.planningMutation.findUnique,
    );
  });

  it("does not expose a replay until trip ownership is verified", async () => {
    mocks.tx.planningMutation.create.mockRejectedValueOnce({ code: "P2002" });
    mocks.tx.trip.findFirst.mockResolvedValueOnce(null);

    await expect(
      executePlanningMutation({
        userId: "other_user",
        tripId: "trip_1",
        control: { operationId: "operation_4" },
        transaction: (tx) =>
          finalizePlanningMutationTx(tx, {
            userId: "other_user",
            tripId: "trip_1",
            kind: "recommendation_select",
            control: { operationId: "operation_4" },
            result: { status: "selected" },
          }),
      }),
    ).rejects.toEqual({ code: "P2002" });

    expect(mocks.tx.planningMutation.findUnique).not.toHaveBeenCalled();
  });

  it("returns archived before loading a collision replay", async () => {
    mocks.tx.planningMutation.create.mockRejectedValueOnce({ code: "P2002" });
    mocks.tx.trip.findFirst.mockResolvedValueOnce({
      id: "trip_1",
      status: "ARCHIVED",
    });

    const result = await executePlanningMutation({
      userId: "user_1",
      tripId: "trip_1",
      control: { operationId: "operation_archived" },
      transaction: (tx) =>
        finalizePlanningMutationTx(tx, {
          userId: "user_1",
          tripId: "trip_1",
          kind: "recommendation_select",
          control: { operationId: "operation_archived" },
          result: { status: "selected" },
        }),
    });

    expect(result).toEqual({ status: "archived" });
    expect(mocks.tx.planningMutation.findUnique).not.toHaveBeenCalled();
  });

  it("rejects ledger results larger than 64 KiB", async () => {
    await expect(
      finalizePlanningMutationTx(mocks.tx as never, {
        userId: "user_1",
        tripId: "trip_1",
        kind: "planning_message_save",
        control: { operationId: "operation_5" },
        result: { status: "saved", content: "x".repeat(70 * 1024) },
      }),
    ).rejects.toThrow("64 KiB ledger limit");

    expect(mocks.tx.planningMutation.create).not.toHaveBeenCalled();
  });
});

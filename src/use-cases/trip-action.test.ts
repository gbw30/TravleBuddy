import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class StalePlanningRevisionError extends Error {}
  class PlanningMutationConflictError extends Error {}
  return {
    StalePlanningRevisionError,
    PlanningMutationConflictError,
    execute: vi.fn(),
    finalize: vi.fn(),
    bind: vi.fn(),
  };
});
vi.mock("@/features/planning", () => ({
  StalePlanningRevisionError: mocks.StalePlanningRevisionError,
  PlanningMutationConflictError: mocks.PlanningMutationConflictError,
  executePlanningMutation: mocks.execute,
  finalizePlanningMutationTx: mocks.finalize,
  bindPlanningMutationControl: mocks.bind,
}));

import { Refusal, runTripAction } from "./trip-action";

const tx = { tx: true };
const base = {
  userId: "user-1",
  tripId: "trip-1",
  kind: "trip_rename" as const,
  control: { operationId: "op-1", expectedRevision: 3 },
  request: { action: "rename", title: "Tokyo" },
};

describe("runTripAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.bind.mockImplementation((control, mutationKind) => ({
      ...control,
      mutationKind,
      requestFingerprint: "f".repeat(64),
    }));
    // The real ledger runs the transaction; a repeat would return before it.
    mocks.execute.mockImplementation(({ transaction }) => transaction(tx));
    mocks.finalize.mockImplementation((_tx, { result }) => ({
      ...result,
      revision: 4,
    }));
  });

  it("applies the change and records it in the ledger in the same transaction", async () => {
    const apply = vi.fn().mockResolvedValue({ title: "Tokyo" });

    const outcome = await runTripAction({ ...base, apply });

    expect(outcome).toEqual({
      status: "ok",
      data: { title: "Tokyo" },
      revision: 4,
    });
    expect(apply).toHaveBeenCalledWith(tx);
    expect(mocks.bind).toHaveBeenCalledWith(
      base.control,
      "trip_rename",
      base.request,
    );
    expect(mocks.finalize).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        userId: "user-1",
        tripId: "trip-1",
        kind: "trip_rename",
        control: expect.objectContaining({
          expectedRevision: 3,
          operationId: "op-1",
        }),
      }),
    );
  });

  it.each(["not_found", "archived", "too_many"] as const)(
    "records nothing when the change is refused as %s",
    async (refusal) => {
      const outcome = await runTripAction({
        ...base,
        apply: async () => refusal,
      });
      expect(outcome).toEqual({ status: refusal });
      expect(mocks.finalize).not.toHaveBeenCalled();
    },
  );

  it("reports a change the rules do not allow, with its message, and records nothing", async () => {
    const outcome = await runTripAction({
      ...base,
      apply: async () =>
        new Refusal("That slot holds something already decided."),
    });
    expect(outcome).toEqual({
      status: "refused",
      message: "That slot holds something already decided.",
    });
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it("returns a repeat's first result without applying again", async () => {
    const first = { status: "ok", data: { title: "Tokyo" }, revision: 4 };
    mocks.execute.mockResolvedValue(first);
    const apply = vi.fn();

    expect(await runTripAction({ ...base, apply })).toEqual(first);
    expect(apply).not.toHaveBeenCalled();
  });

  it("reports a stale revision, however the ledger signals it", async () => {
    mocks.execute.mockRejectedValueOnce(new mocks.StalePlanningRevisionError());
    expect(await runTripAction({ ...base, apply: vi.fn() })).toEqual({
      status: "stale",
    });

    mocks.execute.mockResolvedValueOnce({
      status: "stale_revision",
      revision: 9,
    });
    expect(await runTripAction({ ...base, apply: vi.fn() })).toEqual({
      status: "stale",
    });
  });

  it("reports an operation id reused for a different request as a conflict", async () => {
    mocks.execute.mockRejectedValue(new mocks.PlanningMutationConflictError());
    expect(await runTripAction({ ...base, apply: vi.fn() })).toEqual({
      status: "conflict",
    });
  });

  it("lets an unexpected failure through", async () => {
    mocks.execute.mockRejectedValue(new Error("database down"));
    await expect(runTripAction({ ...base, apply: vi.fn() })).rejects.toThrow(
      "database down",
    );
  });
});

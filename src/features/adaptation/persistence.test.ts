import { describe, expect, it, vi } from "vitest";
import type { PlanningTransaction } from "@/features/planning/mutation";
import {
  createExplicitPreferenceProfileVersionTx,
  persistPreferencePolicyResultTx,
} from "./persistence";

const previousSnapshot = {
  schemaVersion: 1 as const,
  interests: {},
  priceSensitivity: {
    weight: 0.7,
    confidence: 0.8,
    source: "INFERRED" as const,
    observedAt: "2026-07-26T12:00:00.000Z",
  },
  pace: null,
};

describe("createExplicitPreferenceProfileVersionTx", () => {
  it("locks the trip row before reading and allocating the next version", async () => {
    const callOrder: string[] = [];
    const queryRawUnsafe = vi.fn(async (query: string, tripId: string) => {
      void query;
      void tripId;
      callOrder.push("lock");
      return [{ id: "trip-1" }];
    });
    const findUniqueOrThrow = vi.fn(async () => {
      callOrder.push("trip");
      return {
        activePreferenceProfileVersionId: "preference-version-7",
      };
    });
    const findFirst = vi
      .fn()
      .mockImplementationOnce(async () => {
        callOrder.push("current");
        return {
          snapshot: previousSnapshot,
        };
      })
      .mockImplementationOnce(async () => {
        callOrder.push("latest");
        return {
          version: 7,
        };
      });
    const create = vi.fn(async () => {
      callOrder.push("create");
      return {
        id: "preference-version-8",
        version: 8,
      };
    });
    const update = vi.fn(async () => {
      callOrder.push("activate");
      return {
        id: "trip-1",
      };
    });
    const tx = {
      $queryRawUnsafe: queryRawUnsafe,
      trip: {
        findUniqueOrThrow,
        update,
      },
      preferenceProfileVersion: {
        findFirst,
        create,
      },
    } as unknown as PlanningTransaction;

    await expect(
      createExplicitPreferenceProfileVersionTx(tx, {
        tripId: "trip-1",
        projection: {
          interests: ["FOOD"],
          pace: "BALANCED",
        },
        observedAt: "2026-07-27T12:00:00.000Z",
      }),
    ).resolves.toMatchObject({
      id: "preference-version-8",
      version: 8,
      snapshot: {
        priceSensitivity: previousSnapshot.priceSensitivity,
      },
    });

    const [query, tripId] = queryRawUnsafe.mock.calls[0] ?? [];
    expect(query).toContain("FROM trips");
    expect(query).toContain("FOR UPDATE");
    expect(tripId).toBe("trip-1");
    expect(callOrder).toEqual([
      "lock",
      "trip",
      "current",
      "latest",
      "create",
      "activate",
    ]);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tripId: "trip-1",
        version: 8,
        parentVersionId: "preference-version-7",
      }),
      select: {
        id: true,
        version: true,
      },
    });
  });

  it("leaves revision increments to the enclosing stale-revision mutation", async () => {
    const tx = {
      $queryRawUnsafe: vi.fn(async () => [{ id: "trip-1" }]),
      trip: {
        findUniqueOrThrow: vi.fn(async () => ({
          activePreferenceProfileVersionId: null,
        })),
        update: vi.fn(async () => ({ id: "trip-1" })),
      },
      preferenceProfileVersion: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ version: 2 }),
        create: vi.fn(async () => ({
          id: "preference-version-3",
          version: 3,
        })),
      },
    } as unknown as PlanningTransaction;

    await createExplicitPreferenceProfileVersionTx(tx, {
      tripId: "trip-1",
      projection: {
        interests: [],
        pace: null,
      },
    });

    expect(tx.trip.update).toHaveBeenCalledWith({
      where: {
        id: "trip-1",
      },
      data: {
        activePreferenceProfileVersionId: "preference-version-3",
      },
    });
  });
});

describe("persistPreferencePolicyResultTx", () => {
  it("does not create an inferred version for a no-op immediate command", async () => {
    const create = vi.fn();
    const tx = {
      preferenceProfileVersion: {
        findFirst: vi.fn(),
        create,
      },
      tripPreference: {
        findUnique: vi.fn(),
        updateMany: vi.fn(),
      },
    } as unknown as PlanningTransaction;

    await expect(
      persistPreferencePolicyResultTx(tx, {
        tripId: "trip-1",
        parent: { id: "preference-version-1", version: 1 },
        sourceFeedbackId: "feedback-1",
        policy: {
          status: "NO_CHANGE",
          snapshot: previousSnapshot,
          delta: null,
          reason: "UNSUPPORTED_FEEDBACK",
          explanation: "The feedback was preserved.",
        },
      }),
    ).resolves.toMatchObject({
      id: "preference-version-1",
      version: 1,
      created: false,
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("creates and projects a supported inferred update", async () => {
    const updatedSnapshot = {
      ...previousSnapshot,
      priceSensitivity: {
        ...previousSnapshot.priceSensitivity,
        weight: 0.8,
        confidence: 0.9,
      },
    };
    const tx = {
      preferenceProfileVersion: {
        findFirst: vi.fn(async () => ({ version: 1 })),
        create: vi.fn(async () => ({
          id: "preference-version-2",
          version: 2,
        })),
      },
      tripPreference: {
        findUnique: vi.fn(async () => ({ metadata: { existing: true } })),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    } as unknown as PlanningTransaction;

    await expect(
      persistPreferencePolicyResultTx(tx, {
        tripId: "trip-1",
        parent: { id: "preference-version-1", version: 1 },
        sourceFeedbackId: "feedback-1",
        policy: {
          status: "UPDATED",
          snapshot: updatedSnapshot,
          delta: {
            field: "priceSensitivity",
            before: previousSnapshot.priceSensitivity,
            after: updatedSnapshot.priceSensitivity,
            weightChange: 0.1,
            confidenceChange: 0.1,
          },
          explanation: "Price sensitivity increased.",
        },
      }),
    ).resolves.toMatchObject({
      id: "preference-version-2",
      version: 2,
      created: true,
    });
    expect(tx.tripPreference.updateMany).toHaveBeenCalledWith({
      where: { tripId: "trip-1" },
      data: {
        metadata: {
          existing: true,
          adaptive: {
            priceSensitivity: updatedSnapshot.priceSensitivity,
          },
        },
      },
    });
  });
});

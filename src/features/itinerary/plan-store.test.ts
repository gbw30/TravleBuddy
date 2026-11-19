import { describe, expect, it } from "vitest";

import { emptyPlanState, type PlanState } from "./contracts";
import {
  builtPlaceIds,
  copyPlan,
  readBuild,
  readPlanState,
  undoPlan,
  writeBuild,
  writePlanVersion,
} from "./plan-store";

/** A stand-in for the two tables, enough to follow versions and the pointer. */
function fakeClient() {
  const plans = new Map<string, { activeVersionId: string | null }>();
  const versions: {
    id: string;
    tripId: string;
    version: number;
    parentVersionId: string | null;
    state: unknown;
    summary: string;
  }[] = [];
  const client = {
    plan: {
      findUnique: async ({ where }: { where: { tripId: string } }) =>
        plans.get(where.tripId) ?? null,
      upsert: async ({ where }: { where: { tripId: string } }) => {
        if (!plans.has(where.tripId))
          plans.set(where.tripId, { activeVersionId: null });
      },
      update: async ({
        where,
        data,
      }: {
        where: { tripId: string };
        data: { activeVersionId: string };
      }) => {
        plans.set(where.tripId, { activeVersionId: data.activeVersionId });
      },
    },
    planVersion: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        versions.find((v) => v.id === where.id) ?? null,
      findFirst: async ({ where }: { where: { tripId: string } }) =>
        versions
          .filter((v) => v.tripId === where.tripId)
          .sort((a, b) => b.version - a.version)[0] ?? null,
      create: async ({
        data,
      }: {
        data: Omit<(typeof versions)[number], "id">;
      }) => {
        const row = { id: `v${versions.length + 1}`, ...data };
        versions.push(row);
        return row;
      },
    },
  };
  return { client: client as never, plans, versions };
}

const withPick = (placeId: string): PlanState => ({
  ...emptyPlanState,
  picks: { "d1-morning": { placeId, minutes: null } },
});

describe("plan versions", () => {
  it("starts with no choices and nothing to undo", async () => {
    const { client } = fakeClient();
    expect(await readPlanState(client, "trip-1")).toEqual({
      state: emptyPlanState,
      canUndo: false,
      // Nobody has chosen anything yet, the pace included.
      fresh: true,
    });
    expect(await undoPlan(client, "trip-1")).toBe(false);
  });

  it("adds a version for each change and points the plan at the newest", async () => {
    const { client, versions } = fakeClient();
    await writePlanVersion(client, "trip-1", withPick("a"), "Picked a");
    await writePlanVersion(client, "trip-1", withPick("b"), "Picked b");

    expect(versions.map((v) => [v.version, v.parentVersionId])).toEqual([
      [1, null],
      [2, "v1"],
    ]);
    expect(await readPlanState(client, "trip-1")).toEqual({
      state: withPick("b"),
      canUndo: true,
      fresh: false,
    });
  });

  it("undoes by pointing back at the parent, and keeps every version", async () => {
    const { client, versions } = fakeClient();
    await writePlanVersion(client, "trip-1", withPick("a"), "Picked a");
    await writePlanVersion(client, "trip-1", withPick("b"), "Picked b");

    expect(await undoPlan(client, "trip-1")).toBe(true);
    expect(await readPlanState(client, "trip-1")).toEqual({
      state: withPick("a"),
      canUndo: false,
      fresh: false,
    });
    expect(versions).toHaveLength(2);

    // A change after an undo is a new version built on the one undone to.
    await writePlanVersion(client, "trip-1", withPick("c"), "Picked c");
    expect(versions[2]).toMatchObject({ version: 3, parentVersionId: "v1" });
  });

  it("does not trust a saved state that no longer fits the schema", async () => {
    const { client, versions } = fakeClient();
    await writePlanVersion(client, "trip-1", withPick("a"), "Picked a");
    versions[0].state = { pace: "frantic" };
    expect((await readPlanState(client, "trip-1")).state).toEqual(
      emptyPlanState,
    );
  });

  it("refuses to save a state that breaks the schema", async () => {
    const { client } = fakeClient();
    await expect(
      writePlanVersion(
        client,
        "trip-1",
        { ...emptyPlanState, pace: "frantic" as never },
        "Bad",
      ),
    ).rejects.toThrow();
  });

  it("copies one trip's plan into another as its first version", async () => {
    const { client, versions } = fakeClient();
    await writePlanVersion(client, "trip-1", withPick("a"), "Picked a");
    await copyPlan(client, "trip-1", "trip-2");

    expect(await readPlanState(client, "trip-2")).toEqual({
      state: withPick("a"),
      canUndo: false,
      fresh: false,
    });
    expect(versions[1]).toMatchObject({
      tripId: "trip-2",
      version: 1,
      parentVersionId: null,
    });
  });
});

describe("the progress of a build", () => {
  /** A stand-in for the plans table that keeps the build column. */
  function buildClient() {
    const plans = new Map<string, { build?: unknown }>();
    const client = {
      plan: {
        findUnique: async ({ where }: { where: { tripId: string } }) =>
          plans.get(where.tripId) ?? null,
        upsert: async ({
          where,
          update,
        }: {
          where: { tripId: string };
          update: { build: unknown };
        }) => {
          plans.set(where.tripId, { ...plans.get(where.tripId), ...update });
        },
      },
    };
    return { client: client as never, plans };
  }
  const progress = {
    nextDay: 2,
    built: { "d1-morning": "a", "d1-lunch": "b" },
    close: ["d1-morning"],
    empty: ["d1-dinner"],
    unreachable: false,
  };

  it("is nothing until a build is started, then what was last written", async () => {
    const { client } = buildClient();
    expect(await readBuild(client, "trip-1")).toBeNull();
    await writeBuild(client, "trip-1", progress);
    expect(await readBuild(client, "trip-1")).toEqual(progress);
    await writeBuild(client, "trip-1", { ...progress, nextDay: 3 });
    expect((await readBuild(client, "trip-1"))?.nextDay).toBe(3);
    expect(await readBuild(client, "trip-2")).toBeNull();
  });

  it("does not trust a saved value that does not fit, and refuses to write one", async () => {
    const { client, plans } = buildClient();
    plans.set("trip-1", { build: { nextDay: "soon" } });
    expect(await readBuild(client, "trip-1")).toBeNull();
    await expect(
      writeBuild(client, "trip-1", { ...progress, nextDay: 0 }),
    ).rejects.toThrow();
  });

  it("counts a place as built only while it is where the build put it", () => {
    const state: PlanState = {
      ...emptyPlanState,
      picks: {
        "d1-morning": { placeId: "a", minutes: null },
        // The traveller swapped lunch for a place of their own.
        "d1-lunch": { placeId: "mine", minutes: null },
      },
    };
    expect(builtPlaceIds(progress, state)).toEqual(["a"]);
    expect(builtPlaceIds(null, state)).toEqual([]);
  });
});

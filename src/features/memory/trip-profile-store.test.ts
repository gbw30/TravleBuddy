import { describe, expect, it } from "vitest";

import { fakeMemoryClient } from "./fake-memory-client";
import {
  readTripDifference,
  readTripSaid,
  readTripTaste,
  saveTripAnswer,
  saveTripDifference,
  saveTripSaid,
} from "./trip-profile-store";

/** A stand-in for the trip_profiles table and the history written beside it. */
function fakeClient(rows: Record<string, unknown> = {}) {
  const history: unknown[] = [];
  const client = {
    tripProfile: {
      findUnique: async ({ where }: { where: { tripId: string } }) =>
        where.tripId in rows ? { taste: rows[where.tripId] } : null,
      upsert: async ({
        where,
        create,
      }: {
        where: { tripId: string };
        create: { taste: unknown };
      }) => {
        rows[where.tripId] = create.taste;
      },
    },
    profileHistory: {
      create: async ({ data }: { data: unknown }) => {
        history.push(data);
      },
    },
  };
  return { client: client as never, rows, history };
}

const told = (...values: string[]) => ({ values, source: "told" as const });

describe("the trip profile", () => {
  it("is empty for a trip nobody has answered for", async () => {
    expect(await readTripTaste(fakeClient().client, "t1")).toEqual({});
  });

  it("saves an answer by topic and keeps the others", async () => {
    const { client } = fakeClient();
    await saveTripAnswer(client, "t1", "pace", told("relaxed"));
    const taste = await saveTripAnswer(
      client,
      "t1",
      "food",
      told("vegetarian", "gluten-free"),
    );
    expect(taste).toEqual({
      pace: told("relaxed"),
      food: told("vegetarian", "gluten-free"),
    });
    expect(await readTripTaste(client, "t1")).toEqual(taste);
    expect(await readTripTaste(client, "t2")).toEqual({});
  });

  it("replaces an earlier answer on the same topic, and records a default as a default", async () => {
    const { client } = fakeClient();
    await saveTripAnswer(client, "t1", "pace", {
      values: ["balanced"],
      source: "default",
    });
    expect(await readTripTaste(client, "t1")).toEqual({
      pace: { values: ["balanced"], source: "default" },
    });
    await saveTripAnswer(client, "t1", "pace", told("packed"));
    expect(await readTripTaste(client, "t1")).toEqual({ pace: told("packed") });
  });

  it("ignores anything in a saved row that does not fit", async () => {
    const { client } = fakeClient({
      t1: {
        pace: told("relaxed"),
        food: { values: "everything" },
        mood: told("sunny"),
      },
      t2: "not an object",
    });
    expect(await readTripTaste(client, "t1")).toEqual({
      pace: told("relaxed"),
    });
    expect(await readTripTaste(client, "t2")).toEqual({});
  });

  it("keeps every change in order, with the answer before and after", async () => {
    const { client, history } = fakeClient();
    await saveTripAnswer(client, "t1", "pace", told("relaxed"));
    await saveTripAnswer(client, "t1", "pace", told("packed"));
    expect(history).toEqual([
      {
        tripId: "t1",
        topic: "pace",
        after: told("relaxed"),
        cause: "conversation",
      },
      {
        tripId: "t1",
        topic: "pace",
        before: told("relaxed"),
        after: told("packed"),
        cause: "conversation",
      },
    ]);
  });

  it("takes the trip's own answer away again, and says where a change came from", async () => {
    const { client, history } = fakeClient();
    await saveTripAnswer(client, "t1", "pace", told("relaxed"), "brief");
    await saveTripAnswer(client, "t1", "food", told("vegan"), "brief");
    expect(await saveTripAnswer(client, "t1", "pace", null, "brief")).toEqual({
      food: told("vegan"),
    });
    expect(await readTripTaste(client, "t1")).toEqual({ food: told("vegan") });
    expect(history.at(-1)).toEqual({
      tripId: "t1",
      topic: "pace",
      before: told("relaxed"),
      cause: "brief",
    });
    // Nothing to take away: nothing is written.
    await saveTripAnswer(client, "t1", "stay", null, "brief");
    expect(history).toHaveLength(3);
  });

  it("refuses to save an answer that does not fit", async () => {
    const { client, rows, history } = fakeClient();
    await expect(
      saveTripAnswer(client, "t1", "pace", { values: [""], source: "told" }),
    ).rejects.toThrow();
    expect(rows).toEqual({});
    expect(history).toEqual([]);
  });
});

describe("a trip marked as different", () => {
  it("is undecided until the traveller is asked", async () => {
    expect(await readTripDifference(fakeMemoryClient().client, "t1")).toEqual({
      differs: null,
      because: null,
    });
  });

  it("keeps the reason, or that it is an ordinary trip, with the change in the history", async () => {
    const { client, rows } = fakeMemoryClient();
    expect(await saveTripDifference(client, "t1", " Honeymoon ")).toEqual({
      differs: true,
      because: "Honeymoon",
    });
    expect(await readTripDifference(client, "t1")).toEqual({
      differs: true,
      because: "Honeymoon",
    });
    await saveTripDifference(client, "t1", null);
    expect(await readTripDifference(client, "t1")).toEqual({
      differs: false,
      because: null,
    });
    expect(await readTripDifference(client, "t2")).toEqual({
      differs: null,
      because: null,
    });
    expect(rows.history).toMatchObject([
      {
        tripId: "t1",
        topic: "difference",
        after: { differs: true, because: "Honeymoon" },
        cause: "conversation",
      },
      {
        tripId: "t1",
        topic: "difference",
        before: { differs: true, because: "Honeymoon" },
        after: { differs: false, because: null },
      },
    ]);
  });

  it("refuses a difference with no reason", async () => {
    const { client, rows } = fakeMemoryClient();
    await expect(saveTripDifference(client, "t1", "   ")).rejects.toThrow();
    expect(rows.tripProfiles).toEqual([]);
  });
});

describe("what the traveller typed under “anything else”", () => {
  it("is kept as typed, replaced, and forgotten when emptied, with each change in the history", async () => {
    const { client, rows } = fakeMemoryClient();
    expect(await readTripSaid(client, "t1")).toBeNull();
    await saveTripSaid(client, "t1", "  We walk a lot. ");
    expect(await readTripSaid(client, "t1")).toBe("We walk a lot.");
    // The same words again change nothing.
    await saveTripSaid(client, "t1", "We walk a lot.");
    await saveTripSaid(client, "t1", "Quiet places");
    await saveTripSaid(client, "t1", " ");
    expect(await readTripSaid(client, "t1")).toBeNull();
    expect(
      rows.history.map(({ topic, before, after, cause }) => ({
        topic,
        before,
        after,
        cause,
      })),
    ).toEqual([
      {
        topic: "said",
        before: undefined,
        after: "We walk a lot.",
        cause: "brief",
      },
      {
        topic: "said",
        before: "We walk a lot.",
        after: "Quiet places",
        cause: "brief",
      },
      {
        topic: "said",
        before: "Quiet places",
        after: undefined,
        cause: "brief",
      },
    ]);
  });

  it("is cut at 600 characters", async () => {
    const { client } = fakeMemoryClient();
    await saveTripSaid(client, "t1", "x".repeat(700));
    expect(await readTripSaid(client, "t1")).toHaveLength(600);
  });
});

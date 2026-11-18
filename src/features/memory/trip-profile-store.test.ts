import { describe, expect, it } from "vitest";

import { readTripTaste, saveTripAnswer } from "./trip-profile-store";

/** A stand-in for the trip_profiles table. */
function fakeClient(rows: Record<string, unknown> = {}) {
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
  };
  return { client: client as never, rows };
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

  it("refuses to save an answer that does not fit", async () => {
    const { client, rows } = fakeClient();
    await expect(
      saveTripAnswer(client, "t1", "pace", { values: [""], source: "told" }),
    ).rejects.toThrow();
    expect(rows).toEqual({});
  });
});

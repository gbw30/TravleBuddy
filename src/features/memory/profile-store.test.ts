import { describe, expect, it } from "vitest";

import type { ProfileEntry } from "./contracts";
import { fakeMemoryClient } from "./fake-memory-client";
import {
  addNote,
  deleteEntry,
  deleteNote,
  readForgotten,
  readProfile,
  readProfileHistory,
  replaceLearned,
  resetProfile,
  saveStated,
} from "./profile-store";

const learned = (
  topic: ProfileEntry["topic"],
  value: string,
  trip = "Lisbon",
  sureness: ProfileEntry["sureness"] = "think",
): ProfileEntry => ({
  topic,
  value,
  sureness,
  source: { type: "trip", tripId: trip.toLowerCase(), tripTitle: trip },
});
/** The profile's entries as short lines, for comparing. */
const lines = async (client: never, userId: string) =>
  (await readProfile(client, userId)).entries.map(
    (entry) =>
      `${entry.topic}=${entry.value} (${entry.sureness}, ${entry.source.type === "trip" ? entry.source.tripTitle : "told"})`,
  );

describe("a traveller's personal profile", () => {
  it("is empty before anything is known", async () => {
    expect(await readProfile(fakeMemoryClient().client, "ana")).toEqual({
      revision: 0,
      learnAfter: null,
      entries: [],
      notes: [],
    });
  });

  it("keeps what the traveller states as always, from them, and counts the change", async () => {
    const { client } = fakeMemoryClient();
    const saved = await saveStated(
      client,
      "ana",
      "dietary_rules",
      " vegetarian ",
    );
    expect(saved).toMatchObject({
      topic: "dietary_rules",
      value: "vegetarian",
      sureness: "always",
      source: { type: "told" },
    });
    const profile = await readProfile(client, "ana");
    expect(profile.revision).toBe(1);
    expect(profile.entries).toEqual([saved]);
  });

  it("holds one value on a topic that takes one, and several on a topic that takes several", async () => {
    const { client } = fakeMemoryClient();
    await saveStated(client, "ana", "pace", "relaxed");
    await saveStated(client, "ana", "pace", "packed");
    await saveStated(client, "ana", "interests", "museums");
    await saveStated(client, "ana", "interests", "views");
    await saveStated(client, "ana", "interests", "views");
    expect(await lines(client, "ana")).toEqual([
      "pace=packed (always, told)",
      "interests=museums (always, told)",
      "interests=views (always, told)",
    ]);
  });

  it("lists entries in the profile's own order of topics, and leaves out a saved row that no longer fits", async () => {
    const { client, rows } = fakeMemoryClient();
    await saveStated(client, "ana", "allergies", "shellfish");
    await saveStated(client, "ana", "pace", "relaxed");
    rows.entries.push({
      id: "old",
      userId: "ana",
      topic: "queues",
      value: "none",
      sureness: "always",
      sourceTripId: null,
    });
    expect(await lines(client, "ana")).toEqual([
      "pace=relaxed (always, told)",
      "allergies=shellfish (always, told)",
    ]);
  });

  it("refuses a value that does not fit, and changes nothing", async () => {
    const { client, rows } = fakeMemoryClient();
    await expect(saveStated(client, "ana", "pace", "   ")).rejects.toThrow();
    expect(rows.profiles).toEqual([]);
    expect(rows.history).toEqual([]);
  });
});

describe("one traveller and another", () => {
  it("never see or change each other's profile", async () => {
    const { client } = fakeMemoryClient();
    const anas = await saveStated(client, "ana", "dietary_rules", "vegetarian");
    const note = await addNote(client, "ana", "I hate queues");
    await replaceLearned(client, "ana", [learned("pace", "relaxed")]);
    await saveStated(client, "ben", "pace", "packed");

    expect(await lines(client, "ben")).toEqual(["pace=packed (always, told)"]);
    expect((await readProfile(client, "ben")).notes).toEqual([]);

    // Ben names Ana's entry and note by their ids: neither is found.
    expect(await deleteEntry(client, "ben", anas.id)).toBe("not_found");
    expect(await deleteNote(client, "ben", note.id)).toBe("not_found");
    // Ben resets, learns and forgets: only his own profile moves.
    await replaceLearned(client, "ben", []);
    await resetProfile(client, "ben");

    expect(await lines(client, "ana")).toEqual([
      "pace=relaxed (think, Lisbon)",
      "dietary_rules=vegetarian (always, told)",
    ]);
    expect((await readProfile(client, "ana")).notes).toEqual([note]);
    expect(await lines(client, "ben")).toEqual([]);
    expect(await readForgotten(client, "ben")).toEqual([]);
    const bens = await readProfileHistory(client, "ben");
    expect(bens.every((line) => line.topic === "pace")).toBe(true);
    expect(bens).toHaveLength(2);
  });
});

describe("what finished trips have taught", () => {
  it("is added beside what the traveller stated, and counted once", async () => {
    const { client } = fakeMemoryClient();
    await saveStated(client, "ana", "interests", "museums");
    const set = [learned("pace", "relaxed"), learned("interests", "views")];
    expect(await replaceLearned(client, "ana", set)).toBe(true);
    expect(await lines(client, "ana")).toEqual([
      "pace=relaxed (think, Lisbon)",
      "interests=museums (always, told)",
      "interests=views (think, Lisbon)",
    ]);
    // The same set again changes nothing, so the revision stays.
    const { revision } = await readProfile(client, "ana");
    expect(await replaceLearned(client, "ana", set)).toBe(false);
    expect((await readProfile(client, "ana")).revision).toBe(revision);
  });

  it("grows surer, moves to the newer trip, and drops what is no longer shown", async () => {
    const { client } = fakeMemoryClient();
    await replaceLearned(client, "ana", [
      learned("pace", "relaxed"),
      learned("interests", "views"),
    ]);
    await replaceLearned(client, "ana", [
      learned("pace", "relaxed", "Rome", "usually"),
    ]);
    expect(await lines(client, "ana")).toEqual([
      "pace=relaxed (usually, Rome)",
    ]);
  });

  it("never replaces or removes what the traveller stated", async () => {
    const { client } = fakeMemoryClient();
    await saveStated(client, "ana", "pace", "packed");
    await saveStated(client, "ana", "interests", "museums");
    // The rules would not offer these; the store holds the line all the same.
    await replaceLearned(client, "ana", [
      learned("interests", "museums"),
      { ...learned("pace", "packed"), source: { type: "told" } },
    ]);
    await replaceLearned(client, "ana", []);
    expect(await lines(client, "ana")).toEqual([
      "pace=packed (always, told)",
      "interests=museums (always, told)",
    ]);
  });

  it("gives way when the traveller then states the same thing", async () => {
    const { client } = fakeMemoryClient();
    await replaceLearned(client, "ana", [learned("pace", "relaxed")]);
    await saveStated(client, "ana", "pace", "relaxed");
    expect(await lines(client, "ana")).toEqual(["pace=relaxed (always, told)"]);
    // Later learning leaves the stated entry alone.
    await replaceLearned(client, "ana", []);
    expect(await lines(client, "ana")).toEqual(["pace=relaxed (always, told)"]);
  });
});

describe("deleting", () => {
  it("forgets a learned entry with every trip it came from", async () => {
    const { client } = fakeMemoryClient();
    await replaceLearned(client, "ana", [learned("pace", "relaxed")]);
    const [entry] = (await readProfile(client, "ana")).entries;
    expect(
      await deleteEntry(client, "ana", entry.id, ["tokyo", "lisbon"]),
    ).toEqual({ deleted: true });
    expect(await lines(client, "ana")).toEqual([]);
    expect(await readForgotten(client, "ana")).toEqual([
      { topic: "pace", value: "relaxed", tripIds: ["lisbon", "tokyo"] },
    ]);
    // Learned again from new trips and deleted again: the list grows.
    await replaceLearned(client, "ana", [learned("pace", "relaxed", "Porto")]);
    const [again] = (await readProfile(client, "ana")).entries;
    await deleteEntry(client, "ana", again.id);
    expect((await readForgotten(client, "ana"))[0].tripIds).toEqual([
      "lisbon",
      "tokyo",
      "porto",
    ]);
  });

  it("removes a stated entry without recording anything to forget", async () => {
    const { client } = fakeMemoryClient();
    const entry = await saveStated(client, "ana", "pace", "relaxed");
    await deleteEntry(client, "ana", entry.id);
    expect(await readForgotten(client, "ana")).toEqual([]);
    expect(await deleteEntry(client, "ana", entry.id)).toBe("not_found");
  });
});

describe("a reset", () => {
  it("forgets everything and stops the past from teaching it back", async () => {
    const { client } = fakeMemoryClient();
    await saveStated(client, "ana", "pace", "packed");
    await replaceLearned(client, "ana", [learned("interests", "views")]);
    const [, views] = (await readProfile(client, "ana")).entries;
    await deleteEntry(client, "ana", views.id);
    await addNote(client, "ana", "I hate queues");

    await resetProfile(client, "ana", new Date("2028-01-05T10:00:00Z"));

    const profile = await readProfile(client, "ana");
    expect(profile).toMatchObject({
      entries: [],
      notes: [],
      learnAfter: "2028-01-05T10:00:00.000Z",
    });
    expect(await readForgotten(client, "ana")).toEqual([]);
    const [last] = await readProfileHistory(client, "ana");
    expect(last).toMatchObject({ cause: "reset", revision: profile.revision });
  });
});

describe("notes", () => {
  it("are kept, shown and removable, and are not entries", async () => {
    const { client } = fakeMemoryClient();
    const note = await addNote(client, "ana", "I hate queues");
    const profile = await readProfile(client, "ana");
    expect(profile.notes).toEqual([note]);
    expect(profile.entries).toEqual([]);
    expect(await deleteNote(client, "ana", note.id)).toEqual({ deleted: true });
    expect((await readProfile(client, "ana")).notes).toEqual([]);
  });
});

describe("the profile's history", () => {
  it("has every change in order, each under the revision it produced", async () => {
    const { client } = fakeMemoryClient();
    await saveStated(client, "ana", "pace", "relaxed");
    await saveStated(client, "ana", "pace", "packed");
    const [entry] = (await readProfile(client, "ana")).entries;
    await deleteEntry(client, "ana", entry.id);

    const history = (await readProfileHistory(client, "ana")).reverse();
    expect(
      history.map((line) => [
        line.revision,
        (line.before as { value?: string } | undefined)?.value ?? null,
        (line.after as { value?: string } | undefined)?.value ?? null,
        line.cause,
      ]),
    ).toEqual([
      [1, null, "relaxed", "traveller"],
      // Stating a new pace removes the old one under the same revision.
      [2, "relaxed", null, "traveller"],
      [2, null, "packed", "traveller"],
      [3, "packed", null, "traveller"],
    ]);
  });

  it("says when learning made the change", async () => {
    const { client } = fakeMemoryClient();
    await replaceLearned(client, "ana", [learned("pace", "relaxed")]);
    expect((await readProfileHistory(client, "ana"))[0]).toMatchObject({
      topic: "pace",
      cause: "learning",
      revision: 1,
    });
  });
});

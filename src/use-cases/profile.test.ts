import { beforeEach, describe, expect, it, vi } from "vitest";

import { PROFILE_TOPICS } from "@/features/memory/contracts";
import { fakeMemoryClient } from "@/features/memory/fake-memory-client";

// The real stores run on a stand-in for the Memory tables, so these tests
// cover the use case and the store together.
const state = vi.hoisted(() => ({
  client: {} as Record<string, unknown>,
}));
vi.mock("@/lib/db", () => ({
  db: new Proxy(
    {},
    {
      get: (_target, key: string) =>
        key === "$transaction"
          ? (run: (tx: unknown) => unknown) => run(state.client)
          : state.client[key],
    },
  ),
}));

// Which finished trips showed a value is the learning use case's to say.
vi.mock("./learning", () => ({
  tripsThatShowed: vi.fn(async () => ["tokyo", "lisbon"]),
}));

import { readForgotten, replaceLearned } from "@/features/memory";

import {
  changeEntry,
  forgetEverything,
  loadProfile,
  profileTopics,
  removeEntry,
  removeNote,
  tellProfile,
} from "./profile";

const tx = () => state.client as never;
const lines = async (userId: string) =>
  (await loadProfile(userId)).entries.map(
    (entry) => `${entry.topic}=${entry.label} (${entry.sureness})`,
  );

beforeEach(() => {
  state.client = fakeMemoryClient().client as unknown as Record<
    string,
    unknown
  >;
});

describe("what each topic can hold", () => {
  it("covers every topic of the profile, with the script's choices for tastes", () => {
    const topics = profileTopics();
    expect(topics.map((info) => info.topic)).toEqual([...PROFILE_TOPICS]);
    const byTopic = Object.fromEntries(
      topics.map((info) => [info.topic, info]),
    );
    expect(byTopic.pace.choices.map((choice) => choice.value)).toEqual([
      "relaxed",
      "balanced",
      "packed",
    ]);
    expect(byTopic.pace).toMatchObject({
      kind: "taste",
      several: false,
      freeText: false,
    });
    expect(byTopic.interests.several).toBe(true);
  });

  it("offers the dietary rules without 'no restrictions', and takes an allergy in the traveller's words", () => {
    const byTopic = Object.fromEntries(
      profileTopics().map((info) => [info.topic, info]),
    );
    expect(byTopic.dietary_rules).toMatchObject({
      kind: "hard_limit",
      several: true,
    });
    expect(byTopic.dietary_rules.choices.map((choice) => choice.value)).toEqual(
      ["vegetarian", "vegan", "halal", "kosher", "gluten-free"],
    );
    expect(byTopic.allergies).toMatchObject({
      kind: "hard_limit",
      freeText: true,
      choices: [],
    });
  });
});

describe("telling the profile something", () => {
  it("files a plain statement as an entry the traveller stated, with the words to show it", async () => {
    expect(await tellProfile("ana", "I'm vegetarian", false)).toMatchObject({
      type: "entry",
      entry: {
        topic: "dietary_rules",
        value: "vegetarian",
        label: "Vegetarian",
        sureness: "always",
        source: { type: "told" },
      },
    });
    await tellProfile("ana", "Mostly on foot", false);
    await tellProfile("ana", "No shellfish", true);
    expect(await lines("ana")).toEqual([
      "getting_around=Mostly on foot (always)",
      "dietary_rules=Vegetarian (always)",
      "allergies=shellfish (always)",
    ]);
  });

  it("keeps what fits no topic as a note, once", async () => {
    const first = await tellProfile("ana", "I hate queues", false);
    const again = await tellProfile("ana", " I hate queues ", false);
    expect(first).toMatchObject({
      type: "note",
      note: { text: "I hate queues" },
    });
    expect(again).toEqual(first);
    const profile = await loadProfile("ana");
    expect(profile.notes).toHaveLength(1);
    expect(profile.entries).toEqual([]);
  });
});

describe("changing an entry", () => {
  it("replaces the value with another the topic can hold", async () => {
    const told = await tellProfile("ana", "Relaxed", false);
    const id = told.type === "entry" ? told.entry.id : "";
    expect(await changeEntry("ana", id, "packed")).toMatchObject({
      topic: "pace",
      value: "packed",
      label: "Packed",
    });
    expect(await lines("ana")).toEqual(["pace=Packed (always)"]);
  });

  it("refuses a value the topic cannot hold, and changes nothing", async () => {
    const told = await tellProfile("ana", "Relaxed", false);
    const id = told.type === "entry" ? told.entry.id : "";
    expect(await changeEntry("ana", id, "warp speed")).toBe("invalid");
    expect(await changeEntry("ana", id, "vegetarian")).toBe("invalid");
    expect(await lines("ana")).toEqual(["pace=Relaxed (always)"]);
  });

  it("takes the traveller's own words where the topic allows them", async () => {
    const told = await tellProfile("ana", "allergic to shellfish", false);
    const id = told.type === "entry" ? told.entry.id : "";
    expect(await changeEntry("ana", id, " crustaceans ")).toMatchObject({
      topic: "allergies",
      value: "crustaceans",
    });
    expect(
      await changeEntry(
        "ana",
        (await loadProfile("ana")).entries[0].id,
        "x".repeat(81),
      ),
    ).toBe("invalid");
  });

  it("confirms a guess: the same value becomes something the traveller stated", async () => {
    await replaceLearned(tx(), "ana", [
      {
        topic: "pace",
        value: "relaxed",
        sureness: "think",
        source: { type: "trip", tripId: "lisbon", tripTitle: "Lisbon" },
      },
    ]);
    const [guess] = (await loadProfile("ana")).entries;
    expect(guess).toMatchObject({
      sureness: "think",
      source: { type: "trip", tripTitle: "Lisbon" },
    });
    expect(await changeEntry("ana", guess.id, "relaxed")).toMatchObject({
      sureness: "always",
      source: { type: "told" },
    });
    expect(await readForgotten(tx(), "ana")).toEqual([]);
  });

  it("forgets a learned value the traveller corrects, so it is not learned back", async () => {
    await replaceLearned(tx(), "ana", [
      {
        topic: "pace",
        value: "relaxed",
        sureness: "think",
        source: { type: "trip", tripId: "lisbon", tripTitle: "Lisbon" },
      },
    ]);
    const [guess] = (await loadProfile("ana")).entries;
    await changeEntry("ana", guess.id, "packed");
    expect(await lines("ana")).toEqual(["pace=Packed (always)"]);
    expect(await readForgotten(tx(), "ana")).toEqual([
      // Every trip that showed it is forgotten, not only the one the entry named.
      { topic: "pace", value: "relaxed", tripIds: ["lisbon", "tokyo"] },
    ]);
  });
});

describe("one traveller and another", () => {
  it("cannot change, remove or forget each other's profile", async () => {
    const told = await tellProfile("ana", "I'm vegetarian", false);
    const note = await tellProfile("ana", "I hate queues", false);
    const entryId = told.type === "entry" ? told.entry.id : "";
    const noteId = note.type === "note" ? note.note.id : "";

    expect(await loadProfile("ben")).toMatchObject({ entries: [], notes: [] });
    expect(await changeEntry("ben", entryId, "vegan")).toBe("not_found");
    expect(await removeEntry("ben", entryId)).toBe("not_found");
    expect(await removeNote("ben", noteId)).toBe("not_found");
    await forgetEverything("ben");

    expect(await lines("ana")).toEqual(["dietary_rules=Vegetarian (always)"]);
    expect((await loadProfile("ana")).notes).toHaveLength(1);
  });
});

describe("removing and forgetting", () => {
  it("removes an entry and a note of the traveller's own", async () => {
    const told = await tellProfile("ana", "Relaxed", false);
    const note = await tellProfile("ana", "I hate queues", false);
    expect(
      await removeEntry("ana", told.type === "entry" ? told.entry.id : ""),
    ).toEqual({ deleted: true });
    expect(
      await removeNote("ana", note.type === "note" ? note.note.id : ""),
    ).toEqual({ deleted: true });
    expect(await loadProfile("ana")).toMatchObject({ entries: [], notes: [] });
  });

  it("forgets everything and counts it as a change", async () => {
    await tellProfile("ana", "Relaxed", false);
    await tellProfile("ana", "I hate queues", false);
    const before = (await loadProfile("ana")).revision;
    await forgetEverything("ana");
    const after = await loadProfile("ana");
    expect(after).toMatchObject({ entries: [], notes: [] });
    expect(after.revision).toBe(before + 1);
  });
});

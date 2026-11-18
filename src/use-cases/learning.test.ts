import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeMemoryClient } from "@/features/memory/fake-memory-client";
import type { PlaceKind } from "@/features/places/contracts";

// The Memory service is the real one, on a stand-in for its tables. Trips,
// the plan, the places and the discards are stand-ins.
const state = vi.hoisted(() => ({
  client: {} as Record<string, unknown>,
  finished: [] as { id: string; title: string; finishedAt: string }[],
  picks: {} as Record<string, string[]>,
  discards: {} as Record<string, (string | null)[]>,
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
vi.mock("@/features/trips", () => ({
  listFinishedTrips: vi.fn(async () => state.finished),
}));
vi.mock("@/features/itinerary", () => ({
  readPlanState: vi.fn(async (_db: unknown, tripId: string) => ({
    state: {
      picks: Object.fromEntries(
        (state.picks[tripId] ?? []).map((kind, index) => [
          `d1-slot${index}`,
          { placeId: `${tripId}:${index}:${kind}`, minutes: null },
        ]),
      ),
    },
    canUndo: false,
  })),
}));
vi.mock("@/features/places", () => ({
  // A stand-in place id ends with its kind.
  getPlaces: vi.fn(async (ids: string[]) =>
    ids.map((id) => ({ id, kind: id.split(":")[2] as PlaceKind })),
  ),
}));
vi.mock("@/features/recommendations", async (actual) => ({
  ...(await actual<typeof import("@/features/recommendations")>()),
  readDiscards: vi.fn(async (_db: unknown, tripId: string) =>
    (state.discards[tripId] ?? []).map((reason) => ({ placeId: "p", reason })),
  ),
}));

import {
  readProfile,
  resetProfile,
  saveStated,
  saveTripAnswer,
  saveTripDifference,
} from "@/features/memory";

import {
  gatherEvidence,
  learnFromTrips,
  learnQuietly,
  tripShows,
  tripsThatShowed,
} from "./learning";
import { removeEntry } from "./profile";

const tx = () => state.client as never;
const told = (...values: string[]) => ({ values, source: "told" as const });
/** A finished trip, named by its title. */
const finish = (title: string, finishedAt: string) =>
  state.finished.push({ id: title, title, finishedAt });
const lines = async () =>
  (await readProfile(tx(), "ana")).entries.map(
    (entry) =>
      `${entry.topic}=${entry.value} (${entry.sureness}, ${entry.source.type === "trip" ? entry.source.tripTitle : "told"})`,
  );

beforeEach(() => {
  state.client = fakeMemoryClient().client as unknown as Record<
    string,
    unknown
  >;
  state.finished = [];
  state.picks = {};
  state.discards = {};
});

describe("what one trip showed", () => {
  it("is what the traveller said, leaving out no-preference answers, defaults and dietary rules", () => {
    expect(
      tripShows(
        {
          pace: told("relaxed"),
          interests: told("museums", "views"),
          atmosphere: told("either"),
          day_shape: { values: ["early"], source: "default" },
          food: told("vegetarian"),
        },
        [],
        [],
      ),
    ).toEqual([
      { topic: "pace", value: "relaxed" },
      { topic: "interests", value: "museums" },
      { topic: "interests", value: "views" },
    ]);
  });

  it("is also the kinds of place chosen: two of an interest show it, one does not", () => {
    expect(
      tripShows({}, ["museum", "museum", "park", "temple", "sight"], []),
    ).toEqual([
      { topic: "interests", value: "museums" },
      { topic: "interests", value: "history" },
    ]);
    expect(tripShows({}, ["museum"], [])).toEqual([]);
  });

  it("is a taste for quiet when places were turned down as crowded more than one set's worth", () => {
    const crowded = [
      "too_touristy",
      "too_touristy",
      "too_busy",
      "too_touristy",
    ];
    expect(tripShows({}, [], crowded)).toEqual([
      { topic: "atmosphere", value: "quiet" },
    ]);
    expect(tripShows({}, [], crowded.slice(0, 3))).toEqual([]);
    expect(
      tripShows({}, [], ["too_far", "too_far", "too_far", "too_far", null]),
    ).toEqual([]);
  });

  it("names a value once, however it showed", () => {
    expect(
      tripShows({ interests: told("museums") }, ["museum", "museum"], []),
    ).toEqual([{ topic: "interests", value: "museums" }]);
  });
});

describe("learning from finished trips", () => {
  it("learns nothing from one trip, and a taste once two ordinary trips show it", async () => {
    finish("Tokyo", "2027-05-14T10:00:00.000Z");
    await saveTripAnswer(tx(), "Tokyo", "pace", told("relaxed"));
    expect(await learnFromTrips("ana")).toBe(false);
    expect(await lines()).toEqual([]);

    finish("Lisbon", "2027-09-02T10:00:00.000Z");
    await saveTripAnswer(tx(), "Lisbon", "pace", told("relaxed"));
    expect(await learnFromTrips("ana")).toBe(true);
    expect(await lines()).toEqual(["pace=relaxed (think, Lisbon)"]);
    // Learning again from the same trips changes nothing.
    expect(await learnFromTrips("ana")).toBe(false);
  });

  it("learns an interest from the places chosen in two trips", async () => {
    finish("Tokyo", "2027-05-14T10:00:00.000Z");
    finish("Lisbon", "2027-09-02T10:00:00.000Z");
    state.picks = {
      Tokyo: ["museum", "museum", "park"],
      Lisbon: ["museum", "museum"],
    };
    await learnFromTrips("ana");
    expect(await lines()).toEqual(["interests=museums (think, Lisbon)"]);
  });

  it("learns nothing from a trip marked as different", async () => {
    finish("Tokyo", "2027-05-14T10:00:00.000Z");
    finish("Honeymoon", "2027-09-02T10:00:00.000Z");
    await saveTripAnswer(tx(), "Tokyo", "pace", told("packed"));
    await saveTripAnswer(tx(), "Honeymoon", "pace", told("packed"));
    await saveTripDifference(tx(), "Honeymoon", "Honeymoon");
    await learnFromTrips("ana");
    expect(await lines()).toEqual([]);
    expect(
      (await gatherEvidence("ana")).map((trip) => [
        trip.tripId,
        trip.different,
      ]),
    ).toEqual([
      ["Tokyo", false],
      ["Honeymoon", true],
    ]);
    // Marked ordinary after all: it counts.
    await saveTripDifference(tx(), "Honeymoon", null);
    await learnFromTrips("ana");
    expect(await lines()).toEqual(["pace=packed (think, Honeymoon)"]);
  });

  it("never replaces what the traveller stated", async () => {
    await saveStated(tx(), "ana", "pace", "packed");
    for (const [title, date] of [
      ["Tokyo", "2027-05-14"],
      ["Lisbon", "2027-09-02"],
    ]) {
      finish(title, `${date}T10:00:00.000Z`);
      await saveTripAnswer(tx(), title, "pace", told("relaxed"));
      await saveTripAnswer(tx(), title, "interests", told("views"));
    }
    await learnFromTrips("ana");
    expect(await lines()).toEqual([
      "pace=packed (always, told)",
      "interests=views (think, Lisbon)",
    ]);
  });

  it("stops counting a trip that is reopened or deleted", async () => {
    for (const [title, date] of [
      ["Tokyo", "2027-05-14"],
      ["Lisbon", "2027-09-02"],
    ]) {
      finish(title, `${date}T10:00:00.000Z`);
      await saveTripAnswer(tx(), title, "pace", told("relaxed"));
    }
    await learnFromTrips("ana");
    expect(await lines()).toHaveLength(1);
    state.finished.pop();
    expect(await learnFromTrips("ana")).toBe(true);
    expect(await lines()).toEqual([]);
  });

  it("does not learn a deleted entry again from the same trips, but does from new ones", async () => {
    for (const [title, date] of [
      ["Tokyo", "2027-05-14"],
      ["Lisbon", "2027-09-02"],
    ]) {
      finish(title, `${date}T10:00:00.000Z`);
      await saveTripAnswer(tx(), title, "pace", told("relaxed"));
    }
    await learnFromTrips("ana");
    expect(await tripsThatShowed("ana", "pace", "relaxed")).toEqual([
      "Tokyo",
      "Lisbon",
    ]);
    const [entry] = (await readProfile(tx(), "ana")).entries;
    await removeEntry("ana", entry.id);

    await learnFromTrips("ana");
    expect(await lines()).toEqual([]);
    // One new trip is not enough: the two old ones no longer count for this value.
    finish("Porto", "2028-03-01T10:00:00.000Z");
    await saveTripAnswer(tx(), "Porto", "pace", told("relaxed"));
    await learnFromTrips("ana");
    expect(await lines()).toEqual([]);
    finish("Seville", "2028-05-01T10:00:00.000Z");
    await saveTripAnswer(tx(), "Seville", "pace", told("relaxed"));
    await learnFromTrips("ana");
    expect(await lines()).toEqual(["pace=relaxed (think, Seville)"]);
  });

  it("does not learn a reset profile back from trips finished before the reset", async () => {
    for (const [title, date] of [
      ["Tokyo", "2027-05-14"],
      ["Lisbon", "2027-09-02"],
    ]) {
      finish(title, `${date}T10:00:00.000Z`);
      await saveTripAnswer(tx(), title, "pace", told("relaxed"));
    }
    await learnFromTrips("ana");
    await resetProfile(tx(), "ana", new Date("2028-01-01T00:00:00Z"));
    await learnFromTrips("ana");
    expect(await lines()).toEqual([]);
    expect(await gatherEvidence("ana")).toEqual([]);
    // Trips finished afterwards teach as usual.
    for (const [title, date] of [
      ["Porto", "2028-03-01"],
      ["Seville", "2028-05-01"],
    ]) {
      finish(title, `${date}T10:00:00.000Z`);
      await saveTripAnswer(tx(), title, "pace", told("packed"));
    }
    await learnFromTrips("ana");
    expect(await lines()).toEqual(["pace=packed (think, Seville)"]);
  });

  it("does not let a failure to learn reach the traveller's own change", async () => {
    state.client = {};
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    await expect(learnQuietly("ana")).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

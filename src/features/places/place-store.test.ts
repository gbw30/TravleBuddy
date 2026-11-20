import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    $executeRaw: vi.fn(),
    place: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    placeFetch: { findUnique: vi.fn(), upsert: vi.fn() },
    providerCall: { upsert: vi.fn() },
  },
  osm: { sights: vi.fn(), foodNear: vi.fn(), byName: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("./osm-source", () => ({
  osmSource: { origin: "OSM", metered: true, ...mocks.osm },
}));

import { foodReach, sightsReach } from "./overpass";
import {
  addOwnPlace,
  findPlacesByName,
  removeOwnPlace,
  gatherFoodNear,
  gatherSights,
  getPlaces,
  listFoodNear,
  listSights,
} from "./place-store";

const tokyo = {
  name: "Tokyo",
  region: null,
  country: "Japan",
  latitude: 35.6769,
  longitude: 139.7639,
  timeZone: "Asia/Tokyo",
};
const found = {
  originRef: "node/1",
  name: "Senso-ji",
  kind: "temple" as const,
  latitude: 35.7148,
  longitude: 139.7967,
  address: null,
  openingHours: null,
  notable: true,
  serves: [],
  servesNot: [],
  tags: { amenity: "place_of_worship" } as Record<string, string> | null,
  lastEditedAt: new Date("2026-03-14T10:22:41Z") as Date | null,
};
const row = (over: object = {}) => ({
  id: "p1",
  origin: "OSM",
  originRef: "node/1",
  cityKey: "tokyo|japan",
  name: "Senso-ji",
  kind: "temple",
  latitude: 35.7148,
  longitude: 139.7967,
  address: null,
  openingHours: null,
  notable: true,
  serves: [],
  servesNot: [],
  osmTags: null,
  lastEditedAt: null,
  fetchedAt: null,
  addedByUserId: null,
  ...over,
});

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

beforeEach(() => {
  vi.stubEnv("PLACE_PROVIDER_MODE", "auto");
  mocks.db.placeFetch.findUnique.mockResolvedValue(null);
  mocks.db.providerCall.upsert.mockResolvedValue({ count: 1 });
  mocks.db.place.findMany.mockResolvedValue([]);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("gathering places", () => {
  it("asks the provider once, saves what it found, and records the request", async () => {
    mocks.osm.sights.mockResolvedValue({ places: [found], reach: null });

    expect(await gatherSights(tokyo)).toEqual({ status: "ready" });

    expect(mocks.osm.sights).toHaveBeenCalledTimes(1);
    expect(mocks.db.$executeRaw).toHaveBeenCalledTimes(1);
    expect(mocks.db.placeFetch.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          cityKey_scope: { cityKey: "tokyo|japan", scope: "OSM:sights#2" },
        },
      }),
    );
  });

  it("a recent record means no request", async () => {
    mocks.db.placeFetch.findUnique.mockResolvedValue({
      fetchedAt: daysAgo(29),
    });

    expect(await gatherSights(tokyo)).toEqual({ status: "ready" });
    expect(mocks.osm.sights).not.toHaveBeenCalled();
    expect(mocks.db.providerCall.upsert).not.toHaveBeenCalled();
  });

  it("fetches again exactly 30 days after the last request, and not a moment before", async () => {
    vi.useFakeTimers({
      now: new Date("2027-05-11T12:00:00Z"),
      toFake: ["Date"],
    });
    try {
      mocks.osm.sights.mockResolvedValue({ places: [], reach: null });
      mocks.db.placeFetch.findUnique.mockResolvedValue({
        fetchedAt: new Date(Date.now() - 30 * 86_400_000 + 1),
      });
      await gatherSights(tokyo);
      expect(mocks.osm.sights).not.toHaveBeenCalled();

      mocks.db.placeFetch.findUnique.mockResolvedValue({
        fetchedAt: new Date(Date.now() - 30 * 86_400_000),
      });
      await gatherSights(tokyo);
      expect(mocks.osm.sights).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fetches a scope again after 30 days, writing one upsert", async () => {
    mocks.db.placeFetch.findUnique.mockResolvedValue({
      fetchedAt: daysAgo(31),
    });
    mocks.osm.sights.mockResolvedValue({ places: [found], reach: null });

    expect(await gatherSights(tokyo)).toEqual({ status: "ready" });

    expect(mocks.osm.sights).toHaveBeenCalledTimes(1);
    expect(mocks.db.$executeRaw).toHaveBeenCalledTimes(1);
    // A tagged template: the text pieces, then the joined rows.
    const [, rows, conflict] = mocks.db.$executeRaw.mock.calls[0];
    expect(conflict.sql).toContain(
      'ON CONFLICT ("origin", "origin_ref") DO UPDATE',
    );
    expect(rows.values).toContain(JSON.stringify(found.tags));
    // A place returned again is no longer gone.
    expect(conflict.sql).toContain('"gone_at" = NULL');
    expect(mocks.db.placeFetch.upsert).toHaveBeenCalledTimes(1);
  });

  it("a record of an older query version means one request", async () => {
    // Only the version-1 record exists; the lookup is for "#2".
    mocks.db.placeFetch.findUnique.mockImplementation(
      async ({ where }: { where: { cityKey_scope: { scope: string } } }) =>
        where.cityKey_scope.scope === "OSM:food@35.71,139.80#1"
          ? { fetchedAt: daysAgo(1) }
          : null,
    );
    mocks.osm.foodNear.mockResolvedValue({ places: [], reach: null });

    await gatherFoodNear(tokyo, { latitude: 35.7148, longitude: 139.7967 });

    expect(mocks.osm.foodNear).toHaveBeenCalledTimes(1);
  });

  it("a failed refresh leaves rows and the record as they were and says unavailable", async () => {
    mocks.db.placeFetch.findUnique.mockResolvedValue({
      fetchedAt: daysAgo(40),
    });
    mocks.osm.sights.mockRejectedValue(new Error("timeout"));

    expect(await gatherSights(tokyo)).toEqual({ status: "unavailable" });
    expect(mocks.db.$executeRaw).not.toHaveBeenCalled();
    expect(mocks.db.placeFetch.upsert).not.toHaveBeenCalled();
  });

  it("says the provider is unavailable and records nothing when it fails", async () => {
    mocks.osm.sights.mockRejectedValue(new Error("timeout"));

    expect(await gatherSights(tokyo)).toEqual({ status: "unavailable" });
    expect(mocks.db.$executeRaw).not.toHaveBeenCalled();
    expect(mocks.db.placeFetch.upsert).not.toHaveBeenCalled();
  });

  it("logs a database error on the server, with its code and no text the traveller typed, before saying unavailable", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = Object.assign(
      new Error("Raw query failed. Code: `42601`. Message: `syntax error`"),
      { code: "P2010", meta: { code: "42601" } },
    );
    mocks.db.$executeRaw
      .mockRejectedValueOnce(failure)
      .mockRejectedValueOnce(failure);
    mocks.osm.sights.mockResolvedValue({ places: [found], reach: null });
    mocks.osm.byName.mockResolvedValue([found]);

    expect(await gatherSights(tokyo)).toEqual({ status: "unavailable" });
    expect(await findPlacesByName(tokyo, "Hotel Quietname")).toEqual({
      status: "unavailable",
    });

    expect(log).toHaveBeenCalledTimes(2);
    for (const [line, ...rest] of log.mock.calls) {
      expect(rest).toEqual([]);
      expect(line).toMatch(/^\[places\] /);
      expect(line).toContain("P2010");
      expect(line).toContain("42601");
      expect(line).toContain("syntax error");
      expect(line).not.toContain("Quietname");
      expect(line).not.toContain("\n");
    }
    log.mockRestore();
  });

  it("stops at the daily cap without calling the provider", async () => {
    mocks.db.providerCall.upsert.mockResolvedValue({ count: 101 });

    expect(await gatherSights(tokyo)).toEqual({ status: "capped" });
    expect(mocks.osm.sights).not.toHaveBeenCalled();
  });

  it("cannot gather for a city with no known position", async () => {
    expect(
      await gatherSights({ ...tokyo, latitude: null, longitude: null }),
    ).toEqual({
      status: "unavailable",
    });
    expect(mocks.osm.sights).not.toHaveBeenCalled();
  });

  it("gathers food once per square of the map", async () => {
    mocks.osm.foodNear.mockResolvedValue({ places: [], reach: null });

    await gatherFoodNear(tokyo, { latitude: 35.7148, longitude: 139.7967 });

    expect(mocks.osm.foodNear).toHaveBeenCalledWith(tokyo, {
      latitude: 35.71,
      longitude: 139.8,
    });
    expect(mocks.db.placeFetch.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          cityKey_scope: {
            cityKey: "tokyo|japan",
            scope: "OSM:food@35.71,139.80#3",
          },
        },
      }),
    );
  });

  it("uses sample places in mock mode, uncounted and recorded apart from real ones", async () => {
    vi.stubEnv("PLACE_PROVIDER_MODE", "mock");

    expect(await gatherSights(tokyo)).toEqual({ status: "ready" });

    expect(mocks.osm.sights).not.toHaveBeenCalled();
    expect(mocks.db.providerCall.upsert).not.toHaveBeenCalled();
    expect(mocks.db.$executeRaw.mock.calls[0][1].values).toContain("SAMPLE");
    expect(
      mocks.db.placeFetch.upsert.mock.calls[0][0].where.cityKey_scope.scope,
    ).toBe("SAMPLE:sights#2");
  });
});

describe("a place the provider stopped returning", () => {
  const refresh = () =>
    mocks.db.placeFetch.findUnique.mockResolvedValue({
      fetchedAt: daysAgo(31),
    });
  const saved = (
    id: string,
    kind: string,
    [latitude, longitude]: [number, number],
    osmTags: Record<string, string> | null,
  ) => row({ id, originRef: `node/${id}`, kind, latitude, longitude, osmTags });
  const marked = () =>
    mocks.db.place.updateMany.mock.calls.flatMap(
      ([call]) => call.where.id.in as string[],
    );

  it("is marked gone by a food refresh that asks for it; food at another square and the sights stay", async () => {
    refresh();
    const atA = { latitude: 35.71, longitude: 139.8 };
    mocks.osm.foodNear.mockResolvedValue({
      places: [{ ...found, originRef: "node/kept", kind: "restaurant" }],
      reach: foodReach(atA),
    });
    mocks.db.place.findMany.mockResolvedValue([
      saved("kept", "restaurant", [35.7105, 139.8], {
        name: "Kept",
        amenity: "restaurant",
      }),
      saved("closed", "restaurant", [35.711, 139.801], {
        name: "Closed",
        amenity: "restaurant",
      }),
      // About 3 km north, at another square.
      saved("atB", "cafe", [35.74, 139.8], { name: "At B", amenity: "cafe" }),
      saved("temple", "temple", [35.7102, 139.8003], {
        name: "Temple",
        amenity: "place_of_worship",
        wikidata: "Q1",
      }),
    ]);

    expect(
      await gatherFoodNear(tokyo, { latitude: 35.7148, longitude: 139.7967 }),
    ).toEqual({ status: "ready" });

    expect(mocks.db.place.findMany.mock.calls[0][0].where).toEqual({
      origin: "OSM",
      cityKey: "tokyo|japan",
      goneAt: null,
    });
    expect(marked()).toEqual(["closed"]);
    expect(mocks.db.place.updateMany.mock.calls[0][0].data.goneAt).toEqual(
      expect.any(Date),
    );
  });

  it("is not marked when the sights query never asks for it: a bar, a monument with no encyclopedia entry, a search result with no name tag", async () => {
    refresh();
    mocks.osm.sights.mockResolvedValue({
      places: [],
      reach: sightsReach(tokyo),
    });
    mocks.db.place.findMany.mockResolvedValue([
      saved("bar", "bar", [35.68, 139.77], { name: "Bar", amenity: "bar" }),
      saved("monument", "sight", [35.68, 139.76], {
        name: "Monument",
        historic: "monument",
      }),
      saved("searched", "museum", [35.68, 139.76], { tourism: "museum" }),
      saved("untagged", "museum", [35.68, 139.76], null),
      // About 14 km north: outside the circle.
      saved("far", "museum", [35.8, 139.76], {
        name: "Far",
        tourism: "museum",
      }),
      saved("museum", "museum", [35.68, 139.765], {
        name: "Museum",
        tourism: "museum",
      }),
    ]);

    await gatherSights(tokyo);

    expect(marked()).toEqual(["museum"]);
  });

  it("is not marked by a first fetch, or by a reply that may have been cut short", async () => {
    mocks.db.place.findMany.mockResolvedValue([
      saved("museum", "museum", [35.68, 139.765], {
        name: "Museum",
        tourism: "museum",
      }),
    ]);
    mocks.osm.sights.mockResolvedValue({
      places: [],
      reach: sightsReach(tokyo),
    });
    await gatherSights(tokyo);

    refresh();
    mocks.osm.sights.mockResolvedValue({ places: [], reach: null });
    await gatherSights(tokyo);

    expect(mocks.db.place.updateMany).not.toHaveBeenCalled();
  });
});

describe("reading saved places", () => {
  it("lists sights from the active provider and the traveller's own, in a fixed order", async () => {
    mocks.db.place.findMany.mockResolvedValue([row()]);

    const places = await listSights(tokyo, "user-1");

    expect(places[0]).toMatchObject({
      id: "p1",
      kind: "temple",
      origin: "OSM",
      latitude: 35.7148,
    });
    const query = mocks.db.place.findMany.mock.calls[0][0];
    expect(query.where.OR).toEqual([
      { origin: "OSM" },
      { origin: "USER", addedByUserId: "user-1" },
    ]);
    expect(query.where.kind.in).not.toContain("restaurant");
    expect(query.where.goneAt).toBeNull();
    expect(query.orderBy).toEqual({ id: "asc" });
  });

  it("lists food only within walking distance, keeping places with no position", async () => {
    mocks.db.place.findMany.mockResolvedValue([
      row({
        id: "near",
        kind: "restaurant",
        latitude: 35.715,
        longitude: 139.797,
      }),
      row({ id: "far", kind: "restaurant", latitude: 35.66, longitude: 139.7 }),
      row({
        id: "mine",
        kind: "cafe",
        origin: "USER",
        latitude: null,
        longitude: null,
      }),
    ]);

    const places = await listFoodNear(
      tokyo,
      { latitude: 35.7148, longitude: 139.7967 },
      "user-1",
    );

    expect(places.map((place) => place.id)).toEqual(["near", "mine"]);
  });

  it("reads only the string tags of a saved row, whatever JSON the column holds", async () => {
    mocks.db.place.findMany.mockResolvedValue([
      row({
        id: "tagged",
        osmTags: { amenity: "cafe", wikidata: "Q1", level: 3, a: { b: "c" } },
      }),
      row({ id: "list", osmTags: ["amenity", "cafe"] }),
    ]);

    const [tagged, list] = await listSights(tokyo, "user-1");

    expect(tagged.tags).toEqual({ amenity: "cafe", wikidata: "Q1" });
    expect(list.tags).toEqual({});
  });

  it("returns another traveller's own place to nobody else", async () => {
    await getPlaces(["p1", "p2"], "user-1");
    expect(mocks.db.place.findMany.mock.calls[0][0].where).toEqual({
      id: { in: ["p1", "p2"] },
      OR: [{ origin: { not: "USER" } }, { addedByUserId: "user-1" }],
    });
    expect(await getPlaces([], "user-1")).toEqual([]);
  });

  it("returns where a place's facts came from, with empty tags when none", async () => {
    mocks.db.place.findMany.mockResolvedValue([
      row({
        osmTags: { amenity: "place_of_worship" },
        lastEditedAt: new Date("2026-03-14T10:22:41Z"),
        fetchedAt: new Date("2026-11-01T00:00:00Z"),
      }),
      row({ id: "p2", originRef: null }),
    ]);

    const [first, second] = await listSights(tokyo, "user-1");

    expect(first).toMatchObject({
      originRef: "node/1",
      tags: { amenity: "place_of_worship" },
      lastEditedAt: "2026-03-14T10:22:41.000Z",
      fetchedAt: "2026-11-01T00:00:00.000Z",
    });
    expect(second).toMatchObject({
      originRef: null,
      tags: {},
      lastEditedAt: null,
      fetchedAt: null,
    });
  });

  it("reads an unknown kind in old data as a sight rather than failing", async () => {
    mocks.db.place.findMany.mockResolvedValue([row({ kind: "spaceport" })]);
    expect((await listSights(tokyo, "user-1"))[0].kind).toBe("sight");
  });
});

describe("adding a place by name or by hand", () => {
  it("searches on submit, saves the matches and returns them with ids", async () => {
    mocks.osm.byName.mockResolvedValue([found]);
    mocks.db.place.findMany.mockResolvedValue([row()]);

    const outcome = await findPlacesByName(tokyo, "  senso  ");

    expect(mocks.osm.byName).toHaveBeenCalledWith(tokyo, "senso");
    expect(outcome).toMatchObject({ status: "ok", places: [{ id: "p1" }] });
  });

  it("a name search neither overwrites a place Overpass saved nor brings back one marked gone", async () => {
    mocks.osm.byName.mockResolvedValue([found]);

    await findPlacesByName(tokyo, "senso");

    const [, , conflict] = mocks.db.$executeRaw.mock.calls[0];
    expect(conflict.sql).toContain("DO NOTHING");
    expect(conflict.sql).not.toContain("DO UPDATE");
    expect(conflict.sql).not.toContain("gone_at");
    // A gone place it matched is not offered either.
    expect(mocks.db.place.findMany.mock.calls[0][0].where.goneAt).toBeNull();
  });

  it("does not search for text too short, and reports a failed or capped search", async () => {
    expect(await findPlacesByName(tokyo, "a")).toEqual({
      status: "ok",
      places: [],
    });
    expect(mocks.osm.byName).not.toHaveBeenCalled();

    mocks.osm.byName.mockRejectedValue(new Error("down"));
    expect(await findPlacesByName(tokyo, "senso")).toEqual({
      status: "unavailable",
    });

    mocks.db.providerCall.upsert.mockResolvedValue({ count: 500 });
    expect(await findPlacesByName(tokyo, "senso")).toEqual({
      status: "capped",
    });
  });

  it("marks a hand-entered place as the traveller's own", async () => {
    mocks.db.place.create.mockResolvedValue(
      row({
        id: "own",
        origin: "USER",
        originRef: null,
        name: "Aunt's flat",
        kind: "sight",
        latitude: null,
        longitude: null,
        addedByUserId: "user-1",
        notable: false,
        serves: [],
        servesNot: [],
      }),
    );

    const place = await addOwnPlace("user-1", tokyo, {
      name: "Aunt's flat",
      kind: "sight",
    });

    expect(place).toMatchObject({ id: "own", origin: "USER", latitude: null });
    expect(mocks.db.place.create).toHaveBeenCalledWith({
      data: {
        origin: "USER",
        cityKey: "tokyo|japan",
        name: "Aunt's flat",
        kind: "sight",
        addedByUserId: "user-1",
      },
    });
  });
});

describe("removeOwnPlace", () => {
  const tx = (found: { name: string } | null) => ({
    place: {
      findFirst: vi.fn().mockResolvedValue(found),
      deleteMany: vi.fn().mockResolvedValue({ count: found ? 1 : 0 }),
    },
  });
  const asTx = (fake: ReturnType<typeof tx>) =>
    fake as unknown as Parameters<typeof removeOwnPlace>[0];

  it("deletes only a place this traveller added by hand, and answers its name", async () => {
    const fake = tx({ name: "Aunt's flat" });
    expect(await removeOwnPlace(asTx(fake), "user-1", "own")).toBe(
      "Aunt's flat",
    );
    const where = { id: "own", origin: "USER", addedByUserId: "user-1" };
    expect(fake.place.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where }),
    );
    expect(fake.place.deleteMany).toHaveBeenCalledWith({ where });
  });

  it("answers null for a provider place, another traveller's place, or one with no owner", async () => {
    const fake = tx(null);
    expect(await removeOwnPlace(asTx(fake), "user-1", "p1")).toBeNull();
    expect(fake.place.deleteMany).not.toHaveBeenCalled();
  });
});

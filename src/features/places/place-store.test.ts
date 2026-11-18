import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    place: { createMany: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    placeFetch: { findUnique: vi.fn(), upsert: vi.fn() },
    providerCall: { upsert: vi.fn() },
  },
  osm: { sights: vi.fn(), foodNear: vi.fn(), byName: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("./osm-source", () => ({
  osmSource: { origin: "OSM", metered: true, ...mocks.osm },
}));

import {
  addOwnPlace,
  findPlacesByName,
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
  addedByUserId: null,
  ...over,
});

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
    mocks.osm.sights.mockResolvedValue([found]);

    expect(await gatherSights(tokyo)).toEqual({ status: "ready" });

    expect(mocks.osm.sights).toHaveBeenCalledTimes(1);
    expect(mocks.db.place.createMany).toHaveBeenCalledWith({
      data: [{ ...found, origin: "OSM", cityKey: "tokyo|japan" }],
      skipDuplicates: true,
    });
    expect(mocks.db.placeFetch.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          cityKey_scope: { cityKey: "tokyo|japan", scope: "OSM:sights" },
        },
      }),
    );
  });

  it("does not ask again once a request is on record", async () => {
    mocks.db.placeFetch.findUnique.mockResolvedValue({ id: "f1" });

    expect(await gatherSights(tokyo)).toEqual({ status: "ready" });
    expect(mocks.osm.sights).not.toHaveBeenCalled();
    expect(mocks.db.providerCall.upsert).not.toHaveBeenCalled();
  });

  it("says the provider is unavailable and records nothing when it fails", async () => {
    mocks.osm.sights.mockRejectedValue(new Error("timeout"));

    expect(await gatherSights(tokyo)).toEqual({ status: "unavailable" });
    expect(mocks.db.place.createMany).not.toHaveBeenCalled();
    expect(mocks.db.placeFetch.upsert).not.toHaveBeenCalled();
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
    mocks.osm.foodNear.mockResolvedValue([]);

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
            scope: "OSM:food@35.71,139.80",
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
    expect(mocks.db.place.createMany.mock.calls[0][0].data[0]).toMatchObject({
      origin: "SAMPLE",
    });
    expect(
      mocks.db.placeFetch.upsert.mock.calls[0][0].where.cityKey_scope.scope,
    ).toBe("SAMPLE:sights");
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

  it("returns another traveller's own place to nobody else", async () => {
    await getPlaces(["p1", "p2"], "user-1");
    expect(mocks.db.place.findMany.mock.calls[0][0].where).toEqual({
      id: { in: ["p1", "p2"] },
      OR: [{ origin: { not: "USER" } }, { addedByUserId: "user-1" }],
    });
    expect(await getPlaces([], "user-1")).toEqual([]);
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

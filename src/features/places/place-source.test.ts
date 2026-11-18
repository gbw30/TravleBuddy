import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { placesFromNominatim } from "./nominatim";
import { politeFetch, ProviderBusyError, resetPoliteFetch } from "./osm-http";
import { foodQuery, placesFromOverpass, sightsQuery } from "./overpass";
import { cityKey, foodScope } from "./place-source";
import { sampleSource } from "./sample-source";

const tokyo = {
  name: "Tokyo",
  region: null,
  country: "Japan",
  latitude: 35.6769,
  longitude: 139.7639,
  timeZone: "Asia/Tokyo",
};

describe("placesFromOverpass", () => {
  // The shape Overpass returns for `out center tags`.
  const reply = {
    elements: [
      {
        type: "node",
        id: 1,
        lat: 35.7148,
        lon: 139.7967,
        tags: {
          name: "浅草寺",
          "name:en": "Senso-ji",
          amenity: "place_of_worship",
          wikidata: "Q1",
          opening_hours: "Mo-Su 06:00-17:00",
          "addr:housenumber": "2-3-1",
          "addr:street": "Asakusa",
          "addr:city": "Taito",
        },
      },
      {
        type: "way",
        id: 2,
        center: { lat: 35.7188, lon: 139.7765 },
        tags: { name: "Tokyo National Museum", tourism: "museum" },
      },
      {
        type: "node",
        id: 3,
        lat: 35.7,
        lon: 139.7,
        tags: { tourism: "museum" },
      },
      {
        type: "node",
        id: 4,
        lat: 35.7,
        lon: 139.7,
        tags: { name: "A bank", amenity: "bank" },
      },
      { type: "way", id: 5, tags: { name: "No position", tourism: "museum" } },
      {
        type: "node",
        id: 1,
        lat: 35.7148,
        lon: 139.7967,
        tags: { name: "Copy", tourism: "attraction" },
      },
    ],
  };

  it("reads nodes and ways, prefers the English name, and keeps facts as given", () => {
    expect(placesFromOverpass(reply)).toEqual([
      {
        originRef: "node/1",
        name: "Senso-ji",
        kind: "temple",
        latitude: 35.7148,
        longitude: 139.7967,
        address: "2-3-1 Asakusa, Taito",
        openingHours: "Mo-Su 06:00-17:00",
        notable: true,
      },
      {
        originRef: "way/2",
        name: "Tokyo National Museum",
        kind: "museum",
        latitude: 35.7188,
        longitude: 139.7765,
        address: null,
        openingHours: null,
        notable: false,
      },
    ]);
  });

  it("returns nothing for a reply it does not recognise", () => {
    expect(placesFromOverpass(null)).toEqual([]);
    expect(placesFromOverpass({ remark: "runtime error" })).toEqual([]);
  });

  it("asks for sights across the city and food within a walk", () => {
    expect(sightsQuery(tokyo)).toContain("(around:9000,35.6769,139.7639)");
    expect(sightsQuery(tokyo)).toContain(
      '["amenity"="place_of_worship"]["name"]["wikidata"]',
    );
    expect(foodQuery(tokyo)).toContain("(around:1200,35.6769,139.7639)");
    expect(foodQuery(tokyo)).toContain("restaurant|cafe");
  });
});

describe("placesFromNominatim", () => {
  it("reads a named place and keeps an unplanned kind as a sight", () => {
    const places = placesFromNominatim([
      {
        osm_type: "node",
        osm_id: 9,
        name: "Ichiran",
        lat: "35.66",
        lon: "139.70",
        category: "amenity",
        type: "restaurant",
        display_name: "Ichiran, Shibuya, Tokyo, Japan",
        extratags: { opening_hours: "24/7" },
      },
      {
        osm_type: "way",
        osm_id: 10,
        name: "A shop",
        lat: "35.6",
        lon: "139.7",
        category: "shop",
        type: "books",
      },
      { osm_type: "way", osm_id: 11, name: "", lat: "35.6", lon: "139.7" },
    ]);
    expect(
      places.map((place) => [place.originRef, place.kind, place.openingHours]),
    ).toEqual([
      ["node/9", "restaurant", "24/7"],
      ["way/10", "sight", null],
    ]);
  });
});

describe("sample source and keys", () => {
  it("gives the same sample places every time, each with a kind and a position", async () => {
    const first = await sampleSource.sights(tokyo);
    expect(first).toEqual(await sampleSource.sights(tokyo));
    expect(first.length).toBeGreaterThanOrEqual(12);
    expect(new Set(first.map((place) => place.originRef)).size).toBe(
      first.length,
    );

    const lisbon = await sampleSource.sights({
      ...tokyo,
      name: "Lisbon",
      latitude: 38.7,
      longitude: -9.14,
    });
    expect(lisbon[0].name).toBe("Lisbon Old Town");
    expect(
      lisbon.every((place) => Math.abs(place.latitude - 38.7) < 0.05),
    ).toBe(true);

    const food = await sampleSource.foodNear(tokyo, {
      latitude: 35.71,
      longitude: 139.8,
    });
    expect(
      food.every(
        (place) => place.kind === "restaurant" || place.kind === "cafe",
      ),
    ).toBe(true);
    expect(
      (await sampleSource.byName(tokyo, " skytree ")).map(
        (place) => place.name,
      ),
    ).toEqual(["Tokyo Skytree"]);
  });

  it("keys a city by name and country, and food by a square of the map", () => {
    expect(cityKey(tokyo)).toBe("tokyo|japan");
    expect(foodScope({ latitude: 35.7148, longitude: 139.7967 })).toEqual({
      scope: "food@35.71,139.80",
      centre: { latitude: 35.71, longitude: 139.8 },
    });
  });
});

describe("politeFetch", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    resetPoliteFetch();
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("identifies the application and never sends two requests at once", async () => {
    let inFlight = 0;
    let most = 0;
    fetchMock.mockImplementation(async () => {
      inFlight += 1;
      most = Math.max(most, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 50));
      inFlight -= 1;
      return Response.json([]);
    });

    const both = Promise.all([
      politeFetch("https://example.test/a", { timeoutMs: 1000 }),
      politeFetch("https://example.test/b", { timeoutMs: 1000 }),
    ]);
    await vi.advanceTimersByTimeAsync(3000);
    await both;

    expect(most).toBe(1);
    expect(fetchMock.mock.calls[0][1].headers["User-Agent"]).toMatch(
      /TravleBuddy/,
    );
  });

  it("pauses for 30 seconds after being told to slow down", async () => {
    fetchMock.mockResolvedValue(new Response("slow down", { status: 429 }));
    await expect(
      politeFetch("https://example.test/a", { timeoutMs: 1000 }),
    ).rejects.toBeInstanceOf(ProviderBusyError);

    fetchMock.mockResolvedValue(Response.json([]));
    await expect(
      politeFetch("https://example.test/b", { timeoutMs: 1000 }),
    ).rejects.toBeInstanceOf(ProviderBusyError);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(31_000);
    const again = politeFetch("https://example.test/c", { timeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(2000);
    expect((await again).ok).toBe(true);
  });
});

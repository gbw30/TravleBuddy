import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: { cityLookup: { findUnique: vi.fn(), upsert: vi.fn() } },
}));
vi.mock("@/lib/db", () => ({ db: mocks.db }));

import { findCities } from "./city-lookup";
import { citiesFromNominatim } from "./nominatim";
import { resetPoliteFetch } from "./osm-http";

// Shapes recorded from the live service on 2026-11-18.
const tokyo = {
  name: "Tokyo",
  lat: "35.6768601",
  lon: "139.7638947",
  address: { province: "Tokyo", country: "Japan", country_code: "jp" },
};
const sintra = {
  name: "Sintra",
  lat: "38.8355446",
  lon: "-9.3522371",
  address: {
    municipality: "Sintra",
    county: "Lisbon",
    country: "Portugal",
    country_code: "pt",
  },
};

describe("citiesFromNominatim", () => {
  it("reads a province and a municipality as cities, with their time zones", () => {
    expect(citiesFromNominatim([tokyo, sintra])).toEqual([
      {
        name: "Tokyo",
        region: null,
        country: "Japan",
        latitude: 35.6768601,
        longitude: 139.7638947,
        timeZone: "Asia/Tokyo",
      },
      {
        name: "Sintra",
        region: "Lisbon",
        country: "Portugal",
        latitude: 38.8355446,
        longitude: -9.3522371,
        timeZone: "Europe/Lisbon",
      },
    ]);
  });

  it("drops repeats and anything that is not a usable place", () => {
    expect(
      citiesFromNominatim([
        tokyo,
        tokyo,
        { name: "Nowhere", lat: "x", lon: "y", address: {} },
        null,
      ]),
    ).toHaveLength(1);
    expect(citiesFromNominatim({ error: "nope" })).toEqual([]);
  });
});

describe("findCities", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    resetPoliteFetch();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("PLACE_PROVIDER_MODE", "auto");
    mocks.db.cityLookup.findUnique.mockResolvedValue(null);
    mocks.db.cityLookup.upsert.mockResolvedValue({});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("asks the provider once, identifies itself, and saves the answer", async () => {
    fetchMock.mockResolvedValue(Response.json([tokyo]));

    const outcome = await findCities("  TOKYO ");

    expect(outcome).toMatchObject({
      status: "ok",
      cities: [{ name: "Tokyo" }],
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("q=tokyo");
    expect(String(url)).toContain("featureType=city");
    expect(init.headers["User-Agent"]).toMatch(/TravleBuddy/);
    expect(mocks.db.cityLookup.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { query: "tokyo" } }),
    );
  });

  it("answers from the saved result without asking the provider", async () => {
    mocks.db.cityLookup.findUnique.mockResolvedValue({
      results: citiesFromNominatim([sintra]),
    });

    const outcome = await findCities("Sintra");

    expect(outcome).toMatchObject({
      status: "ok",
      cities: [{ name: "Sintra" }],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports the lookup as unavailable when the provider fails", async () => {
    fetchMock.mockResolvedValue(new Response("slow down", { status: 429 }));
    expect(await findCities("Lisbon")).toEqual({ status: "unavailable" });

    fetchMock.mockRejectedValue(new Error("network down"));
    expect(await findCities("Porto")).toEqual({ status: "unavailable" });
  });

  it("does not ask for text too short or too long to be a city", async () => {
    expect(await findCities(" a ")).toEqual({ status: "ok", cities: [] });
    expect(await findCities("x".repeat(81))).toEqual({
      status: "ok",
      cities: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses sample cities in mock mode and saves nothing", async () => {
    vi.stubEnv("PLACE_PROVIDER_MODE", "mock");

    const outcome = await findCities("paris");

    expect(
      outcome.status === "ok" && outcome.cities.map((c) => c.country),
    ).toEqual(["France", "United States"]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.db.cityLookup.upsert).not.toHaveBeenCalled();
  });
});

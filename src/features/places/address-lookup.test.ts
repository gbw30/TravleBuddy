import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    addressLookup: { findUnique: vi.fn(), upsert: vi.fn() },
    providerCall: { upsert: vi.fn() },
  },
}));
vi.mock("@/lib/db", () => ({ db: mocks.db }));

import { findAddresses } from "./address-lookup";
import { addressesFromNominatim } from "./nominatim";
import { resetPoliteFetch } from "./osm-http";

// The shape of Nominatim's reply to a street search.
const rua = {
  osm_type: "way",
  osm_id: 4242,
  lat: "38.7110000",
  lon: "-9.1400000",
  display_name: "Rua da Prata 12, Baixa, Lisbon, 1100-420, Portugal",
};
const lisbon = { latitude: 38.7078, longitude: -9.1366 };

describe("addressesFromNominatim", () => {
  it("reads a label, a position and the provider's reference", () => {
    expect(addressesFromNominatim([rua])).toEqual([
      {
        label: "Rua da Prata 12, Baixa, Lisbon, 1100-420, Portugal",
        latitude: 38.711,
        longitude: -9.14,
        ref: "way/4242",
      },
    ]);
  });

  it("drops anything without a position or a reference", () => {
    expect(
      addressesFromNominatim([
        { ...rua, lat: "x" },
        { ...rua, osm_id: undefined },
        { ...rua, display_name: "" },
        null,
      ]),
    ).toEqual([]);
    expect(addressesFromNominatim({ error: "nope" })).toEqual([]);
  });
});

describe("findAddresses", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    resetPoliteFetch();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("PLACE_PROVIDER_MODE", "auto");
    mocks.db.addressLookup.findUnique.mockResolvedValue(null);
    mocks.db.addressLookup.upsert.mockResolvedValue({});
    mocks.db.providerCall.upsert.mockResolvedValue({ count: 1 });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("asks the provider within about 0.3 degrees of the city and saves the answer under the search and its square", async () => {
    fetchMock.mockResolvedValue(Response.json([rua]));

    const outcome = await findAddresses("  Rua da PRATA 12 ", lisbon);

    expect(outcome).toMatchObject({
      status: "ok",
      addresses: [{ ref: "way/4242" }],
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("q=Rua+da+PRATA+12");
    expect(String(url)).toContain("bounded=1");
    // The square is one tenth of a degree around the city, so the saved key is exact.
    expect(String(url)).toContain("viewbox=-9.4%2C39%2C-8.8%2C38.4");
    expect(init.headers["User-Agent"]).toMatch(/TravleBuddy/);
    const saved = mocks.db.addressLookup.upsert.mock.calls[0][0];
    expect(saved.where.key).toBe("rua da prata 12|38.7,-9.1");
    expect(saved.create.results).toHaveLength(1);
  });

  it("keeps no user in the saved key, and collapses the spaces and case it saves under", async () => {
    fetchMock.mockResolvedValue(Response.json([]));
    await findAddresses("Hotel Aurora", lisbon);
    expect(mocks.db.addressLookup.upsert.mock.calls[0][0].where.key).toBe(
      "hotel aurora|38.7,-9.1",
    );
  });

  it("answers from the saved search without asking the provider", async () => {
    mocks.db.addressLookup.findUnique.mockResolvedValue({
      results: addressesFromNominatim([rua]),
    });

    const outcome = await findAddresses("Rua da Prata 12", lisbon);

    expect(outcome).toMatchObject({ status: "ok" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.db.providerCall.upsert).not.toHaveBeenCalled();
  });

  it("saves a search that found nothing, so it is not asked again", async () => {
    fetchMock.mockResolvedValue(Response.json([]));
    expect(await findAddresses("Nowhere 99", lisbon)).toEqual({
      status: "ok",
      addresses: [],
    });
    expect(mocks.db.addressLookup.upsert).toHaveBeenCalledOnce();
  });

  it("reports an unreachable provider as unavailable and saves nothing", async () => {
    fetchMock.mockResolvedValue(new Response("slow down", { status: 429 }));
    expect(await findAddresses("Rua da Prata 12", lisbon)).toEqual({
      status: "unavailable",
    });
    expect(mocks.db.addressLookup.upsert).not.toHaveBeenCalled();
  });

  it("reports capped once today's allowance is used up, without asking", async () => {
    mocks.db.providerCall.upsert.mockResolvedValue({ count: 101 });
    expect(await findAddresses("Rua da Prata 12", lisbon)).toEqual({
      status: "capped",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    // Its own counter: the place provider's allowance is not touched.
    expect(mocks.db.providerCall.upsert).toHaveBeenCalledOnce();
    expect(
      mocks.db.providerCall.upsert.mock.calls[0][0].where.day_service.service,
    ).toBe("ADDRESS");
  });

  it("does not ask for text too short or too long to be an address", async () => {
    expect(await findAddresses(" a ", lisbon)).toEqual({
      status: "ok",
      addresses: [],
    });
    expect(await findAddresses("x".repeat(121), lisbon)).toEqual({
      status: "ok",
      addresses: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gives one sample address at the city centre in mock mode and saves nothing", async () => {
    vi.stubEnv("PLACE_PROVIDER_MODE", "mock");

    const outcome = await findAddresses("Rua da Prata 12", lisbon);

    expect(outcome).toEqual({
      status: "ok",
      addresses: [
        {
          label: "Sample address, city centre",
          latitude: lisbon.latitude,
          longitude: lisbon.longitude,
          ref: "sample/centre",
        },
      ],
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.db.addressLookup.upsert).not.toHaveBeenCalled();
    expect(mocks.db.providerCall.upsert).not.toHaveBeenCalled();
  });
});

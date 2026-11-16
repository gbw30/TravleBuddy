import { describe, expect, it } from "vitest";
import {
  mapGoogleTypesToCategory,
  normalizeGoogleTextSearchResponse,
} from "./normalization";
import { placeSearchRequestSchema } from "./types";

const request = placeSearchRequestSchema.parse({
  query: "museums",
  destination: {
    city: "Bogota",
    country: "Colombia",
  },
  maxResults: 10,
});

describe("Google Places normalization", () => {
  it("normalizes partial places and drops entries without stable IDs", () => {
    const result = normalizeGoogleTextSearchResponse(
      {
        places: [
          {
            id: "place-2",
            displayName: { text: "Museum Two" },
          },
          {
            displayName: { text: "Missing ID" },
          },
          {
            id: "place-1",
            displayName: { text: "Museum One" },
            formattedAddress: "1 Museum Way",
            primaryType: "museum",
            types: ["tourist_attraction", "museum"],
            rating: 4.75,
            priceLevel: "PRICE_LEVEL_MODERATE",
          },
        ],
      },
      request,
    );

    expect(result.status).toBe("valid");
    if (result.status !== "valid") {
      return;
    }
    expect(result.droppedResults).toBe(1);
    expect(result.places.map((place) => place.providerPlaceId)).toEqual([
      "place-1",
      "place-2",
    ]);
    expect(result.places[0]).toMatchObject({
      provider: "GOOGLE_PLACES",
      name: "Museum One",
      category: "ATTRACTION",
      address: "1 Museum Way",
      city: "Bogota",
      country: "Colombia",
      rating: 4.75,
      priceLevel: 2,
    });
    expect(result.places[1]).toMatchObject({
      address: null,
      latitude: null,
      longitude: null,
      rating: null,
      priceLevel: null,
    });
  });

  it("discards invalid coordinates without discarding an otherwise usable place", () => {
    const result = normalizeGoogleTextSearchResponse(
      {
        places: [
          {
            id: "bad-coordinates",
            displayName: { text: "Usable Place" },
            location: { latitude: 91, longitude: -181 },
          },
        ],
      },
      request,
    );

    expect(result).toMatchObject({
      status: "valid",
      places: [
        {
          providerPlaceId: "bad-coordinates",
          latitude: null,
          longitude: null,
        },
      ],
    });
  });

  it("bounds and deterministically orders retained raw metadata", () => {
    const result = normalizeGoogleTextSearchResponse(
      {
        places: [
          {
            id: "bounded",
            displayName: { text: "Bounded Metadata" },
            primaryType: "museum",
            types: Array.from(
              { length: 20 },
              (_, index) => `type_${String(index).padStart(2, "0")}`,
            ).reverse(),
            businessStatus: "OPERATIONAL",
            userRatingCount: 1234,
            googleMapsUri: "https://maps.google.com/?cid=1234",
            unboundedUnknownField: "x".repeat(20_000),
          },
        ],
      },
      request,
    );

    expect(result.status).toBe("valid");
    if (result.status !== "valid") {
      return;
    }
    expect(result.places[0].rawProviderData.types).toHaveLength(12);
    expect(result.places[0].rawProviderData.types).toEqual(
      [...result.places[0].rawProviderData.types].sort(),
    );
    expect(result.places[0].rawProviderData).not.toHaveProperty(
      "unboundedUnknownField",
    );
  });

  it("rejects malformed response envelopes", () => {
    expect(
      normalizeGoogleTextSearchResponse({ places: "not-an-array" }, request),
    ).toEqual({ status: "invalid" });
    expect(normalizeGoogleTextSearchResponse(null, request)).toEqual({
      status: "invalid",
    });
  });

  it("maps Google types using stable category precedence", () => {
    expect(mapGoogleTypesToCategory(null, ["museum", "restaurant"])).toBe(
      "RESTAURANT",
    );
    expect(mapGoogleTypesToCategory(null, ["restaurant", "museum"])).toBe(
      "RESTAURANT",
    );
    expect(mapGoogleTypesToCategory("museum", ["restaurant", "museum"])).toBe(
      "ATTRACTION",
    );
    expect(mapGoogleTypesToCategory("unknown_type", [])).toBe("ACTIVITY");
  });
});

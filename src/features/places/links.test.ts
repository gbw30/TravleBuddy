import { describe, expect, it } from "vitest";

import type { PlaceDto } from "./contracts";
import { placeLinks } from "./links";

const place = (over: Partial<PlaceDto> = {}): PlaceDto => ({
  id: "p1",
  origin: "OSM",
  name: "Museu Nacional do Azulejo",
  kind: "museum",
  cityKey: "lisbon|portugal",
  latitude: 38.7243,
  longitude: -9.1139,
  address: null,
  openingHours: null,
  notable: false,
  serves: [],
  servesNot: [],
  originRef: "node/123",
  tags: {},
  lastEditedAt: null,
  fetchedAt: null,
  hoursDoubt: null,
  ...over,
});

describe("placeLinks", () => {
  it("takes the website from website or contact:website", () => {
    expect(
      placeLinks(place({ tags: { website: "https://a.example/x" } }), "Lisbon")
        ?.website,
    ).toBe("https://a.example/x");
    expect(
      placeLinks(
        place({ tags: { "contact:website": "http://b.example" } }),
        "Lisbon",
      )?.website,
    ).toBe("http://b.example/");
  });

  it("takes the first web address from a tag that lists several", () => {
    expect(
      placeLinks(
        place({
          tags: {
            website: "mailto:a; https://a.example/pt ;https://a.example/en",
          },
        }),
        "Lisbon",
      )?.website,
    ).toBe("https://a.example/pt");
  });

  it("gives no website for another scheme or none at all", () => {
    for (const website of ["javascript:alert(1)", "www.a.example", "ftp://a"]) {
      expect(placeLinks(place({ tags: { website } }), "Lisbon")?.website).toBe(
        null,
      );
    }
    expect(placeLinks(place(), "Lisbon")?.website).toBeNull();
  });

  it("searches Google Maps by encoded name and position", () => {
    expect(placeLinks(place({ name: "Café & Bar #1" }), "Lisbon")?.maps).toBe(
      "https://www.google.com/maps/search/?api=1&query=Caf%C3%A9%20%26%20Bar%20%231%2C38.7243%2C-9.1139",
    );
  });

  it("searches an own place without a position by name and city", () => {
    const own = place({
      origin: "USER",
      originRef: null,
      latitude: null,
      longitude: null,
      name: "Tasca do Zé",
    });
    expect(placeLinks(own, "Lisbon")).toEqual({
      website: null,
      maps: "https://www.google.com/maps/search/?api=1&query=Tasca%20do%20Z%C3%A9%2C%20Lisbon",
      osm: null,
    });
  });

  it("links OpenStreetMap for an OpenStreetMap place only", () => {
    expect(placeLinks(place(), "Lisbon")?.osm).toBe(
      "https://www.openstreetmap.org/node/123",
    );
  });

  it("gives nothing for a sample place", () => {
    expect(placeLinks(place({ origin: "SAMPLE" }), "Lisbon")).toBeNull();
  });
});

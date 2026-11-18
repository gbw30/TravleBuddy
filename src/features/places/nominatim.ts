import tzLookup from "@photostructure/tz-lookup";

import { citySchema, type City } from "./contracts";
import { dietsFromOsmTags, kindFromOsmTags } from "./kinds";
import { politeFetch } from "./osm-http";
import type { FoundPlace, Point } from "./place-source";

// OpenStreetMap's Nominatim, used as ADR-009 allows: on submit only, one
// request a second, identified, and every result saved by the caller.
const ENDPOINT = "https://nominatim.openstreetmap.org/search";

function timeZoneAt(latitude: number, longitude: number): string | null {
  try {
    return tzLookup(latitude, longitude);
  } catch {
    return null;
  }
}

/**
 * Nominatim's reply as cities. The place's own `name` is used, because the
 * address calls it a city, a province or a municipality depending on the
 * country (Tokyo is a province, Sintra a municipality).
 */
export function citiesFromNominatim(reply: unknown): City[] {
  if (!Array.isArray(reply)) return [];

  const seen = new Set<string>();
  return reply.flatMap((item) => {
    const address = (item?.address ?? {}) as Record<string, unknown>;
    const name = typeof item?.name === "string" ? item.name : "";
    const region = [address.state, address.province, address.county].find(
      (part) => typeof part === "string" && part !== name,
    );
    const latitude = Number(item?.lat);
    const longitude = Number(item?.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    const parsed = citySchema.safeParse({
      name,
      region: typeof region === "string" ? region : null,
      country: address.country,
      latitude,
      longitude,
      timeZone: timeZoneAt(latitude, longitude),
    });
    if (!parsed.success) return [];

    const key = `${parsed.data.name}|${parsed.data.region}|${parsed.data.country}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [parsed.data];
  });
}

async function search(params: Record<string, string>): Promise<unknown> {
  const url = new URL(ENDPOINT);
  url.search = new URLSearchParams({
    format: "jsonv2",
    limit: "5",
    "accept-language": "en",
    ...params,
  }).toString();
  const response = await politeFetch(url, { timeoutMs: 8000 });
  return response.json();
}

/** Throws when the service cannot be reached or refuses the request. */
export async function searchNominatim(query: string): Promise<City[]> {
  return citiesFromNominatim(
    await search({ q: query, addressdetails: "1", featureType: "city" }),
  );
}

/**
 * Nominatim's reply to a search by name as places. A result of a kind the
 * product does not plan with is kept as a sight: the traveller asked for it.
 */
export function placesFromNominatim(reply: unknown): FoundPlace[] {
  if (!Array.isArray(reply)) return [];
  return reply.flatMap((item) => {
    const extra = (item?.extratags ?? {}) as Record<string, string | undefined>;
    const name = typeof item?.name === "string" ? item.name.trim() : "";
    const latitude = Number(item?.lat);
    const longitude = Number(item?.lon);
    if (
      !name ||
      !item?.osm_type ||
      !item?.osm_id ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return [];
    }
    return [
      {
        originRef: `${item.osm_type}/${item.osm_id}`,
        name: name.slice(0, 160),
        kind:
          kindFromOsmTags({ ...extra, [String(item.category)]: item.type }) ??
          "sight",
        latitude,
        longitude,
        address:
          typeof item.display_name === "string"
            ? item.display_name.slice(0, 240)
            : null,
        openingHours: extra.opening_hours?.slice(0, 400) ?? null,
        notable: Boolean(extra.wikidata || extra.wikipedia),
        ...dietsFromOsmTags(extra),
      },
    ];
  });
}

/** Places near a point whose name matches. Throws when the service cannot answer. */
export async function searchPlacesByName(
  text: string,
  near: Point,
): Promise<FoundPlace[]> {
  const reach = 0.3;
  return placesFromNominatim(
    await search({
      q: text,
      extratags: "1",
      bounded: "1",
      viewbox: [
        near.longitude - reach,
        near.latitude + reach,
        near.longitude + reach,
        near.latitude - reach,
      ].join(","),
    }),
  );
}

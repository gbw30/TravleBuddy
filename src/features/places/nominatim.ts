import tzLookup from "@photostructure/tz-lookup";

import { citySchema, type City } from "./contracts";

// OpenStreetMap's Nominatim, used as ADR-009 allows: on submit only, one
// request a second, identified, and every result saved by the caller.
const ENDPOINT = "https://nominatim.openstreetmap.org/search";
const USER_AGENT =
  process.env.PLACES_USER_AGENT ??
  "TravleBuddy/1.0 (+https://travle-buddy.vercel.app)";
const GAP_MS = 1100;

// shortcut: the gap holds inside one server process only; several serverless
// instances could exceed it together. Upgrade to a shared gate, or to a
// self-hosted or paid lookup, before real public use (ADR-009).
let nextSlot = 0;
async function waitForTurn() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + GAP_MS;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

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

/** Throws when the service cannot be reached or refuses the request. */
export async function searchNominatim(query: string): Promise<City[]> {
  await waitForTurn();
  const url = new URL(ENDPOINT);
  url.search = new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    limit: "5",
    featureType: "city",
    "accept-language": "en",
  }).toString();

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Nominatim answered ${response.status}`);
  return citiesFromNominatim(await response.json());
}

import { dietsFromOsmTags, keptTags, kindFromOsmTags } from "./kinds";
import { politeFetch } from "./osm-http";
import type { FoundPlace, Point } from "./place-source";

// OpenStreetMap's Overpass API: one area query per city and kind of place,
// saved by the caller and never repeated (ADR-009).
const ENDPOINT = "https://overpass-api.de/api/interpreter";
const SIGHTS_RADIUS_M = 9000;
const FOOD_RADIUS_M = 1200;

const around = (radius: number, point: Point) =>
  `(around:${radius},${point.latitude},${point.longitude})`;

/**
 * Things to see and do around a city centre. Temples, parks and historic
 * sites are taken only when they have an encyclopedia entry, so a city of
 * thousands of small shrines returns its well-known ones.
 */
export function sightsQuery(centre: Point): string {
  const area = around(SIGHTS_RADIUS_M, centre);
  return `[out:json][timeout:20];
(
  nwr["tourism"~"^(museum|gallery|viewpoint|theme_park|zoo|aquarium|attraction)$"]["name"]${area};
  nwr["amenity"="marketplace"]["name"]${area};
  nwr["historic"]["name"]["wikidata"]${area};
  nwr["amenity"="place_of_worship"]["name"]["wikidata"]${area};
  nwr["leisure"~"^(park|garden)$"]["name"]["wikidata"]${area};
);
out center meta 500;`;
}

/** Restaurants, cafes and bakeries within walking distance of a point. */
export function foodQuery(centre: Point): string {
  const area = around(FOOD_RADIUS_M, centre);
  return `[out:json][timeout:20];
(
  nwr["amenity"~"^(restaurant|cafe)$"]["name"]${area};
  nwr["shop"="bakery"]["name"]${area};
);
out center meta 200;`;
}

type Tags = Record<string, string | undefined>;

function addressFrom(tags: Tags): string | null {
  if (tags["addr:full"]) return tags["addr:full"];
  const street = [tags["addr:housenumber"], tags["addr:street"]]
    .filter(Boolean)
    .join(" ");
  const parts = [street, tags["addr:suburb"], tags["addr:city"]].filter(
    Boolean,
  );
  return parts.length > 0 ? parts.join(", ") : null;
}

function editTime(timestamp: unknown): Date | null {
  const time = typeof timestamp === "string" ? new Date(timestamp) : null;
  return time && !Number.isNaN(time.getTime()) ? time : null;
}

/**
 * Overpass's reply as places. An element without a name, a position or a
 * kind the product plans with is left out, as is a second copy of one place.
 */
export function placesFromOverpass(reply: unknown): FoundPlace[] {
  const elements = (reply as { elements?: unknown })?.elements;
  if (!Array.isArray(elements)) return [];

  const seen = new Set<string>();
  return elements.flatMap((element) => {
    const tags = (element?.tags ?? {}) as Tags;
    // The English name when mappers gave one; otherwise the local name.
    const name = (tags["name:en"] ?? tags.name ?? "").trim();
    const kind = kindFromOsmTags(tags);
    const latitude = Number(element?.lat ?? element?.center?.lat);
    const longitude = Number(element?.lon ?? element?.center?.lon);
    const originRef = `${element?.type}/${element?.id}`;
    if (
      !name ||
      !kind ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      !element?.type ||
      element?.id === undefined ||
      seen.has(originRef)
    ) {
      return [];
    }
    seen.add(originRef);
    return [
      {
        originRef,
        name: name.slice(0, 160),
        kind,
        latitude,
        longitude,
        address: addressFrom(tags)?.slice(0, 240) ?? null,
        openingHours: tags.opening_hours?.slice(0, 400) ?? null,
        notable: Boolean(tags.wikidata || tags.wikipedia),
        ...dietsFromOsmTags(tags),
        tags: keptTags(tags),
        // Only the time: `out meta` also names the editor, which is not kept.
        lastEditedAt: editTime(element?.timestamp),
      },
    ];
  });
}

/** Runs one query. Throws when Overpass cannot be reached or refuses. */
export async function runOverpass(query: string): Promise<FoundPlace[]> {
  const response = await politeFetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ data: query }),
    timeoutMs: 25_000,
  });
  return placesFromOverpass(await response.json());
}

import type { PlaceDto } from "./contracts";

/** Where a traveller can check a place for themselves. */
export type PlaceLinks = {
  website: string | null;
  maps: string;
  osm: string | null;
};

/** The listed website: the first of the tag's ";"-separated values that is a web address. */
function website(tags: PlaceDto["tags"]): string | null {
  for (const value of (tags.website ?? tags["contact:website"] ?? "").split(
    ";",
  )) {
    try {
      const url = new URL(value.trim());
      if (url.protocol === "http:" || url.protocol === "https:")
        return url.href;
    } catch {
      // Not an address; try the next.
    }
  }
  return null;
}

/** Links for the closer look. Null for a sample place, which is not real. */
export function placeLinks(
  place: PlaceDto,
  cityName: string,
): PlaceLinks | null {
  if (place.origin === "SAMPLE") return null;
  const positioned = place.latitude !== null && place.longitude !== null;
  const query = encodeURIComponent(
    positioned
      ? `${place.name},${place.latitude},${place.longitude}`
      : `${place.name}, ${cityName}`,
  );
  return {
    website: website(place.tags),
    maps: `https://www.google.com/maps/search/?api=1&query=${query}`,
    osm:
      place.origin === "OSM" && place.originRef
        ? `https://www.openstreetmap.org/${place.originRef}`
        : null,
  };
}

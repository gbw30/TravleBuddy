import { findCities } from "@/features/places";
import type { City } from "@/features/places/contracts";
import { placeKey, placeName } from "@/features/trips";

// A ticket end's time zone spans two services: Trips holds the ticket and
// its trip's cities, Places looks a city up.

/**
 * Finds the time zone of a ticket end: a trip city of the same name, else a
 * lookup result when it is unambiguous: the only one, or the only one in a
 * country the trip visits. Otherwise the zone stays unknown, and so does the
 * ticket's length (TB-ITN-24). Each name is looked up at most once.
 */
export function ticketZones(cities: City[]) {
  const zones = new Map(
    cities.map((city) => [city.name.toLowerCase(), city.timeZone]),
  );
  const countries = new Set(cities.map((city) => city.country));
  return async (end: string): Promise<string | null> => {
    const key = placeKey(end);
    if (!zones.has(key)) {
      const found = await findCities(placeName(end));
      const results = found.status === "ok" ? found.cities : [];
      const inTrip = results.filter((city) => countries.has(city.country));
      const only =
        results.length === 1
          ? results[0]
          : inTrip.length === 1
            ? inTrip[0]
            : undefined;
      zones.set(key, only?.timeZone ?? null);
    }
    return zones.get(key) ?? null;
  };
}

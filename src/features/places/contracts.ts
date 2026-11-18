// What the Places service returns. Safe to import in the browser.
import { z } from "zod";

import type { PlaceKind } from "./kinds";

export const citySchema = z.object({
  name: z.string().trim().min(1).max(80),
  region: z.string().trim().max(80).nullable(),
  country: z.string().trim().min(1).max(80),
  // Null only on trips made before city lookup existed.
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  timeZone: z.string().max(64).nullable(),
});
export type City = z.infer<typeof citySchema>;

/** A saved place. A null fact is unknown, never a guess (TB-TRU-05). */
export type PlaceDto = {
  id: string;
  /** SAMPLE and USER places are shown as such (TB-TRU-01). */
  origin: "OSM" | "SAMPLE" | "USER";
  name: string;
  kind: PlaceKind;
  /** The city it was saved for: lower-case "name|country". */
  cityKey: string;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  /** In OpenStreetMap's notation, as the provider wrote it. */
  openingHours: string | null;
  notable: boolean;
};

/** "unavailable" means the lookup could not be reached, not that nothing matched. */
export type CityLookupOutcome =
  | { status: "ok"; cities: City[] }
  | { status: "unavailable" };

/** "Sintra, Lisbon, Portugal" */
export function cityLabel(city: Pick<City, "name" | "region" | "country">) {
  return [city.name, city.region, city.country].filter(Boolean).join(", ");
}

export {
  isMealKind,
  kindLabel,
  PLACE_KINDS,
  visitMinutes,
  type PlaceKind,
} from "./kinds";
export {
  isOpenFor,
  parseOpeningHours,
  type WeeklyHours,
} from "./opening-hours";
export {
  distanceKm,
  TRAVEL_MEANS,
  travelEstimate,
  type TravelEstimate,
  type TravelMeans,
} from "./travel";

/** The key places are saved under for a city. */
export function cityKeyOf(city: Pick<City, "name" | "country">): string {
  return `${city.name}|${city.country}`.toLowerCase();
}

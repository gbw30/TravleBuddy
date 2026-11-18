// What the Places service returns. Safe to import in the browser.
import { z } from "zod";

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

/** "unavailable" means the lookup could not be reached, not that nothing matched. */
export type CityLookupOutcome =
  | { status: "ok"; cities: City[] }
  | { status: "unavailable" };

/** "Sintra, Lisbon, Portugal" */
export function cityLabel(city: Pick<City, "name" | "region" | "country">) {
  return [city.name, city.region, city.country].filter(Boolean).join(", ");
}

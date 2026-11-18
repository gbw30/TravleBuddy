import type { City } from "./contracts";

// Sample cities for tests, QA and offline demos (PLACE_PROVIDER_MODE=mock).
const city = (
  name: string,
  region: string | null,
  country: string,
  latitude: number,
  longitude: number,
  timeZone: string,
): City => ({ name, region, country, latitude, longitude, timeZone });

const cities: City[] = [
  city("Tokyo", null, "Japan", 35.6769, 139.7639, "Asia/Tokyo"),
  city("Kyoto", "Kyoto Prefecture", "Japan", 35.0116, 135.7681, "Asia/Tokyo"),
  city("Osaka", "Osaka Prefecture", "Japan", 34.6937, 135.5023, "Asia/Tokyo"),
  city("Lisbon", null, "Portugal", 38.7078, -9.1366, "Europe/Lisbon"),
  city("Sintra", "Lisbon", "Portugal", 38.8355, -9.3522, "Europe/Lisbon"),
  city("Paris", "Ile-de-France", "France", 48.8589, 2.32, "Europe/Paris"),
  city("Paris", "Texas", "United States", 33.6609, -95.5555, "America/Chicago"),
  city(
    "London",
    "England",
    "United Kingdom",
    51.5074,
    -0.1278,
    "Europe/London",
  ),
  city("Rome", "Lazio", "Italy", 41.8933, 12.4829, "Europe/Rome"),
  city(
    "New York",
    "New York",
    "United States",
    40.7127,
    -74.006,
    "America/New_York",
  ),
  city("Mexico City", null, "Mexico", 19.4326, -99.1332, "America/Mexico_City"),
  city(
    "Honolulu",
    "Hawaii",
    "United States",
    21.3045,
    -157.8557,
    "Pacific/Honolulu",
  ),
];

export function searchMockCities(query: string): City[] {
  return cities.filter((entry) => entry.name.toLowerCase().includes(query));
}

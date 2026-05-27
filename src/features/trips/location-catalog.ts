export type TripLocationOption = {
  city: string;
  country: string;
  timeZone: string;
};

export const tripLocationCatalog = [
  { city: "Amsterdam", country: "Netherlands", timeZone: "Europe/Amsterdam" },
  { city: "Bangkok", country: "Thailand", timeZone: "Asia/Bangkok" },
  { city: "Barcelona", country: "Spain", timeZone: "Europe/Madrid" },
  { city: "Berlin", country: "Germany", timeZone: "Europe/Berlin" },
  { city: "Bogota", country: "Colombia", timeZone: "America/Bogota" },
  { city: "Buenos Aires", country: "Argentina", timeZone: "America/Argentina/Buenos_Aires" },
  { city: "Lisbon", country: "Portugal", timeZone: "Europe/Lisbon" },
  { city: "London", country: "United Kingdom", timeZone: "Europe/London" },
  { city: "Los Angeles", country: "United States", timeZone: "America/Los_Angeles" },
  { city: "Madrid", country: "Spain", timeZone: "Europe/Madrid" },
  { city: "Mexico City", country: "Mexico", timeZone: "America/Mexico_City" },
  { city: "Miami", country: "United States", timeZone: "America/New_York" },
  { city: "New York", country: "United States", timeZone: "America/New_York" },
  { city: "Paris", country: "France", timeZone: "Europe/Paris" },
  { city: "Prague", country: "Czechia", timeZone: "Europe/Prague" },
  { city: "Rome", country: "Italy", timeZone: "Europe/Rome" },
  { city: "Seoul", country: "South Korea", timeZone: "Asia/Seoul" },
  { city: "Sydney", country: "Australia", timeZone: "Australia/Sydney" },
  { city: "Tokyo", country: "Japan", timeZone: "Asia/Tokyo" },
  { city: "Vienna", country: "Austria", timeZone: "Europe/Vienna" },
] as const satisfies readonly TripLocationOption[];

export const tripLocationCountries = Array.from(
  new Set(tripLocationCatalog.map((location) => location.country)),
).sort((a, b) => a.localeCompare(b));

export function getTripLocationsForCountry(country: string) {
  return tripLocationCatalog
    .filter((location) => location.country === country)
    .sort((a, b) => a.city.localeCompare(b.city));
}

export function getTripLocation(city: string, country: string) {
  return (
    tripLocationCatalog.find(
      (location) => location.city === city && location.country === country,
    ) ?? null
  );
}

export function isKnownTripLocation(city: string, country: string) {
  return Boolean(getTripLocation(city, country));
}

export function getTripLocationTimeZone(city: string, country: string) {
  return getTripLocation(city, country)?.timeZone ?? null;
}

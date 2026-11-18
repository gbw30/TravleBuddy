import { z } from "zod";

import { db } from "@/lib/db";
import { resolvePlaceProviderMode } from "@/lib/providers/places/server";

import { citySchema, type City, type CityLookupOutcome } from "./contracts";
import { searchMockCities } from "./mock-cities";
import { searchNominatim } from "./nominatim";

const savedCities = z.array(citySchema);

/** The form a search is saved and compared under. */
function normalise(query: string) {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

async function readSaved(query: string): Promise<City[] | null> {
  const saved = await db.cityLookup.findUnique({ where: { query } });
  const parsed = savedCities.safeParse(saved?.results);
  return parsed.success ? parsed.data : null;
}

/**
 * Cities matching what the traveller typed. Any city the provider knows can be
 * a destination (TB-FAC-05). Each search is saved, so the provider is asked
 * once per distinct text.
 */
export async function findCities(text: string): Promise<CityLookupOutcome> {
  const query = normalise(text);
  if (query.length < 2 || query.length > 80)
    return { status: "ok", cities: [] };

  // Sample data is never saved, so it cannot be mistaken for real results.
  if (resolvePlaceProviderMode(process.env) === "mock") {
    return { status: "ok", cities: searchMockCities(query) };
  }

  try {
    const saved = await readSaved(query);
    if (saved) return { status: "ok", cities: saved };

    const cities = await searchNominatim(query);
    await db.cityLookup.upsert({
      where: { query },
      create: { query, results: cities },
      update: { results: cities },
    });
    return { status: "ok", cities };
  } catch {
    return { status: "unavailable" };
  }
}

import { z } from "zod";

import { db } from "@/lib/db";

import type { FoundAddress } from "./contracts";
import { searchAddresses } from "./nominatim";
import { withinCap } from "./place-store";
import type { Point } from "./place-source";
import { usesSamplePlaces } from "./provider-mode";

export type AddressLookupOutcome =
  | { status: "ok"; addresses: FoundAddress[] }
  | { status: "unavailable" | "capped" };

const savedAddresses = z.array(
  z.object({
    label: z.string(),
    latitude: z.number(),
    longitude: z.number(),
    ref: z.string(),
  }),
);

/** The search is bounded to a tenth of a degree around the city, which is also part of its saved key. */
const REACH = 0.3;
const tenth = (value: number) => Math.round(value * 10) / 10;

/**
 * Addresses matching what the traveller typed, near their city. Each search is
 * saved under the search and its square, with no user, so the provider is
 * asked once per distinct search (ADR-009). Called on submit only.
 */
export async function findAddresses(
  text: string,
  near: Point,
): Promise<AddressLookupOutcome> {
  const query = text.trim().replace(/\s+/g, " ");
  if (query.length < 3 || query.length > 120) {
    return { status: "ok", addresses: [] };
  }

  // Sample data is never saved, so it cannot be mistaken for a real address.
  if (usesSamplePlaces()) {
    return {
      status: "ok",
      addresses: [
        {
          label: "Sample address, city centre",
          latitude: near.latitude,
          longitude: near.longitude,
          ref: "sample/centre",
        },
      ],
    };
  }

  const centre = {
    latitude: tenth(near.latitude),
    longitude: tenth(near.longitude),
  };
  const key = `${query.toLowerCase()}|${centre.latitude.toFixed(1)},${centre.longitude.toFixed(1)}`;
  try {
    const saved = savedAddresses.safeParse(
      (await db.addressLookup.findUnique({ where: { key } }))?.results,
    );
    if (saved.success) return { status: "ok", addresses: saved.data };

    if (!(await withinCap("OSM"))) return { status: "capped" };
    const addresses = await searchAddresses(query, {
      west: tenth(centre.longitude - REACH),
      north: tenth(centre.latitude + REACH),
      east: tenth(centre.longitude + REACH),
      south: tenth(centre.latitude - REACH),
    });
    await db.addressLookup.upsert({
      where: { key },
      create: { key, results: addresses },
      update: { results: addresses },
    });
    return { status: "ok", addresses };
  } catch {
    return { status: "unavailable" };
  }
}

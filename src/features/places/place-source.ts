import type { City } from "./contracts";
import type { PlaceKind } from "./kinds";
import { osmSource } from "./osm-source";
import { sampleSource } from "./sample-source";
import { usesSamplePlaces } from "./provider-mode";

export type Point = { latitude: number; longitude: number };

/** A place as a provider reports it, before it is saved. */
export type FoundPlace = {
  /** The provider's own reference, unique within the provider. */
  originRef: string;
  name: string;
  kind: PlaceKind;
  latitude: number;
  longitude: number;
  address: string | null;
  /** As the provider wrote it; null when it gave none. */
  openingHours: string | null;
  notable: boolean;
  /** Dietary rules the listing says it serves, and those it says it does not. */
  serves: string[];
  servesNot: string[];
};

/**
 * The common adapter every place provider sits behind (TB-SYS-09). Each
 * method is one provider request and throws when the provider cannot answer.
 */
export interface PlaceSource {
  readonly origin: "OSM" | "SAMPLE";
  /** Counts toward the daily request cap. */
  readonly metered: boolean;
  /** Things to see and do across a city. */
  sights(city: City & Point): Promise<FoundPlace[]>;
  /** Places to eat within walking distance of a point. */
  foodNear(city: City & Point, point: Point): Promise<FoundPlace[]>;
  /** Places in or near the city whose name matches what the traveller typed. */
  byName(city: City & Point, text: string): Promise<FoundPlace[]>;
}

/**
 * The provider chosen by configuration: sample data in mock mode, otherwise
 * OpenStreetMap. Google stays behind the older text-search adapter in
 * src/lib/providers/places until its terms allow saved plans (ADR-009).
 */
export function activeSource(): PlaceSource {
  return usesSamplePlaces() ? sampleSource : osmSource;
}

export { cityKeyOf as cityKey } from "./contracts";

/** The scope name for the food near a point: one square of about a kilometre. */
export function foodScope(point: Point): { scope: string; centre: Point } {
  const round = (value: number) => Math.round(value * 100) / 100;
  const centre = {
    latitude: round(point.latitude),
    longitude: round(point.longitude),
  };
  return {
    scope: `food@${centre.latitude.toFixed(2)},${centre.longitude.toFixed(2)}`,
    centre,
  };
}

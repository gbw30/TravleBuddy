import { searchPlacesByName } from "./nominatim";
import {
  foodQuery,
  foodReach,
  runOverpass,
  sightsQuery,
  sightsReach,
} from "./overpass";
import type { PlaceSource } from "./place-source";

/** OpenStreetMap: the first version's place provider (ADR-009). */
export const osmSource: PlaceSource = {
  origin: "OSM",
  metered: true,
  sights: (city) => runOverpass(sightsQuery(city), sightsReach(city)),
  foodNear: (_city, point) => runOverpass(foodQuery(point), foodReach(point)),
  byName: (city, text) => searchPlacesByName(text, city),
};

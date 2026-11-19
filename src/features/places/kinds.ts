// The kinds of place the product plans with, and what each implies. Pure:
// safe to import in the browser.

export const PLACE_KINDS = [
  "sight",
  "museum",
  "temple",
  "park",
  "viewpoint",
  "market",
  "restaurant",
  "cafe",
  "bakery",
  "bar",
  "activity",
] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

const labels: Record<PlaceKind, string> = {
  sight: "Sight",
  museum: "Museum",
  temple: "Shrine or temple",
  park: "Park or garden",
  viewpoint: "Viewpoint",
  market: "Market",
  restaurant: "Restaurant",
  cafe: "Cafe",
  bakery: "Bakery",
  bar: "Bar",
  activity: "Activity",
};

/** The word shown on a card for a kind of place. */
export function kindLabel(kind: PlaceKind): string {
  return labels[kind];
}

// No provider says how long a visit takes, so each kind has a standard length
// (PRD 9.7). It is shown as an estimate and the traveller can change it.
const standardVisit: Record<PlaceKind, number> = {
  sight: 60,
  museum: 120,
  temple: 45,
  park: 60,
  viewpoint: 30,
  market: 60,
  restaurant: 75,
  cafe: 45,
  bakery: 45,
  bar: 60,
  activity: 150,
};

/** The standard visit length for a kind of place, in minutes. An estimate. */
export function visitMinutes(kind: PlaceKind): number {
  return standardVisit[kind];
}

/** Somewhere to eat a meal, as opposed to something to see or do. */
export function isMealKind(kind: PlaceKind): boolean {
  return kind === "restaurant" || kind === "cafe" || kind === "bakery";
}

type Tags = Record<string, string | undefined>;

/**
 * The kind of place an OpenStreetMap object is, or null when it is not one the
 * product plans with. The first rule that fits wins, most specific first.
 */
export function kindFromOsmTags(tags: Tags): PlaceKind | null {
  const { amenity, tourism, leisure, historic, shop } = tags;

  if (tourism === "museum" || tourism === "gallery") return "museum";
  if (amenity === "place_of_worship") return "temple";
  if (tourism === "viewpoint") return "viewpoint";
  if (amenity === "marketplace") return "market";
  if (amenity === "restaurant") return "restaurant";
  if (amenity === "cafe") return "cafe";
  if (shop === "bakery") return "bakery";
  if (amenity === "bar" || amenity === "pub") return "bar";
  if (
    tourism === "theme_park" ||
    tourism === "zoo" ||
    tourism === "aquarium" ||
    leisure === "water_park" ||
    amenity === "theatre"
  ) {
    return "activity";
  }
  if (leisure === "park" || leisure === "garden") return "park";
  if (tourism === "attraction" || historic) return "sight";
  return null;
}

/** The dietary rules a place's listing can speak to. */
export const DIETS = [
  "vegetarian",
  "vegan",
  "halal",
  "kosher",
  "gluten-free",
] as const;

/**
 * What a listing says about dietary rules, from OpenStreetMap's `diet:*`
 * tags: "yes" and "only" mean it serves the diet, "no" that it does not.
 * Anything else, or no tag, is unknown and appears in neither list. A place
 * that serves vegan food serves vegetarian food.
 */
export function dietsFromOsmTags(tags: Record<string, string | undefined>): {
  serves: string[];
  servesNot: string[];
} {
  const says = (diet: string) => tags[`diet:${diet.replace("-", "_")}`];
  const serves = DIETS.filter((diet) =>
    ["yes", "only"].includes(says(diet) ?? ""),
  ) as string[];
  if (serves.includes("vegan") && !serves.includes("vegetarian")) {
    serves.unshift("vegetarian");
  }
  return {
    serves,
    servesNot: DIETS.filter(
      (diet) => says(diet) === "no" && !serves.includes(diet),
    ),
  };
}

/** The OpenStreetMap tags kept as a place's provenance; every `diet:*` is kept too. */
export const KEPT_TAGS = [
  "name",
  "name:en",
  "opening_hours",
  "check_date",
  "check_date:opening_hours",
  "website",
  "contact:website",
  "cuisine",
  "wikidata",
  "wikipedia",
  "amenity",
  "tourism",
  "leisure",
  "historic",
  "shop",
] as const;

/** The tags worth keeping, as they arrived. */
export function keptTags(tags: Tags): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tags).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" &&
        ((KEPT_TAGS as readonly string[]).includes(entry[0]) ||
          entry[0].startsWith("diet:")),
    ),
  );
}

import { isMealKind, type PlaceKind } from "./kinds";
import type { FoundPlace, PlaceSource, Point } from "./place-source";

// Sample places for tests, QA and offline demos (PLACE_PROVIDER_MODE=mock).
// They are saved with origin SAMPLE and shown as sample data. Positions and
// hours are illustrative, not provider data.

const tokyo: [string, PlaceKind, number, number, string | null][] = [
  ["Senso-ji", "temple", 35.7148, 139.7967, "Mo-Su 06:00-17:00"],
  [
    "Tokyo National Museum",
    "museum",
    35.7188,
    139.7765,
    "Tu-Su 09:30-17:00; Mo off",
  ],
  ["Ueno Park", "park", 35.7156, 139.7745, "Mo-Su 05:00-23:00"],
  ["Nezu Shrine", "temple", 35.7202, 139.7607, null],
  ["Yanaka Ginza", "market", 35.7276, 139.765, null],
  ["Tokyo Skytree", "viewpoint", 35.7101, 139.8107, "Mo-Su 10:00-21:00"],
  [
    "Imperial Palace East Gardens",
    "park",
    35.6852,
    139.7528,
    "Tu-Th,Sa,Su 09:00-16:30",
  ],
  [
    "Tsukiji Outer Market",
    "market",
    35.6655,
    139.7707,
    "Mo-Sa 05:00-14:00; Su off",
  ],
  ["teamLab Planets", "activity", 35.6491, 139.7898, "Mo-Su 09:00-22:00"],
  ["Meiji Jingu", "temple", 35.6764, 139.6993, null],
  ["Shinjuku Gyoen", "park", 35.6852, 139.7101, "Tu-Su 09:00-16:30; Mo off"],
  ["Shibuya Sky", "viewpoint", 35.6585, 139.7022, "Mo-Su 10:00-22:30"],
  ["Nezu Museum", "museum", 35.6622, 139.7171, "Tu-Su 10:00-17:00; Mo off"],
  [
    "Mori Art Museum",
    "museum",
    35.6604,
    139.7292,
    "Mo,We-Su 10:00-22:00; Tu 10:00-17:00",
  ],
];

// For any other city: one of each kind, set out around the centre.
const anywhere: [string, PlaceKind, number, number, string | null][] = [
  ["Old Town", "sight", 0.004, 0.003, null],
  ["City Museum", "museum", -0.006, 0.008, "Tu-Su 10:00-18:00; Mo off"],
  ["Cathedral", "temple", 0.002, -0.005, "Mo-Su 08:00-19:00"],
  ["Botanical Garden", "park", 0.015, -0.012, "Mo-Su 09:00-18:00"],
  ["Lookout", "viewpoint", -0.011, -0.009, null],
  ["Central Market", "market", 0.001, 0.009, "Mo-Sa 07:00-15:00; Su off"],
  ["Art Gallery", "museum", 0.009, 0.014, "We-Mo 11:00-19:00; Tu off"],
  ["Riverside Park", "park", -0.014, 0.004, null],
  ["Castle", "sight", 0.018, 0.006, "Mo-Su 09:30-17:30"],
];

const food: [string, PlaceKind, number, number, string | null][] = [
  ["Corner Noodles", "restaurant", 0.002, 0.001, "Mo-Su 11:00-22:00"],
  ["Lantern Grill", "restaurant", -0.003, 0.002, "Tu-Su 17:00-23:00; Mo off"],
  ["Market Kitchen", "restaurant", 0.001, -0.004, "Mo-Su 11:30-21:30"],
  ["Morning Cafe", "cafe", -0.001, -0.002, "Mo-Su 07:30-18:00"],
  ["Corner Bakery", "bakery", 0.003, -0.001, "Mo-Su 07:00-17:00"],
  ["Sunrise Cafe", "cafe", -0.002, 0.003, "Mo-Su 07:00-16:00"],
  ["Riverside Cafe", "cafe", 0.001, 0.004, "Mo-Su 07:30-17:00"],
  ["Garden Table", "restaurant", 0.004, 0.003, null],
  [
    "Harbour Canteen",
    "restaurant",
    -0.004,
    -0.003,
    "Mo-Sa 12:00-15:00,18:00-22:00; Su off",
  ],
];

// What the sample food places' listings say about dietary rules. The ones
// not named here say nothing, like most real listings.
const diets: Record<string, Pick<FoundPlace, "serves" | "servesNot">> = {
  "Corner Noodles": { serves: ["vegetarian"], servesNot: [] },
  "Lantern Grill": { serves: [], servesNot: ["vegetarian", "vegan"] },
  "Market Kitchen": {
    serves: ["vegetarian", "vegan", "gluten-free"],
    servesNot: [],
  },
  "Harbour Canteen": { serves: [], servesNot: ["vegan"] },
};

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-");

const place = (
  originRef: string,
  [name, kind, latitude, longitude, openingHours]: (typeof tokyo)[number],
  label = name,
): FoundPlace => ({
  originRef,
  name: label,
  kind,
  latitude,
  longitude,
  address: null,
  openingHours,
  notable: !isMealKind(kind),
  ...(diets[name] ?? { serves: [], servesNot: [] }),
  tags: null,
  lastEditedAt: null,
});

const offset = (
  centre: Point,
  entry: (typeof anywhere)[number],
): (typeof anywhere)[number] => [
  entry[0],
  entry[1],
  Number((centre.latitude + entry[2]).toFixed(5)),
  Number((centre.longitude + entry[3]).toFixed(5)),
  entry[4],
];

function sights(city: { name: string } & Point): FoundPlace[] {
  if (city.name === "Tokyo") {
    return tokyo.map((entry) => place(`tokyo/${slug(entry[0])}`, entry));
  }
  return anywhere.map((entry) =>
    place(
      `${slug(city.name)}/${slug(entry[0])}`,
      offset(city, entry),
      `${city.name} ${entry[0]}`,
    ),
  );
}

function foodNear(point: Point): FoundPlace[] {
  const square = `${point.latitude.toFixed(2)},${point.longitude.toFixed(2)}`;
  return food.map((entry) =>
    place(`food/${square}/${slug(entry[0])}`, offset(point, entry)),
  );
}

/** Sample data behind the same adapter as the real provider. */
export const sampleSource: PlaceSource = {
  origin: "SAMPLE",
  metered: false,
  // Sample places never change, so none is ever gone: no reach.
  sights: async (city) => ({ places: sights(city), reach: null }),
  foodNear: async (_city, point) => ({ places: foodNear(point), reach: null }),
  byName: async (city, text) =>
    sights(city).filter((entry) =>
      entry.name.toLowerCase().includes(text.trim().toLowerCase()),
    ),
};

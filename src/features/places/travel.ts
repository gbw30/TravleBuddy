// Travel time between two points, estimated from the straight-line distance.
// No routing service is used in the first version (ADR-009), so every result
// is an estimate and must be shown as one. Pure: safe to import in the browser.

export const TRAVEL_MEANS = ["walk", "transit", "drive"] as const;
export type TravelMeans = (typeof TRAVEL_MEANS)[number];

type Point = { latitude: number; longitude: number };

/** Streets are not straight: a route is about this much longer than the line. */
const DETOUR = 1.3;
/** Speed in km/h, and minutes spent before moving (waiting, parking). */
const pace: Record<TravelMeans, { speed: number; overhead: number }> = {
  walk: { speed: 4.8, overhead: 0 },
  transit: { speed: 18, overhead: 8 },
  drive: { speed: 25, overhead: 5 },
};
/** Up to this straight-line distance, walking is assumed. */
const WALKABLE_KM = 1.5;

const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** Straight-line distance in kilometres. */
export function distanceKm(from: Point, to: Point): number {
  const dLat = radians(to.latitude - from.latitude);
  const dLon = radians(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(from.latitude)) *
      Math.cos(radians(to.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

/** The walk of a short hop, shown as an option beside the traveller's own means. */
export type WalkOption = { metres: number; minutes: number };

export type TravelEstimate = {
  means: TravelMeans;
  minutes: number;
  /** Set when the hop is within walking distance and the means is not walking. */
  walk: WalkOption | null;
  /** A Google Maps directions link. Nothing is fetched from Google. */
  directions: string;
  /** Always true: there is no routing data behind this number. */
  estimated: true;
};

const GOOGLE_MODE: Record<TravelMeans, string> = {
  walk: "walking",
  transit: "transit",
  drive: "driving",
};

/** Directions between two points: a fixed host and an encoded query, no key. */
export function directionsUrl(
  from: Point,
  to: Point,
  means: TravelMeans,
): string {
  const point = (p: Point) =>
    encodeURIComponent(`${p.latitude},${p.longitude}`);
  return `https://www.google.com/maps/dir/?api=1&origin=${point(from)}&destination=${point(to)}&travelmode=${GOOGLE_MODE[means]}`;
}

/**
 * The estimated time to get from one point to another. Without a preferred
 * means, a short hop is walked and anything longer goes by transit.
 */
export function travelEstimate(
  from: Point,
  to: Point,
  preferred?: TravelMeans,
): TravelEstimate {
  const line = distanceKm(from, to);
  const means = preferred ?? (line <= WALKABLE_KM ? "walk" : "transit");
  const { speed, overhead } = pace[means];
  const moving = ((line * DETOUR) / speed) * 60;
  const onFoot = (line * DETOUR * 60) / pace.walk.speed;
  return {
    means,
    minutes: Math.max(1, Math.round(moving + overhead)),
    walk:
      means !== "walk" && line <= WALKABLE_KM
        ? {
            metres: Math.round((line * DETOUR * 1000) / 10) * 10,
            minutes: Math.max(1, Math.round(onFoot)),
          }
        : null,
    directions: directionsUrl(from, to, means),
    estimated: true,
  };
}

/** What a screen shows of a travel estimate: both ways when the hop is short, and a link. */
export type Leg = {
  means: TravelMeans;
  minutes: number;
  walk?: WalkOption;
  directions?: string;
};

export const legOf = (e: TravelEstimate): Leg => ({
  means: e.means,
  minutes: e.minutes,
  ...(e.walk && { walk: e.walk }),
  directions: e.directions,
});

/** "650 m, about 9 min": a walk as a line says it. */
export const walkWords = (walk: WalkOption) =>
  `${walk.metres < 1000 ? `${walk.metres} m` : `${Math.round(walk.metres / 100) / 10} km`}, about ${walk.minutes} min`;

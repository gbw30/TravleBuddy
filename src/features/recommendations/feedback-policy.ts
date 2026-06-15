import type { FeedbackReason } from "@/generated/prisma/client";
import type {
  MockPlace,
  PlanningTopic,
  RecommendationFeedbackSignal,
  SelectedPlanningPlace,
} from "./types";

export const recommendationRejectReasons = [
  "NOT_INTERESTED",
  "TOO_EXPENSIVE",
  "TOO_FAR",
  "WRONG_VIBE",
  "ALREADY_BEEN_THERE",
  "OTHER",
] as const satisfies readonly FeedbackReason[];

const MAX_FEEDBACK_PENALTY = -40;

function overlaps(left: readonly string[], right: readonly string[]) {
  const rightValues = new Set(right.map((value) => value.toLocaleLowerCase()));

  return left.some((value) => rightValues.has(value.toLocaleLowerCase()));
}

function radians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceKm(
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number },
) {
  const radiusKm = 6371;
  const latitudeDistance = radians(right.latitude - left.latitude);
  const longitudeDistance = radians(right.longitude - left.longitude);
  const startLatitude = radians(left.latitude);
  const endLatitude = radians(right.latitude);
  const haversine =
    Math.sin(latitudeDistance / 2) ** 2 +
    Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      Math.sin(longitudeDistance / 2) ** 2;

  return radiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function farFromSelectedPlace(
  place: MockPlace,
  selectedPlaces: readonly SelectedPlanningPlace[],
) {
  const selectedWithCoordinates = selectedPlaces.filter(
    (
      item,
    ): item is SelectedPlanningPlace & {
      latitude: number;
      longitude: number;
    } => item.latitude !== null && item.longitude !== null,
  );

  if (selectedWithCoordinates.length === 0) {
    return place.transportationModes.includes("RIDE_SHARE");
  }

  const closestDistance = Math.min(
    ...selectedWithCoordinates.map((selectedPlace) =>
      distanceKm(
        {
          latitude: place.latitude,
          longitude: place.longitude,
        },
        {
          latitude: selectedPlace.latitude,
          longitude: selectedPlace.longitude,
        },
      ),
    ),
  );

  return closestDistance > 0.35;
}

function similarCost(place: MockPlace, signal: RecommendationFeedbackSignal) {
  if (signal.estimatedCostAmount !== null) {
    return place.estimatedCostAmount >= signal.estimatedCostAmount;
  }

  if (signal.priceLevel !== null) {
    return place.priceLevel >= signal.priceLevel;
  }

  return place.priceLevel >= 4;
}

export function rejectedProviderPlaceIds(
  rejectedFeedback: readonly RecommendationFeedbackSignal[],
) {
  return new Set(
    rejectedFeedback
      .map((signal) => signal.providerPlaceId)
      .filter((value): value is string => Boolean(value)),
  );
}

export function feedbackPenaltyForPlace(
  place: MockPlace,
  input: {
    topic: PlanningTopic;
    selectedPlaces: readonly SelectedPlanningPlace[];
    rejectedFeedback: readonly RecommendationFeedbackSignal[];
  },
) {
  let penalty = 0;
  const reasons = new Set<string>();

  for (const signal of input.rejectedFeedback) {
    if (signal.providerPlaceId === place.id) {
      continue;
    }

    if (signal.reason === "TOO_EXPENSIVE" && similarCost(place, signal)) {
      penalty -= 18;
      reasons.add("similar cost to a rejected expensive option");
    }

    if (signal.reason === "TOO_FAR" && farFromSelectedPlace(place, input.selectedPlaces)) {
      penalty -= 14;
      reasons.add("similar distance to a rejected far option");
    }

    if (
      signal.reason === "WRONG_VIBE" &&
      (signal.category === place.category ||
        overlaps(signal.tags, [...place.tags, ...place.customMatches]))
    ) {
      penalty -= 16;
      reasons.add("similar vibe to a rejected option");
    }

    if (
      signal.reason === "NOT_INTERESTED" &&
      signal.topic === input.topic &&
      signal.category === place.category
    ) {
      penalty -= 12;
      reasons.add("same category as a rejected option");
    }
  }

  return {
    penalty: Math.max(MAX_FEEDBACK_PENALTY, penalty),
    reasons: Array.from(reasons),
  };
}

import type { AdaptationChangeKind, AdaptationImpactLevel } from "./schemas";

export type AdaptationScope = "ITEM" | "DAY_SET" | "TRIP";

export type AdaptationOperation =
  | "RERANK_LOCAL_CANDIDATES"
  | "REPLACE_ITEM"
  | "REVALIDATE_SCHEDULE_SEGMENT"
  | "REBUILD_AFFECTED_DAYS"
  | "RECALCULATE_TRAVEL_TIME"
  | "ADJUST_ACTIVITY_DENSITY"
  | "CREATE_TRIP_VERSION"
  | "REFRESH_CANDIDATES"
  | "REEVALUATE_LODGING_AND_ACTIVITIES"
  | "REBUILD_ITINERARY";

export type AdaptationImpact = {
  level: AdaptationImpactLevel;
  scope: AdaptationScope;
  operations: readonly AdaptationOperation[];
};

function frozenImpact(
  level: AdaptationImpactLevel,
  scope: AdaptationScope,
  operations: readonly AdaptationOperation[],
): AdaptationImpact {
  return Object.freeze({
    level,
    scope,
    operations: Object.freeze([...operations]),
  });
}

const LOW_IMPACT = frozenImpact("LOW", "ITEM", [
  "RERANK_LOCAL_CANDIDATES",
  "REPLACE_ITEM",
  "REVALIDATE_SCHEDULE_SEGMENT",
]);

const MEDIUM_IMPACT = frozenImpact("MEDIUM", "DAY_SET", [
  "REBUILD_AFFECTED_DAYS",
  "RECALCULATE_TRAVEL_TIME",
  "ADJUST_ACTIVITY_DENSITY",
]);

const HIGH_IMPACT = frozenImpact("HIGH", "TRIP", [
  "CREATE_TRIP_VERSION",
  "REFRESH_CANDIDATES",
  "REEVALUATE_LODGING_AND_ACTIVITIES",
  "REBUILD_ITINERARY",
]);

const impactByChange: Readonly<Record<AdaptationChangeKind, AdaptationImpact>> =
  {
    REJECT_ITINERARY_ITEM: LOW_IMPACT,
    SAVE_RESTAURANT: LOW_IMPACT,
    SWAP_ITINERARY_ITEM: LOW_IMPACT,
    MARK_DAY_TOO_BUSY: MEDIUM_IMPACT,
    CHANGE_DAILY_START_TIME: MEDIUM_IMPACT,
    REJECT_SIMILAR_ITEMS: MEDIUM_IMPACT,
    CHANGE_TRANSPORTATION: MEDIUM_IMPACT,
    CHANGE_DESTINATION: HIGH_IMPACT,
    CHANGE_TRIP_DATES: HIGH_IMPACT,
    CHANGE_BUDGET_SUBSTANTIALLY: HIGH_IMPACT,
    CHANGE_TRAVELERS: HIGH_IMPACT,
    CHANGE_HOTEL_AREA: HIGH_IMPACT,
  };

export function classifyAdaptationImpact(
  change: AdaptationChangeKind,
): AdaptationImpact {
  return impactByChange[change];
}

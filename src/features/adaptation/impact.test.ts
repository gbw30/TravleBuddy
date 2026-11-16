import { describe, expect, it } from "vitest";
import { classifyAdaptationImpact } from "./impact";
import type { AdaptationChangeKind } from "./schemas";

describe("adaptation impact classification", () => {
  it.each([
    "REJECT_ITINERARY_ITEM",
    "SAVE_RESTAURANT",
    "SWAP_ITINERARY_ITEM",
  ] satisfies AdaptationChangeKind[])(
    "classifies %s as low impact",
    (change) => {
      expect(classifyAdaptationImpact(change)).toEqual({
        level: "LOW",
        scope: "ITEM",
        operations: [
          "RERANK_LOCAL_CANDIDATES",
          "REPLACE_ITEM",
          "REVALIDATE_SCHEDULE_SEGMENT",
        ],
      });
    },
  );

  it.each([
    "MARK_DAY_TOO_BUSY",
    "CHANGE_DAILY_START_TIME",
    "REJECT_SIMILAR_ITEMS",
    "CHANGE_TRANSPORTATION",
  ] satisfies AdaptationChangeKind[])(
    "classifies %s as medium impact",
    (change) => {
      expect(classifyAdaptationImpact(change)).toEqual({
        level: "MEDIUM",
        scope: "DAY_SET",
        operations: [
          "REBUILD_AFFECTED_DAYS",
          "RECALCULATE_TRAVEL_TIME",
          "ADJUST_ACTIVITY_DENSITY",
        ],
      });
    },
  );

  it.each([
    "CHANGE_DESTINATION",
    "CHANGE_TRIP_DATES",
    "CHANGE_BUDGET_SUBSTANTIALLY",
    "CHANGE_TRAVELERS",
    "CHANGE_HOTEL_AREA",
  ] satisfies AdaptationChangeKind[])(
    "classifies %s as high impact",
    (change) => {
      expect(classifyAdaptationImpact(change)).toEqual({
        level: "HIGH",
        scope: "TRIP",
        operations: [
          "CREATE_TRIP_VERSION",
          "REFRESH_CANDIDATES",
          "REEVALUATE_LODGING_AND_ACTIVITIES",
          "REBUILD_ITINERARY",
        ],
      });
    },
  );

  it("returns immutable operation definitions", () => {
    const result = classifyAdaptationImpact("REJECT_ITINERARY_ITEM");

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.operations)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { validatePlanningFeedbackTarget } from "./planning-feedback";

describe("planning feedback targets", () => {
  it("allows trip-level planning feedback without a child target", () => {
    expect(
      validatePlanningFeedbackTarget({
        tripId: "trip_1",
        targetType: "TRIP",
      }),
    ).toEqual({
      isValid: true,
      targetField: null,
      targetId: "trip_1",
      data: {
        tripId: "trip_1",
        targetType: "TRIP",
        targetId: "trip_1",
      },
    });
  });

  it("requires suggestion feedback to target a place suggestion", () => {
    expect(
      validatePlanningFeedbackTarget({
        tripId: "trip_1",
        targetType: "PLACE_SUGGESTION",
      }),
    ).toEqual({
      isValid: false,
      error: "PLACE_SUGGESTION feedback requires placeSuggestionId.",
    });
  });

  it("allows feedback for a suggestion", () => {
    expect(
      validatePlanningFeedbackTarget({
        tripId: "trip_1",
        targetType: "PLACE_SUGGESTION",
        placeSuggestionId: "suggestion_1",
      }),
    ).toEqual({
      isValid: true,
      targetField: "placeSuggestionId",
      targetId: "suggestion_1",
      data: {
        tripId: "trip_1",
        targetType: "PLACE_SUGGESTION",
        placeSuggestionId: "suggestion_1",
        targetId: "suggestion_1",
      },
    });
  });

  it("allows feedback for an itinerary item", () => {
    expect(
      validatePlanningFeedbackTarget({
        tripId: "trip_1",
        targetType: "ITINERARY_ITEM",
        itineraryItemId: "item_1",
      }),
    ).toEqual({
      isValid: true,
      targetField: "itineraryItemId",
      targetId: "item_1",
      data: {
        tripId: "trip_1",
        targetType: "ITINERARY_ITEM",
        itineraryItemId: "item_1",
        targetId: "item_1",
      },
    });
  });

  it("rejects feedback targeting multiple child planning objects", () => {
    expect(
      validatePlanningFeedbackTarget({
        tripId: "trip_1",
        targetType: "PLACE_SUGGESTION",
        placeSuggestionId: "suggestion_1",
        itineraryItemId: "item_1",
      }),
    ).toEqual({
      isValid: false,
      error: "Feedback can target only one child planning object.",
    });
  });

  it("rejects child targets on trip-level planning feedback", () => {
    expect(
      validatePlanningFeedbackTarget({
        tripId: "trip_1",
        targetType: "TRIP",
        conflictId: "conflict_1",
      }),
    ).toEqual({
      isValid: false,
      error: "Trip-level feedback must not include a child target.",
    });
  });

  it("rejects feedback without a trip id", () => {
    expect(
      validatePlanningFeedbackTarget({
        tripId: "",
        targetType: "TRIP",
      }),
    ).toEqual({
      isValid: false,
      error: "Planning feedback requires a tripId.",
    });
  });

  it("rejects a generic target id that does not match the typed child target", () => {
    expect(
      validatePlanningFeedbackTarget({
        tripId: "trip_1",
        targetType: "PLACE_SUGGESTION",
        targetId: "wrong_target",
        placeSuggestionId: "suggestion_1",
      }),
    ).toEqual({
      isValid: false,
      error: "Feedback targetId must match the typed child target.",
    });
  });

  it("rejects a trip-level target id that does not match the trip id", () => {
    expect(
      validatePlanningFeedbackTarget({
        tripId: "trip_1",
        targetType: "TRIP",
        targetId: "wrong_trip",
      }),
    ).toEqual({
      isValid: false,
      error: "Trip-level feedback targetId must match tripId.",
    });
  });
});

export type FeedbackTargetType =
  | "TRIP"
  | "PREFERENCE"
  | "PLACE_SUGGESTION"
  | "ITINERARY_DAY"
  | "ITINERARY_ITEM"
  | "CONFLICT";

export type PlanningFeedbackTargetInput = {
  tripId: string;
  targetType: FeedbackTargetType;
  targetId?: string | null;
  tripPreferenceId?: string | null;
  placeSuggestionId?: string | null;
  itineraryDayId?: string | null;
  itineraryItemId?: string | null;
  conflictId?: string | null;
};

const targetFieldByType = {
  PREFERENCE: "tripPreferenceId",
  PLACE_SUGGESTION: "placeSuggestionId",
  ITINERARY_DAY: "itineraryDayId",
  ITINERARY_ITEM: "itineraryItemId",
  CONFLICT: "conflictId",
} as const satisfies Record<Exclude<FeedbackTargetType, "TRIP">, keyof PlanningFeedbackTargetInput>;

const targetFields = Object.values(targetFieldByType);

export type PlanningFeedbackTargetValidation =
  | {
      isValid: true;
      targetField: keyof PlanningFeedbackTargetInput | null;
      targetId: string;
      data: PlanningFeedbackTargetInput & {
        targetId: string;
      };
    }
  | {
      isValid: false;
      error: string;
    };

function getPopulatedId(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

export function validatePlanningFeedbackTarget(
  target: PlanningFeedbackTargetInput,
): PlanningFeedbackTargetValidation {
  const tripId = getPopulatedId(target.tripId);

  if (!tripId) {
    return {
      isValid: false,
      error: "Planning feedback requires a tripId.",
    };
  }

  const populatedTargetFields = targetFields.filter((field) =>
    Boolean(getPopulatedId(target[field])),
  );

  if (target.targetType === "TRIP") {
    if (populatedTargetFields.length > 0) {
      return {
        isValid: false,
        error: "Trip-level feedback must not include a child target.",
      };
    }

    const providedTargetId = getPopulatedId(target.targetId);

    if (providedTargetId && providedTargetId !== tripId) {
      return {
        isValid: false,
        error: "Trip-level feedback targetId must match tripId.",
      };
    }

    return {
      isValid: true,
      targetField: null,
      targetId: tripId,
      data: {
        ...target,
        tripId,
        targetId: tripId,
      },
    };
  }

  const expectedField = targetFieldByType[target.targetType];
  const expectedTargetId = getPopulatedId(target[expectedField]);

  if (!expectedTargetId) {
    return {
      isValid: false,
      error: `${target.targetType} feedback requires ${expectedField}.`,
    };
  }

  if (populatedTargetFields.length > 1) {
    return {
      isValid: false,
      error: "Feedback can target only one child planning object.",
    };
  }

  const providedTargetId = getPopulatedId(target.targetId);

  if (providedTargetId && providedTargetId !== expectedTargetId) {
    return {
      isValid: false,
      error: "Feedback targetId must match the typed child target.",
    };
  }

  return {
    isValid: true,
    targetField: expectedField,
    targetId: expectedTargetId,
    data: {
      ...target,
      tripId,
      [expectedField]: expectedTargetId,
      targetId: expectedTargetId,
    },
  };
}

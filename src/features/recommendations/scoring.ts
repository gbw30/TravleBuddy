import type {
  MockPlace,
  RecommendationPreferenceSnapshot,
  ScoredMockPlace,
  SelectedPlanningPlace,
  PlanningTopic,
} from "./types";

const interestLabelByValue: Record<string, string> = {
  FOOD: "food",
  HISTORY: "history",
  MUSEUMS: "museums",
  NATURE: "nature",
  ADVENTURE: "adventure",
  NIGHTLIFE: "nightlife",
  SHOPPING: "shopping",
  PHOTOGRAPHY: "photography",
  BEACHES: "beaches",
  ART: "art",
  ARCHITECTURE: "architecture",
  MUSIC: "music",
  WELLNESS: "wellness",
  LOCAL_CULTURE: "local culture",
  HIDDEN_GEMS: "hidden gems",
};

function intersectionCount(left: readonly string[], right: readonly string[]) {
  const rightValues = new Set(right.map((value) => value.toLocaleLowerCase()));

  return left.filter((value) => rightValues.has(value.toLocaleLowerCase())).length;
}

function includesTextMatch(left: readonly string[], right: readonly string[]) {
  const rightValues = right.map((value) => value.toLocaleLowerCase());

  return left.some((value) => {
    const normalized = value.toLocaleLowerCase();

    return rightValues.some(
      (candidate) =>
        normalized.includes(candidate) || candidate.includes(normalized),
    );
  });
}

function topicCategoryBonus(place: MockPlace, topic: PlanningTopic) {
  return place.topic === topic ? 10 : 0;
}

function explanationParts(
  place: MockPlace,
  preference: RecommendationPreferenceSnapshot,
  penalties: number,
) {
  const parts: string[] = [];
  const matchedInterests = preference.interests.filter((interest) =>
    place.tags.includes(interest),
  );

  if (matchedInterests.length > 0) {
    parts.push(
      `matches your interest in ${interestLabelByValue[matchedInterests[0]] ?? matchedInterests[0].toLocaleLowerCase()}`,
    );
  }

  if (preference.budgetLevel && place.budgetLevels.includes(preference.budgetLevel)) {
    parts.push(
      `fits your ${preference.budgetLevel.toLocaleLowerCase()} comfort target`,
    );
  }

  if (preference.pace && place.pace.includes(preference.pace)) {
    parts.push(`works for a ${preference.pace.toLocaleLowerCase()} pace`);
  }

  if (
    preference.customPreferences.length > 0 &&
    includesTextMatch(preference.customPreferences, place.customMatches)
  ) {
    parts.push("reflects your custom trip notes");
  }

  if (penalties < 0) {
    parts.push("penalized because it overlaps with something you asked to avoid");
  }

  return `Recommended because it ${parts.join(", ")}.`;
}

export function scoreMockPlace(
  place: MockPlace,
  input: {
    topic: PlanningTopic;
    preference: RecommendationPreferenceSnapshot;
    selectedPlaces: SelectedPlanningPlace[];
  },
): ScoredMockPlace {
  const preferenceMatch =
    intersectionCount(input.preference.interests, place.tags) * 12 +
    intersectionCount(input.preference.transportationModes, place.transportationModes) * 6 +
    intersectionCount(input.preference.accommodationTypes, place.accommodationTypes) * 10 +
    (includesTextMatch(input.preference.customPreferences, place.customMatches)
      ? 14
      : 0) +
    topicCategoryBonus(place, input.topic);
  const budgetFit =
    input.preference.budgetLevel &&
    place.budgetLevels.includes(input.preference.budgetLevel)
      ? 18
      : 0;
  const rating = Math.round(place.rating * 4);
  const paceFit =
    input.preference.pace && place.pace.includes(input.preference.pace) ? 10 : 0;
  const practicality =
    input.preference.walkingToleranceKm || input.selectedPlaces.length > 0 ? 6 : 2;
  const penalties = includesTextMatch(input.preference.mustAvoid, [
    ...place.tags,
    ...place.customMatches,
    place.description,
    place.name,
  ])
    ? -28
    : 0;
  const rawScore =
    preferenceMatch + budgetFit + rating + paceFit + practicality + penalties;
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  return {
    place,
    score,
    breakdown: {
      preferenceMatch,
      budgetFit,
      rating,
      paceFit,
      practicality,
      penalties,
    },
    explanation: explanationParts(place, input.preference, penalties),
  };
}

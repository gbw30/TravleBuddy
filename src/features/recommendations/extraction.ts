import type {
  AccommodationType,
  BudgetLevel,
  TransportationMode,
  TravelPace,
} from "@/generated/prisma/client";
import type {
  ExtractedPreferenceSignals,
  PlanningTopic,
  RecommendationPreferenceSnapshot,
} from "./types";

type KeywordMap<T extends string> = {
  value: T;
  keywords: string[];
};

const interestKeywords = [
  { value: "HISTORY", keywords: ["history", "historic", "heritage"] },
  { value: "MUSEUMS", keywords: ["museum", "museums", "gallery", "galleries"] },
  { value: "FOOD", keywords: ["food", "restaurant", "restaurants", "cafe", "cafes", "coffee"] },
  { value: "NATURE", keywords: ["nature", "park", "parks", "garden", "outdoor"] },
  { value: "ADVENTURE", keywords: ["adventure", "hiking", "active"] },
  { value: "NIGHTLIFE", keywords: ["nightlife", "bar", "bars", "club", "clubs"] },
  { value: "SHOPPING", keywords: ["shopping", "boutique", "shops"] },
  { value: "PHOTOGRAPHY", keywords: ["photo", "photos", "photography", "views"] },
  { value: "BEACHES", keywords: ["beach", "beaches", "coast"] },
  { value: "ART", keywords: ["art", "design"] },
  { value: "ARCHITECTURE", keywords: ["architecture", "buildings"] },
  { value: "MUSIC", keywords: ["music", "concert", "jazz"] },
  { value: "WELLNESS", keywords: ["wellness", "spa", "yoga"] },
  { value: "LOCAL_CULTURE", keywords: ["local culture", "cultural"] },
  { value: "HIDDEN_GEMS", keywords: ["hidden gem", "hidden gems", "offbeat", "less touristy"] },
] satisfies KeywordMap<string>[];

const transportationKeywords = [
  { value: "WALKING", keywords: ["walk", "walkable", "walking"] },
  { value: "PUBLIC_TRANSIT", keywords: ["transit", "metro", "subway", "train", "bus"] },
  { value: "RIDE_SHARE", keywords: ["rideshare", "uber", "taxi"] },
  { value: "RENTAL_CAR", keywords: ["rental car", "drive", "driving"] },
  { value: "MIXED", keywords: ["mixed transport", "flexible transport"] },
] satisfies KeywordMap<TransportationMode>[];

const accommodationKeywords = [
  { value: "HOTEL", keywords: ["hotel", "hotels"] },
  { value: "HOSTEL", keywords: ["hostel", "hostels"] },
  { value: "RESORT", keywords: ["resort", "resorts"] },
  { value: "AIRBNB", keywords: ["airbnb", "apartment"] },
  { value: "OTHER", keywords: ["guesthouse", "inn"] },
] satisfies KeywordMap<AccommodationType>[];

const customPreferenceKeywords = [
  { value: "Quiet hotels", keywords: ["quiet hotel", "quiet hotels", "calm hotel"] },
  { value: "Quiet mornings", keywords: ["quiet morning", "quiet mornings"] },
  { value: "Local markets", keywords: ["local market", "local markets", "markets"] },
  { value: "Low-crowd attractions", keywords: ["avoid crowds", "low crowd", "less crowded", "crowded"] },
  { value: "Scenic walks", keywords: ["scenic walk", "scenic walks"] },
  { value: "Independent cafes", keywords: ["independent cafe", "independent cafes"] },
  { value: "Rooftop views", keywords: ["rooftop", "views"] },
] satisfies KeywordMap<string>[];

function normalize(text: string) {
  return text.toLocaleLowerCase();
}

function includesKeyword(text: string, keyword: string) {
  return new RegExp(`\\b${keyword.replaceAll(" ", "\\s+")}\\b`, "i").test(text);
}

function matchKeywordValues<T extends string>(
  text: string,
  values: readonly KeywordMap<T>[],
) {
  return values
    .filter((item) => item.keywords.some((keyword) => includesKeyword(text, keyword)))
    .map((item) => item.value);
}

function uniq<T>(values: readonly T[]) {
  return Array.from(new Set(values));
}

function extractBudgetLevel(text: string): BudgetLevel | undefined {
  if (/\b(luxury|premium|splurge|five star|5 star)\b/i.test(text)) {
    return "LUXURY";
  }

  if (/\b(budget|cheap|affordable|low cost)\b/i.test(text)) {
    return "BUDGET";
  }

  if (/\b(moderate|midrange|mid-range|reasonable)\b/i.test(text)) {
    return "MODERATE";
  }

  return undefined;
}

function extractPace(text: string): TravelPace | undefined {
  if (/\b(relaxed|slow|easy|flexible)\b/i.test(text)) {
    return "RELAXED";
  }

  if (/\b(packed|busy|full schedule|as much as possible)\b/i.test(text)) {
    return "PACKED";
  }

  if (/\b(balanced|moderate pace)\b/i.test(text)) {
    return "BALANCED";
  }

  return undefined;
}

function extractWalkingToleranceKm(text: string) {
  const match = text.match(/(?:more than|over|within|under|less than)?\s*(\d+(?:\.\d+)?)\s*km\b/i);

  return match ? Number(match[1]) : null;
}

function extractMustAvoid(text: string) {
  const avoidMatch = text.match(/\b(?:avoid|skip|no)\s+([^.,;]+)/i);

  if (!avoidMatch) {
    return [];
  }

  return [avoidMatch[1].split(/\s+and\s+anything/i)[0].trim()];
}

export function extractPreferenceSignals(
  message: string,
): ExtractedPreferenceSignals {
  const text = normalize(message);

  return {
    budgetLevel: extractBudgetLevel(text),
    pace: extractPace(text),
    interests: uniq(matchKeywordValues(text, interestKeywords)),
    transportationModes: uniq(
      matchKeywordValues(text, transportationKeywords),
    ),
    accommodationTypes: uniq(matchKeywordValues(text, accommodationKeywords)),
    customPreferences: uniq(
      matchKeywordValues(text, customPreferenceKeywords),
    ),
    mustAvoid: extractMustAvoid(message),
    walkingToleranceKm: extractWalkingToleranceKm(text),
  };
}

export function mergePreferenceSignals(
  preference: RecommendationPreferenceSnapshot | null,
  signals: ExtractedPreferenceSignals,
): RecommendationPreferenceSnapshot {
  return {
    budgetLevel: signals.budgetLevel ?? preference?.budgetLevel ?? null,
    pace: signals.pace ?? preference?.pace ?? null,
    interests: uniq([...(preference?.interests ?? []), ...signals.interests]),
    transportationModes: uniq([
      ...(preference?.transportationModes ?? []),
      ...signals.transportationModes,
    ]),
    accommodationTypes: uniq([
      ...(preference?.accommodationTypes ?? []),
      ...signals.accommodationTypes,
    ]),
    hotelPriority: preference?.hotelPriority ?? null,
    walkingToleranceKm:
      signals.walkingToleranceKm ?? preference?.walkingToleranceKm ?? null,
    customPreferences: uniq([
      ...(preference?.customPreferences ?? []),
      ...signals.customPreferences,
    ]),
    mustAvoid: uniq([...(preference?.mustAvoid ?? []), ...signals.mustAvoid]),
  };
}

export function hasTopicRecommendationReadiness({
  topic,
  preference,
  selectedPlaceCount,
}: {
  topic: PlanningTopic;
  preference: RecommendationPreferenceSnapshot;
  selectedPlaceCount: number;
}) {
  const signals = new Set<string>();

  if (preference.budgetLevel) signals.add("budget");
  if (preference.pace) signals.add("pace");
  if (preference.walkingToleranceKm) signals.add("walking");
  if (selectedPlaceCount > 0) signals.add("anchor");
  if (preference.customPreferences.length > 0) signals.add("custom");

  if (topic === "HOTEL_BASE") {
    if (preference.accommodationTypes.length > 0) signals.add("accommodation");
    if (preference.hotelPriority) signals.add("hotelPriority");
  }

  if (topic === "ACTIVITIES" || topic === "FOOD_NIGHTLIFE") {
    if (preference.interests.length > 0) signals.add("interests");
  }

  if (topic === "BUDGET_PACE") {
    if (preference.transportationModes.length > 0) signals.add("transport");
  }

  const signalCount = signals.size;

  return {
    isReady: signalCount >= 2,
    signalCount,
    missingSignalCount: Math.max(0, 2 - signalCount),
  };
}

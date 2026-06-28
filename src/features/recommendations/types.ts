import type {
  AccommodationType,
  BudgetLevel,
  FeedbackAction,
  FeedbackReason,
  PlanningActor,
  PlanningEventType,
  SuggestionCategory,
  TransportationMode,
  TravelPace,
} from "@/generated/prisma/client";

export type PlanningTopic =
  | "HOTEL_BASE"
  | "ACTIVITIES"
  | "FOOD_NIGHTLIFE"
  | "BUDGET_PACE";

export type RecommendationPreferenceSnapshot = {
  budgetLevel: BudgetLevel | null;
  pace: TravelPace | null;
  interests: string[];
  transportationModes: TransportationMode[];
  accommodationTypes: AccommodationType[];
  hotelPriority: number | null;
  walkingToleranceKm: number | null;
  customPreferences: string[];
  mustAvoid: string[];
};

export type ExtractedPreferenceSignals = Partial<
  Pick<
    RecommendationPreferenceSnapshot,
    | "budgetLevel"
    | "pace"
    | "walkingToleranceKm"
    | "interests"
    | "transportationModes"
    | "accommodationTypes"
    | "customPreferences"
    | "mustAvoid"
  >
> & {
  interests: string[];
  transportationModes: TransportationMode[];
  accommodationTypes: AccommodationType[];
  customPreferences: string[];
  mustAvoid: string[];
  walkingToleranceKm: number | null;
};

export type MockPlace = {
  id: string;
  city: string;
  country: string;
  name: string;
  category: SuggestionCategory;
  topic: PlanningTopic;
  tags: string[];
  budgetLevels: BudgetLevel[];
  pace: TravelPace[];
  transportationModes: TransportationMode[];
  accommodationTypes: AccommodationType[];
  customMatches: string[];
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  rating: number;
  priceLevel: number;
  estimatedCostAmount: number;
  estimatedCostCurrency: string;
};

export type SelectedPlanningPlace = {
  id: string;
  name: string;
  category: SuggestionCategory;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type RecommendationFeedbackSignal = {
  providerPlaceId: string | null;
  topic: PlanningTopic | null;
  category: SuggestionCategory;
  name: string;
  reason: FeedbackReason | null;
  note: string | null;
  tags: string[];
  estimatedCostAmount: number | null;
  priceLevel: number | null;
  latitude: number | null;
  longitude: number | null;
};

export type RecommendationScoreBreakdown = {
  preferenceMatch: number;
  budgetFit: number;
  rating: number;
  paceFit: number;
  practicality: number;
  penalties: number;
};

export type ScoredMockPlace = {
  place: MockPlace;
  score: number;
  explanation: string;
  breakdown: RecommendationScoreBreakdown;
};

export type PlanningTimelineEvent = {
  id: string;
  actor: PlanningActor;
  type: PlanningEventType;
  title: string;
  message: string | null;
  createdAt: string;
};

export type PlaceActionLogEntry = {
  id: string;
  action: Extract<FeedbackAction, "SELECT" | "REJECT" | "DESELECT">;
  reason: FeedbackReason | null;
  note: string | null;
  createdAt: string;
  place: {
    id: string;
    name: string;
    category: SuggestionCategory;
    status: "PENDING" | "SELECTED" | "REJECTED";
    city: string | null;
    country: string | null;
  };
};

export type RecommendationDto = {
  id: string;
  tripId: string;
  destinationId: string | null;
  topic: PlanningTopic | null;
  name: string;
  category: SuggestionCategory;
  status: "PENDING" | "SELECTED" | "REJECTED";
  description: string | null;
  explanation: string | null;
  city: string | null;
  country: string | null;
  score: number | null;
  rating: number | null;
  estimatedCostAmount: number | null;
  estimatedCostCurrency: string | null;
};

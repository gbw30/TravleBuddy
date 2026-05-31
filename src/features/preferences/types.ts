import type {
  AccommodationType,
  BudgetLevel,
  TransportationMode,
  TravelPace,
} from "@/generated/prisma/client";

export type PreferenceOption<T extends string = string> = {
  value: T;
  label: string;
};

export type TripPreferenceDto = {
  id: string;
  tripId: string;
  budgetLevel: BudgetLevel | null;
  pace: TravelPace | null;
  interests: string[];
  transportationModes: TransportationMode[];
  accommodationTypes: AccommodationType[];
  hotelPriority: number | null;
  walkingToleranceKm: number | null;
  dietaryRestrictions: string[];
  accessibilityNeeds: string[];
  mustAvoid: string[];
  customNotes: string | null;
  customPreferences: string[];
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
};

export type RecommendationPreferenceInput = TripPreferenceDto;

export type PreferenceTripSummary = {
  id: string;
  title: string;
  status: "DRAFT" | "PLANNING" | "ARCHIVED";
  budgetAmount: number | null;
  budgetCurrency: string | null;
  travelStyle: TravelPace | null;
};

export type PreferenceAccessResult =
  | {
      status: "ok";
      trip: PreferenceTripSummary;
      preference: TripPreferenceDto | null;
    }
  | {
      status: "not_found" | "archived";
    }
  | {
      status: "not_ready";
      missingRequirements: string[];
    };

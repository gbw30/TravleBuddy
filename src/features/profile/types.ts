import type {
  AccommodationType,
  BudgetLevel,
  TransportationMode,
  TravelPace,
} from "@/generated/prisma/client";

export type ProfileDto = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

export type UserTravelPreferenceDto = {
  id: string;
  userId: string;
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
  customPreferences: string[];
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
};

export type UserTravelPreferenceInput = {
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
  customPreferences: string[];
  metadata: unknown;
};

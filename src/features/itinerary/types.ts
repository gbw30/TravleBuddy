import type { SuggestionCategory, TravelPace } from "@/generated/prisma/client";

export type ItineraryDraftTrip = {
  id: string;
  startDate: Date | string | null;
  endDate: Date | string | null;
  budgetCurrency: string | null;
  preference: {
    pace: TravelPace | null;
  } | null;
};

export type ItineraryDraftPlace = {
  id: string;
  tripId: string;
  category: SuggestionCategory;
  name: string;
  description: string | null;
  city?: string | null;
  country?: string | null;
  score: number | { toString: () => string } | null;
  estimatedCostAmount: number | { toString: () => string } | null;
  estimatedCostCurrency: string | null;
};

export type ItineraryItemDto = {
  id: string;
  placeSuggestionId: string | null;
  title: string;
  description: string | null;
  category: SuggestionCategory | null;
  city: string | null;
  country: string | null;
  sortOrder: number;
  estimatedCostAmount: number | null;
  estimatedCostCurrency: string | null;
};

export type ItineraryDayDto = {
  id: string;
  dayNumber: number;
  date: string | null;
  title: string | null;
  notes: string | null;
  itemCount: number;
  estimatedCostAmount: number | null;
  estimatedCostCurrency: string | null;
  items: ItineraryItemDto[];
};

export type ItineraryTotalsDto = {
  itemCount: number;
  estimatedCostAmount: number | null;
  estimatedCostCurrency: string | null;
};

export type ItineraryDto = {
  days: ItineraryDayDto[];
  totals: ItineraryTotalsDto;
};

export type BuiltItineraryDraft = ItineraryDto & {
  status: "built";
};

export type EmptyItineraryDraft = ItineraryDto & {
  status: "no_selected_places";
};

export type ItineraryDraft = BuiltItineraryDraft | EmptyItineraryDraft;

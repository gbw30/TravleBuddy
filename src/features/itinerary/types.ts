import type {
  ConflictSeverity,
  ConflictStatus,
  ConflictType,
  CityWindowSource,
  Prisma,
  SuggestionCategory,
  TripLogisticsMode,
  TravelSegmentMode,
  TravelPace,
} from "@/generated/prisma/client";

export type ItineraryDraftDestination = {
  id: string;
  city: string;
  country: string;
};

export type ItineraryDraftTravelSegment = {
  id: string;
  mode?: TravelSegmentMode;
  originCity: string;
  originCountry: string;
  destinationCity: string;
  destinationCountry: string;
  departAt: Date | string;
  arriveAt: Date | string;
};

export type ItineraryDraftTrip = {
  id: string;
  startDate: Date | string | null;
  endDate: Date | string | null;
  budgetCurrency: string | null;
  logisticsMode?: TripLogisticsMode;
  destinations?: ItineraryDraftDestination[];
  travelSegments?: ItineraryDraftTravelSegment[];
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

export type ItineraryCityWindowDto = {
  id: string;
  destinationId: string | null;
  travelSegmentId: string | null;
  city: string;
  country: string;
  startTime: string;
  endTime: string;
  source: CityWindowSource;
};

export type ItineraryTimeSlotDto = {
  startTime: string;
  endTime: string;
  city: string | null;
  country: string | null;
  travelSegmentId: string | null;
  itemIds: string[];
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
  costIsComplete: boolean;
  excludedCostCurrencies: string[];
  cityWindows: ItineraryCityWindowDto[];
  timeSlots: ItineraryTimeSlotDto[];
  items: ItineraryItemDto[];
};

export type ItineraryTotalsDto = {
  itemCount: number;
  estimatedCostAmount: number | null;
  estimatedCostCurrency: string | null;
  costIsComplete: boolean;
  excludedCostCurrencies: string[];
};

export type UnscheduledItineraryItemDto = ItineraryItemDto & {
  reason: "PACE_CAPACITY_EXCEEDED" | "NO_AVAILABLE_DAY";
  reasonMessage: string;
};

export type ItineraryConflictDto = {
  id: string;
  itineraryItemId: string | null;
  type: ConflictType;
  severity: ConflictSeverity;
  status: ConflictStatus;
  message: string;
  recommendation: string | null;
  metadata: Prisma.JsonValue | null;
};

export type ItineraryConflictSummaryDto = {
  total: number;
  low: number;
  medium: number;
  high: number;
};

export type ItineraryDto = {
  days: ItineraryDayDto[];
  unscheduledItems: UnscheduledItineraryItemDto[];
  totals: ItineraryTotalsDto;
  conflicts: ItineraryConflictDto[];
  conflictSummary: ItineraryConflictSummaryDto;
};

export type BuiltItineraryDraft = ItineraryDto & {
  status: "built";
};

export type EmptyItineraryDraft = ItineraryDto & {
  status: "no_selected_places";
};

export type ItineraryDraft = BuiltItineraryDraft | EmptyItineraryDraft;

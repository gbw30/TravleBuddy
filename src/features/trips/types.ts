export type TripStatus = "DRAFT" | "PLANNING" | "ARCHIVED";
export type TravelStyle = "RELAXED" | "BALANCED" | "PACKED";

export type TripDestination = {
  id: string;
  city: string;
  country: string;
  region?: string | null;
  timeZone?: string | null;
  sortOrder: number;
};

export type Trip = {
  id: string;
  userId: string;
  title: string;
  status: TripStatus;
  destinationSearchText?: string | null;
  departureCity?: string | null;
  departureCountry?: string | null;
  departureTimeZone?: string | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  budgetAmount?: string | null;
  budgetCurrency?: string | null;
  destinations?: TripDestination[];
  travelStyle?: TravelStyle | null;
};

export type TripFeatureGate =
  | "discovery"
  | "itinerary"
  | "map"
  | "conflicts"
  | "full-export";

export type TripDto = Trip & {
  createdAt: string;
  updatedAt: string;
  readiness: {
    canUseDiscovery: boolean;
    canUseFullPlanning: boolean;
    missingRequirements: string[];
  };
};

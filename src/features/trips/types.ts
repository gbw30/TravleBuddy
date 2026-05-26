export type TripStatus = "DRAFT" | "PLANNING" | "ARCHIVED";

export type TripDestination = {
  id: string;
  city: string;
  country: string;
  region?: string | null;
  sortOrder: number;
};

export type Trip = {
  id: string;
  userId: string;
  title: string;
  status: TripStatus;
  destinationSearchText?: string | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  budgetAmount?: unknown | null;
  budgetCurrency?: string | null;
  destinations?: TripDestination[];
};

export type TripFeatureGate =
  | "discovery"
  | "itinerary"
  | "map"
  | "conflicts"
  | "full-export";

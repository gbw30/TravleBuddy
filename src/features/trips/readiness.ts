type DestinationCount = {
  destinations?: number;
};

export type TripReadinessInput = {
  status: "DRAFT" | "PLANNING" | "ARCHIVED";
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  budgetAmount?: unknown | null;
  budgetCurrency?: string | null;
  destinations?: readonly unknown[] | null;
  _count?: DestinationCount | null;
};

export type TripReadiness = {
  canUseDiscovery: boolean;
  canUseFullPlanning: boolean;
  missingRequirements: string[];
};

function hasDateRange(trip: TripReadinessInput) {
  if (!trip.startDate || !trip.endDate) {
    return false;
  }

  const startDate = new Date(trip.startDate);
  const endDate = new Date(trip.endDate);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return false;
  }

  return endDate >= startDate;
}

function toBudgetNumber(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return Number(value);
  }

  if (typeof value === "object" && value !== null) {
    const toString = (value as { toString?: () => string }).toString;

    if (typeof toString === "function") {
      return Number(toString.call(value));
    }
  }

  return Number.NaN;
}

function hasBudget(trip: TripReadinessInput) {
  const budgetAmount = toBudgetNumber(trip.budgetAmount);

  return (
    Number.isFinite(budgetAmount) &&
    budgetAmount > 0 &&
    typeof trip.budgetCurrency === "string" &&
    trip.budgetCurrency.trim().length === 3
  );
}

function hasDestinationList(trip: TripReadinessInput) {
  if (Array.isArray(trip.destinations)) {
    return trip.destinations.length > 0;
  }

  return Boolean(trip._count?.destinations && trip._count.destinations > 0);
}

export function canUseDiscovery(trip: TripReadinessInput) {
  return trip.status === "DRAFT" || trip.status === "PLANNING";
}

export function getMissingFullPlanningRequirements(
  trip: TripReadinessInput,
) {
  const missingRequirements: string[] = [];

  if (trip.status !== "PLANNING") {
    missingRequirements.push("planning status");
  }

  if (!hasDestinationList(trip)) {
    missingRequirements.push("at least one destination");
  }

  if (!hasDateRange(trip)) {
    missingRequirements.push("valid date range");
  }

  if (!hasBudget(trip)) {
    missingRequirements.push("trip-level budget amount and currency");
  }

  return missingRequirements;
}

export function canUseFullPlanning(trip: TripReadinessInput) {
  return getMissingFullPlanningRequirements(trip).length === 0;
}

export function getTripReadiness(trip: TripReadinessInput): TripReadiness {
  const missingRequirements = getMissingFullPlanningRequirements(trip);

  return {
    canUseDiscovery: canUseDiscovery(trip),
    canUseFullPlanning: missingRequirements.length === 0,
    missingRequirements,
  };
}

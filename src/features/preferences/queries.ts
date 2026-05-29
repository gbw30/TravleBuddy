import type { Prisma } from "@/generated/prisma/client";
import { buildTripOwnerWhere } from "@/lib/authorization-rules";
import { db } from "@/lib/db";
import { getContinueTripCreationMissingRequirements } from "@/features/trips/schemas";
import type {
  PreferenceAccessResult,
  PreferenceTripSummary,
  TripPreferenceDto,
} from "./types";

export const preferenceSelect = {
  id: true,
  tripId: true,
  budgetLevel: true,
  pace: true,
  interests: true,
  transportationModes: true,
  accommodationTypes: true,
  hotelPriority: true,
  walkingToleranceKm: true,
  dietaryRestrictions: true,
  accessibilityNeeds: true,
  mustAvoid: true,
  customNotes: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TripPreferenceSelect;

const tripPreferenceAccessSelect = {
  id: true,
  title: true,
  status: true,
  startDate: true,
  endDate: true,
  budgetAmount: true,
  budgetCurrency: true,
  destinations: {
    select: {
      city: true,
      country: true,
    },
  },
  preference: {
    select: preferenceSelect,
  },
} satisfies Prisma.TripSelect;

export type PreferenceRecord = Prisma.TripPreferenceGetPayload<{
  select: typeof preferenceSelect;
}>;

type PreferenceTripRecord = Prisma.TripGetPayload<{
  select: typeof tripPreferenceAccessSelect;
}>;

type PreferenceReadinessTrip = {
  title: string;
  status: "DRAFT" | "PLANNING" | "ARCHIVED";
  startDate: Date | string | null;
  endDate: Date | string | null;
  budgetAmount: unknown | null;
  budgetCurrency: string | null;
  destinations: readonly { city?: string | null; country?: string | null }[];
  preference: { pace: string | null } | null;
};

function toStringArray(value: Prisma.JsonValue | null | undefined) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function getMetadataStringArray(
  metadata: Prisma.JsonValue | null | undefined,
  key: string,
) {
  if (!metadata || Array.isArray(metadata) || typeof metadata !== "object") {
    return [];
  }

  return toStringArray(metadata[key]);
}

function serializeDecimalNumber(value: { toString: () => string } | number | null) {
  if (value === null) {
    return null;
  }

  return typeof value === "number" ? value : Number(value.toString());
}

export function toPreferenceDto(
  preference: PreferenceRecord,
): TripPreferenceDto {
  return {
    id: preference.id,
    tripId: preference.tripId,
    budgetLevel: preference.budgetLevel,
    pace: preference.pace,
    interests: preference.interests,
    transportationModes: preference.transportationModes,
    accommodationTypes: preference.accommodationTypes,
    hotelPriority: preference.hotelPriority,
    walkingToleranceKm: serializeDecimalNumber(preference.walkingToleranceKm),
    dietaryRestrictions: toStringArray(preference.dietaryRestrictions),
    accessibilityNeeds: toStringArray(preference.accessibilityNeeds),
    mustAvoid: toStringArray(preference.mustAvoid),
    customNotes: preference.customNotes,
    customPreferences: getMetadataStringArray(
      preference.metadata,
      "customPreferences",
    ),
    metadata: preference.metadata,
    createdAt: preference.createdAt.toISOString(),
    updatedAt: preference.updatedAt.toISOString(),
  };
}

function toPreferenceTripSummary(trip: PreferenceTripRecord): PreferenceTripSummary {
  return {
    id: trip.id,
    title: trip.title,
    status: trip.status,
    travelStyle: trip.preference?.pace ?? null,
  };
}

export function getPreferenceMissingRequirements(trip: PreferenceReadinessTrip) {
  return getContinueTripCreationMissingRequirements({
    title: trip.title,
    destinations: trip.destinations,
    startDate: trip.startDate,
    endDate: trip.endDate,
    budgetAmount: trip.budgetAmount,
    budgetCurrency: trip.budgetCurrency,
    travelStyle: trip.preference?.pace ?? null,
  });
}

export function toPreferenceAccessResult(
  trip: PreferenceTripRecord | null,
): PreferenceAccessResult {
  if (!trip) {
    return {
      status: "not_found",
    };
  }

  if (trip.status === "ARCHIVED") {
    return {
      status: "archived",
    };
  }

  const missingRequirements = getPreferenceMissingRequirements(trip);

  if (missingRequirements.length > 0) {
    return {
      status: "not_ready",
      missingRequirements,
    };
  }

  return {
    status: "ok",
    trip: toPreferenceTripSummary(trip),
    preference: trip.preference ? toPreferenceDto(trip.preference) : null,
  };
}

export async function getTripPreferenceForUser(
  userId: string,
  tripId: string,
): Promise<PreferenceAccessResult> {
  const trip = await db.trip.findFirst({
    where: buildTripOwnerWhere(userId, tripId),
    select: tripPreferenceAccessSelect,
  });

  return toPreferenceAccessResult(trip);
}

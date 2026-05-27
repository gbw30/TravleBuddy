import type { Prisma } from "@/generated/prisma/client";
import { buildTripOwnerWhere } from "@/lib/authorization-rules";
import { db } from "@/lib/db";
import { getTripReadiness } from "./readiness";
import type { TripDto } from "./types";

export const tripWithDetailsSelect = {
  id: true,
  userId: true,
  title: true,
  status: true,
  destinationSearchText: true,
  departureCity: true,
  departureCountry: true,
  departureTimeZone: true,
  startDate: true,
  endDate: true,
  budgetAmount: true,
  budgetCurrency: true,
  createdAt: true,
  updatedAt: true,
  destinations: {
    select: {
      id: true,
      city: true,
      country: true,
      region: true,
      timeZone: true,
      sortOrder: true,
    },
    orderBy: {
      sortOrder: "asc",
    },
  },
  preference: {
    select: {
      pace: true,
    },
  },
} satisfies Prisma.TripSelect;

export type TripWithDetails = Prisma.TripGetPayload<{
  select: typeof tripWithDetailsSelect;
}>;

function serializeDate(value: Date | null) {
  return value ? value.toISOString() : null;
}

function serializeDecimal(value: { toString: () => string } | null) {
  return value ? value.toString() : null;
}

export function toTripDto(trip: TripWithDetails): TripDto {
  const dto = {
    id: trip.id,
    userId: trip.userId,
    title: trip.title,
    status: trip.status,
    destinationSearchText: trip.destinationSearchText,
    departureCity: trip.departureCity,
    departureCountry: trip.departureCountry,
    departureTimeZone: trip.departureTimeZone,
    startDate: serializeDate(trip.startDate),
    endDate: serializeDate(trip.endDate),
    budgetAmount: serializeDecimal(trip.budgetAmount),
    budgetCurrency: trip.budgetCurrency,
    createdAt: trip.createdAt.toISOString(),
    updatedAt: trip.updatedAt.toISOString(),
    destinations: trip.destinations,
    travelStyle: trip.preference?.pace ?? null,
  };

  return {
    ...dto,
    readiness: getTripReadiness(dto),
  };
}

export async function getTripsForUser(userId: string) {
  const trips = await db.trip.findMany({
    where: {
      userId,
    },
    select: tripWithDetailsSelect,
    orderBy: {
      updatedAt: "desc",
    },
  });

  return trips.map(toTripDto);
}

export async function getTripByIdForUser(userId: string, tripId: string) {
  const trip = await db.trip.findFirst({
    where: buildTripOwnerWhere(userId, tripId),
    select: tripWithDetailsSelect,
  });

  return trip ? toTripDto(trip) : null;
}

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type {
  Prisma,
  TravelSegmentMode,
  TripLogisticsMode,
} from "@/generated/prisma/client";
import { rebuildItineraryDraftForTripTx } from "@/features/itinerary/builder";
import { buildTripOwnerWhere } from "@/lib/authorization-rules";
import { requireUser } from "@/lib/authorization";
import { db } from "@/lib/db";

type TripTx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

const travelSegmentModes = new Set<TravelSegmentMode>([
  "FLIGHT",
  "TRAIN",
  "BUS",
  "CAR",
  "FERRY",
  "OTHER",
]);

const logisticsModes = new Set<TripLogisticsMode>(["FLEXIBLE", "TICKETED"]);

const logisticsTripSelect = {
  id: true,
  title: true,
  status: true,
  departureCity: true,
  departureCountry: true,
  startDate: true,
  endDate: true,
  logisticsMode: true,
  destinations: {
    select: {
      id: true,
      city: true,
      country: true,
      sortOrder: true,
    },
    orderBy: {
      sortOrder: "asc",
    },
  },
  travelSegments: {
    select: {
      id: true,
      mode: true,
      originCity: true,
      originCountry: true,
      destinationCity: true,
      destinationCountry: true,
      departAt: true,
      arriveAt: true,
      carrier: true,
      referenceCode: true,
      sortOrder: true,
    },
    orderBy: [
      {
        sortOrder: "asc",
      },
      {
        departAt: "asc",
      },
    ],
  },
} satisfies Prisma.TripSelect;

type LogisticsTripRecord = Prisma.TripGetPayload<{
  select: typeof logisticsTripSelect;
}>;

type TravelSegmentInput = {
  mode: TravelSegmentMode | string;
  originCity: string;
  originCountry: string;
  destinationCity: string;
  destinationCountry: string;
  departAt: Date | string;
  arriveAt: Date | string;
  carrier?: string | null;
  referenceCode?: string | null;
};

type LogisticsResult =
  | { status: "saved" }
  | { status: "not_found" | "archived" | "invalid" };

function dateOnly(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown) {
  const text = normalizeText(value);

  return text.length > 0 ? text : null;
}

function parseLogisticsMode(value: unknown): TripLogisticsMode | null {
  return typeof value === "string" && logisticsModes.has(value as TripLogisticsMode)
    ? (value as TripLogisticsMode)
    : null;
}

function parseTravelSegmentMode(value: unknown): TravelSegmentMode | null {
  return typeof value === "string" && travelSegmentModes.has(value as TravelSegmentMode)
    ? (value as TravelSegmentMode)
    : null;
}

function parseDateTimeInput(value: Date | string) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const trimmed = value.trim();
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)
    ? `${trimmed}:00.000Z`
    : trimmed;
  const date = new Date(normalized);

  return Number.isNaN(date.getTime()) ? null : date;
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);

  next.setUTCDate(next.getUTCDate() + days);

  return next;
}

function tripDateRange(trip: Pick<LogisticsTripRecord, "startDate" | "endDate">) {
  if (!trip.startDate || !trip.endDate) {
    return null;
  }

  const start = new Date(trip.startDate);
  const endExclusive = addUtcDays(new Date(trip.endDate), 1);

  return start < endExclusive ? { start, endExclusive } : null;
}

function validateTravelSegmentInput(
  trip: Pick<LogisticsTripRecord, "startDate" | "endDate">,
  input: TravelSegmentInput,
) {
  const mode = parseTravelSegmentMode(input.mode);
  const originCity = normalizeText(input.originCity);
  const originCountry = normalizeText(input.originCountry);
  const destinationCity = normalizeText(input.destinationCity);
  const destinationCountry = normalizeText(input.destinationCountry);
  const departAt = parseDateTimeInput(input.departAt);
  const arriveAt = parseDateTimeInput(input.arriveAt);
  const range = tripDateRange(trip);

  if (
    !mode ||
    !originCity ||
    !originCountry ||
    !destinationCity ||
    !destinationCountry ||
    !departAt ||
    !arriveAt ||
    !range
  ) {
    return null;
  }

  if (arriveAt <= departAt) {
    return null;
  }

  if (departAt < range.start || arriveAt > range.endExclusive) {
    return null;
  }

  return {
    mode,
    originCity,
    originCountry,
    destinationCity,
    destinationCountry,
    departAt,
    arriveAt,
    carrier: optionalText(input.carrier),
    referenceCode: optionalText(input.referenceCode),
  };
}

function serializeSegment(
  segment: LogisticsTripRecord["travelSegments"][number],
) {
  return {
    ...segment,
    departAt: segment.departAt.toISOString(),
    arriveAt: segment.arriveAt.toISOString(),
  };
}

function serializeTrip(trip: LogisticsTripRecord) {
  return {
    id: trip.id,
    title: trip.title,
    status: trip.status,
    logisticsMode: trip.logisticsMode,
    departureCity: trip.departureCity,
    departureCountry: trip.departureCountry,
    startDate: dateOnly(trip.startDate),
    endDate: dateOnly(trip.endDate),
    destinations: trip.destinations,
  };
}

async function ownedLogisticsTrip(tx: TripTx, userId: string, tripId: string) {
  return tx.trip.findFirst({
    where: buildTripOwnerWhere(userId, tripId),
    select: logisticsTripSelect,
  });
}

async function rebuildPlanningItineraryIfNeeded(
  tx: TripTx,
  trip: Pick<LogisticsTripRecord, "id" | "status">,
) {
  if (trip.status === "PLANNING") {
    await rebuildItineraryDraftForTripTx(tx, trip.id);
  }
}

export async function getTripLogisticsWorkspace(userId: string, tripId: string) {
  const trip = await db.trip.findFirst({
    where: buildTripOwnerWhere(userId, tripId),
    select: logisticsTripSelect,
  });

  if (!trip) {
    return { status: "not_found" as const };
  }

  if (trip.status === "ARCHIVED") {
    return { status: "archived" as const };
  }

  return {
    status: "ok" as const,
    trip: serializeTrip(trip),
    travelSegments: trip.travelSegments.map(serializeSegment),
  };
}

export async function saveTripLogisticsMode(
  userId: string,
  tripId: string,
  input: { mode: TripLogisticsMode | string },
): Promise<LogisticsResult> {
  const mode = parseLogisticsMode(input.mode);

  if (!mode) {
    return { status: "invalid" };
  }

  return db.$transaction(async (tx) => {
    const trip = await ownedLogisticsTrip(tx, userId, tripId);

    if (!trip) {
      return { status: "not_found" as const };
    }

    if (trip.status === "ARCHIVED") {
      return { status: "archived" as const };
    }

    await tx.trip.update({
      where: {
        id: tripId,
      },
      data: {
        logisticsMode: mode,
      },
    });
    await rebuildPlanningItineraryIfNeeded(tx, trip);

    return { status: "saved" as const };
  });
}

export async function addTripTravelSegment(
  userId: string,
  tripId: string,
  input: TravelSegmentInput,
): Promise<LogisticsResult> {
  return db.$transaction(async (tx) => {
    const trip = await ownedLogisticsTrip(tx, userId, tripId);

    if (!trip) {
      return { status: "not_found" as const };
    }

    if (trip.status === "ARCHIVED") {
      return { status: "archived" as const };
    }

    const segment = validateTravelSegmentInput(trip, input);

    if (!segment) {
      return { status: "invalid" as const };
    }

    const existingSegments =
      (await tx.tripTravelSegment.findMany({
        where: {
          tripId,
        },
        select: {
          sortOrder: true,
        },
        orderBy: {
          sortOrder: "desc",
        },
        take: 1,
      })) ?? [];

    await tx.trip.update({
      where: {
        id: tripId,
      },
      data: {
        logisticsMode: "TICKETED",
      },
    });
    await tx.tripTravelSegment.create({
      data: {
        tripId,
        ...segment,
        sortOrder: (existingSegments[0]?.sortOrder ?? -1) + 1,
      },
      select: {
        id: true,
      },
    });
    await rebuildPlanningItineraryIfNeeded(tx, trip);

    return { status: "saved" as const };
  });
}

export async function updateTripTravelSegment(
  userId: string,
  tripId: string,
  segmentId: string,
  input: TravelSegmentInput,
): Promise<LogisticsResult> {
  return db.$transaction(async (tx) => {
    const trip = await ownedLogisticsTrip(tx, userId, tripId);

    if (!trip) {
      return { status: "not_found" as const };
    }

    if (trip.status === "ARCHIVED") {
      return { status: "archived" as const };
    }

    const segment = validateTravelSegmentInput(trip, input);

    if (!segment || !segmentId) {
      return { status: "invalid" as const };
    }

    const updated = await tx.tripTravelSegment.updateMany({
      where: {
        id: segmentId,
        tripId,
      },
      data: segment,
    });

    if (updated.count === 0) {
      return { status: "not_found" as const };
    }

    await rebuildPlanningItineraryIfNeeded(tx, trip);

    return { status: "saved" as const };
  });
}

export async function deleteTripTravelSegment(
  userId: string,
  tripId: string,
  segmentId: string,
): Promise<LogisticsResult> {
  return db.$transaction(async (tx) => {
    const trip = await ownedLogisticsTrip(tx, userId, tripId);

    if (!trip) {
      return { status: "not_found" as const };
    }

    if (trip.status === "ARCHIVED") {
      return { status: "archived" as const };
    }

    const deleted = await tx.tripTravelSegment.deleteMany({
      where: {
        id: segmentId,
        tripId,
      },
    });

    if (deleted.count === 0) {
      return { status: "not_found" as const };
    }

    await rebuildPlanningItineraryIfNeeded(tx, trip);

    return { status: "saved" as const };
  });
}

function formString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}

function formLocation(value: FormDataEntryValue | null) {
  const [city = "", country = ""] = formString(value).split("|||");

  return {
    city,
    country,
  };
}

function revalidateTripLogisticsPaths(tripId: string) {
  revalidatePath(`/trips/${tripId}/logistics`);
  revalidatePath(`/trips/${tripId}/planning`);
  revalidatePath(`/trips/${tripId}/itinerary`);
}

function redirectAfterLogisticsResult(
  tripId: string,
  result: LogisticsResult,
  successPath = `/trips/${tripId}/logistics?mode=ticketed&saved=1`,
) {
  if (result.status === "not_found") {
    redirect("/trips?error=not-found");
  }

  if (result.status === "archived") {
    redirect(`/trips/${tripId}/logistics?error=archived`);
  }

  if (result.status === "invalid") {
    redirect(`/trips/${tripId}/logistics?error=invalid`);
  }

  revalidateTripLogisticsPaths(tripId);
  redirect(successPath);
}

export async function saveTripLogisticsModeFormAction(formData: FormData) {
  "use server";

  const userId = await requireUser();
  const tripId = formString(formData.get("tripId"));
  const mode = formString(formData.get("mode"));

  if (!tripId) {
    redirect("/trips?error=invalid-trip");
  }

  const result = await saveTripLogisticsMode(userId, tripId, { mode });
  const successPath =
    mode === "TICKETED"
      ? `/trips/${tripId}/logistics?mode=ticketed&saved=1`
      : `/trips/${tripId}/planning?message=logistics-saved`;

  redirectAfterLogisticsResult(tripId, result, successPath);
}

export async function addTripTravelSegmentFormAction(formData: FormData) {
  "use server";

  const userId = await requireUser();
  const tripId = formString(formData.get("tripId"));
  const origin = formLocation(formData.get("originLocation"));
  const destination = formLocation(formData.get("destinationLocation"));

  if (!tripId) {
    redirect("/trips?error=invalid-trip");
  }

  const result = await addTripTravelSegment(userId, tripId, {
    mode: formString(formData.get("segmentMode")),
    originCity: origin.city || formString(formData.get("originCity")),
    originCountry: origin.country || formString(formData.get("originCountry")),
    destinationCity: destination.city || formString(formData.get("destinationCity")),
    destinationCountry:
      destination.country || formString(formData.get("destinationCountry")),
    departAt: formString(formData.get("departAt")),
    arriveAt: formString(formData.get("arriveAt")),
    carrier: formString(formData.get("carrier")),
    referenceCode: formString(formData.get("referenceCode")),
  });

  redirectAfterLogisticsResult(tripId, result);
}

export async function deleteTripTravelSegmentFormAction(formData: FormData) {
  "use server";

  const userId = await requireUser();
  const tripId = formString(formData.get("tripId"));
  const segmentId = formString(formData.get("segmentId"));

  if (!tripId || !segmentId) {
    redirect("/trips?error=invalid-trip");
  }

  const result = await deleteTripTravelSegment(userId, tripId, segmentId);

  redirectAfterLogisticsResult(
    tripId,
    result,
    `/trips/${tripId}/logistics?mode=ticketed&saved=1`,
  );
}

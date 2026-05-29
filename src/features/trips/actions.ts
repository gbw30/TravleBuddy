import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/authorization";
import { buildTripOwnerWhere } from "@/lib/authorization-rules";
import {
  createTripInputSchema,
  deriveTripStatusFromDetails,
  mergeTripPatchForValidation,
  patchTripInputSchema,
  updateTripInputSchema,
  type CreateTripInput,
  type ParsedCreateTripInput,
} from "./schemas";
import { getTripLocationTimeZone } from "./location-catalog";
import {
  toTripDto,
  tripWithDetailsSelect,
  type TripWithDetails,
} from "./queries";
import type { Prisma, UserTravelPreference } from "@/generated/prisma/client";

export type UpdateTripResult =
  | {
      status: "updated";
      trip: ReturnType<typeof toTripDto>;
    }
  | {
      status: "not_found" | "archived" | "invalid";
    };

export type DeleteTripResult = {
  status: "deleted" | "not_found" | "archived";
};

function hasOwn(input: unknown, key: string) {
  return typeof input === "object" && input !== null && key in input;
}

function destinationRouteSearchText(
  destinations: readonly { city: string; country: string }[],
) {
  if (destinations.length === 0) {
    return null;
  }

  return destinations
    .map((destination) => `${destination.city}, ${destination.country}`)
    .join(" -> ");
}

function destinationsForCreate(
  destinations: readonly { city: string; country: string }[] | null | undefined,
) {
  if (!destinations?.length) {
    return undefined;
  }

  return {
    create: destinations.map((destination, index) => ({
      city: destination.city,
      country: destination.country,
      sortOrder: index,
      timeZone: getTripLocationTimeZone(destination.city, destination.country),
    })),
  };
}

type ProfilePreferenceForTripCreate = UserTravelPreference | null;

function jsonStringArray(value: Prisma.JsonValue | null | undefined) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function preferenceForCreate(
  travelStyle: ParsedCreateTripInput["travelStyle"],
  profilePreference?: ProfilePreferenceForTripCreate,
) {
  if (profilePreference) {
    const create = {
      budgetLevel: profilePreference.budgetLevel ?? undefined,
      pace: travelStyle ?? profilePreference.pace ?? undefined,
      interests: profilePreference.interests,
      transportationModes: profilePreference.transportationModes,
      accommodationTypes: profilePreference.accommodationTypes,
      hotelPriority: profilePreference.hotelPriority ?? undefined,
      walkingToleranceKm: profilePreference.walkingToleranceKm ?? undefined,
      dietaryRestrictions: jsonStringArray(profilePreference.dietaryRestrictions),
      accessibilityNeeds: jsonStringArray(profilePreference.accessibilityNeeds),
      mustAvoid: jsonStringArray(profilePreference.mustAvoid),
      metadata: {
        customPreferences: jsonStringArray(profilePreference.customPreferences),
        source: "user_travel_preference",
      },
    } satisfies Prisma.TripPreferenceCreateWithoutTripInput;

    return {
      create,
    };
  }

  return travelStyle
    ? {
        create: {
          pace: travelStyle,
        },
      }
    : undefined;
}

function getTripDestinations(trip: TripWithDetails) {
  return trip.destinations.map((destination) => ({
    city: destination.city,
    country: destination.country,
  }));
}

async function refreshTripStatus(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  trip: TripWithDetails,
) {
  const nextStatus = deriveTripStatusFromDetails(trip);

  if (nextStatus === trip.status) {
    return trip;
  }

  return tx.trip.update({
    where: {
      id: trip.id,
    },
    data: {
      status: nextStatus,
    },
    select: tripWithDetailsSelect,
  });
}

export async function createTrip(userId: string, input: CreateTripInput) {
  const parsed = createTripInputSchema.parse(input);
  const profilePreference = parsed.useProfilePreferences
    ? await db.userTravelPreference.findUnique({
        where: {
          userId,
        },
      })
    : null;
  const destinations = parsed.destinations ?? [];
  const status =
    parsed.intent === "continue"
      ? deriveTripStatusFromDetails({
          startDate: parsed.startDate,
          endDate: parsed.endDate,
          budgetAmount: parsed.budgetAmount,
          budgetCurrency: parsed.budgetCurrency,
          destinations,
        })
      : "DRAFT";
  const trip = await db.trip.create({
    data: {
      userId,
      title: parsed.title,
      status,
      departureCity: parsed.departureCity ?? null,
      departureCountry: parsed.departureCountry ?? null,
      departureTimeZone: parsed.departureTimeZone ?? null,
      destinationSearchText: destinationRouteSearchText(destinations),
      startDate: parsed.startDate ?? null,
      endDate: parsed.endDate ?? null,
      budgetAmount: parsed.budgetAmount ?? null,
      budgetCurrency: parsed.budgetCurrency ?? null,
      destinations: destinationsForCreate(destinations),
      preference: preferenceForCreate(parsed.travelStyle, profilePreference),
    },
    select: tripWithDetailsSelect,
  });

  return toTripDto(trip);
}

export async function updateTrip(
  userId: string,
  tripId: string,
  input: unknown,
): Promise<UpdateTripResult> {
  const parsed = patchTripInputSchema.parse(input);
  const hasDepartureFields =
    hasOwn(input, "departureCity") || hasOwn(input, "departureCountry");
  const hasDestinationsField = hasOwn(input, "destinations");
  const hasLegacyDestinationFields =
    hasOwn(input, "destinationCity") || hasOwn(input, "destinationCountry");
  const hasDestinationFields =
    hasDestinationsField || hasLegacyDestinationFields;
  const hasDateFields = hasOwn(input, "startDate") || hasOwn(input, "endDate");
  const hasBudgetFields =
    hasOwn(input, "budgetAmount") || hasOwn(input, "budgetCurrency");
  const hasTravelStyleField = hasOwn(input, "travelStyle");

  // Keep ownership verification, related row edits, and status derivation atomic.
  const trip = await db.$transaction(async (tx) => {
    const existingTrip = await tx.trip.findFirst({
      where: buildTripOwnerWhere(userId, tripId),
      select: tripWithDetailsSelect,
    });

    if (!existingTrip) {
      return {
        status: "not_found" as const,
      };
    }

    if (existingTrip.status === "ARCHIVED") {
      return {
        status: "archived" as const,
      };
    }

    let merged;

    try {
      merged = mergeTripPatchForValidation(
        {
          title: existingTrip.title,
          departureCity: existingTrip.departureCity ?? null,
          departureCountry: existingTrip.departureCountry ?? null,
          departureTimeZone: existingTrip.departureTimeZone ?? null,
          destinations: getTripDestinations(existingTrip),
          destinationCity: existingTrip.destinations[0]?.city ?? null,
          destinationCountry: existingTrip.destinations[0]?.country ?? null,
          startDate: existingTrip.startDate,
          endDate: existingTrip.endDate,
          budgetAmount: existingTrip.budgetAmount
            ? Number(existingTrip.budgetAmount.toString())
            : null,
          budgetCurrency: existingTrip.budgetCurrency as
            | "USD"
            | "EUR"
            | null,
          travelStyle: existingTrip.preference?.pace ?? null,
        },
        parsed,
      );
    } catch {
      return {
        status: "invalid" as const,
      };
    }

    const nextDestinations = hasDestinationsField
      ? (parsed.destinations ?? [])
      : hasLegacyDestinationFields
        ? merged.destinationCity && merged.destinationCountry
          ? [
              {
                city: merged.destinationCity,
                country: merged.destinationCountry,
              },
            ]
          : []
        : getTripDestinations(existingTrip);
    const nextDepartureTimeZone =
      merged.departureCity && merged.departureCountry
        ? getTripLocationTimeZone(merged.departureCity, merged.departureCountry)
        : null;

    await tx.trip.update({
      where: {
        id: tripId,
      },
      data: {
        title: parsed.title ?? undefined,
        departureCity: hasDepartureFields
          ? (merged.departureCity ?? null)
          : undefined,
        departureCountry: hasDepartureFields
          ? (merged.departureCountry ?? null)
          : undefined,
        departureTimeZone: hasDepartureFields
          ? nextDepartureTimeZone
          : undefined,
        destinationSearchText: hasDestinationFields
          ? destinationRouteSearchText(nextDestinations)
          : undefined,
        startDate: hasDateFields ? (merged.startDate ?? null) : undefined,
        endDate: hasDateFields ? (merged.endDate ?? null) : undefined,
        budgetAmount: hasBudgetFields ? (merged.budgetAmount ?? null) : undefined,
        budgetCurrency: hasBudgetFields
          ? (merged.budgetCurrency ?? null)
          : undefined,
      },
    });

    if (hasDestinationFields) {
      await tx.tripDestination.deleteMany({
        where: {
          tripId,
        },
      });

      for (const [index, destination] of nextDestinations.entries()) {
        await tx.tripDestination.create({
          data: {
            tripId,
            city: destination.city,
            country: destination.country,
            sortOrder: index,
            timeZone: getTripLocationTimeZone(
              destination.city,
              destination.country,
            ),
          },
        });
      }
    }

    if (hasTravelStyleField && parsed.travelStyle) {
      await tx.tripPreference.upsert({
        where: {
          tripId,
        },
        update: {
          pace: parsed.travelStyle,
        },
        create: {
          tripId,
          pace: parsed.travelStyle,
        },
      });
    }

    if (hasTravelStyleField && !parsed.travelStyle) {
      await tx.tripPreference.updateMany({
        where: {
          tripId,
        },
        data: {
          pace: null,
        },
      });
    }

    const updatedTrip = await tx.trip.findFirstOrThrow({
      where: buildTripOwnerWhere(userId, tripId),
      select: tripWithDetailsSelect,
    });

    return refreshTripStatus(tx, updatedTrip);
  });

  if (
    trip.status === "not_found" ||
    trip.status === "archived" ||
    trip.status === "invalid"
  ) {
    return trip;
  }

  return {
    status: "updated",
    trip: toTripDto(trip),
  };
}

export async function deleteTrip(
  userId: string,
  tripId: string,
): Promise<DeleteTripResult> {
  return db.$transaction(async (tx) => {
    const existingTrip = await tx.trip.findFirst({
      where: buildTripOwnerWhere(userId, tripId),
      select: {
        id: true,
        status: true,
      },
    });

    if (!existingTrip) {
      return {
        status: "not_found",
      };
    }

    if (existingTrip.status === "ARCHIVED") {
      return {
        status: "archived",
      };
    }

    await tx.trip.deleteMany({
      where: buildTripOwnerWhere(userId, tripId),
    });

    return {
      status: "deleted",
    };
  });
}

function formString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}

function getDestinationsFromFormData(formData: FormData) {
  const cities = formData.getAll("destinationCity");
  const countries = formData.getAll("destinationCountry");

  return cities
    .map((city, index) => ({
      city: formString(city),
      country: formString(countries[index] ?? null),
    }))
    .filter(
      (destination) =>
        destination.city.trim().length > 0 ||
        destination.country.trim().length > 0,
    );
}

function getTripDetailsInputFromFormData(formData: FormData) {
  const intent = formData.get("intent");
  const destinations = getDestinationsFromFormData(formData);
  const startDate = formData.get("startDate");
  const endDate = formData.get("endDate");
  const budgetAmount = formData.get("budgetAmount");
  const budgetCurrency = formData.get("budgetCurrency");
  const departureCity = formData.get("departureCity");
  const departureCountry = formData.get("departureCountry");
  const isDraftIntent = intent !== "continue";

  return {
    intent,
    title: formData.get("title"),
    departureCity:
      isDraftIntent && !(formString(departureCity).trim() && formString(departureCountry).trim())
        ? ""
        : departureCity,
    departureCountry:
      isDraftIntent && !(formString(departureCity).trim() && formString(departureCountry).trim())
        ? ""
        : departureCountry,
    destinations: isDraftIntent
      ? destinations.filter(
          (destination) =>
            destination.city.trim().length > 0 &&
            destination.country.trim().length > 0,
        )
      : destinations,
    startDate:
      isDraftIntent && !(formString(startDate).trim() && formString(endDate).trim())
        ? ""
        : startDate,
    endDate:
      isDraftIntent && !(formString(startDate).trim() && formString(endDate).trim())
        ? ""
        : endDate,
    budgetAmount:
      isDraftIntent &&
      !(formString(budgetAmount).trim() && formString(budgetCurrency).trim())
        ? ""
        : budgetAmount,
    budgetCurrency:
      isDraftIntent &&
      !(formString(budgetAmount).trim() && formString(budgetCurrency).trim())
        ? ""
        : budgetCurrency,
    travelStyle: formData.get("travelStyle"),
    useProfilePreferences: formData.get("useProfilePreferences"),
  };
}

export async function createTripFormAction(formData: FormData) {
  "use server";

  const userId = await requireUser();
  const parsed = createTripInputSchema.safeParse(
    getTripDetailsInputFromFormData(formData),
  );

  if (!parsed.success) {
    redirect("/trips/new?error=invalid");
  }

  const trip = await createTrip(userId, parsed.data);

  revalidatePath("/dashboard");
  revalidatePath("/trips");
  redirect(
    parsed.data.intent === "continue"
      ? `/trips/${trip.id}/preferences`
      : `/trips/${trip.id}`,
  );
}

export async function updateTripSettingsFormAction(formData: FormData) {
  "use server";

  const userId = await requireUser();
  const tripId = formData.get("tripId");

  if (typeof tripId !== "string" || !tripId) {
    redirect("/trips?error=invalid-trip");
  }

  const input = getTripDetailsInputFromFormData(formData);
  const parsed = updateTripInputSchema.safeParse(input);

  if (!parsed.success) {
    redirect(`/trips/${tripId}/settings?error=invalid`);
  }

  const result = await updateTrip(userId, tripId, input);

  if (result.status === "not_found") {
    redirect("/trips?error=not-found");
  }

  if (result.status === "archived") {
    redirect(`/trips/${tripId}/settings?error=archived`);
  }

  if (result.status === "invalid") {
    redirect(`/trips/${tripId}/settings?error=invalid`);
  }

  revalidatePath("/dashboard");
  revalidatePath("/trips");
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/settings`);
  redirect(`/trips/${tripId}`);
}

export async function deleteTripFormAction(formData: FormData) {
  "use server";

  const userId = await requireUser();
  const tripId = formData.get("tripId");

  if (typeof tripId !== "string" || !tripId) {
    redirect("/trips?error=invalid-trip");
  }

  if (formData.get("confirmDelete") !== "on") {
    redirect(`/trips/${tripId}/settings?error=confirm-delete`);
  }

  const result = await deleteTrip(userId, tripId);

  if (result.status === "archived") {
    redirect(`/trips/${tripId}/settings?error=archived`);
  }

  revalidatePath("/dashboard");
  revalidatePath("/trips");
  redirect("/trips");
}

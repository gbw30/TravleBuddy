import { db } from "@/lib/db";
import { buildTripOwnerWhere } from "@/lib/authorization-rules";
import {
  createTripInputSchema,
  deriveTripStatusFromDetails,
  mergeTripPatchForValidation,
  patchTripInputSchema,
  type CreateTripInput,
  type ParsedCreateTripInput,
} from "./schemas";
import { getTripLocationTimeZone } from "./location-catalog";
import {
  toTripDto,
  tripWithDetailsSelect,
  type TripWithDetails,
} from "./queries";
import { rebuildItineraryDraftForTripTx } from "@/features/itinerary/builder";
import type { Prisma, UserTravelPreference } from "@/generated/prisma/client";
import type {
  PlanningMutationControl,
  StalePlanningMutationResult,
} from "@/features/planning/types";
import {
  executePlanningMutation,
  finalizePlanningMutationTx,
  getPlanningMutationReplayTx,
} from "@/features/planning/mutation";
import { createPlanningOperationContext } from "@/features/planning/telemetry";
import { createExplicitPreferenceProfileVersionTx } from "@/features/adaptation/persistence";

export type UpdateTripResult =
  | {
      status: "updated";
      trip: ReturnType<typeof toTripDto>;
      revision: number;
    }
  | {
      status: "not_found" | "archived" | "invalid";
    }
  | StalePlanningMutationResult;

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
      dietaryRestrictions: jsonStringArray(
        profilePreference.dietaryRestrictions,
      ),
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

function destinationsAreEqual(
  left: readonly { city: string; country: string }[],
  right: readonly { city: string; country: string }[],
) {
  return (
    left.length === right.length &&
    left.every(
      (destination, index) =>
        destination.city === right[index]?.city &&
        destination.country === right[index]?.country,
    )
  );
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
  const preference = preferenceForCreate(parsed.travelStyle, profilePreference);
  const status =
    parsed.intent === "continue"
      ? deriveTripStatusFromDetails({
          startDate: parsed.startDate,
          endDate: parsed.endDate,
          budgetAmount: parsed.budgetAmount,
          budgetCurrency: parsed.budgetCurrency,
          travelStyle: parsed.travelStyle,
          destinations,
        })
      : "DRAFT";
  const trip = await db.$transaction(async (tx) => {
    const created = await tx.trip.create({
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
        preference,
      },
      select: tripWithDetailsSelect,
    });

    if (preference) {
      await createExplicitPreferenceProfileVersionTx(tx, {
        tripId: created.id,
        projection: {
          interests: profilePreference?.interests ?? [],
          pace: parsed.travelStyle ?? profilePreference?.pace ?? null,
        },
      });
    }

    return created;
  });

  return toTripDto(trip);
}

export async function updateTrip(
  userId: string,
  tripId: string,
  input: unknown,
  control?: PlanningMutationControl,
): Promise<UpdateTripResult> {
  const operation = createPlanningOperationContext(
    tripId,
    control?.operationId,
  );
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
  return executePlanningMutation({
    userId,
    tripId,
    control,
    transaction: async (tx) => {
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
      const replay = await getPlanningMutationReplayTx<UpdateTripResult>(
        tx,
        tripId,
        control,
      );

      if (replay) return replay;
      const parsed = patchTripInputSchema.parse(input);

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
            budgetCurrency: existingTrip.budgetCurrency as "USD" | "EUR" | null,
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
          ? getTripLocationTimeZone(
              merged.departureCity,
              merged.departureCountry,
            )
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
          budgetAmount: hasBudgetFields
            ? (merged.budgetAmount ?? null)
            : undefined,
          budgetCurrency: hasBudgetFields
            ? (merged.budgetCurrency ?? null)
            : undefined,
        },
      });

      const destinationsChanged =
        hasDestinationFields &&
        !destinationsAreEqual(
          getTripDestinations(existingTrip),
          nextDestinations,
        );
      const travelStyleChanged =
        hasTravelStyleField &&
        (existingTrip.preference?.pace ?? null) !==
          (parsed.travelStyle ?? null);

      if (destinationsChanged) {
        await tx.placeSuggestion.updateMany({
          where: {
            tripId,
            destinationId: {
              not: null,
            },
          },
          data: {
            destinationId: null,
          },
        });

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

      if (travelStyleChanged) {
        const preferenceProjection = await tx.tripPreference.findUnique({
          where: {
            tripId,
          },
          select: {
            interests: true,
            pace: true,
            updatedAt: true,
          },
        });

        if (preferenceProjection) {
          await createExplicitPreferenceProfileVersionTx(tx, {
            tripId,
            projection: preferenceProjection,
          });
        }
      }

      const updatedTrip = await tx.trip.findFirstOrThrow({
        where: buildTripOwnerWhere(userId, tripId),
        select: tripWithDetailsSelect,
      });
      const tripWithStatus = await refreshTripStatus(tx, updatedTrip);
      const itineraryInputsChanged =
        destinationsChanged ||
        hasDateFields ||
        hasBudgetFields ||
        travelStyleChanged;

      if (tripWithStatus.status === "PLANNING" && itineraryInputsChanged) {
        await rebuildItineraryDraftForTripTx(tx, tripId, operation);
      }
      return finalizePlanningMutationTx(tx, {
        userId,
        tripId,
        kind: "trip_settings_update",
        control,
        result: {
          status: "updated" as const,
          trip: toTripDto(tripWithStatus),
        },
      });
    },
  });
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

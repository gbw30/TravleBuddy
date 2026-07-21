import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authorization";
import { buildTripOwnerWhere } from "@/lib/authorization-rules";
import {
  getPreferenceInputFromFormData,
  preferenceInputSchema,
  type PreferenceInput,
  type ParsedPreferenceInput,
} from "./schemas";
import {
  getPreferenceMissingRequirements,
  preferenceSelect,
  toPreferenceDto,
} from "./queries";
import type { TripPreferenceDto } from "./types";
import { userTravelPreferenceDataFromTripPreference } from "@/features/profile/preferences";
import { rebuildItineraryDraftForTripTx } from "@/features/itinerary/builder";
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

export type SaveTripPreferenceResult =
  | {
      status: "saved";
      operation: "created" | "updated";
      preference: TripPreferenceDto;
      revision: number;
    }
  | {
      status: "not_found" | "archived" | "invalid";
    }
  | {
      status: "not_ready";
      missingRequirements: string[];
    }
  | StalePlanningMutationResult;

function preferencePersistenceData(input: ParsedPreferenceInput) {
  return {
    budgetLevel: input.budgetLevel,
    pace: input.pace,
    interests: input.interests,
    transportationModes: input.transportationModes,
    accommodationTypes: input.accommodationTypes,
    hotelPriority: input.hotelPriority,
    walkingToleranceKm: input.walkingToleranceKm,
    dietaryRestrictions: input.dietaryRestrictions,
    accessibilityNeeds: input.accessibilityNeeds,
    mustAvoid: input.mustAvoid,
    customNotes: input.customNotes,
    metadata: {
      customPreferences: input.customPreferences,
    },
  };
}

function planningEventMetadata(
  operation: "created" | "updated",
  input: ParsedPreferenceInput,
) {
  return {
    operation,
    interestCount: input.interests.length,
    transportationModeCount: input.transportationModes.length,
    accommodationTypeCount: input.accommodationTypes.length,
    hasDietaryRestrictions: input.dietaryRestrictions.length > 0,
    hasAccessibilityNeeds: input.accessibilityNeeds.length > 0,
    hasMustAvoid: input.mustAvoid.length > 0,
    customPreferenceCount: input.customPreferences.length,
  };
}

function preferenceRedirectPath(
  tripId: string,
  returnTo: FormDataEntryValue | null,
  query: string,
) {
  if (returnTo === "settings") {
    return `/trips/${tripId}/settings?tab=preferences&${query}`;
  }

  return `/trips/${tripId}/preferences?${query}`;
}

function preferenceSuccessRedirectPath(
  tripId: string,
  returnTo: FormDataEntryValue | null,
) {
  if (returnTo === "settings") {
    return preferenceRedirectPath(tripId, returnTo, "saved=1");
  }

  return `/trips/${tripId}/logistics?saved=1`;
}

export async function saveTripPreference(
  userId: string,
  tripId: string,
  input: PreferenceInput,
  control?: PlanningMutationControl,
): Promise<SaveTripPreferenceResult> {
  const planningOperation = createPlanningOperationContext(
    tripId,
    control?.operationId,
  );

  return executePlanningMutation({
    userId,
    tripId,
    control,
    transaction: async (tx) => {
      const trip = await tx.trip.findFirst({
        where: buildTripOwnerWhere(userId, tripId),
        select: {
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
            select: {
              pace: true,
            },
          },
        },
      });

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
      const replay =
        await getPlanningMutationReplayTx<SaveTripPreferenceResult>(
          tx,
          tripId,
          control,
        );

      if (replay) return replay;
      const parsed = preferenceInputSchema.safeParse(input);

      if (!parsed.success) {
        return {
          status: "invalid" as const,
        };
      }

      const missingRequirements = getPreferenceMissingRequirements(trip);

      if (missingRequirements.length > 0) {
        return {
          status: "not_ready",
          missingRequirements,
        };
      }

      const existingPreference = await tx.tripPreference.findUnique({
        where: {
          tripId,
        },
        select: {
          id: true,
        },
      });
      const operation = existingPreference ? "updated" : "created";
      const data = preferencePersistenceData(parsed.data);

      if (parsed.data.budgetAmount !== null) {
        await tx.trip.update({
          where: {
            id: tripId,
          },
          data: {
            budgetAmount: parsed.data.budgetAmount,
          },
        });
      }

      const preference = await tx.tripPreference.upsert({
        where: {
          tripId,
        },
        update: data,
        create: {
          tripId,
          ...data,
        },
        select: preferenceSelect,
      });
      const userTravelPreferenceData =
        userTravelPreferenceDataFromTripPreference(tripId, parsed.data);

      await tx.userTravelPreference.upsert({
        where: {
          userId,
        },
        update: userTravelPreferenceData,
        create: {
          userId,
          ...userTravelPreferenceData,
        },
      });

      await tx.planningEvent.create({
        data: {
          tripId,
          actor: "SYSTEM",
          type: "SYSTEM_NOTE",
          title:
            operation === "created"
              ? "Preference profile created"
              : "Preference profile updated",
          message:
            "Trip preferences were saved and are available for future recommendation planning.",
          visibleToUser: true,
          metadata: planningEventMetadata(operation, parsed.data),
        },
      });
      if ((trip.preference?.pace ?? null) !== parsed.data.pace) {
        await rebuildItineraryDraftForTripTx(tx, tripId, planningOperation);
      }

      return finalizePlanningMutationTx(tx, {
        userId,
        tripId,
        kind: "preference_save",
        control,
        result: {
          status: "saved" as const,
          operation,
          preference: toPreferenceDto(preference),
        },
      });
    },
  });
}

export async function saveTripPreferenceFormAction(formData: FormData) {
  "use server";

  const userId = await requireUser();
  const tripId = formData.get("tripId");
  const returnTo = formData.get("returnTo");

  if (typeof tripId !== "string" || !tripId) {
    redirect("/trips?error=invalid-trip");
  }

  const result = await saveTripPreference(
    userId,
    tripId,
    getPreferenceInputFromFormData(formData),
  );

  if (result.status === "not_found") {
    redirect("/trips?error=not-found");
  }

  if (result.status === "archived") {
    redirect(preferenceRedirectPath(tripId, returnTo, "error=archived"));
  }

  if (result.status === "not_ready") {
    redirect(preferenceRedirectPath(tripId, returnTo, "error=not-ready"));
  }

  if (result.status === "stale_revision") {
    redirect(preferenceRedirectPath(tripId, returnTo, "error=stale"));
  }

  if (result.status === "invalid") {
    redirect(preferenceRedirectPath(tripId, returnTo, "error=invalid"));
  }

  revalidatePath("/dashboard");
  revalidatePath("/profile");
  revalidatePath("/trips");
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/settings`);
  revalidatePath(`/trips/${tripId}/preferences`);
  revalidatePath(`/trips/${tripId}/logistics`);
  revalidatePath(`/trips/${tripId}/planning`);
  revalidatePath(`/trips/${tripId}/itinerary`);
  redirect(preferenceSuccessRedirectPath(tripId, returnTo));
}

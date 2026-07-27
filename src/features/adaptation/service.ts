import { z } from "zod";
import type { GenerationJobStatus } from "@/generated/prisma/client";
import { buildTripOwnerWhere } from "@/lib/authorization-rules";
import type {
  PlanningMutationControl,
  StalePlanningMutationResult,
} from "@/features/planning/types";
import {
  executePlanningMutation,
  finalizePlanningMutationTx,
  getPlanningMutationReplayTx,
} from "@/features/planning/mutation";
import { ensureActivePreferenceProfileVersionTx } from "./persistence";
import {
  itineraryItemFeedbackInputSchema,
  type ItineraryItemFeedbackInput,
} from "./schemas";

const operationIdSchema = z.string().trim().uuid();

export type CaptureItineraryItemFeedbackResult =
  | {
      status: "queued";
      feedbackId: string;
      jobId: string;
      jobStatus: GenerationJobStatus;
      revision: number;
    }
  | {
      status: "not_found" | "item_not_found" | "archived" | "invalid";
    }
  | StalePlanningMutationResult;

export async function captureItineraryItemFeedback(
  userId: string,
  tripId: string,
  itemId: string,
  input: ItineraryItemFeedbackInput,
  control?: PlanningMutationControl,
): Promise<CaptureItineraryItemFeedbackResult> {
  const parsedInput = itineraryItemFeedbackInputSchema.safeParse(input);
  const parsedOperationId = operationIdSchema.safeParse(control?.operationId);

  if (
    !parsedInput.success ||
    !parsedOperationId.success ||
    control?.expectedRevision === undefined
  ) {
    return { status: "invalid" };
  }

  return executePlanningMutation({
    userId,
    tripId,
    control,
    transaction: async (tx) => {
      const trip = await tx.trip.findFirst({
        where: buildTripOwnerWhere(userId, tripId),
        select: {
          id: true,
          status: true,
          tripVersion: true,
          activePreferenceProfileVersionId: true,
          activeItineraryVersionId: true,
          preference: {
            select: {
              id: true,
            },
          },
        },
      });

      if (!trip) {
        return { status: "not_found" as const };
      }
      if (trip.status === "ARCHIVED") {
        return { status: "archived" as const };
      }

      const replay =
        await getPlanningMutationReplayTx<CaptureItineraryItemFeedbackResult>(
          tx,
          tripId,
          control,
        );

      if (replay) return replay;
      if (!trip.activeItineraryVersionId) {
        return { status: "item_not_found" as const };
      }

      const item = await tx.itineraryItem.findFirst({
        where: {
          id: itemId,
          tripId,
          day: {
            itineraryVersionId: trip.activeItineraryVersionId,
          },
        },
        select: {
          id: true,
          title: true,
          placeSuggestionId: true,
          dayId: true,
          day: {
            select: {
              dayNumber: true,
              itineraryVersionId: true,
            },
          },
        },
      });

      if (!item) {
        return { status: "item_not_found" as const };
      }

      const preferenceVersion = await ensureActivePreferenceProfileVersionTx(
        tx,
        {
          tripId,
          activePreferenceProfileVersionId:
            trip.activePreferenceProfileVersionId,
        },
      );
      const capturedTripVersion = trip.tripVersion + 1;
      const feedback = await tx.planningFeedback.create({
        data: {
          tripId,
          eventKey: parsedOperationId.data,
          userId,
          targetType: "ITINERARY_ITEM",
          targetId: item.id,
          source: "USER",
          action: parsedInput.data.action,
          reason: parsedInput.data.reason,
          userNote: parsedInput.data.userNote ?? null,
          tripPreferenceId: trip.preference?.id ?? null,
          placeSuggestionId: item.placeSuggestionId,
          itineraryDayId: item.dayId,
          itineraryItemId: item.id,
          capturedTripVersion,
          capturedPreferenceProfileVersionId: preferenceVersion.id,
          capturedItineraryVersionId: item.day.itineraryVersionId,
          processingStatus: "QUEUED",
          metadata: {
            itemTitle: item.title,
            affectedDay: item.day.dayNumber,
          },
        },
        select: {
          id: true,
        },
      });
      const idempotencyKey = `feedback:${parsedOperationId.data}`;
      const job = await tx.generationJob.create({
        data: {
          tripId,
          feedbackId: feedback.id,
          type: "PROCESS_FEEDBACK_EVENT",
          status: "PENDING",
          idempotencyKey,
          tripVersion: capturedTripVersion,
          preferenceProfileVersionId: preferenceVersion.id,
          parentItineraryVersionId: item.day.itineraryVersionId,
          payload: {
            feedbackId: feedback.id,
            operationId: parsedOperationId.data,
            tripVersion: capturedTripVersion,
            preferenceProfileVersionId: preferenceVersion.id,
            parentItineraryVersionId: item.day.itineraryVersionId,
          },
          progress: 0,
          progressMessage: "Feedback received.",
          maxAttempts: 3,
        },
        select: {
          id: true,
          status: true,
        },
      });

      await tx.jobEvent.create({
        data: {
          jobId: job.id,
          type: "RECEIVED",
          progress: 0,
          message: "Feedback received.",
        },
      });
      await tx.planningEvent.create({
        data: {
          tripId,
          actor: "USER",
          type: "USER_FEEDBACK",
          title: "Itinerary feedback received",
          message: `${item.title} was marked for an adaptive replacement.`,
          metadata: {
            feedbackId: feedback.id,
            jobId: job.id,
            action: parsedInput.data.action,
            reason: parsedInput.data.reason,
            affectedDay: item.day.dayNumber,
          },
        },
      });

      return finalizePlanningMutationTx(tx, {
        userId,
        tripId,
        kind: "itinerary_item_feedback",
        control,
        result: {
          status: "queued" as const,
          feedbackId: feedback.id,
          jobId: job.id,
          jobStatus: job.status,
        },
      });
    },
  });
}

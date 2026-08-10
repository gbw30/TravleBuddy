import { z } from "zod";
import type { GenerationJobStatus } from "@/generated/prisma/client";
import { buildTripOwnerWhere } from "@/lib/authorization-rules";
import { refreshItineraryConflictsForTripTx } from "@/features/itinerary/conflict-engine";
import type {
  PlanningMutationControl,
  StalePlanningMutationResult,
} from "@/features/planning/types";
import {
  executePlanningMutation,
  finalizePlanningMutationTx,
  getPlanningMutationReplayTx,
  StalePlanningRevisionError,
} from "@/features/planning/mutation";
import {
  ensureActivePreferenceProfileVersionTx,
  persistPreferencePolicyResultTx,
} from "./persistence";
import { applyFeedbackPreferencePolicy } from "./preferences";
import {
  adaptiveItinerarySnapshotSelect,
  materializeAdaptiveItineraryVersionTx,
} from "./version-copy";
import {
  itineraryItemFeedbackInputSchema,
  type ItineraryItemFeedbackInput,
} from "./schemas";

const operationIdSchema = z.string().trim().uuid();
const lockImmediateAdaptiveCommandSql = `
SELECT planning_revision AS "planningRevision"
FROM trips
WHERE id = $1
FOR UPDATE
`;

export type CaptureItineraryItemFeedbackResult =
  | {
      status: "removed";
      feedbackId: string;
      revision: number;
      affectedDay: number;
      itineraryVersion: {
        id: string;
        version: number;
      };
      preferenceDelta: unknown;
      preferenceExplanation: string;
    }
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
    transactionOptions:
      parsedInput.data.action === "REJECT"
        ? {
            maxWait: 5_000,
            timeout: 15_000,
          }
        : undefined,
    transaction: async (tx) => {
      const trip = await tx.trip.findFirst({
        where: buildTripOwnerWhere(userId, tripId),
        select: {
          id: true,
          status: true,
          tripVersion: true,
          activePreferenceProfileVersionId: true,
          activeItineraryVersionId: true,
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
      if (parsedInput.data.action === "REJECT") {
        const [lockedTrip] = await tx.$queryRawUnsafe<
          Array<{ planningRevision: number }>
        >(lockImmediateAdaptiveCommandSql, tripId);

        if (
          !lockedTrip ||
          lockedTrip.planningRevision !== control.expectedRevision
        ) {
          throw new StalePlanningRevisionError();
        }
      }
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

      if (parsedInput.data.action === "REJECT") {
        const sourceItinerary = await tx.itineraryVersion.findFirst({
          where: {
            id: item.day.itineraryVersionId,
            tripId,
          },
          select: adaptiveItinerarySnapshotSelect,
        });

        if (!sourceItinerary) {
          return { status: "item_not_found" as const };
        }

        const observedAt = new Date();
        const preferencePolicy = applyFeedbackPreferencePolicy(
          preferenceVersion.snapshot,
          {
            reason: parsedInput.data.reason,
            observedAt: observedAt.toISOString(),
          },
        );
        const feedback = await tx.planningFeedback.create({
          data: {
            tripId,
            eventKey: parsedOperationId.data,
            userId,
            targetType: "ITINERARY_ITEM",
            targetId: item.id,
            source: "USER",
            action: "REJECT",
            reason: parsedInput.data.reason,
            userNote: parsedInput.data.userNote ?? null,
            itineraryItemId: item.id,
            capturedTripVersion,
            capturedPreferenceProfileVersionId: preferenceVersion.id,
            capturedItineraryVersionId: item.day.itineraryVersionId,
            processingStatus: "PROCESSED",
            processedAt: observedAt,
            createdAt: observedAt,
            metadata: {
              source: "immediate_remove",
              itemTitle: item.title,
              affectedDay: item.day.dayNumber,
            },
          },
          select: {
            id: true,
          },
        });
        const activatedPreference = await persistPreferencePolicyResultTx(tx, {
          tripId,
          parent: {
            id: preferenceVersion.id,
            version: preferenceVersion.version,
          },
          sourceFeedbackId: feedback.id,
          policy: preferencePolicy,
        });
        const successor = await materializeAdaptiveItineraryVersionTx(tx, {
          tripId,
          source: sourceItinerary,
          preferenceProfileVersionId: activatedPreference.id,
          targetItemId: item.id,
          feedbackId: feedback.id,
          preferenceExplanation: preferencePolicy.explanation,
          change: {
            kind: "REMOVE",
          },
        });
        const remainingSuggestionReferences = item.placeSuggestionId
          ? sourceItinerary.days
              .flatMap((day) => day.items)
              .filter(
                (sourceItem) =>
                  sourceItem.id !== item.id &&
                  sourceItem.placeSuggestionId === item.placeSuggestionId,
              ).length
          : 0;

        if (item.placeSuggestionId && remainingSuggestionReferences === 0) {
          await tx.placeSuggestion.updateMany({
            where: {
              id: item.placeSuggestionId,
              tripId,
            },
            data: {
              status: "REJECTED",
            },
          });
        }

        const conflictTrip = await tx.trip.findUniqueOrThrow({
          where: {
            id: tripId,
          },
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
                id: true,
              },
            },
            preference: {
              select: {
                pace: true,
              },
            },
          },
        });

        await refreshItineraryConflictsForTripTx(tx, conflictTrip, {
          itineraryVersionId: successor.id,
        });
        const superseded = await tx.itineraryVersion.updateMany({
          where: {
            id: sourceItinerary.id,
            tripId,
            status: "ACTIVE",
          },
          data: {
            status: "SUPERSEDED",
          },
        });

        if (superseded.count !== 1) {
          throw new StalePlanningRevisionError();
        }

        await tx.itineraryVersion.update({
          where: {
            id: successor.id,
          },
          data: {
            status: "ACTIVE",
            activatedAt: observedAt,
          },
        });
        await tx.trip.update({
          where: {
            id: tripId,
          },
          data: {
            activePreferenceProfileVersionId: activatedPreference.id,
            activeItineraryVersionId: successor.id,
          },
        });
        await tx.planningEvent.create({
          data: {
            tripId,
            actor: "USER",
            type: "USER_FEEDBACK",
            title: "Itinerary item removed",
            message: `${item.title} was removed from day ${item.day.dayNumber}.`,
            metadata: {
              source: "immediate_remove",
              feedbackId: feedback.id,
              affectedDay: item.day.dayNumber,
              itineraryVersion: successor.version,
              preferenceDelta: preferencePolicy.delta,
            },
          },
        });

        return finalizePlanningMutationTx(tx, {
          userId,
          tripId,
          kind: "itinerary_item_feedback",
          control,
          result: {
            status: "removed" as const,
            feedbackId: feedback.id,
            affectedDay: successor.affectedDay,
            itineraryVersion: {
              id: successor.id,
              version: successor.version,
            },
            preferenceDelta: preferencePolicy.delta,
            preferenceExplanation: preferencePolicy.explanation,
          },
        });
      }

      // The feedback consistency constraint permits exactly one typed target.
      // The worker derives the item's day and place suggestion from this link.
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

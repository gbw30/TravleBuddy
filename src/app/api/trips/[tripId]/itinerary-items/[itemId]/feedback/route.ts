import {
  UnauthorizedError,
  assertAuthenticatedApiUser,
} from "@/lib/authorization";
import { itineraryItemFeedbackInputSchema } from "@/features/adaptation/schemas";
import { captureItineraryItemFeedback } from "@/features/adaptation/service";
import {
  bindPlanningMutationControl,
  parsePlanningMutationControl,
} from "@/features/planning/request-control";
import {
  invalidPlanningMutationControlResponse,
  planningMutationConflictResponse,
  readPlanningMutationJson,
} from "@/app/api/trips/planning-mutation";

type FeedbackRouteContext = {
  params: Promise<{
    tripId: string;
    itemId: string;
  }>;
};

function apiError(message: string, status: number, details?: unknown) {
  return Response.json(
    details ? { error: message, details } : { error: message },
    { status },
  );
}

function feedbackPayload(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }

  const record = body as Record<string, unknown>;
  return {
    action: record.action,
    reason: record.reason,
    userNote: record.userNote,
  };
}

export async function POST(request: Request, context: FeedbackRouteContext) {
  try {
    const userId = await assertAuthenticatedApiUser();
    const { tripId, itemId } = await context.params;
    const body = await readPlanningMutationJson(request);
    const parsedControl = parsePlanningMutationControl(body);

    if (!parsedControl.success) {
      return invalidPlanningMutationControlResponse(parsedControl.issues);
    }

    const parsed = itineraryItemFeedbackInputSchema.safeParse(
      feedbackPayload(body),
    );
    if (!parsed.success) {
      return apiError("Invalid itinerary feedback payload.", 400, {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const control = bindPlanningMutationControl(
      parsedControl.data,
      "itinerary_item_feedback",
      {
        itemId,
        ...parsed.data,
      },
    );
    const result = await captureItineraryItemFeedback(
      userId,
      tripId,
      itemId,
      parsed.data,
      control,
    );

    switch (result.status) {
      case "queued":
        return Response.json(
          {
            feedbackId: result.feedbackId,
            jobId: result.jobId,
            revision: result.revision,
            status: result.jobStatus,
          },
          { status: 202 },
        );
      case "stale_revision":
        return Response.json(result, { status: 409 });
      case "not_found":
      case "item_not_found":
        return apiError("Itinerary item not found.", 404);
      case "archived":
        return apiError(
          "Archived trips cannot accept itinerary feedback.",
          409,
        );
      case "invalid":
        return apiError("Itinerary feedback could not be queued.", 422);
      default: {
        const _exhaustive: never = result;
        return _exhaustive;
      }
    }
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return apiError("Unauthorized", 401);
    }

    const conflict = planningMutationConflictResponse(error);
    if (conflict) {
      return conflict;
    }

    return apiError("Unable to record itinerary feedback.", 500);
  }
}

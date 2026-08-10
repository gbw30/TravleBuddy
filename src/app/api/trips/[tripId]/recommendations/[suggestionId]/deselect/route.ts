import {
  UnauthorizedError,
  assertAuthenticatedApiUser,
} from "@/lib/authorization";
import { deselectRecommendation } from "@/features/recommendations/service";
import {
  bindPlanningMutationControl,
  parsePlanningMutationControl,
} from "@/features/planning/request-control";
import {
  invalidPlanningMutationControlResponse,
  planningMutationConflictResponse,
  readPlanningMutationJson,
} from "@/app/api/trips/planning-mutation";

type DeselectRouteContext = {
  params: Promise<{
    tripId: string;
    suggestionId: string;
  }>;
};

function apiError(message: string, status: number, details?: unknown) {
  return Response.json(
    details ? { error: message, details } : { error: message },
    { status },
  );
}

function accessErrorResponse(
  result:
    | { status: "not_found" | "suggestion_not_found" | "archived" }
    | { status: "not_ready"; missingRequirements: string[] },
) {
  switch (result.status) {
    case "not_found":
    case "suggestion_not_found":
      return apiError("Suggestion not found.", 404);
    case "archived":
      return apiError("Archived trips cannot remove selected places.", 409);
    case "not_ready":
      return apiError("Trip is not ready for recommendations.", 409, {
        missingRequirements: result.missingRequirements,
      });
    default: {
      const _exhaustive: never = result;
      return _exhaustive;
    }
  }
}

export async function POST(request: Request, context: DeselectRouteContext) {
  try {
    const userId = await assertAuthenticatedApiUser();
    const { tripId, suggestionId } = await context.params;
    const parsedControl = parsePlanningMutationControl(
      await readPlanningMutationJson(request),
    );

    if (!parsedControl.success) {
      return invalidPlanningMutationControlResponse(parsedControl.issues);
    }

    const input = { suggestionId };
    const control = bindPlanningMutationControl(
      parsedControl.data,
      "recommendation_deselect",
      input,
    );
    const result = await deselectRecommendation(
      userId,
      tripId,
      input,
      control,
    );

    if (result.status === "stale_revision") {
      return Response.json(result, { status: 409 });
    }
    if (result.status !== "deselected") {
      return accessErrorResponse(result);
    }

    return Response.json({ deselected: true, revision: result.revision });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return apiError("Unauthorized", 401);
    }

    const conflict = planningMutationConflictResponse(error);
    if (conflict) return conflict;

    return apiError("Unable to remove selected place.", 500);
  }
}

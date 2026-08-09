import {
  UnauthorizedError,
  assertAuthenticatedApiUser,
} from "@/lib/authorization";
import { selectRecommendation } from "@/features/recommendations/service";
import {
  bindPlanningMutationControl,
  parsePlanningMutationControl,
} from "@/features/planning/request-control";
import {
  invalidPlanningMutationControlResponse,
  planningMutationConflictResponse,
  readPlanningMutationJson,
} from "@/app/api/trips/planning-mutation";

type SelectRouteContext = {
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
    | {
        status:
          | "not_found"
          | "suggestion_not_found"
          | "archived"
          | "invalid_context";
      }
    | { status: "not_ready"; missingRequirements: string[] },
) {
  switch (result.status) {
    case "not_found":
    case "suggestion_not_found":
      return apiError("Suggestion not found.", 404);
    case "archived":
      return apiError("Archived trips cannot select recommendations.", 409);
    case "not_ready":
      return apiError("Trip is not ready for recommendations.", 409, {
        missingRequirements: result.missingRequirements,
      });
    case "invalid_context":
      return apiError(
        "Suggestion does not match a valid trip day and destination.",
        422,
      );
    default: {
      const _exhaustive: never = result;
      return _exhaustive;
    }
  }
}

export async function POST(request: Request, context: SelectRouteContext) {
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
      "recommendation_select",
      input,
    );
    const result = await selectRecommendation(userId, tripId, input, control);

    if (result.status === "stale_revision") {
      return Response.json(result, { status: 409 });
    }
    if (result.status !== "selected") {
      return accessErrorResponse(result);
    }
    if (!("revision" in result)) {
      return apiError("Unable to select recommendation.", 500);
    }

    return Response.json({ selected: true, revision: result.revision });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return apiError("Unauthorized", 401);
    }

    const conflict = planningMutationConflictResponse(error);
    if (conflict) return conflict;

    return apiError("Unable to select recommendation.", 500);
  }
}

import {
  UnauthorizedError,
  assertAuthenticatedApiUser,
} from "@/lib/authorization";
import { refreshRecommendations } from "@/features/recommendations/service";
import { refreshRecommendationsInputSchema } from "@/features/recommendations/schemas";
import {
  bindPlanningMutationControl,
  parsePlanningMutationControl,
} from "@/features/planning/request-control";
import {
  invalidPlanningMutationControlResponse,
  planningMutationConflictResponse,
  readPlanningMutationJson,
} from "@/app/api/trips/planning-mutation";

type RefreshRouteContext = {
  params: Promise<{
    tripId: string;
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
    | { status: "not_found" }
    | { status: "archived" }
    | { status: "not_ready"; missingRequirements: string[] }
    | { status: "needs_more_context"; readiness: unknown },
) {
  switch (result.status) {
    case "not_found":
      return apiError("Trip not found.", 404);
    case "archived":
      return apiError("Archived trips cannot refresh recommendations.", 409);
    case "not_ready":
      return apiError("Trip is not ready for recommendations.", 409, {
        missingRequirements: result.missingRequirements,
      });
    case "needs_more_context":
      return apiError("More preference context is needed.", 409, {
        readiness: result.readiness,
      });
    default: {
      const _exhaustive: never = result;
      return _exhaustive;
    }
  }
}

export async function POST(request: Request, context: RefreshRouteContext) {
  try {
    const userId = await assertAuthenticatedApiUser();
    const { tripId } = await context.params;
    const body = await readPlanningMutationJson(request);
    const parsedControl = parsePlanningMutationControl(body);

    if (!parsedControl.success) {
      return invalidPlanningMutationControlResponse(parsedControl.issues);
    }

    const parsed = refreshRecommendationsInputSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("Invalid refresh payload.", 400, {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const control = bindPlanningMutationControl(
      parsedControl.data,
      "recommendations_refresh",
      parsed.data,
    );
    const result = await refreshRecommendations(
      userId,
      tripId,
      parsed.data,
      control,
    );

    if (result.status === "stale_revision") {
      return Response.json(result, { status: 409 });
    }
    if (result.status !== "generated") {
      return accessErrorResponse(result);
    }

    return Response.json({
      recommendations: result.recommendations,
      revision: result.revision,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return apiError("Unauthorized", 401);
    }

    const conflict = planningMutationConflictResponse(error);
    if (conflict) return conflict;

    return apiError("Unable to refresh recommendations.", 500);
  }
}

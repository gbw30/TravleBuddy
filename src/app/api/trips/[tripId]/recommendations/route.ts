import { UnauthorizedError, assertAuthenticatedApiUser } from "@/lib/authorization";
import { listRecommendations } from "@/features/recommendations/service";
import { planningTopicSchema } from "@/features/recommendations/schemas";

type RecommendationsRouteContext = {
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
    | { status: "not_ready"; missingRequirements: string[] },
) {
  switch (result.status) {
    case "not_found":
      return apiError("Trip not found.", 404);
    case "archived":
      return apiError("Archived trips cannot use recommendations.", 409);
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

export async function GET(
  request: Request,
  context: RecommendationsRouteContext,
) {
  try {
    const userId = await assertAuthenticatedApiUser();
    const { tripId } = await context.params;
    const url = new URL(request.url);
    const topicValue = url.searchParams.get("topic");
    const topic = topicValue ? planningTopicSchema.parse(topicValue) : undefined;
    const result = await listRecommendations(userId, tripId, topic);

    if (result.status !== "ok") {
      return accessErrorResponse(result);
    }

    return Response.json({ recommendations: result.recommendations });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return apiError("Unauthorized", 401);
    }

    return apiError("Unable to load recommendations.", 500);
  }
}

import {
  UnauthorizedError,
  assertAuthenticatedApiUser,
} from "@/lib/authorization";
import { rejectRecommendation } from "@/features/recommendations/service";
import { rejectRecommendationInputSchema } from "@/features/recommendations/schemas";

type RejectRouteContext = {
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

async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
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
      return apiError("Archived trips cannot reject recommendations.", 409);
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

export async function POST(request: Request, context: RejectRouteContext) {
  try {
    const userId = await assertAuthenticatedApiUser();
    const { tripId, suggestionId } = await context.params;
    const parsed = rejectRecommendationInputSchema.safeParse(
      await readJson(request),
    );

    if (!parsed.success) {
      return apiError("Invalid rejection payload.", 400, {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const result = await rejectRecommendation(userId, tripId, {
      suggestionId,
      ...parsed.data,
    });

    if (result.status === "stale_revision") {
      return Response.json(result, { status: 409 });
    }
    if (result.status !== "rejected") {
      return accessErrorResponse(result);
    }

    return Response.json({ rejected: true, revision: result.revision });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return apiError("Unauthorized", 401);
    }

    return apiError("Unable to reject recommendation.", 500);
  }
}

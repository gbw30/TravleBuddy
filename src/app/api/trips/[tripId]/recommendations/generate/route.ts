import { UnauthorizedError, assertAuthenticatedApiUser } from "@/lib/authorization";
import { generateRecommendations } from "@/features/recommendations/service";
import { generateRecommendationsInputSchema } from "@/features/recommendations/schemas";

type GenerateRouteContext = {
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

async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
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

export async function POST(request: Request, context: GenerateRouteContext) {
  try {
    const userId = await assertAuthenticatedApiUser();
    const { tripId } = await context.params;
    const parsed = generateRecommendationsInputSchema.safeParse(
      await readJson(request),
    );

    if (!parsed.success) {
      return apiError("Invalid recommendation payload.", 400, {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const result = await generateRecommendations(userId, tripId, parsed.data);

    if (result.status === "needs_more_context") {
      return apiError("More preference context is needed.", 409, {
        readiness: result.readiness,
      });
    }

    if (result.status !== "generated") {
      return accessErrorResponse(result);
    }

    return Response.json({ recommendations: result.recommendations });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return apiError("Unauthorized", 401);
    }

    return apiError("Unable to generate recommendations.", 500);
  }
}

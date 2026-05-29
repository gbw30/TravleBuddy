import { assertAuthenticatedApiUser, UnauthorizedError } from "@/lib/authorization";
import { saveTripPreference } from "@/features/preferences/actions";
import { getTripPreferenceForUser } from "@/features/preferences/queries";
import { preferenceInputSchema } from "@/features/preferences/schemas";

type TripPreferenceRouteContext = {
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
    case "not_ready":
      return apiError("Trip is not ready for preferences.", 409, {
        missingRequirements: result.missingRequirements,
      });
    case "not_found":
      return apiError("Trip not found.", 404);
    case "archived":
      return apiError("Archived trips cannot update preferences.", 409);
    default: {
      const _exhaustive: never = result;
      return _exhaustive;
    }
  }
}

export async function GET(
  _request: Request,
  context: TripPreferenceRouteContext,
) {
  try {
    const userId = await assertAuthenticatedApiUser();
    const { tripId } = await context.params;
    const result = await getTripPreferenceForUser(userId, tripId);

    if (result.status !== "ok") {
      return accessErrorResponse(result);
    }

    return Response.json({ preference: result.preference });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return apiError("Unauthorized", 401);
    }

    return apiError("Unable to load trip preferences.", 500);
  }
}

export async function PUT(
  request: Request,
  context: TripPreferenceRouteContext,
) {
  try {
    const userId = await assertAuthenticatedApiUser();
    const { tripId } = await context.params;
    const body = await readJson(request);
    const parsed = preferenceInputSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        {
          error: "Invalid preference payload.",
          issues: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const result = await saveTripPreference(userId, tripId, parsed.data);

    if (result.status !== "saved") {
      if (result.status === "invalid") {
        return apiError("Invalid preference payload.", 400);
      }

      if (result.status === "not_ready") {
        return accessErrorResponse(result);
      }

      return accessErrorResponse({ status: result.status });
    }

    return Response.json({ preference: result.preference });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return apiError("Unauthorized", 401);
    }

    return apiError("Unable to save trip preferences.", 500);
  }
}

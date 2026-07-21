import { revalidatePath } from "next/cache";
import {
  UnauthorizedError,
  assertAuthenticatedApiUser,
} from "@/lib/authorization";
import { checkItineraryConflicts } from "@/features/itinerary/conflict-engine";

type ConflictCheckRouteContext = {
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
    | { status: "not_found" | "archived" }
    | { status: "not_ready"; missingRequirements: string[] },
) {
  switch (result.status) {
    case "not_found":
      return apiError("Trip not found.", 404);
    case "archived":
      return apiError("Archived trips cannot check conflicts.", 409);
    case "not_ready":
      return apiError("Trip is not ready for conflict checks.", 409, {
        missingRequirements: result.missingRequirements,
      });
    default: {
      const _exhaustive: never = result;
      return _exhaustive;
    }
  }
}

export async function POST(
  _request: Request,
  context: ConflictCheckRouteContext,
) {
  try {
    const userId = await assertAuthenticatedApiUser();
    const { tripId } = await context.params;
    const result = await checkItineraryConflicts(userId, tripId);

    if (result.status === "stale_revision") {
      return Response.json(result, { status: 409 });
    }
    if (result.status !== "checked") {
      return accessErrorResponse(result);
    }

    revalidatePath(`/trips/${tripId}/itinerary`);

    return Response.json({
      checked: true,
      conflicts: result.conflicts,
      summary: result.summary,
      revision: result.revision,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return apiError("Unauthorized", 401);
    }

    return apiError("Unable to check conflicts.", 500);
  }
}

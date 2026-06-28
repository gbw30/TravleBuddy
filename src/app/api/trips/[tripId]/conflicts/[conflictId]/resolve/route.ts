import { revalidatePath } from "next/cache";
import { UnauthorizedError, assertAuthenticatedApiUser } from "@/lib/authorization";
import { updateItineraryConflictStatus } from "@/features/itinerary/conflict-engine";

type ConflictResolveRouteContext = {
  params: Promise<{
    tripId: string;
    conflictId: string;
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

function requestedStatus(body: unknown) {
  if (
    body &&
    !Array.isArray(body) &&
    typeof body === "object" &&
    "status" in body &&
    body.status === "IGNORED"
  ) {
    return "IGNORED";
  }

  return "RESOLVED";
}

function accessErrorResponse(
  result:
    | { status: "not_found" | "archived" | "conflict_not_found" }
    | { status: "not_ready"; missingRequirements: string[] },
) {
  switch (result.status) {
    case "not_found":
      return apiError("Trip not found.", 404);
    case "conflict_not_found":
      return apiError("Conflict not found.", 404);
    case "archived":
      return apiError("Archived trips cannot update conflicts.", 409);
    case "not_ready":
      return apiError("Trip is not ready for conflict updates.", 409, {
        missingRequirements: result.missingRequirements,
      });
    default: {
      const _exhaustive: never = result;
      return _exhaustive;
    }
  }
}

export async function PATCH(
  request: Request,
  context: ConflictResolveRouteContext,
) {
  try {
    const userId = await assertAuthenticatedApiUser();
    const { tripId, conflictId } = await context.params;
    const status = requestedStatus(await readJson(request));
    const result = await updateItineraryConflictStatus(userId, tripId, {
      conflictId,
      status,
    });

    if (result.status !== "updated") {
      return accessErrorResponse(result);
    }

    revalidatePath(`/trips/${tripId}/itinerary`);

    return Response.json({
      updated: true,
      status,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return apiError("Unauthorized", 401);
    }

    return apiError("Unable to update conflict.", 500);
  }
}

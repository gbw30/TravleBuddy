import { revalidatePath } from "next/cache";
import {
  UnauthorizedError,
  assertAuthenticatedApiUser,
} from "@/lib/authorization";
import { updateItineraryConflictStatus } from "@/features/itinerary/conflict-engine";
import {
  bindPlanningMutationControl,
  parsePlanningMutationControl,
} from "@/features/planning/request-control";
import {
  invalidPlanningMutationControlResponse,
  planningMutationConflictResponse,
  readPlanningMutationJson,
} from "@/app/api/trips/planning-mutation";

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

function requestedStatus(body: unknown): "RESOLVED" | "IGNORED" {
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
    const body = await readPlanningMutationJson(request);
    const parsedControl = parsePlanningMutationControl(body);

    if (!parsedControl.success) {
      return invalidPlanningMutationControlResponse(parsedControl.issues);
    }

    const status = requestedStatus(body);
    const input = {
      conflictId,
      status,
    };
    const control = bindPlanningMutationControl(
      parsedControl.data,
      "conflict_status_update",
      input,
    );
    const result = await updateItineraryConflictStatus(
      userId,
      tripId,
      input,
      control,
    );

    if (result.status === "stale_revision") {
      return Response.json(result, { status: 409 });
    }
    if (result.status !== "updated") {
      return accessErrorResponse(result);
    }

    revalidatePath(`/trips/${tripId}/itinerary`);

    return Response.json({
      updated: true,
      status,
      revision: result.revision,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return apiError("Unauthorized", 401);
    }

    const conflict = planningMutationConflictResponse(error);
    if (conflict) return conflict;

    return apiError("Unable to update conflict.", 500);
  }
}

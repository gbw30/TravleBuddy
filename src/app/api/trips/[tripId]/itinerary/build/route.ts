import {
  UnauthorizedError,
  assertAuthenticatedApiUser,
} from "@/lib/authorization";
import { rebuildItinerary } from "@/features/itinerary/builder";

type ItineraryBuildRouteContext = {
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
      return apiError("Itinerary not found.", 404);
    case "archived":
      return apiError("Archived trips cannot rebuild itineraries.", 409);
    case "not_ready":
      return apiError("Trip is not ready for itineraries.", 409, {
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
  context: ItineraryBuildRouteContext,
) {
  try {
    const userId = await assertAuthenticatedApiUser();
    const { tripId } = await context.params;
    const result = await rebuildItinerary(userId, tripId);

    if (result.status === "stale_revision") {
      return Response.json(result, { status: 409 });
    }
    if (result.status === "no_selected_places") {
      return Response.json({
        rebuilt: false,
        status: "no_selected_places",
        itinerary: result.itinerary,
        revision: result.revision,
      });
    }

    if (result.status !== "rebuilt") {
      return accessErrorResponse(result);
    }

    return Response.json({
      rebuilt: true,
      itinerary: result.itinerary,
      revision: result.revision,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return apiError("Unauthorized", 401);
    }

    return apiError("Unable to rebuild itinerary.", 500);
  }
}

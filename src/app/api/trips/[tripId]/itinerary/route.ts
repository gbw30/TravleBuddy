import { UnauthorizedError, assertAuthenticatedApiUser } from "@/lib/authorization";
import { getItinerary } from "@/features/itinerary/builder";

type ItineraryRouteContext = {
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
      return apiError("Archived trips cannot load itineraries.", 409);
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

export async function GET(_request: Request, context: ItineraryRouteContext) {
  try {
    const userId = await assertAuthenticatedApiUser();
    const { tripId } = await context.params;
    const result = await getItinerary(userId, tripId);

    if (result.status !== "ok") {
      return accessErrorResponse(result);
    }

    return Response.json({ itinerary: result.itinerary });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return apiError("Unauthorized", 401);
    }

    return apiError("Unable to load itinerary.", 500);
  }
}

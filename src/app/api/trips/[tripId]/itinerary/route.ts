import {
  UnauthorizedError,
  assertAuthenticatedApiUser,
} from "@/lib/authorization";
import { getItinerary } from "@/features/itinerary/builder";
import { z } from "zod";

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
    | {
        status:
          | "not_found"
          | "version_not_found"
          | "invalid_version"
          | "archived";
      }
    | { status: "not_ready"; missingRequirements: string[] },
) {
  switch (result.status) {
    case "not_found":
      return apiError("Itinerary not found.", 404);
    case "version_not_found":
      return apiError("Itinerary version not found.", 404);
    case "invalid_version":
      return apiError("Invalid itinerary version.", 400);
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

const itineraryVersionQuerySchema = z
  .string()
  .trim()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().positive().max(2_147_483_647));

export async function GET(request: Request, context: ItineraryRouteContext) {
  try {
    const userId = await assertAuthenticatedApiUser();
    const { tripId } = await context.params;
    const versionValues = new URL(request.url).searchParams.getAll("version");
    if (versionValues.length > 1) {
      return apiError("Invalid itinerary version.", 400);
    }
    const parsedVersion =
      versionValues.length === 0
        ? { success: true as const, data: undefined }
        : itineraryVersionQuerySchema.safeParse(versionValues[0]);
    if (!parsedVersion.success) {
      return apiError("Invalid itinerary version.", 400, {
        issues: parsedVersion.error.flatten().formErrors,
      });
    }
    const result = await getItinerary(userId, tripId, parsedVersion.data);

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

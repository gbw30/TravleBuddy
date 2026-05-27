import { assertAuthenticatedApiUser, UnauthorizedError } from "@/lib/authorization";
import { deleteTrip, updateTrip } from "@/features/trips/actions";
import { getTripByIdForUser } from "@/features/trips/queries";
import { patchTripInputSchema } from "@/features/trips/schemas";

type TripRouteContext = {
  params: Promise<{
    tripId: string;
  }>;
};

function apiError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function GET(_request: Request, context: TripRouteContext) {
  try {
    const userId = await assertAuthenticatedApiUser();
    const { tripId } = await context.params;
    const trip = await getTripByIdForUser(userId, tripId);

    if (!trip) {
      return apiError("Trip not found.", 404);
    }

    return Response.json({ trip });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return apiError("Unauthorized", 401);
    }

    return apiError("Unable to load trip.", 500);
  }
}

export async function PATCH(request: Request, context: TripRouteContext) {
  try {
    const userId = await assertAuthenticatedApiUser();
    const { tripId } = await context.params;
    const body = await readJson(request);
    const parsed = patchTripInputSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        {
          error: "Invalid trip payload.",
          issues: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const result = await updateTrip(userId, tripId, parsed.data);

    if (result.status === "not_found") {
      return apiError("Trip not found.", 404);
    }

    if (result.status === "archived") {
      return apiError("Archived trips cannot be edited.", 409);
    }

    if (result.status === "invalid") {
      return apiError("Invalid trip payload.", 400);
    }

    if (result.status === "updated") {
      return Response.json({ trip: result.trip });
    }

    return apiError("Unable to update trip.", 500);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return apiError("Unauthorized", 401);
    }

    return apiError("Unable to update trip.", 500);
  }
}

export async function DELETE(_request: Request, context: TripRouteContext) {
  try {
    const userId = await assertAuthenticatedApiUser();
    const { tripId } = await context.params;
    const result = await deleteTrip(userId, tripId);

    if (result.status === "not_found") {
      return apiError("Trip not found.", 404);
    }

    if (result.status === "archived") {
      return apiError("Archived trips cannot be deleted.", 409);
    }

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return apiError("Unauthorized", 401);
    }

    return apiError("Unable to delete trip.", 500);
  }
}

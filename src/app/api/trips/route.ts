import { assertAuthenticatedApiUser, UnauthorizedError } from "@/lib/authorization";
import { createTrip } from "@/features/trips/actions";
import { getTripsForUser } from "@/features/trips/queries";
import { createTripInputSchema } from "@/features/trips/schemas";

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

export async function GET() {
  try {
    const userId = await assertAuthenticatedApiUser();
    const trips = await getTripsForUser(userId);

    return Response.json({ trips });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return apiError("Unauthorized", 401);
    }

    return apiError("Unable to load trips.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await assertAuthenticatedApiUser();
    const body = await readJson(request);
    const parsed = createTripInputSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        {
          error: "Invalid trip payload.",
          issues: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const trip = await createTrip(userId, parsed.data);

    return Response.json({ trip }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return apiError("Unauthorized", 401);
    }

    return apiError("Unable to create trip.", 500);
  }
}

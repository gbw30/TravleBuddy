import {
  UnauthorizedError,
  assertAuthenticatedApiUser,
} from "@/lib/authorization";
import { getGenerationJobForTrip } from "@/features/jobs/queries";

type JobRouteContext = {
  params: Promise<{
    tripId: string;
    jobId: string;
  }>;
};

function apiError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function GET(_request: Request, context: JobRouteContext) {
  try {
    const userId = await assertAuthenticatedApiUser();
    const { tripId, jobId } = await context.params;
    const job = await getGenerationJobForTrip(userId, tripId, jobId);

    if (!job) {
      return apiError("Generation job not found.", 404);
    }

    return Response.json(
      { job },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return apiError("Unauthorized", 401);
    }

    return apiError("Unable to load generation job.", 500);
  }
}

import { startTripSchema } from "@/features/trips/contracts";
import { startTrip } from "@/use-cases/start-trip";

import { json, readBody, withUser } from "../respond";

/** Starts a trip from the start screen's answers. */
export const POST = withUser(async (userId, request) => {
  const body = await readBody(request, startTripSchema);
  if ("response" in body) return body.response;

  const trip = await startTrip(userId, body.data);
  if ("refused" in trip) {
    return json(
      {
        error: "invalid_request",
        issues: [{ path: ["tickets"], message: trip.refused }],
      },
      422,
    );
  }
  return json({ trip }, 201);
});

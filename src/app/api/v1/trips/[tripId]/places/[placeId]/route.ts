import { controlSchema } from "@/features/trips/contracts";
import { removeTripPlace, tripsAlsoHolding } from "@/use-cases/plan";

import { json, outcomeResponse, readBody, withUser } from "../../../../respond";

type Context = { params: Promise<{ tripId: string; placeId: string }> };

/**
 * Removes a place the traveller added by hand. Slots holding it reopen. The
 * body carries the operation id and expected revision.
 */
export const DELETE = withUser<Context>(async (userId, request, context) => {
  const { tripId, placeId } = await context.params;
  const body = await readBody(request, controlSchema);
  if ("response" in body) return body.response;

  return outcomeResponse(
    await removeTripPlace({ userId, tripId, placeId, control: body.data }),
  );
});

/** The traveller's other trips that hold this place, for the confirm step before removing it. */
export const GET = withUser<Context>(async (userId, _request, context) => {
  const { tripId, placeId } = await context.params;
  return json({ otherTrips: await tripsAlsoHolding(userId, tripId, placeId) });
});

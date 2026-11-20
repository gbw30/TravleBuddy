import { controlSchema } from "@/features/trips/contracts";
import { removeTripPlace } from "@/use-cases/plan";

import { outcomeResponse, readBody, withUser } from "../../../../respond";

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

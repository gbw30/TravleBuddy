import { removeCommitment, updateCommitment } from "@/features/trips";
import {
  commitmentActionSchema,
  controlSchema,
} from "@/features/trips/contracts";
import { runTripAction } from "@/use-cases/trip-action";

import { outcomeResponse, readBody, withUser } from "../../../../respond";

type Context = { params: Promise<{ tripId: string; commitmentId: string }> };

/** Replaces a fixed commitment's details. */
export const PATCH = withUser<Context>(async (userId, request, context) => {
  const { tripId, commitmentId } = await context.params;
  const body = await readBody(request, commitmentActionSchema);
  if ("response" in body) return body.response;

  const { commitment, ...control } = body.data;
  return outcomeResponse(
    await runTripAction({
      userId,
      tripId,
      kind: "commitment_update",
      control,
      request: { commitmentId, commitment },
      apply: (tx) =>
        updateCommitment(tx, userId, tripId, commitmentId, commitment),
    }),
  );
});

/** Removes a fixed commitment. The body carries the operation id and expected revision. */
export const DELETE = withUser<Context>(async (userId, request, context) => {
  const { tripId, commitmentId } = await context.params;
  const body = await readBody(request, controlSchema);
  if ("response" in body) return body.response;

  return outcomeResponse(
    await runTripAction({
      userId,
      tripId,
      kind: "commitment_remove",
      control: body.data,
      request: { commitmentId },
      apply: (tx) => removeCommitment(tx, userId, tripId, commitmentId),
    }),
  );
});

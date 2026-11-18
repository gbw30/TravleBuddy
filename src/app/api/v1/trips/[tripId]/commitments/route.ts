import { addCommitment } from "@/features/trips";
import { commitmentActionSchema } from "@/features/trips/contracts";
import { runTripAction } from "@/use-cases/trip-action";

import { outcomeResponse, readBody, withUser } from "../../../respond";

type Context = { params: Promise<{ tripId: string }> };

/** Adds a fixed commitment. Answers every commitment of the trip and the clashes among them. */
export const POST = withUser<Context>(async (userId, request, context) => {
  const { tripId } = await context.params;
  const body = await readBody(request, commitmentActionSchema);
  if ("response" in body) return body.response;

  const { commitment, ...control } = body.data;
  return outcomeResponse(
    await runTripAction({
      userId,
      tripId,
      kind: "commitment_add",
      control,
      request: commitment,
      apply: (tx) => addCommitment(tx, userId, tripId, commitment),
    }),
    true,
  );
});

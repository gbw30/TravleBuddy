import { turnSchema } from "@/features/conversation/contracts";
import { controlSchema } from "@/features/trips/contracts";
import { loadConversation, takeTurn } from "@/use-cases/conversation";

import { json, outcomeResponse, readBody, withUser } from "../../../respond";

type Context = { params: Promise<{ tripId: string }> };

const bodySchema = controlSchema.extend({ turn: turnSchema });

// A typed message can take one call to the AI model and a city lookup.
export const maxDuration = 30;

/** The trip's conversation: the saved thread and the question that is waiting. */
export const GET = withUser<Context>(async (userId, _request, context) => {
  const { tripId } = await context.params;
  const conversation = await loadConversation(userId, tripId);
  return conversation
    ? json({ conversation })
    : json({ error: "not_found" }, 404);
});

/** One turn: a tapped answer, a skip or a typed message. Answers the conversation as it stands afterwards. */
export const POST = withUser<Context>(async (userId, request, context) => {
  const { tripId } = await context.params;
  const body = await readBody(request, bodySchema);
  if ("response" in body) return body.response;

  const { turn, ...control } = body.data;
  const outcome = await takeTurn({ userId, tripId, control, turn });
  if (outcome.status !== "ok") return outcomeResponse(outcome);
  // A repeat returns the ledger's entry; either way the answer is the thread now.
  const conversation = await loadConversation(userId, tripId);
  return json({
    data: { ...outcome.data, conversation },
    revision: outcome.revision,
  });
});

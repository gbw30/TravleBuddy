import { controlSchema } from "@/features/trips/contracts";
import { briefSaveSchema } from "@/use-cases/brief";
import { loadBrief, saveBrief } from "@/use-cases/save-brief";

import { json, outcomeResponse, readBody, withUser } from "../../../respond";

type Context = { params: Promise<{ tripId: string }> };

const bodySchema = controlSchema.extend(briefSaveSchema.shape);

/** The trip's brief: its facts, what is decided, its style with sources, and the review. */
export const GET = withUser<Context>(async (userId, _request, context) => {
  const { tripId } = await context.params;
  const brief = await loadBrief(userId, tripId);
  return brief ? json({ brief }) : json({ error: "not_found" }, 404);
});

/** Saves one step of the brief and answers the brief as it stands afterwards. */
export const PUT = withUser<Context>(async (userId, request, context) => {
  const { tripId } = await context.params;
  const body = await readBody(request, bodySchema);
  if ("response" in body) return body.response;

  const { operationId, expectedRevision, ...save } = body.data;
  const outcome = await saveBrief({
    userId,
    tripId,
    control: { operationId, expectedRevision },
    save,
  });
  if (outcome.status !== "ok") return outcomeResponse(outcome);
  const brief = await loadBrief(userId, tripId);
  return json({ data: { brief }, revision: outcome.revision });
});

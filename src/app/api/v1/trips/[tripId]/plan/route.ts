import { planActionSchema } from "@/features/itinerary/contracts";
import { controlSchema } from "@/features/trips/contracts";
import { loadPlan, runPlanAction } from "@/use-cases/plan";

import { json, outcomeResponse, readBody, withUser } from "../../../respond";

type Context = { params: Promise<{ tripId: string }> };

const bodySchema = controlSchema.extend({ action: planActionSchema });

// Gathering a city's places can take one provider request.
export const maxDuration = 30;

/** The plan as it stands: the laid-out days, the shelf and the places they name. */
export const GET = withUser<Context>(async (userId, _request, context) => {
  const { tripId } = await context.params;
  const plan = await loadPlan(userId, tripId);
  return plan ? json({ plan }) : json({ error: "not_found" }, 404);
});

/** One change to the plan. Answers the plan as it stands afterwards. */
export const POST = withUser<Context>(async (userId, request, context) => {
  const { tripId } = await context.params;
  const body = await readBody(request, bodySchema);
  if ("response" in body) return body.response;

  const { action, ...control } = body.data;
  const outcome = await runPlanAction({ userId, tripId, control, action });
  if (outcome.status !== "ok") return outcomeResponse(outcome);
  // A repeat returns the ledger's entry; either way the answer is the plan now.
  const plan = await loadPlan(userId, tripId);
  return json({ data: { ...outcome.data, plan }, revision: outcome.revision });
});

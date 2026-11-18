import { z } from "zod";

import { planActionSchema } from "@/features/itinerary/contracts";
import { controlSchema } from "@/features/trips/contracts";
import { loadPlan, runPlanAction } from "@/use-cases/plan";

import { json, outcomeResponse, readBody, withUser } from "../../../respond";

type Context = { params: Promise<{ tripId: string }> };

const slotSchema = z.string().regex(/^d\d{1,3}-[a-z0-9-]{4,12}$/);
const bodySchema = controlSchema.extend({
  action: planActionSchema,
  /** The slot to show cards for afterwards. Defaults to the next one to fill. */
  focus: slotSchema.optional(),
});

// Gathering a city's places can take one provider request.
export const maxDuration = 30;

/**
 * The plan as it stands, with the cards for one slot (`?slot=`, or the next to
 * fill). Reading can gather a city's places and records the cards it shows.
 */
export const GET = withUser<Context>(async (userId, request, context) => {
  const { tripId } = await context.params;
  const focus = slotSchema.safeParse(
    new URL(request.url).searchParams.get("slot"),
  );
  const plan = await loadPlan(
    userId,
    tripId,
    focus.success ? focus.data : undefined,
  );
  return plan ? json({ plan }) : json({ error: "not_found" }, 404);
});

/** One change to the plan. Answers the plan as it stands afterwards. */
export const POST = withUser<Context>(async (userId, request, context) => {
  const { tripId } = await context.params;
  const body = await readBody(request, bodySchema);
  if ("response" in body) return body.response;

  const { action, focus, ...control } = body.data;
  const outcome = await runPlanAction({ userId, tripId, control, action });
  if (outcome.status !== "ok") return outcomeResponse(outcome);
  // A repeat returns the ledger's entry; either way the answer is the plan now.
  const plan = await loadPlan(userId, tripId, focus);
  return json({ data: { ...outcome.data, plan }, revision: outcome.revision });
});

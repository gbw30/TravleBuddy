import { z } from "zod";

import { PLACE_KINDS } from "@/features/places/contracts";
import { addTripPlace, findTripPlaces } from "@/use-cases/plan";

import { json, readBody, withUser } from "../../../respond";

type Context = { params: Promise<{ tripId: string }> };

const slotSchema = z.string().regex(/^d\d{1,3}-[a-z0-9-]{4,12}$/);
const ownPlaceSchema = z.object({
  name: z.string().trim().min(1).max(160),
  kind: z.enum(PLACE_KINDS),
  slotId: slotSchema.optional(),
});

// A search by name is one request to the place provider.
export const maxDuration = 30;

/**
 * Places by name (`?q=`) in the city of a slot (`?slot=`), as cards. Called
 * when the traveller submits a search, never while typing (ADR-009).
 */
export const GET = withUser<Context>(async (userId, request, context) => {
  const { tripId } = await context.params;
  const params = new URL(request.url).searchParams;
  const slot = slotSchema.safeParse(params.get("slot"));
  const found = await findTripPlaces(
    userId,
    tripId,
    slot.success ? slot.data : undefined,
    params.get("q") ?? "",
  );
  if (found.status === "ok") return json({ cards: found.cards });
  if (found.status === "not_found") return json({ error: "not_found" }, 404);
  return json(
    {
      error: found.status === "capped" ? "lookup_capped" : "lookup_unavailable",
    },
    503,
  );
});

/** Adds a place the provider does not know. It is marked as the traveller's own. */
export const POST = withUser<Context>(async (userId, request, context) => {
  const { tripId } = await context.params;
  const body = await readBody(request, ownPlaceSchema);
  if ("response" in body) return body.response;

  const { slotId, ...place } = body.data;
  const card = await addTripPlace(userId, tripId, slotId, place);
  return card ? json({ card }, 201) : json({ error: "not_found" }, 404);
});

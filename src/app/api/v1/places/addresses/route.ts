import { findAddresses } from "@/features/places";
import { addressSearchSchema } from "@/features/places/contracts";

import { json, readBody, withUser } from "../../respond";

/**
 * Addresses matching `query` near the city at `near`. Called when the
 * traveller submits a search, never while typing (ADR-009). A POST, so the
 * typed address stays out of the address bar and request logs.
 */
export const POST = withUser(async (_userId, request) => {
  const body = await readBody(request, addressSearchSchema);
  if ("response" in body) return body.response;
  const outcome = await findAddresses(body.data.query, body.data.near);
  if (outcome.status === "ok") return json({ addresses: outcome.addresses });
  return json(
    {
      error:
        outcome.status === "capped" ? "lookup_capped" : "lookup_unavailable",
    },
    503,
  );
});

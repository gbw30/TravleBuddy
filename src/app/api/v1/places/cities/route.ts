import { findCities } from "@/features/places";

import { json, withUser } from "../../respond";

/** Cities matching `q`. Called when the traveller submits a search, never while typing (ADR-009). */
export const GET = withUser(async (_userId, request) => {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const outcome = await findCities(query);
  return outcome.status === "ok"
    ? json({ cities: outcome.cities })
    : json({ error: "lookup_unavailable" }, 503);
}, "lookups");

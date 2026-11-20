import { findAddresses } from "@/features/places";

import { json, withUser } from "../../respond";

/**
 * Addresses matching `q` near the city at `near=<lat>,<lon>`. Called when the
 * traveller submits a search, never while typing (ADR-009).
 */
export const GET = withUser(async (_userId, request) => {
  const params = new URL(request.url).searchParams;
  const near = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(
    params.get("near") ?? "",
  );
  const [latitude, longitude] = near ? [Number(near[1]), Number(near[2])] : [];
  if (
    latitude === undefined ||
    longitude === undefined ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return json({ error: "invalid_request" }, 422);
  }
  const outcome = await findAddresses(params.get("q") ?? "", {
    latitude,
    longitude,
  });
  if (outcome.status === "ok") return json({ addresses: outcome.addresses });
  return json(
    {
      error:
        outcome.status === "capped" ? "lookup_capped" : "lookup_unavailable",
    },
    503,
  );
});

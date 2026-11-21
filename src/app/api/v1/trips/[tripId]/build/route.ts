import { z } from "zod";

import { controlSchema } from "@/features/trips/contracts";
import { buildNextDay } from "@/use-cases/build";

import { outcomeResponse, readBody, withUser } from "../../../respond";

type Context = { params: Promise<{ tripId: string }> };

const bodySchema = controlSchema.extend({ start: z.boolean().optional() });

/** A plan build is the request that starts one; each next day counts only as an API call. */
const startsBuild = async (request: Request) =>
  (
    await request
      .clone()
      .json()
      .catch(() => null)
  )?.start === true
    ? ("turns" as const)
    : null;

// One day can take a request to the place provider for each of its slots.
export const maxDuration = 60;

/**
 * Builds one day of the trip: the first with `start`, otherwise the next.
 * The page calls it again until the answer says `done` (PRD 11.3).
 */
export const POST = withUser<Context>(async (userId, request, context) => {
  const { tripId } = await context.params;
  const body = await readBody(request, bodySchema);
  if ("response" in body) return body.response;

  const { start, ...control } = body.data;
  return outcomeResponse(
    await buildNextDay({ userId, tripId, control, start: start ?? false }),
  );
}, startsBuild);

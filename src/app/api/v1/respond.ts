import type { ZodType } from "zod";

import { CitiesInUseError } from "@/features/trips";
import {
  assertAuthenticatedApiUser,
  UnauthorizedError,
} from "@/lib/authorization";
import type { TripActionOutcome } from "@/use-cases/trip-action";

// Shared by every /api/v1 route. The routes are documented in docs/api/v1.md.

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status });

/** The request body checked against a schema, or the 422 answer to send back. */
export async function readBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<{ data: T } | { response: Response }> {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (parsed.success) return { data: parsed.data };
  return {
    response: json(
      { error: "invalid_request", issues: parsed.error.issues },
      422,
    ),
  };
}

/** Runs a handler for the signed-in traveller and turns known failures into answers. */
export function withUser<Context>(
  handler: (
    userId: string,
    request: Request,
    context: Context,
  ) => Promise<Response>,
) {
  return async (request: Request, context: Context) => {
    try {
      const userId = await assertAuthenticatedApiUser();
      return await handler(userId, request, context);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return json({ error: "unauthorized" }, 401);
      }
      if (error instanceof CitiesInUseError) {
        return json({ error: "cities_in_use" }, 409);
      }
      console.error(error);
      return json({ error: "server_error" }, 500);
    }
  };
}

const refusals = {
  not_found: ["not_found", 404],
  archived: ["archived", 409],
  stale: ["stale_revision", 409],
  conflict: ["operation_id_conflict", 409],
  too_many: ["too_many", 422],
} as const;

/** The answer for a change to a trip. `created` answers 201 instead of 200. */
export function outcomeResponse(
  outcome: TripActionOutcome<unknown>,
  created = false,
) {
  if (outcome.status === "ok") {
    return json(
      { data: outcome.data, revision: outcome.revision },
      created ? 201 : 200,
    );
  }
  if (outcome.status === "refused") {
    return json({ error: "refused", message: outcome.message }, 409);
  }
  const [error, status] = refusals[outcome.status];
  return json({ error }, status);
}

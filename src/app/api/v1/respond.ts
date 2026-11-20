import type { ZodType } from "zod";

import {
  assertAuthenticatedApiUser,
  UnauthorizedError,
} from "@/lib/authorization";
import { admit, asPerson, identify, type Scope } from "@/features/fair-use";
import { DATES_ORDER_MESSAGE } from "@/features/trips/contracts";
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

/**
 * Counts a request against the limits of the person it comes from
 * (TB-SYS-16), then does the work as that person, so their daily shares are
 * counted too. Over a limit it answers 429 with the seconds to wait. A device
 * seen for the first time gets its cookie on either answer.
 */
export async function fairly(
  request: Request,
  account: string | null,
  scopes: Scope[],
  work: () => Promise<Response>,
): Promise<Response> {
  const { person, cookie } = identify(request, account);
  const wait = await admit(person, scopes);
  const answer =
    wait === null
      ? await asPerson(person, work)
      : Response.json(
          { error: "rate_limited" },
          { status: 429, headers: { "Retry-After": String(wait) } },
        );
  if (!cookie) return answer;
  // Copied, because the headers of some answers cannot be changed.
  const sent = new Response(answer.body, answer);
  sent.headers.append("Set-Cookie", cookie);
  return sent;
}

/**
 * Runs a handler for the signed-in traveller and turns known failures into
 * answers. Every request counts under `api`; `scope` adds the route's own
 * limit, or works it out from the request.
 */
export function withUser<Context>(
  handler: (
    userId: string,
    request: Request,
    context: Context,
  ) => Promise<Response>,
  scope?: Scope | ((request: Request) => Promise<Scope | null>),
) {
  return async (request: Request, context: Context) => {
    try {
      const userId = await assertAuthenticatedApiUser();
      const own = typeof scope === "function" ? await scope(request) : scope;
      return await fairly(request, userId, own ? ["api", own] : ["api"], () =>
        handler(userId, request, context),
      );
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return json({ error: "unauthorized" }, 401);
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
  bad_dates: ["invalid_request", 422],
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
  if (outcome.status === "bad_dates") {
    return json(
      {
        error: "invalid_request",
        issues: [{ path: ["endDate"], message: DATES_ORDER_MESSAGE }],
      },
      422,
    );
  }
  const [error, status] = refusals[outcome.status];
  return json({ error }, status);
}

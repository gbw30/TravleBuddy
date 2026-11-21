// Browser-side calls to the /api/v1 routes (docs/api/v1.md).

export type ApiResult<T> =
  | { ok: true; data: T; revision: number | null }
  | {
      ok: false;
      error: string;
      message: string;
      /** Over a request limit: the seconds until another request is let through. */
      retryAfter?: number;
    };

const messages: Record<string, string> = {
  stale_revision:
    "This trip changed somewhere else. I have loaded the latest version; please try again.",
  operation_id_conflict: "That did not save. Please try again.",
  archived: "This trip is archived. Restore it to make changes.",
  not_found: "This trip no longer exists.",
  too_many: "This trip already holds as many commitments as it can.",
  invalid_request:
    "Something in the form is not valid. Check it and try again.",
  invalid_value: "That is not something this topic can hold.",
  lookup_unavailable:
    "City search is not available right now. Try again in a moment.",
  lookup_capped:
    "Today's place lookups are used up. Try again tomorrow, or add the place by hand.",
  unauthorized: "You are signed out. Sign in again to continue.",
  rate_limited:
    "You have made a lot of requests in a short time. Try again in a minute.",
};
const fallback = "That did not work. Please try again.";

export async function callApi<T>(
  path: string,
  init: { method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: object },
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(path, {
      method: init.method,
      headers: init.body ? { "Content-Type": "application/json" } : undefined,
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    const reply = response.status === 204 ? {} : await response.json();
    if (response.ok) {
      return {
        ok: true,
        data: (reply.data ?? reply) as T,
        revision: reply.revision ?? null,
      };
    }
    const error = typeof reply.error === "string" ? reply.error : "unknown";
    // A refusal carries its own reason, written for the traveller.
    const message =
      error === "refused" && typeof reply.message === "string"
        ? reply.message
        : (messages[error] ?? fallback);
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("Retry-After")) || 60;
      return { ok: false, error, message, retryAfter };
    }
    return { ok: false, error, message };
  } catch {
    return { ok: false, error: "network", message: fallback };
  }
}

/**
 * Waits a request limit may last in a row before one request gives up
 * (TB-SYS-16). A wait runs to the end of the limit's minute, so one is
 * nearly always enough.
 */
export const LIMIT_WAITS = 3;

/**
 * Sends a request, and sends it again once a request limit's wait is over,
 * at most LIMIT_WAITS waits in a row. `waiting` hears the limit's message
 * while a wait lasts and null when it ends. A request no longer `wanted` is
 * not sent again. The last answer is handed back.
 */
export async function patiently<T>(
  ask: () => Promise<ApiResult<T>>,
  waiting: (message: string | null) => void,
  wanted: () => boolean = () => true,
): Promise<ApiResult<T>> {
  for (let waits = 0; ; waits++) {
    const result = await ask();
    if (result.ok || !result.retryAfter || waits === LIMIT_WAITS || !wanted()) {
      return result;
    }
    const wait = result.retryAfter * 1000;
    waiting(result.message);
    await new Promise((go) => setTimeout(go, wait));
    waiting(null);
    if (!wanted()) return result;
  }
}

// The newest revision seen for each trip in this tab. Several panels on one
// page change the same trip, and each must send the revision the last one got.
const latestRevision = new Map<string, number>();

/**
 * A change to an existing trip. Each call is one operation: the id lets the
 * server recognise a repeat, and the revision lets it refuse a stale screen.
 * `revision` is the one the page was rendered with.
 */
export async function changeTrip<T>(
  tripId: string,
  revision: number,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body: object = {},
  subPath = "",
): Promise<ApiResult<T>> {
  const result = await callApi<T>(`/api/v1/trips/${tripId}${subPath}`, {
    method,
    body: {
      ...body,
      operationId: crypto.randomUUID(),
      expectedRevision: Math.max(latestRevision.get(tripId) ?? 0, revision),
    },
  });
  if (result.ok && result.revision !== null) {
    latestRevision.set(tripId, result.revision);
  }
  return result;
}

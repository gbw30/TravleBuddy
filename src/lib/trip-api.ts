// Browser-side calls to the /api/v1 routes (docs/api/v1.md).

export type ApiResult<T> =
  | { ok: true; data: T; revision: number | null }
  | { ok: false; error: string; message: string };

const messages: Record<string, string> = {
  stale_revision:
    "This trip changed somewhere else. I have loaded the latest version; please try again.",
  operation_id_conflict: "That did not save. Please try again.",
  archived: "This trip is archived. Restore it to make changes.",
  not_found: "This trip no longer exists.",
  cities_in_use:
    "These cities are still used by places chosen in the earlier planner, so they cannot be removed yet.",
  too_many: "This trip already holds as many commitments as it can.",
  invalid_request:
    "Something in the form is not valid. Check it and try again.",
  lookup_unavailable:
    "City search is not available right now. Try again in a moment.",
  lookup_capped:
    "Today's place lookups are used up. Try again tomorrow, or add the place by hand.",
  unauthorized: "You are signed out. Sign in again to continue.",
};
const fallback = "That did not work. Please try again.";

export async function callApi<T>(
  path: string,
  init: { method: "GET" | "POST" | "PATCH" | "DELETE"; body?: object },
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
    return { ok: false, error, message };
  } catch {
    return { ok: false, error: "network", message: fallback };
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
  method: "POST" | "PATCH" | "DELETE",
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

// Shared manners for OpenStreetMap's community services (ADR-009): identify
// the application, never two requests at once, and back off when asked.

export const USER_AGENT =
  process.env.PLACES_USER_AGENT ??
  "TravleBuddy/1.0 (+https://travle-buddy.vercel.app)";

const GAP_MS = 1100;
const BACK_OFF_MS = 30_000;

/** The service asked us to slow down; nothing was fetched. */
export class ProviderBusyError extends Error {
  constructor() {
    super("The place provider asked for a pause.");
    this.name = "ProviderBusyError";
  }
}

// shortcut: the queue and the pause hold inside one server process only;
// several serverless instances could exceed the limit together. Upgrade to a
// shared gate, or to a self-hosted or paid service, before real public use.
let queue: Promise<unknown> = Promise.resolve();
let nextSlot = 0;
const pausedUntil = new Map<string, number>(); // by host

/**
 * Sends one request at a time, at least a second apart. After HTTP 429 or 406
 * that host fails fast for 30 seconds instead of waiting inside a page load.
 * Refusals and failures are logged as host and status (or error name) only.
 */
export function politeFetch(
  url: string | URL,
  init: RequestInit & { timeoutMs: number },
): Promise<Response> {
  const run = async () => {
    const host = new URL(url).host;
    if (Date.now() < (pausedUntil.get(host) ?? 0))
      throw new ProviderBusyError();
    const wait = nextSlot - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    nextSlot = Date.now() + GAP_MS;

    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: {
          ...init.headers,
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(init.timeoutMs),
      });
    } catch (error) {
      // Never log the URL, body or headers: only who failed and how.
      console.warn("OSM request failed", {
        host,
        error: error instanceof Error ? error.name : "Error",
      });
      throw error;
    }
    if (!response.ok)
      console.warn("OSM request refused", { host, status: response.status });
    if (response.status === 429 || response.status === 406) {
      pausedUntil.set(host, Date.now() + BACK_OFF_MS);
      throw new ProviderBusyError();
    }
    if (!response.ok) throw new Error(`Provider answered ${response.status}`);
    return response;
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

/** For tests: forget any pause and queue. */
export function resetPoliteFetch() {
  queue = Promise.resolve();
  nextSlot = 0;
  pausedUntil.clear();
}

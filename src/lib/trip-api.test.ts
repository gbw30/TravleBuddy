import { afterEach, describe, expect, it, vi } from "vitest";

import { callApi } from "./trip-api";

afterEach(() => vi.unstubAllGlobals());

describe("callApi", () => {
  it("says plainly when too many requests were made, whatever the route", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: "rate_limited" },
          { status: 429, headers: { "Retry-After": "42" } },
        ),
      ),
    );
    expect(await callApi("/api/v1/trips/t/plan", { method: "GET" })).toEqual({
      ok: false,
      error: "rate_limited",
      message:
        "You have made a lot of requests in a short time. Try again in a minute.",
      retryAfter: 42,
    });
  });

  it("names no wait for any other refusal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "not_found" }, { status: 404 })),
    );
    const result = await callApi("/api/v1/trips/t", { method: "GET" });
    expect(result).not.toHaveProperty("retryAfter");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LIMIT_WAITS, callApi, patiently, type ApiResult } from "./trip-api";

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

describe("patiently", () => {
  const limited: ApiResult<string> = {
    ok: false,
    error: "rate_limited",
    message:
      "You have made a lot of requests in a short time. Try again in a minute.",
    retryAfter: 30,
  };
  const answered: ApiResult<string> = { ok: true, data: "plan", revision: 1 };

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("asks again once a request limit's wait is over", async () => {
    const ask = vi
      .fn<() => Promise<ApiResult<string>>>()
      .mockResolvedValueOnce(limited)
      .mockResolvedValueOnce(answered);
    const waiting = vi.fn();
    const result = patiently(ask, waiting);

    await vi.advanceTimersByTimeAsync(29_999);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(waiting).toHaveBeenLastCalledWith(limited.message);

    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toEqual(answered);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(waiting).toHaveBeenLastCalledWith(null);
  });

  it(`gives up after ${LIMIT_WAITS} waits in a row and hands back the limit`, async () => {
    const ask = vi
      .fn<() => Promise<ApiResult<string>>>()
      .mockResolvedValue(limited);
    const result = patiently(ask, vi.fn());

    await vi.advanceTimersByTimeAsync((LIMIT_WAITS + 2) * 30_000);
    expect(ask).toHaveBeenCalledTimes(LIMIT_WAITS + 1);
    expect(vi.getTimerCount()).toBe(0);
    expect(await result).toEqual(limited);
  });

  it("does not ask again for a request no longer wanted", async () => {
    const ask = vi
      .fn<() => Promise<ApiResult<string>>>()
      .mockResolvedValue(limited);
    let wanted = true;
    const result = patiently(ask, vi.fn(), () => wanted);

    wanted = false;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await result).toEqual(limited);
    expect(ask).toHaveBeenCalledTimes(1);
  });
});

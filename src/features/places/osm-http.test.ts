import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { politeFetch, ProviderBusyError, resetPoliteFetch } from "./osm-http";

describe("politeFetch by host", () => {
  const fetchMock = vi.fn();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  beforeEach(() => {
    resetPoliteFetch();
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("a 406 from one host does not pause another host", async () => {
    fetchMock.mockResolvedValueOnce(new Response("no", { status: 406 }));
    await expect(
      politeFetch("https://one.test/x", { timeoutMs: 1000 }),
    ).rejects.toBeInstanceOf(ProviderBusyError);

    fetchMock.mockResolvedValue(Response.json([]));
    const other = politeFetch("https://two.test/x", { timeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(2000);
    expect((await other).ok).toBe(true);
    await expect(
      politeFetch("https://one.test/y", { timeoutMs: 1000 }),
    ).rejects.toBeInstanceOf(ProviderBusyError);
  });

  it("logs the host and status of a refused or failed request, never the header", async () => {
    fetchMock.mockResolvedValueOnce(new Response("no", { status: 406 }));
    await expect(
      politeFetch("https://one.test/secret?q=1", { timeoutMs: 1000 }),
    ).rejects.toBeInstanceOf(ProviderBusyError);

    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    const failed = politeFetch("https://two.test/x", { timeoutMs: 1000 });
    const assertion = expect(failed).rejects.toThrow("fetch failed");
    await vi.advanceTimersByTimeAsync(2000);
    await assertion;

    expect(warn.mock.calls.map((c) => c[1])).toEqual([
      { host: "one.test", status: 406 },
      { host: "two.test", error: "TypeError" },
    ]);
    const { USER_AGENT } = await import("./osm-http");
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain(USER_AGENT);
    expect(logged).not.toContain("secret");
  });
});

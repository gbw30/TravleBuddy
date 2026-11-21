import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OVERPASS_ENDPOINTS, runOverpass, sightsReach } from "./overpass";
import { resetPoliteFetch, USER_AGENT } from "./osm-http";

const reach = sightsReach({ latitude: 1, longitude: 1 });
const fetchMock = vi.fn();

async function run() {
  const result = runOverpass("q", reach);
  const settled = result.then(
    (v) => v,
    (e) => e,
  );
  await vi.advanceTimersByTimeAsync(10_000);
  return settled;
}

describe("runOverpass", () => {
  beforeEach(() => {
    resetPoliteFetch();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fetchMock.mockReset();
  });

  it.each([
    ["a 406", () => new Response("", { status: 406 })],
    ["a 429", () => new Response("", { status: 429 })],
    ["a 503", () => new Response("", { status: 503 })],
    ["a timeout", () => Promise.reject(new DOMException("t", "TimeoutError"))],
    ["a network error", () => Promise.reject(new TypeError("fetch failed"))],
  ])("tries the next endpoint after %s", async (_name, first) => {
    fetchMock.mockImplementationOnce(async () => first());
    fetchMock.mockResolvedValue(Response.json({ elements: [] }));
    const result = await run();
    expect(result).toHaveProperty("places");
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(
      OVERPASS_ENDPOINTS.slice(0, 2),
    );
  });

  it("throws the last error when every endpoint fails", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 503 }));
    const result = await run();
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("Provider answered 503");
    expect(fetchMock).toHaveBeenCalledTimes(OVERPASS_ENDPOINTS.length);
  });

  it("sends the PLACES_USER_AGENT header to each", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 503 }));
    await run();
    for (const call of fetchMock.mock.calls)
      expect(call[1].headers["User-Agent"]).toBe(USER_AGENT);
  });
});

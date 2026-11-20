import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  GET: vi.fn(),
  POST: vi.fn(),
  admit: vi.fn(),
  identify: vi.fn(),
  asPerson: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  handlers: { GET: mocks.GET, POST: mocks.POST },
}));
vi.mock("@/lib/authorization", () => ({}));
vi.mock("@/features/fair-use", () => ({
  admit: mocks.admit,
  identify: mocks.identify,
  asPerson: mocks.asPerson,
}));

import { GET, POST } from "./route";

const visitor = { account: null, device: "device-1", signature: "sig-1" };
const request = (method: string) =>
  new Request("http://localhost/api/auth/callback/google", {
    method,
  }) as NextRequest;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.identify.mockReturnValue({ person: visitor, cookie: null });
  mocks.admit.mockResolvedValue(null);
  mocks.asPerson.mockImplementation((_person, work: () => unknown) => work());
  const signedIn = () =>
    Response.redirect("http://localhost/home", 302) as Response;
  mocks.GET.mockImplementation(async () => signedIn());
  mocks.POST.mockImplementation(async () => signedIn());
});

describe("NextAuth's routes, reached without sign-in", () => {
  it("count against the device's limit, with no account", async () => {
    const answer = await GET(request("GET"));
    expect(answer.status).toBe(302);
    expect(mocks.identify).toHaveBeenCalledWith(expect.any(Request), null);
    expect(mocks.admit).toHaveBeenCalledWith(visitor, ["unsigned"]);
    await POST(request("POST"));
    expect(mocks.POST).toHaveBeenCalledTimes(1);
  });

  it("answer 429 over the limit without signing anyone in", async () => {
    mocks.admit.mockResolvedValue(30);
    const answer = await POST(request("POST"));
    expect(answer.status).toBe(429);
    expect(answer.headers.get("Retry-After")).toBe("30");
    expect(await answer.json()).toEqual({ error: "rate_limited" });
    expect(mocks.POST).not.toHaveBeenCalled();
  });

  it("add the device cookie to an answer whose headers are fixed, keeping its own headers", async () => {
    mocks.identify.mockReturnValue({
      person: visitor,
      cookie: "tb_device=new; Path=/",
    });
    const answer = await GET(request("GET"));
    expect(answer.status).toBe(302);
    expect(answer.headers.get("Location")).toBe("http://localhost/home");
    expect(answer.headers.getSetCookie()).toEqual(["tb_device=new; Path=/"]);
  });
});

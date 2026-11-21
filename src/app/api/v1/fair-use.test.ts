import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Prisma } from "@/generated/prisma/client";

// The real wrapper and the real Fair use service; only the table and the
// session are stand-ins. Proves a share spent deep in a service is counted
// against the person the route identified.
const mocks = vi.hoisted(() => ({
  db: {
    $queryRaw: vi.fn(),
    fairUseCount: { deleteMany: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/authorization", () => ({
  UnauthorizedError: class extends Error {},
  assertAuthenticatedApiUser: async () => "user-1",
}));

import { withinShare } from "@/features/fair-use";

import { withUser } from "./respond";

/** The keys each counting statement wrote, in order. */
const keysWritten = () =>
  mocks.db.$queryRaw.mock.calls.map((call) =>
    (call[0] as Prisma.Sql).values.filter((_, i) => i % 3 === 0),
  );

let counts: Record<string, number> = {};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AUTH_SECRET", "a-test-secret-that-is-long-enough-1234");
  counts = {};
  mocks.db.$queryRaw.mockImplementation(async (sql: Prisma.Sql) =>
    sql.values
      .filter((_, i) => i % 3 === 0)
      .map((key) => ({ key, count: counts[key as string] ?? 2 })),
  );
});

const route = withUser(async () =>
  Response.json({ within: await withinShare("gather") }),
);

describe("a share spent inside a route", () => {
  it("is counted against the account and signature the route identified", async () => {
    const answer = await route(
      new Request("http://localhost/api/v1/trips/t/plan"),
      undefined,
    );
    expect(await answer.json()).toEqual({ within: true });
    const [request, share] = keysWritten();
    expect(request).toEqual([
      "api:a:user-1",
      expect.stringMatching(/^api:s:[0-9a-f]{32}$/),
      "sweep",
    ]);
    expect(share).toEqual([
      "gather:a:user-1",
      expect.stringMatching(/^gather:s:[0-9a-f]{32}$/),
    ]);
    // A first visit: the device gets its cookie and is not counted yet.
    expect(answer.headers.get("Set-Cookie")).toMatch(/^tb_device=/);
  });

  it("is used up once the account has made its 30 provider requests today", async () => {
    counts["gather:a:user-1"] = 31;
    const answer = await route(
      new Request("http://localhost/api/v1/trips/t/plan"),
      undefined,
    );
    expect(await answer.json()).toEqual({ within: false });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Prisma } from "@/generated/prisma/client";

type Sql = Prisma.Sql;

const mocks = vi.hoisted(() => ({
  db: {
    $queryRaw: vi.fn(),
    fairUseCount: { deleteMany: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock("@/lib/db", () => ({ db: mocks.db }));

import {
  addAiSpend,
  admit,
  aiShareLeft,
  asPerson,
  identify,
  limitsOff,
  withinShare,
} from "./counts";
import { deviceCookie } from "./person";

const NOW = new Date("2026-11-20T12:34:15.500Z");
const MINUTE_END = new Date("2026-11-20T12:35:00.000Z");
const DAY_END = new Date("2026-11-21T00:00:00.000Z");
const person = { account: "user-1", device: "device-1", signature: "sig-1" };

/** The rows one counting statement wrote: key, window end and amount. */
function written(call = 0) {
  const values = (mocks.db.$queryRaw.mock.calls[call][0] as Sql).values;
  const rows = [];
  for (let i = 0; i < values.length; i += 3) {
    rows.push({
      key: values[i] as string,
      endsAt: values[i + 1] as Date,
      amount: values[i + 2] as number,
    });
  }
  return rows;
}

/** Answers each counting statement with the counts given, 1 for any other key. */
function counts(byKey: Record<string, number>) {
  mocks.db.$queryRaw.mockImplementation(async (sql: Sql) => {
    const keys = sql.values.filter((_, i) => i % 3 === 0) as string[];
    return keys.map((key) => ({ key, count: byKey[key] ?? 1 }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  counts({ sweep: 2 });
});

describe("admit", () => {
  it("counts every identifier against every limit in one statement, in the minute's window", async () => {
    await admit(person, ["api", "places"], NOW);
    expect(mocks.db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(written().map((row) => row.key)).toEqual([
      "api:a:user-1",
      "api:d:device-1",
      "api:s:sig-1",
      "places:a:user-1",
      "places:d:device-1",
      "places:s:sig-1",
      "sweep",
    ]);
    expect(written().every((row) => row.endsAt.getTime() === +MINUTE_END)).toBe(
      true,
    );
  });

  it("refuses when any one identifier is over, with the seconds to the window's end", async () => {
    counts({ sweep: 2, "api:d:device-1": 61 });
    expect(await admit(person, ["api"], NOW)).toBe(45);
    counts({ sweep: 2, "lookups:a:user-1": 11 });
    expect(await admit(person, ["api", "lookups"], NOW)).toBe(45);
  });

  it("admits up to the limit itself", async () => {
    counts({ sweep: 2, "api:a:user-1": 60, "turns:a:user-1": 10 });
    expect(await admit(person, ["api", "turns"], NOW)).toBeNull();
  });

  it("gives the signature five times a person's limit, because a network is shared", async () => {
    counts({ sweep: 2, "api:s:sig-1": 300 });
    expect(await admit(person, ["api"], NOW)).toBeNull();
    counts({ sweep: 2, "api:s:sig-1": 301 });
    expect(await admit(person, ["api"], NOW)).toBe(45);
  });

  it("counts a device without sign-in by its cookie and signature at 30 a minute", async () => {
    const visitor = { account: null, device: "device-1", signature: "sig-1" };
    counts({ sweep: 2, "unsigned:d:device-1": 30 });
    expect(await admit(visitor, ["unsigned"], NOW)).toBeNull();
    expect(written().map((row) => row.key)).toEqual([
      "unsigned:d:device-1",
      "unsigned:s:sig-1",
      "sweep",
    ]);
    counts({ sweep: 2, "unsigned:d:device-1": 31 });
    expect(await admit(visitor, ["unsigned"], NOW)).toBe(45);
  });

  it("does not count a device it does not know", async () => {
    await admit({ ...person, device: null }, ["api"], NOW);
    expect(written().map((row) => row.key)).toEqual([
      "api:a:user-1",
      "api:s:sig-1",
      "sweep",
    ]);
  });

  it("deletes ended windows once a minute: when this request opened the minute", async () => {
    await admit(person, ["api"], NOW);
    expect(mocks.db.fairUseCount.deleteMany).not.toHaveBeenCalled();
    counts({ sweep: 1 });
    await admit(person, ["api"], NOW);
    expect(mocks.db.fairUseCount.deleteMany).toHaveBeenCalledWith({
      where: { endsAt: { lte: NOW } },
    });
  });
});

describe("limitsOff", () => {
  it("is on only in development, with the flag, off Vercel", () => {
    const flag = { FAIR_USE_LIMITS: "off" };
    expect(limitsOff({ NODE_ENV: "development", ...flag })).toBe(true);
    expect(limitsOff({ NODE_ENV: "production", ...flag })).toBe(false);
    expect(limitsOff({ NODE_ENV: "test", ...flag })).toBe(false);
    expect(limitsOff({ NODE_ENV: "development", ...flag, VERCEL: "1" })).toBe(
      false,
    );
    expect(limitsOff({ NODE_ENV: "development" })).toBe(false);
  });

  it("lets everything through without counting when on", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("FAIR_USE_LIMITS", "off");
    counts({ sweep: 2, "api:a:user-1": 500 });
    expect(await admit(person, ["api"], NOW)).toBeNull();
    expect(
      await asPerson(person, () => withinShare("gather", NOW)),
    ).toBe(true);
    expect(mocks.db.$queryRaw).not.toHaveBeenCalled();
  });

  it("is ignored by a production build, whatever the flag says", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FAIR_USE_LIMITS", "off");
    counts({ sweep: 2, "api:a:user-1": 61 });
    expect(await admit(person, ["api"], NOW)).toBe(45);
  });
});

describe("daily shares", () => {
  it("are not counted outside a request, where there is no person", async () => {
    expect(await withinShare("gather", NOW)).toBe(true);
    expect(mocks.db.$queryRaw).not.toHaveBeenCalled();
  });

  it("count the person's provider requests in the UTC day", async () => {
    counts({ "gather:a:user-1": 30, "gather:s:sig-1": 150 });
    expect(await asPerson(person, () => withinShare("gather", NOW))).toBe(true);
    expect(written()).toEqual([
      { key: "gather:a:user-1", endsAt: DAY_END, amount: 1 },
      { key: "gather:d:device-1", endsAt: DAY_END, amount: 1 },
      { key: "gather:s:sig-1", endsAt: DAY_END, amount: 1 },
    ]);
  });

  it("are used up past 30 place gatherings or 20 address lookups", async () => {
    counts({ "gather:d:device-1": 31 });
    expect(await asPerson(person, () => withinShare("gather", NOW))).toBe(
      false,
    );
    counts({ "addresses:a:user-1": 21 });
    expect(await asPerson(person, () => withinShare("addresses", NOW))).toBe(
      false,
    );
    counts({ "addresses:s:sig-1": 101 });
    expect(await asPerson(person, () => withinShare("addresses", NOW))).toBe(
      false,
    );
  });
});

describe("AI spend share", () => {
  it("records the person's spend in millionths of a dollar, rounded up", async () => {
    await asPerson(person, () => addAiSpend(0.0012345, NOW));
    expect(written()).toEqual([
      { key: "ai:a:user-1", endsAt: DAY_END, amount: 1235 },
      { key: "ai:d:device-1", endsAt: DAY_END, amount: 1235 },
      { key: "ai:s:sig-1", endsAt: DAY_END, amount: 1235 },
    ]);
  });

  it("leaves room until any identifier reaches one dollar a day (five for a signature)", async () => {
    const spent = (rows: { key: string; count: number }[]) =>
      mocks.db.fairUseCount.findMany.mockResolvedValue(rows);

    spent([
      { key: "ai:a:user-1", count: 999_999 },
      { key: "ai:s:sig-1", count: 4_999_999 },
    ]);
    expect(await asPerson(person, () => aiShareLeft(NOW))).toBe(true);
    expect(mocks.db.fairUseCount.findMany).toHaveBeenCalledWith({
      where: {
        key: { in: ["ai:a:user-1", "ai:d:device-1", "ai:s:sig-1"] },
        endsAt: DAY_END,
      },
      select: { key: true, count: true },
    });

    spent([{ key: "ai:d:device-1", count: 1_000_000 }]);
    expect(await asPerson(person, () => aiShareLeft(NOW))).toBe(false);
    spent([{ key: "ai:s:sig-1", count: 5_000_000 }]);
    expect(await asPerson(person, () => aiShareLeft(NOW))).toBe(false);
  });
});

describe("identify", () => {
  const SECRET = "a-test-secret-that-is-long-enough-1234";
  const env = { AUTH_SECRET: SECRET, NODE_ENV: "production" };

  it("gives a new device a signed cookie and does not count it as known yet", () => {
    const { person: found, cookie } = identify(
      new Request("https://example.test/api/v1/profile"),
      "user-1",
      env,
      NOW,
    );
    expect(found.account).toBe("user-1");
    expect(found.device).toBeNull();
    expect(found.signature).toMatch(/^[0-9a-f]{32}$/);
    expect(cookie).toMatch(
      /^tb_device=[\w-]{22}\.[\w-]{43}; Path=\/; Max-Age=34560000; HttpOnly; SameSite=Lax; Secure$/,
    );
  });

  it("replaces a cookie whose signature does not hold", () => {
    const forged = `tb_device=${"A".repeat(22)}.${"B".repeat(43)}`;
    const { person: found, cookie } = identify(
      new Request("https://example.test/", { headers: { cookie: forged } }),
      null,
      env,
      NOW,
    );
    expect(found.device).toBeNull();
    expect(cookie).toMatch(/^tb_device=/);
    expect(cookie).not.toContain("A".repeat(22));
  });

  it("knows a device by its signed cookie and sets nothing new", () => {
    const { id, value } = deviceCookie(SECRET);
    const { person: found, cookie } = identify(
      new Request("https://example.test/", {
        headers: { cookie: `tb_device=${value}` },
      }),
      null,
      env,
      NOW,
    );
    expect(found.device).toBe(id);
    expect(cookie).toBeNull();
  });

  it("marks the cookie Secure only in production", () => {
    const { cookie } = identify(
      new Request("http://localhost/"),
      null,
      { AUTH_SECRET: SECRET, NODE_ENV: "development" },
      NOW,
    );
    expect(cookie).not.toContain("Secure");
  });
});

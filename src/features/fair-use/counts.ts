import { AsyncLocalStorage } from "node:async_hooks";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

import {
  AI_DAILY_SHARE_USD,
  DAILY_SHARES,
  REQUESTS_PER_MINUTE,
  SIGNATURE_FACTOR,
  type Scope,
  type Share,
} from "./limits";
import { DEVICE_COOKIE, deviceCookie, readDevice, signature } from "./person";

/** Who a request counts against: whichever of the three identifiers it carries. */
export type Person = {
  account: string | null;
  /** Null for a device without a valid cookie: it is not known yet. */
  device: string | null;
  signature: string;
};

type Env = Record<string, string | undefined>;

/**
 * The quality checks' switch, for a local development server only:
 * FAIR_USE_LIMITS=off with NODE_ENV "development", off Vercel. A production
 * build (NODE_ENV "production") never honours it.
 */
export function limitsOff(env: Env = process.env): boolean {
  return (
    env.NODE_ENV === "development" &&
    env.FAIR_USE_LIMITS === "off" &&
    !env.VERCEL
  );
}

/** Browsers keep a cookie at most 400 days. */
const DEVICE_MAX_AGE = 400 * 86_400;

/**
 * The person a request comes from, and the Set-Cookie value for a device
 * seen for the first time, or whose cookie was not signed by this site.
 */
export function identify(
  request: Request,
  account: string | null,
  env: Env = process.env,
  now = new Date(),
): { person: Person; cookie: string | null } {
  const secret = env.AUTH_SECRET ?? env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set.");
  const device = readDevice(request.headers.get("cookie"), secret);
  const fresh = device ? null : deviceCookie(secret);
  return {
    person: {
      account,
      device,
      signature: signature(request.headers, secret, now, Boolean(env.VERCEL)),
    },
    cookie:
      fresh &&
      `${DEVICE_COOKIE}=${fresh.value}; Path=/; Max-Age=${DEVICE_MAX_AGE}; HttpOnly; SameSite=Lax${env.NODE_ENV === "production" ? "; Secure" : ""}`,
  };
}

const minuteEnd = (now: Date) =>
  new Date(Math.floor(now.getTime() / 60_000) * 60_000 + 60_000);
const dayEnd = (now: Date) =>
  new Date(
    new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`).getTime() +
      86_400_000,
  );

/** Each identifier's key under one limit, and what it is held to. */
function held(person: Person, scope: string, limit: number) {
  return [
    person.account && { key: `${scope}:a:${person.account}`, limit },
    person.device && { key: `${scope}:d:${person.device}`, limit },
    { key: `${scope}:s:${person.signature}`, limit: limit * SIGNATURE_FACTOR },
  ].filter((item) => !!item);
}

/**
 * Adds `amount` to each key's window in one statement and returns the new
 * counts. Concurrent requests queue on each row, so each sees its own count.
 */
async function add(
  keys: string[],
  endsAt: Date,
  amount: number,
): Promise<Map<string, number>> {
  const rows = await db.$queryRaw<{ key: string; count: number }[]>(
    Prisma.sql`INSERT INTO "fair_use_counts" ("key", "ends_at", "count")
VALUES ${Prisma.join(keys.map((key) => Prisma.sql`(${key}, ${endsAt}, ${amount})`))}
ON CONFLICT ("key", "ends_at") DO UPDATE SET "count" = "fair_use_counts"."count" + EXCLUDED."count"
RETURNING "key", "count"`,
  );
  return new Map(rows.map((row) => [row.key, row.count]));
}

/** One row a minute, across every instance: the request that opens it deletes the ended windows. */
const SWEEP = "sweep";

/**
 * Counts a request against every identifier the person carries, under each
 * scope, in the current minute. Returns null to let it through, or the
 * seconds until the window ends when any one of them is over its limit.
 */
export async function admit(
  person: Person,
  scopes: Scope[],
  now = new Date(),
): Promise<number | null> {
  if (limitsOff()) return null;
  const endsAt = minuteEnd(now);
  const counted = scopes.flatMap((scope) =>
    held(person, scope, REQUESTS_PER_MINUTE[scope]),
  );
  const found = await add(
    [...counted.map((item) => item.key), SWEEP],
    endsAt,
    1,
  );
  if (found.get(SWEEP) === 1) {
    await db.fairUseCount.deleteMany({ where: { endsAt: { lte: now } } });
  }
  return counted.some((item) => (found.get(item.key) ?? 0) > item.limit)
    ? Math.max(1, Math.ceil((endsAt.getTime() - now.getTime()) / 1000))
    : null;
}

// The person of the request being worked on. A daily share is spent deep in
// a service (a provider request), far below the route that knows the person.
const current = new AsyncLocalStorage<Person>();

/** Runs a request's work as this person, so their daily shares are counted. */
export const asPerson = <T>(person: Person, work: () => T): T =>
  current.run(person, work);

/**
 * Counts one provider request against the person's share of a daily
 * allowance (TB-SYS-17). False once any of their identifiers has used it up.
 * Work outside a request has no person and is held only by the shared cap.
 */
export async function withinShare(
  share: Share,
  now = new Date(),
): Promise<boolean> {
  const person = current.getStore();
  if (!person || limitsOff()) return true;
  const counted = held(person, share, DAILY_SHARES[share]);
  const found = await add(
    counted.map((item) => item.key),
    dayEnd(now),
    1,
  );
  return counted.every((item) => (found.get(item.key) ?? 0) <= item.limit);
}

/** AI spend is counted in millionths of a US dollar. */
const MICRO_USD = 1_000_000;

/** Whether the person has spent less than their daily share of the AI model. */
export async function aiShareLeft(now = new Date()): Promise<boolean> {
  const person = current.getStore();
  if (!person || limitsOff()) return true;
  const counted = held(person, "ai", AI_DAILY_SHARE_USD * MICRO_USD);
  const rows = await db.fairUseCount.findMany({
    where: {
      key: { in: counted.map((item) => item.key) },
      endsAt: dayEnd(now),
    },
    select: { key: true, count: true },
  });
  const spent = new Map(rows.map((row) => [row.key, row.count]));
  return counted.every((item) => (spent.get(item.key) ?? 0) < item.limit);
}

/**
 * Records what one model call cost against the person's daily share. The
 * month's total is kept by Conversation; this only divides it among people.
 */
export async function addAiSpend(usd: number, now = new Date()): Promise<void> {
  const person = current.getStore();
  if (!person || usd <= 0 || limitsOff()) return;
  await add(
    held(person, "ai", 0).map((item) => item.key),
    dayEnd(now),
    Math.ceil(usd * MICRO_USD),
  );
}

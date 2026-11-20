import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

import type { City, PlaceDto } from "./contracts";
import { isMealKind, PLACE_KINDS, type PlaceKind } from "./kinds";
import {
  activeSource,
  cityKey,
  foodScope,
  type FoundPlace,
  type Gathered,
  type PlaceSource,
  type Point,
  type Reach,
} from "./place-source";
import { hoursDoubt } from "./opening-hours";
import { distanceKm } from "./travel";

/**
 * "unavailable": the provider could not be reached. "capped": today's request
 * allowance is used up. In both cases nothing was fetched and saved places
 * remain usable (TB-TRU-06, TB-SYS-11).
 */
export type GatherOutcome = { status: "ready" | "unavailable" | "capped" };

const DAILY_CAP = Number(process.env.PLACE_DAILY_REQUEST_CAP ?? 100);
const FOOD_REACH_KM = 1.5;
/** Saved places are fetched again once their record is this old. */
export const REFRESH_DAYS = 30;
/** Raised when a query changes, so its places are fetched again on next use. */
export const QUERY_VERSION = { sights: 2, food: 3 } as const;

type PlaceRow = Prisma.PlaceGetPayload<object>;

/** The saved tags with string values only: the column can hold any JSON. */
function savedTags(json: Prisma.JsonValue): Record<string, string> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  return Object.fromEntries(
    Object.entries(json).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

const todayUtc = () => new Date().toISOString().slice(0, 10);

/**
 * One server log line for a request that ends as "unavailable": the error's
 * Prisma and Postgres codes and its message, never what the traveller typed.
 */
function logFailure(error: unknown): void {
  const { message, code, meta } = (error ?? {}) as {
    message?: unknown;
    code?: unknown;
    meta?: { code?: unknown };
  };
  const codes = [code, meta?.code].filter(Boolean).join(" ");
  const text = String(message ?? error)
    .replace(/\s+/g, " ")
    .slice(0, 300);
  console.error(`[places] ${codes ? `${codes} ` : ""}${text}`);
}

/** `today` is read once by the caller, so every row of one answer is judged on the same day. */
function toDto(row: PlaceRow, today: string): PlaceDto {
  const dto = {
    id: row.id,
    origin: row.origin,
    name: row.name,
    cityKey: row.cityKey,
    kind: (PLACE_KINDS as readonly string[]).includes(row.kind)
      ? (row.kind as PlaceKind)
      : "sight",
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    address: row.address,
    openingHours: row.openingHours,
    notable: row.notable,
    serves: row.serves,
    servesNot: row.servesNot,
    originRef: row.originRef,
    tags: savedTags(row.osmTags),
    lastEditedAt: row.lastEditedAt?.toISOString() ?? null,
    fetchedAt: row.fetchedAt?.toISOString() ?? null,
  };
  return {
    ...dto,
    hoursDoubt: hoursDoubt(dto, today),
  };
}

/** A city with a known position; places cannot be gathered without one. */
function located(city: City): (City & Point) | null {
  return city.latitude === null || city.longitude === null
    ? null
    : { ...city, latitude: city.latitude, longitude: city.longitude };
}

/** Counts one request to the provider today. False once the cap is passed. */
export async function withinCap(
  service: string,
  cap = DAILY_CAP,
): Promise<boolean> {
  const day = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const row = await db.providerCall.upsert({
    where: { day_service: { day, service } },
    create: { day, service, count: 1 },
    update: { count: { increment: 1 } },
  });
  return row.count <= cap;
}

// One insert for all places. A refetch updates in place, so the id stays and
// plans that point at it stay valid. A name search only adds new places: its
// thinner data must not overwrite what a full fetch saved, nor bring back a
// place a refresh found gone. Only a refresh that returns it again does.
async function save(
  source: PlaceSource,
  key: string,
  found: FoundPlace[],
  onConflict: "update" | "keep",
): Promise<void> {
  const unique = [...new Map(found.map((p) => [p.originRef, p])).values()];
  if (unique.length === 0) return;
  const rows = unique.map(
    (p) =>
      Prisma.sql`(${source.origin}::"PlaceOrigin", ${p.originRef}, ${key}, ${p.name}, ${p.kind}, ${p.latitude}, ${p.longitude}, ${p.address}, ${p.openingHours}, ${p.notable}, ${p.serves}, ${p.servesNot}, ${p.tags ? JSON.stringify(p.tags) : null}::jsonb, ${p.lastEditedAt}, now(), now())`,
  );
  const conflict =
    onConflict === "keep"
      ? Prisma.sql`ON CONFLICT ("origin", "origin_ref") DO NOTHING`
      : Prisma.sql`ON CONFLICT ("origin", "origin_ref") DO UPDATE SET
  "name" = EXCLUDED."name", "kind" = EXCLUDED."kind", "latitude" = EXCLUDED."latitude", "longitude" = EXCLUDED."longitude",
  "address" = EXCLUDED."address", "opening_hours" = EXCLUDED."opening_hours", "notable" = EXCLUDED."notable",
  "serves" = EXCLUDED."serves", "serves_not" = EXCLUDED."serves_not", "osm_tags" = EXCLUDED."osm_tags",
  "last_edited_at" = EXCLUDED."last_edited_at", "fetched_at" = EXCLUDED."fetched_at", "updated_at" = EXCLUDED."updated_at", "gone_at" = NULL`;
  await db.$executeRaw`INSERT INTO "places" ("origin", "origin_ref", "city_key", "name", "kind", "latitude", "longitude", "address", "opening_hours", "notable", "serves", "serves_not", "osm_tags", "last_edited_at", "fetched_at", "updated_at")
VALUES ${Prisma.join(rows)}
${conflict}`;
}

/**
 * A refresh marks gone each saved place it asks for, inside its circle, that
 * it no longer returned. A gone place is never offered on a card again; a plan
 * that holds it keeps it, since getPlaces still reads it.
 */
async function markGone(
  source: PlaceSource,
  key: string,
  found: FoundPlace[],
  reach: Reach,
): Promise<void> {
  const returned = new Set(found.map((place) => place.originRef));
  const saved = await db.place.findMany({
    where: { origin: source.origin, cityKey: key, goneAt: null },
    select: {
      id: true,
      originRef: true,
      latitude: true,
      longitude: true,
      osmTags: true,
    },
  });
  const gone = saved.filter(
    (place) =>
      place.originRef !== null &&
      !returned.has(place.originRef) &&
      place.latitude !== null &&
      place.longitude !== null &&
      // Overpass measures a way's outline and only its centre is saved: a margin.
      distanceKm(reach.centre, {
        latitude: Number(place.latitude),
        longitude: Number(place.longitude),
      }) *
        1000 <=
        reach.radiusM * 0.9 &&
      reach.asks(savedTags(place.osmTags)),
  );
  if (gone.length === 0) return;
  await db.place.updateMany({
    where: { id: { in: gone.map((place) => place.id) } },
    data: { goneAt: new Date() },
  });
}

/**
 * Makes sure one set of places is saved, asking the provider at most once
 * per REFRESH_DAYS. The record of a finished request is kept per provider and
 * query version, so sample places never stand in for a real request and a
 * changed query is fetched again.
 */
async function gather(
  city: City,
  scope: keyof typeof QUERY_VERSION,
  detail: string,
  request: (source: PlaceSource, city: City & Point) => Promise<Gathered>,
): Promise<GatherOutcome> {
  const source = activeSource();
  const key = cityKey(city);
  const fetchKey = {
    cityKey: key,
    scope: `${source.origin}:${detail}#${QUERY_VERSION[scope]}`,
  };

  const done = await db.placeFetch.findUnique({
    where: { cityKey_scope: fetchKey },
    select: { fetchedAt: true },
  });
  if (
    done &&
    Date.now() - done.fetchedAt.getTime() < REFRESH_DAYS * 86_400_000
  ) {
    return { status: "ready" };
  }

  const where = located(city);
  if (!where) return { status: "unavailable" };
  if (source.metered && !(await withinCap(source.origin))) {
    return { status: "capped" };
  }

  try {
    const { places: found, reach } = await request(source, where);
    await save(source, key, found, "update");
    // Only a refresh: a first fetch, also after a query change, proves nothing.
    if (done && reach) await markGone(source, key, found, reach);
    await db.placeFetch.upsert({
      where: { cityKey_scope: fetchKey },
      create: { ...fetchKey, placeCount: found.length },
      update: { placeCount: found.length, fetchedAt: new Date() },
    });
    return { status: "ready" };
  } catch (error) {
    logFailure(error);
    return { status: "unavailable" };
  }
}

/** Makes sure the city's things to see and do are saved. One provider request at most. */
export function gatherSights(city: City): Promise<GatherOutcome> {
  return gather(city, "sights", "sights", (source, where) =>
    source.sights(where),
  );
}

/** Makes sure the places to eat near a point are saved. One provider request at most. */
export function gatherFoodNear(
  city: City,
  point: Point,
): Promise<GatherOutcome> {
  const { scope, centre } = foodScope(point);
  return gather(city, "food", scope, (source, where) =>
    source.foodNear(where, centre),
  );
}

/** Rows the traveller may be offered: the active provider's, and their own; never a gone place. */
function visible(key: string, userId: string): Prisma.PlaceWhereInput {
  return {
    cityKey: key,
    goneAt: null,
    OR: [
      { origin: activeSource().origin },
      { origin: "USER", addedByUserId: userId },
    ],
  };
}

/** The city's saved things to see and do, in a fixed order. */
export async function listSights(
  city: City,
  userId: string,
): Promise<PlaceDto[]> {
  const rows = await db.place.findMany({
    where: {
      ...visible(cityKey(city), userId),
      kind: { in: PLACE_KINDS.filter((kind) => !isMealKind(kind)) },
    },
    orderBy: { id: "asc" },
  });
  const today = todayUtc();
  return rows.map((row) => toDto(row, today));
}

/** The saved places to eat within walking distance of a point, in a fixed order. */
export async function listFoodNear(
  city: City,
  point: Point,
  userId: string,
): Promise<PlaceDto[]> {
  const rows = await db.place.findMany({
    where: {
      ...visible(cityKey(city), userId),
      kind: { in: PLACE_KINDS.filter(isMealKind) },
    },
    orderBy: { id: "asc" },
  });
  const today = todayUtc();
  return rows
    .map((row) => toDto(row, today))
    .filter(
      (place) =>
        place.latitude === null ||
        place.longitude === null ||
        distanceKm(point, {
          latitude: place.latitude,
          longitude: place.longitude,
        }) <= FOOD_REACH_KM,
    );
}

/** Saved places by id. A traveller's own place is returned only to them. */
export async function getPlaces(
  ids: string[],
  userId: string,
): Promise<PlaceDto[]> {
  if (ids.length === 0) return [];
  const rows = await db.place.findMany({
    where: {
      id: { in: ids },
      OR: [{ origin: { not: "USER" } }, { addedByUserId: userId }],
    },
  });
  const today = todayUtc();
  return rows.map((row) => toDto(row, today));
}

export type PlaceSearchOutcome =
  | { status: "ok"; places: PlaceDto[] }
  | { status: "unavailable" | "capped" };

/**
 * Places whose name matches what the traveller typed, saved so they can be
 * added to a plan (TB-CRD-10). Called on submit, never while typing.
 */
export async function findPlacesByName(
  city: City,
  text: string,
): Promise<PlaceSearchOutcome> {
  const query = text.trim();
  const where = located(city);
  if (query.length < 2 || query.length > 80)
    return { status: "ok", places: [] };
  if (!where) return { status: "unavailable" };

  const source = activeSource();
  if (source.metered && !(await withinCap(source.origin))) {
    return { status: "capped" };
  }
  try {
    const found = await source.byName(where, query);
    const key = cityKey(city);
    await save(source, key, found, "keep");
    const rows = await db.place.findMany({
      where: {
        origin: source.origin,
        originRef: { in: found.map((place) => place.originRef) },
        goneAt: null,
      },
      orderBy: { id: "asc" },
    });
    const today = todayUtc();
    return { status: "ok", places: rows.map((row) => toDto(row, today)) };
  } catch (error) {
    logFailure(error);
    return { status: "unavailable" };
  }
}

/**
 * A place the provider does not know, entered by hand. It is marked as the
 * traveller's own and shown only to them (TB-CRD-11).
 */
export async function addOwnPlace(
  userId: string,
  city: City,
  input: { name: string; kind: PlaceKind },
): Promise<PlaceDto> {
  const row = await db.place.create({
    data: {
      origin: "USER",
      cityKey: cityKey(city),
      name: input.name,
      kind: input.kind,
      addedByUserId: userId,
    },
  });
  return toDto(row, todayUtc());
}

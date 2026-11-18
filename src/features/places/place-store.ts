import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

import type { City, PlaceDto } from "./contracts";
import { isMealKind, PLACE_KINDS, type PlaceKind } from "./kinds";
import {
  activeSource,
  cityKey,
  foodScope,
  type FoundPlace,
  type PlaceSource,
  type Point,
} from "./place-source";
import { distanceKm } from "./travel";

/**
 * "unavailable": the provider could not be reached. "capped": today's request
 * allowance is used up. In both cases nothing was fetched and saved places
 * remain usable (TB-TRU-06, TB-SYS-11).
 */
export type GatherOutcome = { status: "ready" | "unavailable" | "capped" };

const DAILY_CAP = Number(process.env.PLACE_DAILY_REQUEST_CAP ?? 100);
const FOOD_REACH_KM = 1.5;

type PlaceRow = Prisma.PlaceGetPayload<object>;

function toDto(row: PlaceRow): PlaceDto {
  return {
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
  };
}

/** A city with a known position; places cannot be gathered without one. */
function located(city: City): (City & Point) | null {
  return city.latitude === null || city.longitude === null
    ? null
    : { ...city, latitude: city.latitude, longitude: city.longitude };
}

/** Counts one request to the provider today. False once the cap is passed. */
async function withinCap(service: string): Promise<boolean> {
  const day = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const row = await db.providerCall.upsert({
    where: { day_service: { day, service } },
    create: { day, service, count: 1 },
    update: { count: { increment: 1 } },
  });
  return row.count <= DAILY_CAP;
}

async function save(
  source: PlaceSource,
  key: string,
  found: FoundPlace[],
): Promise<void> {
  if (found.length === 0) return;
  await db.place.createMany({
    data: found.map((place) => ({
      ...place,
      origin: source.origin,
      cityKey: key,
    })),
    skipDuplicates: true,
  });
}

/**
 * Makes sure one set of places is saved, asking the provider at most once.
 * The record of a finished request is kept per provider, so sample places
 * never stand in for a real request.
 */
async function gather(
  city: City,
  scope: string,
  request: (source: PlaceSource, city: City & Point) => Promise<FoundPlace[]>,
): Promise<GatherOutcome> {
  const source = activeSource();
  const key = cityKey(city);
  const fetchKey = { cityKey: key, scope: `${source.origin}:${scope}` };

  const done = await db.placeFetch.findUnique({
    where: { cityKey_scope: fetchKey },
    select: { id: true },
  });
  if (done) return { status: "ready" };

  const where = located(city);
  if (!where) return { status: "unavailable" };
  if (source.metered && !(await withinCap(source.origin))) {
    return { status: "capped" };
  }

  try {
    const found = await request(source, where);
    await save(source, key, found);
    await db.placeFetch.upsert({
      where: { cityKey_scope: fetchKey },
      create: { ...fetchKey, placeCount: found.length },
      update: { placeCount: found.length, fetchedAt: new Date() },
    });
    return { status: "ready" };
  } catch {
    return { status: "unavailable" };
  }
}

/** Makes sure the city's things to see and do are saved. One provider request at most. */
export function gatherSights(city: City): Promise<GatherOutcome> {
  return gather(city, "sights", (source, where) => source.sights(where));
}

/** Makes sure the places to eat near a point are saved. One provider request at most. */
export function gatherFoodNear(
  city: City,
  point: Point,
): Promise<GatherOutcome> {
  const { scope, centre } = foodScope(point);
  return gather(city, scope, (source, where) => source.foodNear(where, centre));
}

/** Rows the traveller may see: the active provider's, and their own. */
function visible(key: string, userId: string): Prisma.PlaceWhereInput {
  return {
    cityKey: key,
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
  return rows.map(toDto);
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
  return rows.map(toDto).filter(
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
  return rows.map(toDto);
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
    await save(source, key, found);
    const rows = await db.place.findMany({
      where: {
        origin: source.origin,
        originRef: { in: found.map((place) => place.originRef) },
      },
      orderBy: { id: "asc" },
    });
    return { status: "ok", places: rows.map(toDto) };
  } catch {
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
  return toDto(row);
}

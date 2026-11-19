import type { Prisma } from "@/generated/prisma/client";
import { buildTripOwnerWhere } from "@/lib/authorization-rules";
import { db } from "@/lib/db";

import { findClashes } from "./clashes";
import {
  commitmentOrder,
  commitmentSelect,
  toCommitmentDto,
} from "./commitment-store";
import { NEW_TRIP_TITLE } from "./contracts";
import type {
  PlanningMode,
  TicketInput,
  TripDetail,
  TripFacts,
  TripFactsInput,
  TripSummary,
} from "./contracts";
import { ticketTitle } from "./tickets";
import { findEditable, type Refused } from "./trip-access";
import { missingFacts, todayIn, tripState } from "./trip-state";

type Tx = Prisma.TransactionClient;

const summarySelect = {
  id: true,
  title: true,
  status: true,
  planningRevision: true,
  planningMode: true,
  planFinishedAt: true,
  startDate: true,
  endDate: true,
  lengthNights: true,
  timeOfYear: true,
  datesFirmness: true,
  adults: true,
  children: true,
  budgetAmount: true,
  budgetCurrency: true,
  budgetBasis: true,
  budgetFirmness: true,
  purpose: true,
  destinations: {
    select: {
      city: true,
      region: true,
      country: true,
      latitude: true,
      longitude: true,
      timeZone: true,
      nights: true,
    },
    orderBy: { sortOrder: "asc" },
  },
} satisfies Prisma.TripSelect;

type TripRow = Prisma.TripGetPayload<{ select: typeof summarySelect }>;

const dateOnly = (value: Date | null) =>
  value ? value.toISOString().slice(0, 10) : null;
const asDate = (value: string | null) =>
  value ? new Date(`${value}T00:00:00Z`) : null;
const asNumber = (value: { toString(): string } | null) =>
  value === null ? null : Number(value);

function toFacts(row: TripRow): TripFacts {
  return {
    cities: row.destinations.map((destination) => ({
      city: {
        name: destination.city,
        region: destination.region,
        country: destination.country,
        latitude: asNumber(destination.latitude),
        longitude: asNumber(destination.longitude),
        timeZone: destination.timeZone,
      },
      nights: destination.nights,
    })),
    startDate: dateOnly(row.startDate),
    endDate: dateOnly(row.endDate),
    lengthNights: row.lengthNights,
    timeOfYear: row.timeOfYear,
    datesFirmness: row.datesFirmness,
    adults: row.adults,
    children: row.children,
    budgetAmount: asNumber(row.budgetAmount),
    budgetCurrency: row.budgetCurrency as TripFacts["budgetCurrency"],
    budgetBasis: row.budgetBasis,
    budgetFirmness: row.budgetFirmness,
    purpose: row.purpose,
  };
}

function toSummary(
  row: TripRow,
  commitmentCount: number,
  now: Date,
): TripSummary & { facts: TripFacts } {
  const facts = toFacts(row);
  const lastZone = row.destinations.at(-1)?.timeZone ?? null;
  return {
    id: row.id,
    title: row.title,
    state: tripState(
      { planFinished: row.planFinishedAt !== null, endDate: facts.endDate },
      todayIn(lastZone, now),
    ),
    archived: row.status === "ARCHIVED",
    revision: row.planningRevision,
    planningMode: row.planningMode,
    startDate: facts.startDate,
    endDate: facts.endDate,
    cities: facts.cities.map(({ city }) => city.name),
    commitmentCount,
    missingFacts: missingFacts(facts),
    facts,
  };
}

/** The traveller's trips, most recently changed first. Archived trips are included. */
export async function listTrips(
  userId: string,
  now = new Date(),
): Promise<TripSummary[]> {
  const rows = await db.trip.findMany({
    where: { userId },
    select: { ...summarySelect, _count: { select: { commitments: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map((row) => {
    const summary: TripSummary & { facts?: TripFacts } = toSummary(
      row,
      row._count.commitments,
      now,
    );
    // The facts are for the trip page; Home needs only the summary.
    delete summary.facts;
    return summary;
  });
}

/**
 * The traveller's trips whose plans are marked finished, oldest first. A
 * trip counts toward what the site learns once its plan is finished (PRD 12.4).
 * `title` is a name to recognise the trip by: its own title, or its first
 * city and month while the title is still the one every new trip starts with.
 */
export async function listFinishedTrips(
  userId: string,
): Promise<{ id: string; title: string; finishedAt: string }[]> {
  const rows = await db.trip.findMany({
    where: { userId, planFinishedAt: { not: null } },
    select: {
      id: true,
      title: true,
      planFinishedAt: true,
      startDate: true,
      destinations: {
        select: { city: true },
        orderBy: { sortOrder: "asc" },
        take: 1,
      },
    },
    orderBy: { planFinishedAt: "asc" },
  });
  return rows.map((row) => {
    const city = row.destinations[0]?.city;
    const month = row.startDate
      ? new Intl.DateTimeFormat("en-GB", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(row.startDate)
      : null;
    return {
      id: row.id,
      title:
        row.title !== NEW_TRIP_TITLE || !city
          ? row.title
          : month
            ? `${city}, ${month}`
            : city,
      finishedAt: row.planFinishedAt!.toISOString(),
    };
  });
}

/** One trip with its facts and commitments, or null when it is not the traveller's. */
export async function getTrip(
  userId: string,
  tripId: string,
  now = new Date(),
): Promise<TripDetail | null> {
  const row = await db.trip.findFirst({
    where: buildTripOwnerWhere(userId, tripId),
    select: {
      ...summarySelect,
      commitments: { select: commitmentSelect, orderBy: commitmentOrder },
    },
  });
  if (!row) return null;

  const commitments = row.commitments.map(toCommitmentDto);
  return {
    ...toSummary(row, commitments.length, now),
    commitments,
    clashes: findClashes(commitments),
  };
}

export type NewTrip = {
  title: string;
  planningMode: PlanningMode;
  startDate: string | null;
  endDate: string | null;
  cities: TripFacts["cities"];
  tickets: TicketInput[];
};

/** Creates the trip, its cities and one transport commitment per ticket, all or nothing. */
export async function createTrip(
  userId: string,
  input: NewTrip,
): Promise<{ id: string }> {
  return db.trip.create({
    data: {
      userId,
      title: input.title,
      status: "PLANNING",
      planningMode: input.planningMode,
      startDate: asDate(input.startDate),
      endDate: asDate(input.endDate),
      // Booked tickets fix the dates until the traveller says otherwise.
      datesFirmness: input.startDate ? "FIXED" : null,
      destinations: { create: input.cities.map(destinationData) },
      commitments: {
        create: input.tickets.map((ticket) => ({
          kind: "TRANSPORT" as const,
          title: ticketTitle(ticket),
          date: asDate(ticket.departDate),
          startTime: ticket.departTime,
          endDate: asDate(ticket.arriveDate),
          endTime: ticket.arriveTime,
          reference: ticket.reference,
          transportMode: ticket.mode,
          origin: ticket.from,
          destination: ticket.to,
        })),
      },
    },
    select: { id: true },
  });
}

function destinationData(
  { city, nights }: TripFacts["cities"][number],
  sortOrder: number,
) {
  return {
    city: city.name,
    region: city.region,
    country: city.country,
    latitude: city.latitude,
    longitude: city.longitude,
    timeZone: city.timeZone,
    nights,
    sortOrder,
  };
}

export async function renameTrip(
  tx: Tx,
  userId: string,
  tripId: string,
  title: string,
): Promise<Refused | { title: string }> {
  const refused = await findEditable(tx, userId, tripId);
  if (refused) return refused;
  await tx.trip.update({ where: { id: tripId }, data: { title } });
  return { title };
}

/** Saves the facts the input names and leaves the rest as they were. */
export async function saveTripFacts(
  tx: Tx,
  userId: string,
  tripId: string,
  facts: TripFactsInput,
): Promise<Refused | { saved: true }> {
  const refused = await findEditable(tx, userId, tripId);
  if (refused) return refused;

  const { cities, startDate, endDate, ...plain } = facts;
  await tx.trip.update({
    where: { id: tripId },
    data: {
      ...plain,
      ...(startDate === undefined ? {} : { startDate: asDate(startDate) }),
      ...(endDate === undefined ? {} : { endDate: asDate(endDate) }),
    },
  });
  if (cities) await replaceCities(tx, tripId, cities);
  return { saved: true };
}

/**
 * Rewrites the ordered cities in place. Rows are reused by position, because
 * places suggested by the earlier planner may still point at them.
 */
async function replaceCities(
  tx: Tx,
  tripId: string,
  cities: TripFacts["cities"],
) {
  const existing = await tx.tripDestination.findMany({
    where: { tripId },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  for (const [index, entry] of cities.entries()) {
    const data = destinationData(entry, index);
    if (existing[index]) {
      await tx.tripDestination.update({
        where: { id: existing[index].id },
        data,
      });
    } else {
      await tx.tripDestination.create({ data: { ...data, tripId } });
    }
  }
  const surplus = existing.slice(cities.length).map((row) => row.id);
  if (surplus.length === 0) return;
  await tx.tripDestination.deleteMany({ where: { id: { in: surplus } } });
}

/** Archiving hides a trip from Home; restoring puts it back in planning. */
export async function setTripArchived(
  tx: Tx,
  userId: string,
  tripId: string,
  archived: boolean,
): Promise<"not_found" | { archived: boolean }> {
  const updated = await tx.trip.updateMany({
    where: buildTripOwnerWhere(userId, tripId),
    data: { status: archived ? "ARCHIVED" : "PLANNING" },
  });
  return updated.count === 1 ? { archived } : "not_found";
}

/** Marking the plan finished moves the trip to upcoming; reopening returns it to planning. */
export async function setPlanFinished(
  tx: Tx,
  userId: string,
  tripId: string,
  finished: boolean,
): Promise<Refused | { finished: boolean }> {
  const refused = await findEditable(tx, userId, tripId);
  if (refused) return refused;
  await tx.trip.update({
    where: { id: tripId },
    data: { planFinishedAt: finished ? new Date() : null },
  });
  return { finished };
}

/** Changes the way the trip is planned: in conversation or from a brief (TB-STA-04). */
export async function setPlanningMode(
  tx: Tx,
  userId: string,
  tripId: string,
  planningMode: PlanningMode,
): Promise<Refused | { planningMode: PlanningMode }> {
  const refused = await findEditable(tx, userId, tripId);
  if (refused) return refused;
  await tx.trip.update({ where: { id: tripId }, data: { planningMode } });
  return { planningMode };
}

/** Deletes the trip and everything that belongs to it. False when it is not the traveller's. */
export async function removeTrip(
  userId: string,
  tripId: string,
): Promise<boolean> {
  const deleted = await db.trip.deleteMany({
    where: buildTripOwnerWhere(userId, tripId),
  });
  return deleted.count === 1;
}

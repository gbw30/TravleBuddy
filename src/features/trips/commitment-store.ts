import type { Prisma } from "@/generated/prisma/client";

import { findClashes } from "./clashes";
import type { Clash, CommitmentDto, CommitmentInput } from "./contracts";
import { withCityZones } from "./tickets";
import { findEditable, type Refused } from "./trip-access";

type Tx = Prisma.TransactionClient;

/** More than a trip can hold; a guard against a runaway client, not a product limit. */
const MAX_COMMITMENTS = 100;

/** Whether a trip already holds as many commitments as it may. */
export const commitmentsFull = (count: number): boolean =>
  count >= MAX_COMMITMENTS;

export const commitmentSelect = {
  id: true,
  kind: true,
  title: true,
  date: true,
  startTime: true,
  endDate: true,
  endTime: true,
  reference: true,
  note: true,
  transportMode: true,
  origin: true,
  destination: true,
  originTimeZone: true,
  destinationTimeZone: true,
  latitude: true,
  longitude: true,
  locatedRef: true,
  locatedAddress: true,
} satisfies Prisma.FixedCommitmentSelect;

export const commitmentOrder = [
  { date: "asc" },
  { startTime: "asc" },
  { createdAt: "asc" },
] satisfies Prisma.FixedCommitmentOrderByWithRelationInput[];

type CommitmentRow = Prisma.FixedCommitmentGetPayload<{
  select: typeof commitmentSelect;
}>;

const dateOnly = (value: Date | null) =>
  value ? value.toISOString().slice(0, 10) : null;
const asDate = (value: string | null) =>
  value ? new Date(`${value}T00:00:00Z`) : null;

export function toCommitmentDto(row: CommitmentRow): CommitmentDto {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    date: dateOnly(row.date),
    startTime: row.startTime,
    endDate: dateOnly(row.endDate),
    endTime: row.endTime,
    reference: row.reference,
    note: row.note,
    located:
      row.latitude !== null &&
      row.longitude !== null &&
      row.locatedRef &&
      row.locatedAddress
        ? {
            latitude: Number(row.latitude),
            longitude: Number(row.longitude),
            ref: row.locatedRef,
            address: row.locatedAddress,
          }
        : null,
    transportMode: row.transportMode,
    transport:
      row.transportMode && row.origin && row.destination
        ? {
            mode: row.transportMode,
            origin: row.origin,
            destination: row.destination,
            originZone: row.originTimeZone,
            destinationZone: row.destinationTimeZone,
          }
        : null,
  };
}

/** Every commitment of the trip after a change, with the clashes among them. */
export type CommitmentsResult = {
  commitments: CommitmentDto[];
  clashes: Clash[];
};

async function currentCommitments(
  tx: Tx,
  tripId: string,
): Promise<CommitmentsResult> {
  const rows = await tx.fixedCommitment.findMany({
    where: { tripId },
    select: commitmentSelect,
    orderBy: commitmentOrder,
  });
  const cities = await tx.tripDestination.findMany({
    where: { tripId },
    select: { city: true, timeZone: true },
  });
  const commitments = withCityZones(
    rows.map(toCommitmentDto),
    cities.map(({ city, timeZone }) => ({ name: city, timeZone })),
  );
  // Both sides of a clash are kept: the traveller decides (TB-FIX-06).
  return { commitments, clashes: findClashes(commitments) };
}

function rowData(input: CommitmentInput) {
  return {
    kind: input.kind,
    title: input.title,
    date: asDate(input.date),
    startTime: input.startTime,
    endDate: asDate(input.endDate),
    endTime: input.endTime,
    reference: input.reference,
    note: input.note,
    latitude: input.located?.latitude ?? null,
    longitude: input.located?.longitude ?? null,
    locatedRef: input.located?.ref ?? null,
    locatedAddress: input.located?.address ?? null,
    transportMode: input.transportMode,
  };
}

export async function addCommitment(
  tx: Tx,
  userId: string,
  tripId: string,
  input: CommitmentInput,
): Promise<Refused | "too_many" | CommitmentsResult> {
  const refused = await findEditable(tx, userId, tripId);
  if (refused) return refused;
  if (commitmentsFull(await tx.fixedCommitment.count({ where: { tripId } }))) {
    return "too_many";
  }
  await tx.fixedCommitment.create({ data: { ...rowData(input), tripId } });
  return currentCommitments(tx, tripId);
}

export async function updateCommitment(
  tx: Tx,
  userId: string,
  tripId: string,
  commitmentId: string,
  input: CommitmentInput,
  /** Zones found for a ticket's ends that had none. */
  zones: { originTimeZone?: string; destinationTimeZone?: string } = {},
): Promise<Refused | CommitmentsResult> {
  const refused = await findEditable(tx, userId, tripId);
  if (refused) return refused;
  const updated = await tx.fixedCommitment.updateMany({
    where: { id: commitmentId, tripId },
    data: {
      ...rowData(input),
      // A ticket turned into something else no longer has a route.
      ...(input.kind === "TRANSPORT"
        ? zones
        : {
            origin: null,
            destination: null,
            originTimeZone: null,
            destinationTimeZone: null,
          }),
    },
  });
  if (updated.count !== 1) return "not_found";
  return currentCommitments(tx, tripId);
}

export async function removeCommitment(
  tx: Tx,
  userId: string,
  tripId: string,
  commitmentId: string,
): Promise<Refused | CommitmentsResult> {
  const refused = await findEditable(tx, userId, tripId);
  if (refused) return refused;
  const deleted = await tx.fixedCommitment.deleteMany({
    where: { id: commitmentId, tripId },
  });
  if (deleted.count !== 1) return "not_found";
  return currentCommitments(tx, tripId);
}

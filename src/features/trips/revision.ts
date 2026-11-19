import type { Prisma } from "@/generated/prisma/client";
import { buildTripOwnerWhere } from "@/lib/authorization-rules";

type Tx = Prisma.TransactionClient;

// The trip's side of the replay ledger (TB-SYS-05, TB-SYS-07). The ledger
// belongs to another service, so it reads and moves a trip's revision here.

/** A trip as an action on it needs it. Null when it is not the traveller's. */
export function tripForAction(tx: Tx, userId: string, tripId: string) {
  return tx.trip.findFirst({
    where: buildTripOwnerWhere(userId, tripId),
    select: { id: true, status: true, planningRevision: true },
  });
}

/**
 * Moves a trip to its next revision, only while it is still at the expected
 * one. Null when the trip is not the traveller's or has moved on.
 */
export async function advanceTripRevision(
  tx: Tx,
  userId: string,
  tripId: string,
  expectedRevision: number | undefined,
): Promise<number | null> {
  const updated = await tx.trip.updateMany({
    where: {
      ...buildTripOwnerWhere(userId, tripId),
      ...(expectedRevision === undefined
        ? {}
        : { planningRevision: expectedRevision }),
    },
    data: {
      planningRevision: { increment: 1 },
      tripVersion: { increment: 1 },
    },
  });
  if (updated.count !== 1) return null;
  const trip = await tx.trip.findUniqueOrThrow({
    where: { id: tripId },
    select: { planningRevision: true },
  });
  return trip.planningRevision;
}

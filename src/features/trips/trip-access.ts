import type { Prisma } from "@/generated/prisma/client";
import { buildTripOwnerWhere } from "@/lib/authorization-rules";

/** A change the caller asked for that the trip's state does not allow. */
export type Refused = "not_found" | "archived" | "bad_dates";

/**
 * Null when the traveller owns the trip and may still change it. A trip that
 * belongs to someone else is "not_found", never "forbidden" (TB-ACC-01).
 */
export async function findEditable(
  tx: Prisma.TransactionClient,
  userId: string,
  tripId: string,
): Promise<Refused | null> {
  const trip = await tx.trip.findFirst({
    where: buildTripOwnerWhere(userId, tripId),
    select: { status: true },
  });
  if (!trip) return "not_found";
  return trip.status === "ARCHIVED" ? "archived" : null;
}

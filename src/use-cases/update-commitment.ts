import { ticketLength } from "@/features/itinerary/contracts";
import { getTrip, updateCommitment } from "@/features/trips";
import {
  LANDS_BEFORE_LEAVING,
  type CommitmentInput,
} from "@/features/trips/contracts";

import { ticketZones } from "./ticket-zones";
import { runTripAction } from "./trip-action";

/**
 * Replaces a fixed commitment's details. For a ticket, an end whose zone is
 * still unknown (its lookup failed, or found no single answer) is looked up
 * again first, outside the change's transaction, and a zone found is saved.
 */
export async function updateTripCommitment(
  userId: string,
  tripId: string,
  commitmentId: string,
  commitment: CommitmentInput,
  control: { operationId: string; expectedRevision: number },
) {
  const trip =
    commitment.kind === "TRANSPORT" ? await getTrip(userId, tripId) : null;
  const route = trip?.commitments.find((c) => c.id === commitmentId)?.transport;
  const zones: { originTimeZone?: string; destinationTimeZone?: string } = {};
  if (trip && route) {
    const zoneOf = ticketZones(trip.facts.cities.map(({ city }) => city));
    const origin = route.originZone ?? (await zoneOf(route.origin));
    const destination =
      route.destinationZone ?? (await zoneOf(route.destination));
    if (!route.originZone && origin) zones.originTimeZone = origin;
    if (!route.destinationZone && destination)
      zones.destinationTimeZone = destination;
    // Both clocks decide whether it lands after it leaves (TB-ITN-26).
    const length = ticketLength({
      ...commitment,
      originZone: route.originZone ?? origin,
      destinationZone: route.destinationZone ?? destination,
    });
    if (length !== null && length <= 0) {
      return {
        status: "refused" as const,
        message: LANDS_BEFORE_LEAVING,
      };
    }
  }
  return runTripAction({
    userId,
    tripId,
    kind: "commitment_update",
    control,
    request: { commitmentId, commitment },
    apply: (tx) =>
      updateCommitment(tx, userId, tripId, commitmentId, commitment, zones),
  });
}

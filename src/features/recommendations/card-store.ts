import type { Prisma } from "@/generated/prisma/client";

import type { DiscardReason } from "./contracts";

type Client = Prisma.TransactionClient;
type Action = "PRESENTED" | "PICKED" | "SAVED" | "DISCARDED";

// Every card shown, picked, saved or turned down stays on record for the
// trip (TB-CRD-12).

/** Records that cards were shown for a slot. A card already shown there is not recorded twice. */
export async function recordPresented(
  client: Client,
  tripId: string,
  slotId: string,
  placeIds: string[],
): Promise<void> {
  if (placeIds.length === 0) return;
  const seen = await client.cardEvent.findMany({
    where: { tripId, slotId, action: "PRESENTED", placeId: { in: placeIds } },
    select: { placeId: true },
  });
  const known = new Set(seen.map((event) => event.placeId));
  const fresh = placeIds.filter((id) => !known.has(id));
  if (fresh.length === 0) return;
  await client.cardEvent.createMany({
    data: fresh.map((placeId) => ({
      tripId,
      slotId,
      placeId,
      action: "PRESENTED" as const,
    })),
  });
}

/** Records one thing the traveller did with a card. */
export async function recordCard(
  client: Client,
  tripId: string,
  slotId: string,
  placeId: string,
  action: Exclude<Action, "PRESENTED" | "DISCARDED">,
): Promise<void> {
  await client.cardEvent.create({ data: { tripId, slotId, placeId, action } });
}

/** Records cards turned down: one entry per place and reason, or one with no reason. */
export async function recordDiscards(
  client: Client,
  tripId: string,
  slotId: string,
  placeIds: string[],
  reasons: DiscardReason[],
  note: string | null,
): Promise<void> {
  const given: (DiscardReason | null)[] = reasons.length > 0 ? reasons : [null];
  await client.cardEvent.createMany({
    data: placeIds.flatMap((placeId) =>
      given.map((reason) => ({
        tripId,
        slotId,
        placeId,
        action: "DISCARDED" as const,
        reason,
        note,
      })),
    ),
  });
}

/** The cards turned down in a trip, with the reasons given. */
export async function readDiscards(
  client: Client,
  tripId: string,
): Promise<{ placeId: string; reason: string | null }[]> {
  return client.cardEvent.findMany({
    where: { tripId, action: "DISCARDED" },
    select: { placeId: true, reason: true },
    orderBy: { createdAt: "asc" },
  });
}

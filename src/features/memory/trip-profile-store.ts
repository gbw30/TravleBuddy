import type { Prisma } from "@/generated/prisma/client";

import {
  TASTE_TOPICS,
  tripAnswerSchema,
  type TasteTopic,
  type TripAnswer,
  type TripTaste,
} from "./contracts";

type Client = Prisma.TransactionClient;

// The trip profile: what the traveller said about their taste for this trip
// (PRD 12.1). One row per trip. The personal profile comes in Milestone 6.

/** Keeps the answers that fit the schema; anything else in the row is ignored. */
function tasteFrom(saved: unknown): TripTaste {
  const taste: TripTaste = {};
  if (!saved || typeof saved !== "object") return taste;
  for (const topic of TASTE_TOPICS) {
    const answer = tripAnswerSchema.safeParse(
      (saved as Record<string, unknown>)[topic],
    );
    if (answer.success) taste[topic] = answer.data;
  }
  return taste;
}

export async function readTripTaste(
  client: Client,
  tripId: string,
): Promise<TripTaste> {
  const row = await client.tripProfile.findUnique({
    where: { tripId },
    select: { taste: true },
  });
  return tasteFrom(row?.taste);
}

/** Saves the answer on one topic, replacing an earlier one, and returns the taste as it now stands. */
export async function saveTripAnswer(
  client: Client,
  tripId: string,
  topic: TasteTopic,
  answer: TripAnswer,
): Promise<TripTaste> {
  const taste = {
    ...(await readTripTaste(client, tripId)),
    [topic]: tripAnswerSchema.parse(answer),
  };
  await client.tripProfile.upsert({
    where: { tripId },
    create: { tripId, taste },
    update: { taste },
  });
  return taste;
}

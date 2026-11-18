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
  const before = await readTripTaste(client, tripId);
  const saved = tripAnswerSchema.parse(answer);
  const taste = { ...before, [topic]: saved };
  await client.tripProfile.upsert({
    where: { tripId },
    create: { tripId, taste },
    update: { taste },
  });
  // Changes to a trip profile are kept in order too (TB-MEM-13).
  await client.profileHistory.create({
    data: {
      tripId,
      topic,
      ...(before[topic] ? { before: before[topic] } : {}),
      after: saved,
      cause: "conversation",
    },
  });
  return taste;
}

/** Whether the traveller marked this trip as different from their usual, and why. */
export type TripDifference = {
  /** Null until the traveller has been asked. */
  differs: boolean | null;
  because: string | null;
};

export async function readTripDifference(
  client: Client,
  tripId: string,
): Promise<TripDifference> {
  const row = await client.tripProfile.findUnique({
    where: { tripId },
    select: { differs: true, differsBecause: true },
  });
  return {
    differs: row?.differs ?? null,
    because: row?.differsBecause ?? null,
  };
}

/**
 * Records the traveller's answer to "is this trip different?" (TB-AGT-12).
 * A trip marked as different teaches the personal profile nothing through
 * behaviour (TB-MEM-09).
 */
export async function saveTripDifference(
  client: Client,
  tripId: string,
  because: string | null,
): Promise<TripDifference> {
  const next = {
    differs: because !== null,
    differsBecause: because?.trim().slice(0, 120) || null,
  };
  if (because !== null && !next.differsBecause) {
    throw new Error("A trip marked as different needs its reason.");
  }
  const before = await readTripDifference(client, tripId);
  await client.tripProfile.upsert({
    where: { tripId },
    create: { tripId, ...next },
    update: next,
  });
  await client.profileHistory.create({
    data: {
      tripId,
      topic: "difference",
      ...(before.differs === null ? {} : { before }),
      after: { differs: next.differs, because: next.differsBecause },
      cause: "conversation",
    },
  });
  return { differs: next.differs, because: next.differsBecause };
}

import type { Prisma } from "@/generated/prisma/client";
import type { Sentence } from "@/lib/wording";

type Client = Prisma.TransactionClient;

// The words shown to a traveller, with the sentences and facts they were made
// from. A repeat of the same words writes nothing; a changed fact is a new
// row, and the old one stays.

export type WordingRow = {
  subject: string;
  factsKey: string;
  sentences: Sentence[];
  shown: string;
  wordedBy: "template" | "model";
  fallback?: string | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
};

export async function recordWordings(
  client: Client,
  tripId: string,
  rows: WordingRow[],
): Promise<void> {
  if (rows.length === 0) return;
  await client.wordingRecord.createMany({
    data: rows.map((row) => ({
      ...row,
      tripId,
      sentences: row.sentences as unknown as Prisma.InputJsonValue,
    })),
    skipDuplicates: true,
  });
}

/** What was recorded for these subjects, the newest first. */
export async function readWordings(
  client: Client,
  tripId: string,
  subjects: string[],
): Promise<(WordingRow & { createdAt: Date })[]> {
  if (subjects.length === 0) return [];
  const rows = await client.wordingRecord.findMany({
    where: { tripId, subject: { in: subjects } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => ({
    ...row,
    sentences: row.sentences as unknown as Sentence[],
    wordedBy: row.wordedBy === "model" ? "model" : "template",
  }));
}

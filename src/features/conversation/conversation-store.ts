import type { Prisma } from "@/generated/prisma/client";

import { factsKeyOf, type Sentence } from "@/lib/wording";

import {
  FACT_TOPICS,
  messageBodySchema,
  type ConversationMessage,
  type FactTopic,
  type MessageBody,
} from "./contracts";
import { recordWordings, type WordingRow } from "./wording-store";

type Client = Prisma.TransactionClient;

// The saved conversation of a trip (TB-AGT-13): every message in the order
// it was written, and the fact questions the traveller chose to skip.

export type NewMessage = {
  from: ConversationMessage["from"];
  body: MessageBody;
  /** What an agent message was made from. Recorded privately with the message. */
  sentences?: Sentence[];
  /** How the body's words came about; a template when absent. */
  wording?:
    | { fallback: string }
    | { model: string; inputTokens?: number; outputTokens?: number };
};

/** A fact that rests on what the traveller wrote just before, in the same batch. */
export const PREVIOUS = "message:previous";

const AUTHOR = { agent: "AGENT", traveller: "TRAVELLER" } as const;
/** The thread shows its latest messages; older ones stay saved. */
const LATEST = 500;

/**
 * Adds messages to the end of the trip's conversation, in the order given,
 * and the record of the sentences each was made from, through the same client.
 */
export async function appendMessages(
  client: Client,
  tripId: string,
  messages: NewMessage[],
): Promise<void> {
  if (messages.length === 0) return;
  const rows = await client.conversationMessage.createManyAndReturn({
    data: messages.map(({ from, body }) => ({
      tripId,
      author: AUTHOR[from],
      body: messageBodySchema.parse(body),
    })),
    select: { id: true },
  });
  // Ids grow in the order the rows were written.
  const ids = rows.map((row) => row.id).sort((a, b) => a - b);
  let previous: number | null = null;
  const records: WordingRow[] = [];
  messages.forEach(({ from, body, sentences, wording }, i) => {
    if (from === "traveller") previous = ids[i];
    if (!sentences) return;
    const resolved = sentences.map((sentence) => ({
      ...sentence,
      facts: sentence.facts.map((fact) =>
        fact.source.type === "traveller" && previous !== null
          ? {
              ...fact,
              source: {
                ...fact.source,
                ref: fact.source.ref.replaceAll(
                  PREVIOUS,
                  `message:${previous}`,
                ),
              },
            }
          : fact,
      ),
    }));
    records.push({
      subject: `message:${ids[i]}`,
      factsKey: factsKeyOf(resolved),
      sentences: resolved,
      shown: body.text,
      ...(wording && "model" in wording
        ? { wordedBy: "model", fallback: null, ...wording }
        : { wordedBy: "template", fallback: wording?.fallback ?? "off" }),
    });
  });
  await recordWordings(client, tripId, records);
}

/** The trip's conversation, oldest first. */
export async function readConversation(
  client: Client,
  tripId: string,
): Promise<ConversationMessage[]> {
  const rows = await client.conversationMessage.findMany({
    where: { tripId },
    orderBy: { id: "desc" },
    take: LATEST,
    select: { id: true, author: true, body: true, createdAt: true },
  });
  return rows.reverse().flatMap((row) => {
    const body = messageBodySchema.safeParse(row.body);
    if (!body.success) return [];
    return [
      {
        id: String(row.id),
        from:
          row.author === "AGENT" ? ("agent" as const) : ("traveller" as const),
        body: body.data,
        at: row.createdAt.toISOString(),
      },
    ];
  });
}

/** The last message of the thread, or null when there is none or it no longer fits. */
export async function readLastMessage(
  client: Client,
  tripId: string,
): Promise<MessageBody | null> {
  const row = await client.conversationMessage.findFirst({
    where: { tripId },
    orderBy: { id: "desc" },
    select: { body: true },
  });
  const body = messageBodySchema.safeParse(row?.body);
  return body.success ? body.data : null;
}

/** The topic of the question most recently saved in the thread, if any. */
export async function lastQuestionTopic(
  client: Client,
  tripId: string,
): Promise<string | null> {
  const row = await client.conversationMessage.findFirst({
    where: { tripId, body: { path: ["kind"], equals: "question" } },
    orderBy: { id: "desc" },
    select: { body: true },
  });
  const body = messageBodySchema.safeParse(row?.body);
  return body.success && body.data.kind === "question" ? body.data.topic : null;
}

export async function readSkippedFacts(
  client: Client,
  tripId: string,
): Promise<FactTopic[]> {
  const row = await client.conversation.findUnique({
    where: { tripId },
    select: { skippedFacts: true },
  });
  return FACT_TOPICS.filter((topic) => row?.skippedFacts.includes(topic));
}

/** Remembers that a fact question was skipped, so it is not asked again. */
export async function skipFact(
  client: Client,
  tripId: string,
  topic: FactTopic,
): Promise<void> {
  const skipped = await readSkippedFacts(client, tripId);
  if (skipped.includes(topic)) return;
  const skippedFacts = [...skipped, topic];
  await client.conversation.upsert({
    where: { tripId },
    create: { tripId, skippedFacts },
    update: { skippedFacts },
  });
}

import { describe, expect, it } from "vitest";

import {
  appendMessages,
  readLastMessage,
  readConversation,
  readSkippedFacts,
  skipFact,
} from "./conversation-store";
import { underCap } from "./model/budget";
import { addUsage, readUsage } from "./model/usage-store";

type MessageRow = {
  id: number;
  tripId: string;
  author: "AGENT" | "TRAVELLER";
  body: unknown;
  createdAt: Date;
};
type UsageRow = { inputTokens: number; outputTokens: number; calls: number };
type Step = { increment: number };

/** A stand-in for the conversation tables. Rows written together share a time, as in one transaction. */
function fakeClient() {
  const messages: MessageRow[] = [];
  const skipped: Record<string, string[]> = {};
  const usage: Record<string, UsageRow> = {};
  const now = new Date("2026-11-19T08:00:00Z");
  const client = {
    conversationMessage: {
      // The newest row of a trip, as the store asks for it.
      findFirst: async ({ where }: { where: { tripId: string } }) =>
        messages
          .filter((row) => row.tripId === where.tripId)
          .sort((a, b) => b.id - a.id)[0] ?? null,
      createMany: async ({
        data,
      }: {
        data: Omit<MessageRow, "id" | "createdAt">[];
      }) => {
        for (const row of data)
          messages.push({ ...row, id: messages.length + 1, createdAt: now });
      },
      findMany: async ({
        where,
        take,
      }: {
        where: { tripId: string };
        take: number;
      }) =>
        messages
          .filter((row) => row.tripId === where.tripId)
          .sort((a, b) => b.id - a.id)
          .slice(0, take),
    },
    conversation: {
      findUnique: async ({ where }: { where: { tripId: string } }) =>
        where.tripId in skipped
          ? { skippedFacts: skipped[where.tripId] }
          : null,
      upsert: async ({
        where,
        create,
      }: {
        where: { tripId: string };
        create: { skippedFacts: string[] };
      }) => {
        skipped[where.tripId] = create.skippedFacts;
      },
    },
    aiUsage: {
      // Returns the selected columns only, as the real client does.
      findUnique: async ({ where }: { where: { month: string } }) => {
        const row = usage[where.month];
        return row
          ? { inputTokens: row.inputTokens, outputTokens: row.outputTokens }
          : null;
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { month: string };
        create: UsageRow;
        update: { inputTokens: Step; outputTokens: Step; calls: Step };
      }) => {
        const row = usage[where.month];
        usage[where.month] = row
          ? {
              inputTokens: row.inputTokens + update.inputTokens.increment,
              outputTokens: row.outputTokens + update.outputTokens.increment,
              calls: row.calls + update.calls.increment,
            }
          : {
              inputTokens: create.inputTokens,
              outputTokens: create.outputTokens,
              calls: create.calls,
            };
      },
    },
  };
  return { client: client as never, messages, skipped, usage };
}

const text = (words: string) => ({ kind: "text" as const, text: words });

describe("the saved conversation", () => {
  it("is empty for a trip with no messages", async () => {
    expect(await readConversation(fakeClient().client, "t1")).toEqual([]);
  });

  it("restores questions, answers and proposals in the order they were written", async () => {
    const { client } = fakeClient();
    await appendMessages(client, "t1", [
      {
        from: "agent",
        body: {
          kind: "question",
          topic: "pace",
          text: "How packed should the days be?",
        },
      },
    ]);
    // One turn writes the answer and the agent's reply together.
    await appendMessages(client, "t1", [
      { from: "traveller", body: text("Relaxed") },
      { from: "agent", body: text("I will keep the days relaxed.") },
      {
        from: "agent",
        body: {
          kind: "proposal",
          slotId: "d1-morning",
          text: "For the first morning:",
          placeNames: ["Senso-ji", "Ueno Park"],
        },
      },
    ]);
    await appendMessages(client, "t2", [
      { from: "traveller", body: text("Another trip") },
    ]);

    const thread = await readConversation(client, "t1");
    expect(thread.map((message) => [message.from, message.body.kind])).toEqual([
      ["agent", "question"],
      ["traveller", "text"],
      ["agent", "text"],
      ["agent", "proposal"],
    ]);
    expect(thread[3].body).toMatchObject({
      slotId: "d1-morning",
      placeNames: ["Senso-ji", "Ueno Park"],
    });
    expect(thread[0]).toMatchObject({
      id: "1",
      at: "2026-11-19T08:00:00.000Z",
    });
  });

  it("writes nothing when there is nothing to add, and refuses a message that does not fit", async () => {
    const { client, messages } = fakeClient();
    await appendMessages(client, "t1", []);
    await expect(
      appendMessages(client, "t1", [{ from: "agent", body: text("") }]),
    ).rejects.toThrow();
    expect(messages).toEqual([]);
  });

  it("leaves out a saved row whose body no longer fits, and keeps the rest", async () => {
    const { client, messages } = fakeClient();
    await appendMessages(client, "t1", [
      { from: "agent", body: text("Hello") },
    ]);
    messages.push({
      id: 2,
      tripId: "t1",
      author: "AGENT",
      body: { kind: "poll" },
      createdAt: new Date(),
    });
    await appendMessages(client, "t1", [
      { from: "traveller", body: text("Hi") },
    ]);
    expect(
      (await readConversation(client, "t1")).map((message) => message.id),
    ).toEqual(["1", "3"]);
  });
});

describe("the last message of a thread", () => {
  it("is what was said last, for that trip only", async () => {
    const { client } = fakeClient();
    expect(await readLastMessage(client, "t1")).toBeNull();
    const offer = {
      kind: "offer" as const,
      text: "Noted: vegetarian. Should I remember that for every trip?",
      remember: { texts: ["Vegetarian"], hard: true },
    };
    await appendMessages(client, "t1", [
      { from: "traveller", body: text("Vegetarian") },
      { from: "agent", body: offer },
    ]);
    await appendMessages(client, "t2", [
      { from: "agent", body: text("Hello") },
    ]);
    expect(await readLastMessage(client, "t1")).toEqual(offer);
    expect(await readLastMessage(client, "t2")).toEqual(text("Hello"));
  });
});

describe("skipped fact questions", () => {
  it("remembers each skipped question once, per trip, in the script's order", async () => {
    const { client, skipped } = fakeClient();
    expect(await readSkippedFacts(client, "t1")).toEqual([]);
    await skipFact(client, "t1", "purpose");
    await skipFact(client, "t1", "budget");
    await skipFact(client, "t1", "budget");
    expect(await readSkippedFacts(client, "t1")).toEqual(["budget", "purpose"]);
    expect(skipped.t1).toHaveLength(2);
    expect(await readSkippedFacts(client, "t2")).toEqual([]);
  });

  it("ignores a saved topic the script no longer has", async () => {
    const { client, skipped } = fakeClient();
    skipped.t1 = ["weather", "who"];
    expect(await readSkippedFacts(client, "t1")).toEqual(["who"]);
  });
});

describe("the month's spend on the AI model", () => {
  it("starts at nothing and adds up call by call, month by month", async () => {
    const { client, usage } = fakeClient();
    expect(await readUsage(client, "2026-11")).toEqual({
      inputTokens: 0,
      outputTokens: 0,
    });
    await addUsage(client, "2026-11", { inputTokens: 900, outputTokens: 40 });
    await addUsage(client, "2026-11", { inputTokens: 1100, outputTokens: 60 });
    await addUsage(client, "2026-12", { inputTokens: 5, outputTokens: 5 });
    expect(await readUsage(client, "2026-11")).toEqual({
      inputTokens: 2000,
      outputTokens: 100,
    });
    expect(usage["2026-11"].calls).toBe(2);
    expect(await readUsage(client, "2026-12")).toEqual({
      inputTokens: 5,
      outputTokens: 5,
    });
  });

  it("closes the model once the month's spend reaches the cap, and opens again next month", async () => {
    const { client } = fakeClient();
    const cap = { AI_MONTHLY_CAP_USD: "1" } as Record<
      string,
      string
    > as NodeJS.ProcessEnv;
    await addUsage(client, "2026-11", {
      inputTokens: 10_000_000,
      outputTokens: 0,
    });
    expect(underCap(await readUsage(client, "2026-11"), cap)).toBe(false);
    expect(underCap(await readUsage(client, "2026-12"), cap)).toBe(true);
  });
});

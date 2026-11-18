import type { Prisma } from "@/generated/prisma/client";

import type { TokenUsage } from "./budget";

type Client = Prisma.TransactionClient;

// Tokens spent on the AI model, kept per calendar month for the spending cap
// (TB-SYS-11). A call is paid for even when the turn it served is rolled back,
// so `addUsage` is called outside the turn's transaction.
// shortcut: the Int columns hold about 200 US dollars of input tokens a month; widen them if the cap ever nears that.

export async function readUsage(
  client: Client,
  month: string,
): Promise<TokenUsage> {
  const row = await client.aiUsage.findUnique({
    where: { month },
    select: { inputTokens: true, outputTokens: true },
  });
  return row ?? { inputTokens: 0, outputTokens: 0 };
}

export async function addUsage(
  client: Client,
  month: string,
  usage: TokenUsage,
): Promise<void> {
  await client.aiUsage.upsert({
    where: { month },
    create: { month, ...usage, calls: 1 },
    update: {
      inputTokens: { increment: usage.inputTokens },
      outputTokens: { increment: usage.outputTokens },
      calls: { increment: 1 },
    },
  });
}

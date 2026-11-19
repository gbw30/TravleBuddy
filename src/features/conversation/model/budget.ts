// Spending on the AI model is worked out from the token counts each reply
// reports, and capped per month (TB-SYS-11). At the cap the agent runs in its
// limited mode until the month ends.

export type TokenUsage = { inputTokens: number; outputTokens: number };

// Claude Haiku 5.5, US dollars per million tokens, for a prompt of 100,000
// tokens or fewer. The prompts here are about a thousand.
const INPUT_USD_PER_MTOK = 0.1;
const OUTPUT_USD_PER_MTOK = 0.5;
const DEFAULT_CAP_USD = 15; // the developer's monthly allowance, set 2026-11-19

export function costUsd(usage: TokenUsage): number {
  return (
    (usage.inputTokens * INPUT_USD_PER_MTOK +
      usage.outputTokens * OUTPUT_USD_PER_MTOK) /
    1_000_000
  );
}

export function monthlyCapUsd(env: NodeJS.ProcessEnv = process.env): number {
  const cap = Number(env.AI_MONTHLY_CAP_USD ?? DEFAULT_CAP_USD);
  return Number.isFinite(cap) && cap >= 0 ? cap : DEFAULT_CAP_USD;
}

/** Whether this month's spend still leaves room for another call. */
export function underCap(
  spentThisMonth: TokenUsage,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return costUsd(spentThisMonth) < monthlyCapUsd(env);
}

/** The month a call is counted in, as "2026-11" (UTC). */
export const usageMonth = (at: Date): string => at.toISOString().slice(0, 7);

import {
  addUsage,
  aiMode,
  costUsd,
  modelCall,
  readUsage,
  underCap,
  usageMonth,
  type ModelCall,
  type TokenUsage,
} from "@/features/conversation";
import { addAiSpend, aiShareLeft } from "@/features/fair-use";
import { db } from "@/lib/db";

// The one gate in front of every model call: the switch, then this month's
// cap (TB-SYS-11), then the person's share of today (TB-SYS-17).

/**
 * The way to call the model, or why it is closed: "off" for the switch,
 * "cap" for the monthly cap or the person's share. `mode` is the switch that
 * governs the caller's work.
 */
export async function modelGate(
  now: Date,
  mode: "on" | "off" = aiMode(),
): Promise<ModelCall | "off" | "cap"> {
  const call = mode === "on" ? modelCall() : null;
  if (!call) return "off";
  return underCap(await readUsage(db, usageMonth(now))) &&
    (await aiShareLeft(now))
    ? call
    : "cap";
}

/**
 * Counts what a call used. Called outside any transaction: the call is paid
 * for whatever happens to the work that asked for it.
 */
export async function payForModel(usage: TokenUsage, now: Date): Promise<void> {
  await addUsage(db, usageMonth(now), usage);
  // The same cost again, only to divide the month among people: the share
  // is checked before a call, so a burst can pass it by a call or two.
  await addAiSpend(costUsd(usage), now);
}

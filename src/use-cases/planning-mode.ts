import { appendMessages, readConversation } from "@/features/conversation";
import { readTripSaid } from "@/features/memory";
import type { PlanningTransaction } from "@/features/planning";
import { setPlanningMode, type Refused } from "@/features/trips";
import type { PlanningMode } from "@/features/trips/contracts";

/** What the agent says in conversation about the brief's "anything else" box. */
export const saidInBrief = (said: string) =>
  `In your brief you also wrote: “${said}”.`;

/**
 * Changes the way a trip is planned (TB-STA-04). Both ways read the same
 * facts, commitments and taste, so nothing entered is lost. The one thing
 * only the brief shows is its "anything else" box: turning to the
 * conversation puts those words in the thread, once (TB-QPL-12).
 */
export async function changePlanningMode(
  tx: PlanningTransaction,
  userId: string,
  tripId: string,
  planningMode: PlanningMode,
): Promise<Refused | { planningMode: PlanningMode }> {
  const changed = await setPlanningMode(tx, userId, tripId, planningMode);
  if (typeof changed === "string" || planningMode !== "GUIDED") return changed;

  const said = await readTripSaid(tx, tripId);
  if (!said) return changed;
  const text = saidInBrief(said);
  const thread = await readConversation(tx, tripId);
  const there = thread.some(
    (message) => message.body.kind === "text" && message.body.text === text,
  );
  if (!there) {
    await appendMessages(tx, tripId, [
      { from: "agent", body: { kind: "text", text } },
    ]);
  }
  return changed;
}

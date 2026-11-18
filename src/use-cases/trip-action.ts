import {
  bindPlanningMutationControl,
  executePlanningMutation,
  finalizePlanningMutationTx,
  PlanningMutationConflictError,
  StalePlanningRevisionError,
  type PlanningMutationKind,
  type PlanningTransaction,
} from "@/features/planning";
import type { Refused } from "@/features/trips";

// One change to an existing trip. It spans two services: the Trips service
// makes the change and the Conversation service's ledger records it, in one
// transaction (ADR-008 rule 3). Shared transactions are listed in
// docs/architecture/service-borders.md.

export type TripActionOutcome<T> =
  | { status: "ok"; data: T; revision: number }
  | { status: Refused | "stale" | "conflict" | "too_many" };

type Applied<T> = T | Refused | "too_many";

/**
 * Runs `apply` once per operation id. A repeat returns the first result, a
 * different request under the same id is a conflict, and a request made
 * against an older revision is stale (TB-SYS-05 to TB-SYS-07).
 */
export async function runTripAction<T extends object>(input: {
  userId: string;
  tripId: string;
  kind: PlanningMutationKind;
  control: { operationId: string; expectedRevision: number };
  /** The validated request, without the control fields. It identifies a repeat. */
  request: unknown;
  apply: (tx: PlanningTransaction) => Promise<Applied<T>>;
}): Promise<TripActionOutcome<T>> {
  const control = bindPlanningMutationControl(
    input.control,
    input.kind,
    input.request,
  );

  try {
    const outcome = await executePlanningMutation<
      TripActionOutcome<T> | { status: "archived" }
    >({
      userId: input.userId,
      tripId: input.tripId,
      control,
      transaction: async (tx) => {
        const applied = await input.apply(tx);
        if (typeof applied === "string") return { status: applied };
        return finalizePlanningMutationTx(tx, {
          userId: input.userId,
          tripId: input.tripId,
          kind: input.kind,
          control,
          result: { status: "ok" as const, data: applied },
        });
      },
    });
    return outcome.status === "stale_revision"
      ? { status: "stale" }
      : (outcome as TripActionOutcome<T>);
  } catch (error) {
    if (error instanceof StalePlanningRevisionError) return { status: "stale" };
    if (error instanceof PlanningMutationConflictError) {
      return { status: "conflict" };
    }
    throw error;
  }
}

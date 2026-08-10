import type { Prisma } from "@/generated/prisma/client";
import { buildTripOwnerWhere } from "@/lib/authorization-rules";
import { db } from "@/lib/db";
import type {
  PlanningMutationControl,
  PlanningMutationKind,
  PlanningMutationReplay,
  PlanningSnapshot,
  StalePlanningMutationResult,
} from "./types";

export type PlanningTransaction = Prisma.TransactionClient;

const mutationResultVersion = 1;
const maxMutationResultBytes = 64 * 1024;

export class PlanningMutationConflictError extends Error {
  readonly code = "operation_id_conflict";

  constructor() {
    super("Operation ID was already used for a different planning mutation.");
    this.name = "PlanningMutationConflictError";
  }
}

export class StalePlanningRevisionError extends Error {
  constructor() {
    super("Planning revision is stale.");
    this.name = "StalePlanningRevisionError";
  }
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002",
  );
}

function jsonResult<T>(result: T): Prisma.InputJsonValue {
  const serialized = JSON.stringify(result);

  if (Buffer.byteLength(serialized, "utf8") > maxMutationResultBytes) {
    throw new Error(
      "Planning mutation result exceeds the 64 KiB ledger limit.",
    );
  }

  return JSON.parse(serialized) as Prisma.InputJsonValue;
}

function assertReplayMatches(
  replay: {
    kind: string;
    requestFingerprint: string | null;
  },
  control: PlanningMutationControl,
) {
  const mutationKind = control.mutationKind;
  const requestFingerprint = control.requestFingerprint;

  // Preserve replay compatibility for non-route legacy callers that have not
  // opted into a bound mutation control.
  if (!mutationKind && !requestFingerprint) return;

  if (
    !mutationKind ||
    !requestFingerprint ||
    replay.kind !== mutationKind ||
    replay.requestFingerprint !== requestFingerprint
  ) {
    throw new PlanningMutationConflictError();
  }
}

export async function getPlanningMutationReplayTx<T = never>(
  tx: PlanningTransaction,
  tripId: string,
  control?: PlanningMutationControl,
): Promise<T | null> {
  const operationId = control?.operationId?.trim();

  if (!operationId) return null;

  const replay = await tx.planningMutation.findUnique({
    where: {
      tripId_operationId: {
        tripId,
        operationId,
      },
    },
    select: {
      kind: true,
      requestFingerprint: true,
      result: true,
    },
  });

  if (!replay) return null;

  assertReplayMatches(replay, control ?? {});
  return replay.result as T;
}

export async function finalizePlanningMutationTx<T extends object>(
  tx: PlanningTransaction,
  input: {
    userId: string;
    tripId: string;
    kind: PlanningMutationKind;
    control?: PlanningMutationControl;
    result: T;
  },
): Promise<T & { revision: number }> {
  const expectedRevision = input.control?.expectedRevision;
  const operationId = input.control?.operationId?.trim();
  const mutationKind = input.control?.mutationKind;
  const requestFingerprint = input.control?.requestFingerprint;

  if (
    (mutationKind || requestFingerprint) &&
    (mutationKind !== input.kind ||
      !requestFingerprint ||
      !/^[a-f0-9]{64}$/.test(requestFingerprint))
  ) {
    throw new PlanningMutationConflictError();
  }

  const updated = await tx.trip.updateMany({
    where: {
      ...buildTripOwnerWhere(input.userId, input.tripId),
      ...(expectedRevision === undefined
        ? {}
        : { planningRevision: expectedRevision }),
    },
    data: {
      planningRevision: {
        increment: 1,
      },
      tripVersion: {
        increment: 1,
      },
    },
  });

  if (updated.count !== 1) {
    throw new StalePlanningRevisionError();
  }

  const trip = await tx.trip.findUniqueOrThrow({
    where: { id: input.tripId },
    select: { planningRevision: true },
  });
  const result = {
    ...input.result,
    revision: trip.planningRevision,
  };

  if (operationId) {
    await tx.planningMutation.create({
      data: {
        tripId: input.tripId,
        operationId,
        kind: input.kind,
        requestFingerprint: requestFingerprint ?? null,
        requestedRevision: expectedRevision ?? null,
        resultingRevision: trip.planningRevision,
        resultVersion: mutationResultVersion,
        result: jsonResult(result),
      },
    });
  }

  return result;
}

async function loadReplayForOwner<T>(
  userId: string,
  tripId: string,
  control: PlanningMutationControl,
) {
  const operationId = control.operationId?.trim();

  if (!operationId) return null;

  return db.$transaction(async (tx) => {
    const trip = await tx.trip.findFirst({
      where: buildTripOwnerWhere(userId, tripId),
      select: { id: true, status: true },
    });

    if (!trip) return null;
    if (trip.status === "ARCHIVED") return { status: "archived" } as T;

    const replay: PlanningMutationReplay | null =
      await tx.planningMutation.findUnique({
        where: {
          tripId_operationId: {
            tripId,
            operationId,
          },
        },
        select: {
          kind: true,
          requestFingerprint: true,
          result: true,
          resultingRevision: true,
        },
      });

    if (!replay) return null;

    assertReplayMatches(replay, control);
    return replay.result as T;
  });
}

async function loadLatestSnapshot(userId: string, tripId: string) {
  const { getPlanningWorkspace } =
    await import("@/features/recommendations/service");
  const workspace = await getPlanningWorkspace(userId, tripId);

  return workspace.status === "ok" ? workspace.snapshot : null;
}

export async function executePlanningMutation<T>(input: {
  userId: string;
  tripId: string;
  control?: PlanningMutationControl;
  transactionOptions?: {
    maxWait?: number;
    timeout?: number;
  };
  transaction: (tx: PlanningTransaction) => Promise<T>;
}): Promise<T | StalePlanningMutationResult> {
  try {
    return await db.$transaction(async (tx) => {
      const control = input.control;
      const hasBoundRequest =
        control?.expectedRevision !== undefined &&
        Boolean(control.operationId && control.mutationKind) &&
        Boolean(control.requestFingerprint);

      if (hasBoundRequest) {
        const trip = await tx.trip.findFirst({
          where: buildTripOwnerWhere(input.userId, input.tripId),
          select: {
            id: true,
            status: true,
            planningRevision: true,
          },
        });

        // Preserve each domain service's established not-found/archived
        // result without exposing replay data across the ownership boundary.
        if (trip && trip.status !== "ARCHIVED") {
          const replay = await getPlanningMutationReplayTx<T>(
            tx,
            input.tripId,
            control,
          );

          if (replay) return replay;

          if (trip.planningRevision !== control.expectedRevision) {
            throw new StalePlanningRevisionError();
          }
        }
      }

      return input.transaction(tx);
    }, input.transactionOptions);
  } catch (error) {
    const operationId = input.control?.operationId?.trim();

    if (operationId && isUniqueConstraintError(error)) {
      const replay = await loadReplayForOwner<T>(
        input.userId,
        input.tripId,
        input.control ?? {},
      );

      if (replay) return replay;
    }

    if (error instanceof StalePlanningRevisionError) {
      if (operationId) {
        const replay = await loadReplayForOwner<T>(
          input.userId,
          input.tripId,
          input.control ?? {},
        );

        if (replay) return replay;
      }

      const snapshot: PlanningSnapshot | null = await loadLatestSnapshot(
        input.userId,
        input.tripId,
      );

      if (snapshot) {
        return {
          status: "stale_revision",
          revision: snapshot.revision,
          snapshot,
        };
      }
    }

    throw error;
  }
}

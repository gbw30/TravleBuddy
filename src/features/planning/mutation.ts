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

class StalePlanningRevisionError extends Error {
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
      result: true,
    },
  });

  return replay ? (replay.result as T) : null;
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
  operationId: string,
) {
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
          result: true,
          resultingRevision: true,
        },
      });

    return replay ? (replay.result as T) : null;
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
  transaction: (tx: PlanningTransaction) => Promise<T>;
}): Promise<T | StalePlanningMutationResult> {
  try {
    return await db.$transaction(input.transaction);
  } catch (error) {
    const operationId = input.control?.operationId?.trim();

    if (operationId && isUniqueConstraintError(error)) {
      const replay = await loadReplayForOwner<T>(
        input.userId,
        input.tripId,
        operationId,
      );

      if (replay) return replay;
    }

    if (error instanceof StalePlanningRevisionError) {
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

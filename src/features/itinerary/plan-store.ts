import type { Prisma } from "@/generated/prisma/client";

import {
  buildProgressSchema,
  emptyPlanState,
  planStateSchema,
  type BuildProgress,
  type PlanState,
} from "./contracts";

type Client = Prisma.TransactionClient;

// Plan versions are append-only: a change adds a version and moves the
// plan's pointer; undo moves the pointer back to the parent (ADR-001).

async function activeVersion(client: Client, tripId: string) {
  const plan = await client.plan.findUnique({
    where: { tripId },
    select: { activeVersionId: true },
  });
  if (!plan?.activeVersionId) return null;
  return client.planVersion.findUnique({
    where: { id: plan.activeVersionId },
    select: { id: true, parentVersionId: true, state: true },
  });
}

/** The traveller's choices now in force. A trip with no plan yet has none. */
export async function readPlanState(
  client: Client,
  tripId: string,
): Promise<{ state: PlanState; canUndo: boolean }> {
  const version = await activeVersion(client, tripId);
  // A saved state that no longer fits the schema is not trusted.
  const parsed = planStateSchema.safeParse(version?.state);
  return {
    state: parsed.success ? parsed.data : emptyPlanState,
    canUndo: Boolean(version?.parentVersionId),
  };
}

/** Saves the choices as a new version and makes it the one in force. */
export async function writePlanVersion(
  tx: Client,
  tripId: string,
  state: PlanState,
  summary: string,
): Promise<void> {
  const [current, newest] = await Promise.all([
    activeVersion(tx, tripId),
    tx.planVersion.findFirst({
      where: { tripId },
      orderBy: { version: "desc" },
      select: { version: true },
    }),
  ]);
  await tx.plan.upsert({
    where: { tripId },
    create: { tripId },
    update: {},
  });
  const created = await tx.planVersion.create({
    data: {
      tripId,
      version: (newest?.version ?? 0) + 1,
      parentVersionId: current?.id ?? null,
      state: planStateSchema.parse(state),
      summary: summary.slice(0, 200),
    },
    select: { id: true },
  });
  await tx.plan.update({
    where: { tripId },
    data: { activeVersionId: created.id },
  });
}

/** How far the trip's build has come, or null when none was started. */
export async function readBuild(
  client: Client,
  tripId: string,
): Promise<BuildProgress | null> {
  const plan = await client.plan.findUnique({
    where: { tripId },
    select: { build: true },
  });
  const parsed = buildProgressSchema.safeParse(plan?.build);
  return parsed.success ? parsed.data : null;
}

export async function writeBuild(
  tx: Client,
  tripId: string,
  progress: BuildProgress,
): Promise<void> {
  const build = buildProgressSchema.parse(progress);
  await tx.plan.upsert({
    where: { tripId },
    create: { tripId, build },
    update: { build },
  });
}

/**
 * The places in the plan that the build chose and the traveller has left
 * where the build put them. They are the agent's choices, not the traveller's.
 */
export function builtPlaceIds(
  progress: BuildProgress | null,
  state: PlanState,
): string[] {
  return Object.entries(progress?.built ?? {}).flatMap(([slot, placeId]) =>
    state.picks[slot]?.placeId === placeId ? [placeId] : [],
  );
}

/** Returns the plan to the version before the last change. False when there is none. */
export async function undoPlan(tx: Client, tripId: string): Promise<boolean> {
  const version = await activeVersion(tx, tripId);
  if (!version?.parentVersionId) return false;
  await tx.plan.update({
    where: { tripId },
    data: { activeVersionId: version.parentVersionId },
  });
  return true;
}

/**
 * Copies one trip's plan into another as its first version (TB-SYS-14), the
 * groundwork for starting from a template. No screen uses it yet.
 */
export async function copyPlan(
  tx: Client,
  fromTripId: string,
  toTripId: string,
): Promise<void> {
  const { state } = await readPlanState(tx, fromTripId);
  await writePlanVersion(tx, toTripId, state, "Copied from another trip");
}

import type { Prisma, TravelPace } from "@/generated/prisma/client";
import type { PlanningTransaction } from "@/features/planning/mutation";
import {
  adaptivePreferenceSnapshotSchema,
  type AdaptivePreferenceSnapshot,
  type WeightedPreferenceSignal,
} from "./schemas";
import type { PreferencePolicyResult } from "./preferences";

type PreferenceProjection = {
  interests: readonly string[];
  pace: TravelPace | null;
  updatedAt?: Date | string;
};

const lockTripPreferenceVersionAllocatorSql = `
SELECT id
FROM trips
WHERE id = $1
FOR UPDATE
`;

const defaultPriceSensitivity = (
  observedAt: string,
): WeightedPreferenceSignal => ({
  weight: 0.5,
  confidence: 0,
  source: "DEFAULT",
  observedAt,
});

function normalizedObservedAt(value?: Date | string) {
  const date = value ? new Date(value) : new Date();

  return Number.isNaN(date.getTime())
    ? new Date().toISOString()
    : date.toISOString();
}

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

export function parseAdaptivePreferenceSnapshot(
  value: Prisma.JsonValue | null | undefined,
) {
  const parsed = adaptivePreferenceSnapshotSchema.safeParse(value);

  return parsed.success ? parsed.data : null;
}

/**
 * Materializes the mutable TripPreference projection as a strict adaptive
 * snapshot. Explicit interests and pace replace their previous explicit
 * projection; the independent price-sensitivity signal is preserved.
 */
export function adaptiveSnapshotFromPreferenceProjection(
  projection: PreferenceProjection,
  previous?: AdaptivePreferenceSnapshot | null,
  observedAtInput?: Date | string,
): AdaptivePreferenceSnapshot {
  const observedAt = normalizedObservedAt(
    observedAtInput ?? projection.updatedAt,
  );
  const interests = Object.fromEntries(
    [...new Set(projection.interests.map((interest) => interest.trim()))]
      .filter(Boolean)
      .sort()
      .map((interest) => [
        interest,
        {
          weight: 1,
          confidence: 1,
          source: "EXPLICIT" as const,
          observedAt,
        },
      ]),
  );

  return adaptivePreferenceSnapshotSchema.parse({
    schemaVersion: 1,
    interests,
    priceSensitivity:
      previous?.priceSensitivity ?? defaultPriceSensitivity(observedAt),
    pace: projection.pace
      ? {
          value: projection.pace,
          confidence: 1,
          source: "EXPLICIT",
          observedAt,
        }
      : null,
  });
}

export async function ensureActivePreferenceProfileVersionTx(
  tx: PlanningTransaction,
  input: {
    tripId: string;
    activePreferenceProfileVersionId: string | null;
  },
) {
  if (input.activePreferenceProfileVersionId) {
    const active = await tx.preferenceProfileVersion.findFirst({
      where: {
        id: input.activePreferenceProfileVersionId,
        tripId: input.tripId,
      },
      select: {
        id: true,
        version: true,
        snapshot: true,
      },
    });

    if (active) {
      return {
        ...active,
        snapshot:
          parseAdaptivePreferenceSnapshot(active.snapshot) ??
          adaptiveSnapshotFromPreferenceProjection({
            interests: [],
            pace: null,
          }),
      };
    }
  }

  const projection = await tx.tripPreference.findUnique({
    where: {
      tripId: input.tripId,
    },
    select: {
      interests: true,
      pace: true,
      updatedAt: true,
    },
  });
  const latest = await tx.preferenceProfileVersion.findFirst({
    where: {
      tripId: input.tripId,
    },
    select: {
      version: true,
    },
    orderBy: {
      version: "desc",
    },
  });
  const snapshot = adaptiveSnapshotFromPreferenceProjection(
    projection ?? {
      interests: [],
      pace: null,
    },
  );
  const created = await tx.preferenceProfileVersion.create({
    data: {
      tripId: input.tripId,
      version: (latest?.version ?? 0) + 1,
      snapshot,
      delta: {
        kind: "INITIALIZED",
      },
    },
    select: {
      id: true,
      version: true,
      snapshot: true,
    },
  });

  await tx.trip.update({
    where: {
      id: input.tripId,
    },
    data: {
      activePreferenceProfileVersionId: created.id,
    },
  });

  return {
    ...created,
    snapshot,
  };
}

export async function createExplicitPreferenceProfileVersionTx(
  tx: PlanningTransaction,
  input: {
    tripId: string;
    projection: PreferenceProjection;
    observedAt?: Date | string;
  },
) {
  // Version allocation is protected by the trip row for the lifetime of the
  // caller's PostgreSQL transaction. A concurrent explicit save waits here,
  // then observes the committed active pointer and latest version below.
  await tx.$queryRawUnsafe<Array<{ id: string }>>(
    lockTripPreferenceVersionAllocatorSql,
    input.tripId,
  );
  const trip = await tx.trip.findUniqueOrThrow({
    where: {
      id: input.tripId,
    },
    select: {
      activePreferenceProfileVersionId: true,
    },
  });
  const current = trip.activePreferenceProfileVersionId
    ? await tx.preferenceProfileVersion.findFirst({
        where: {
          id: trip.activePreferenceProfileVersionId,
          tripId: input.tripId,
        },
        select: {
          snapshot: true,
        },
      })
    : null;
  const latest = await tx.preferenceProfileVersion.findFirst({
    where: {
      tripId: input.tripId,
    },
    select: {
      version: true,
    },
    orderBy: {
      version: "desc",
    },
  });
  const previous = parseAdaptivePreferenceSnapshot(current?.snapshot);
  const snapshot = adaptiveSnapshotFromPreferenceProjection(
    input.projection,
    previous,
    input.observedAt,
  );
  const created = await tx.preferenceProfileVersion.create({
    data: {
      tripId: input.tripId,
      version: (latest?.version ?? 0) + 1,
      parentVersionId: trip.activePreferenceProfileVersionId,
      snapshot,
      delta: {
        kind: "EXPLICIT_SAVE",
        fields: ["interests", "pace"],
      },
    },
    select: {
      id: true,
      version: true,
    },
  });

  await tx.trip.update({
    where: {
      id: input.tripId,
    },
    data: {
      activePreferenceProfileVersionId: created.id,
    },
  });

  return {
    ...created,
    snapshot,
  };
}

/**
 * Persists a supported inferred preference update and keeps TripPreference as
 * the current read projection. Immediate commands can skip no-op versions;
 * durable adaptive jobs retain their existing auditable version-per-feedback
 * behavior by setting persistNoChange.
 */
export async function persistPreferencePolicyResultTx(
  tx: PlanningTransaction,
  input: {
    tripId: string;
    parent: {
      id: string;
      version: number;
    };
    sourceFeedbackId: string;
    policy: PreferencePolicyResult;
    persistNoChange?: boolean;
  },
) {
  if (input.policy.status !== "UPDATED" && !input.persistNoChange) {
    return {
      ...input.parent,
      snapshot: input.policy.snapshot,
      created: false,
    };
  }

  const latest = await tx.preferenceProfileVersion.findFirst({
    where: {
      tripId: input.tripId,
    },
    select: {
      version: true,
    },
    orderBy: {
      version: "desc",
    },
  });
  const created = await tx.preferenceProfileVersion.create({
    data: {
      tripId: input.tripId,
      version: (latest?.version ?? 0) + 1,
      parentVersionId: input.parent.id,
      sourceFeedbackId: input.sourceFeedbackId,
      snapshot: input.policy.snapshot,
      delta: input.policy.delta ?? undefined,
    },
    select: {
      id: true,
      version: true,
    },
  });
  const projection = await tx.tripPreference.findUnique({
    where: {
      tripId: input.tripId,
    },
    select: {
      metadata: true,
    },
  });

  await tx.tripPreference.updateMany({
    where: {
      tripId: input.tripId,
    },
    data: {
      metadata: {
        ...jsonObject(projection?.metadata),
        adaptive: {
          priceSensitivity: input.policy.snapshot.priceSensitivity,
        },
      },
    },
  });

  return {
    ...created,
    snapshot: input.policy.snapshot,
    created: true,
  };
}

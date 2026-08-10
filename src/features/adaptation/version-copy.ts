import type { Prisma } from "@/generated/prisma/client";
import type { PlanningTransaction } from "@/features/planning/mutation";
import { recomputeAffectedDayEstimatedCost } from "./activation";

export const adaptiveItinerarySnapshotSelect = {
  id: true,
  version: true,
  days: {
    select: {
      id: true,
      dayNumber: true,
      date: true,
      title: true,
      notes: true,
      estimatedCostAmount: true,
      estimatedCostCurrency: true,
      cityWindows: {
        select: {
          destinationId: true,
          travelSegmentId: true,
          city: true,
          country: true,
          startTime: true,
          endTime: true,
          source: true,
        },
        orderBy: {
          startTime: "asc",
        },
      },
      items: {
        select: {
          id: true,
          placeSuggestionId: true,
          title: true,
          description: true,
          startTime: true,
          endTime: true,
          durationMinutes: true,
          sortOrder: true,
          estimatedCostAmount: true,
          estimatedCostCurrency: true,
          notes: true,
          placeSuggestion: {
            select: {
              destinationId: true,
              providerPlaceId: true,
              category: true,
              city: true,
              country: true,
              metadata: true,
            },
          },
        },
        orderBy: {
          sortOrder: "asc",
        },
      },
    },
    orderBy: {
      dayNumber: "asc",
    },
  },
} satisfies Prisma.ItineraryVersionSelect;

export type AdaptiveItinerarySnapshot = Prisma.ItineraryVersionGetPayload<{
  select: typeof adaptiveItinerarySnapshotSelect;
}>;

export type AdaptiveReplacementRecord = {
  id: string;
  name: string;
  description: string | null;
  estimatedCostAmount: Prisma.Decimal | null;
  estimatedCostCurrency: string | null;
};

type MaterializeAdaptiveItineraryInput = {
  tripId: string;
  source: AdaptiveItinerarySnapshot;
  preferenceProfileVersionId: string | null;
  targetItemId: string;
  feedbackId: string;
  preferenceExplanation: string;
  sourceJobId?: string | null;
  change:
    | {
        kind: "REMOVE";
      }
    | {
        kind: "REPLACE";
        replacement: AdaptiveReplacementRecord;
      };
};

export class AdaptiveVersionCopyError extends Error {
  readonly code = "ADAPTATION_VALIDATION_FAILED";

  constructor(readonly reason: string) {
    super("The adaptive itinerary successor could not be materialized.");
    this.name = "AdaptiveVersionCopyError";
  }
}

/**
 * Materializes an immutable successor using a bounded number of inserts. IDs
 * continue to come from PostgreSQL defaults; callers own validation and active
 * pointer changes so the previous itinerary remains valid until commit.
 */
export async function materializeAdaptiveItineraryVersionTx(
  tx: PlanningTransaction,
  input: MaterializeAdaptiveItineraryInput,
) {
  const matches = input.source.days.flatMap((day) =>
    day.items
      .filter((item) => item.id === input.targetItemId)
      .map((item) => ({ day, item })),
  );

  if (matches.length !== 1) {
    throw new AdaptiveVersionCopyError(
      matches.length === 0
        ? "ADAPTIVE_TARGET_NOT_FOUND"
        : "ADAPTIVE_TARGET_AMBIGUOUS",
    );
  }

  const [{ day: affectedDay, item: targetItem }] = matches;
  const latest = await tx.itineraryVersion.findFirst({
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
  const version = await tx.itineraryVersion.create({
    data: {
      tripId: input.tripId,
      version: (latest?.version ?? 0) + 1,
      parentVersionId: input.source.id,
      preferenceProfileVersionId: input.preferenceProfileVersionId,
      sourceJobId: input.sourceJobId ?? null,
      status: "DRAFT",
      changeScope: "ITEM",
      changeSummary:
        input.change.kind === "REMOVE"
          ? {
              outcome: "REMOVED",
              feedbackId: input.feedbackId,
              affectedDay: affectedDay.dayNumber,
              rejectedItemId: input.targetItemId,
              explanation: input.preferenceExplanation,
            }
          : {
              outcome: "REPLACED",
              feedbackId: input.feedbackId,
              affectedDay: affectedDay.dayNumber,
              rejectedItemId: input.targetItemId,
              replacementSuggestionId: input.change.replacement.id,
              explanation: input.preferenceExplanation,
            },
    },
    select: {
      id: true,
      version: true,
    },
  });
  const effectiveItemsByDay = new Map(
    input.source.days.map((sourceDay) => [
      sourceDay.id,
      sourceDay.items.flatMap((sourceItem) => {
        if (sourceItem.id !== input.targetItemId) return [sourceItem];
        if (input.change.kind === "REMOVE") return [];

        return [
          {
            ...sourceItem,
            placeSuggestionId: input.change.replacement.id,
            title: input.change.replacement.name,
            description: input.change.replacement.description,
            estimatedCostAmount: input.change.replacement.estimatedCostAmount,
            estimatedCostCurrency:
              input.change.replacement.estimatedCostCurrency,
          },
        ];
      }),
    ]),
  );
  const createdDays = await tx.itineraryDay.createManyAndReturn({
    data: input.source.days.map((sourceDay) => {
      const isAffected = sourceDay.id === affectedDay.id;
      const dayCost = isAffected
        ? recomputeAffectedDayEstimatedCost({
            declaredCurrency: sourceDay.estimatedCostCurrency,
            items: effectiveItemsByDay.get(sourceDay.id) ?? [],
          })
        : {
            estimatedCostAmount: sourceDay.estimatedCostAmount,
            estimatedCostCurrency: sourceDay.estimatedCostCurrency,
          };

      return {
        tripId: input.tripId,
        itineraryVersionId: version.id,
        dayNumber: sourceDay.dayNumber,
        date: sourceDay.date,
        title: sourceDay.title,
        notes: sourceDay.notes,
        estimatedCostAmount: dayCost.estimatedCostAmount,
        estimatedCostCurrency: dayCost.estimatedCostCurrency,
      };
    }),
    select: {
      id: true,
      dayNumber: true,
    },
  });
  const createdDayIdByNumber = new Map(
    createdDays.map((day) => [day.dayNumber, day.id]),
  );
  const cityWindows = input.source.days.flatMap((sourceDay) => {
    const dayId = createdDayIdByNumber.get(sourceDay.dayNumber);
    if (!dayId) {
      throw new AdaptiveVersionCopyError("ADAPTIVE_DAY_NOT_MATERIALIZED");
    }

    return sourceDay.cityWindows.map((window) => ({
      tripId: input.tripId,
      dayId,
      destinationId: window.destinationId,
      travelSegmentId: window.travelSegmentId,
      city: window.city,
      country: window.country,
      startTime: window.startTime,
      endTime: window.endTime,
      source: window.source,
    }));
  });

  if (cityWindows.length > 0) {
    await tx.itineraryCityWindow.createMany({ data: cityWindows });
  }

  const itemData = input.source.days.flatMap((sourceDay) => {
    const dayId = createdDayIdByNumber.get(sourceDay.dayNumber);
    if (!dayId) {
      throw new AdaptiveVersionCopyError("ADAPTIVE_DAY_NOT_MATERIALIZED");
    }

    return (effectiveItemsByDay.get(sourceDay.id) ?? []).map((item) => ({
      tripId: input.tripId,
      dayId,
      placeSuggestionId: item.placeSuggestionId,
      title: item.title,
      description: item.description,
      startTime: item.startTime,
      endTime: item.endTime,
      durationMinutes: item.durationMinutes,
      sortOrder: item.sortOrder,
      estimatedCostAmount: item.estimatedCostAmount,
      estimatedCostCurrency: item.estimatedCostCurrency,
      notes: item.notes,
    }));
  });
  const createdItems =
    itemData.length > 0
      ? await tx.itineraryItem.createManyAndReturn({
          data: itemData,
          select: {
            id: true,
            dayId: true,
            placeSuggestionId: true,
            sortOrder: true,
          },
        })
      : [];
  const affectedDayId = createdDayIdByNumber.get(affectedDay.dayNumber);
  const replacementSuggestionId =
    input.change.kind === "REPLACE" ? input.change.replacement.id : null;
  const replacementItemId = replacementSuggestionId
    ? (createdItems.find(
        (item) =>
          item.dayId === affectedDayId &&
          item.placeSuggestionId === replacementSuggestionId &&
          item.sortOrder === targetItem.sortOrder,
      )?.id ?? null)
    : null;

  if (replacementSuggestionId && !replacementItemId) {
    throw new AdaptiveVersionCopyError("ADAPTIVE_REPLACEMENT_NOT_MATERIALIZED");
  }

  return {
    ...version,
    affectedDay: affectedDay.dayNumber,
    rejectedSuggestionId: targetItem.placeSuggestionId,
    replacementItemId,
  };
}

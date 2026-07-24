import type {
  ConflictSeverity,
  ConflictStatus,
  ConflictType,
  FeedbackAction,
  Prisma,
  SuggestionCategory,
  TravelPace,
} from "@/generated/prisma/client";
import { buildTripOwnerWhere } from "@/lib/authorization-rules";
import { db } from "@/lib/db";
import type { PlanningMutationControl } from "@/features/planning/types";
import {
  executePlanningMutation,
  finalizePlanningMutationTx,
  getPlanningMutationReplayTx,
} from "@/features/planning/mutation";
import {
  createPlanningOperationContext,
  measurePlanningOperation,
  type PlanningOperationContext,
} from "@/features/planning/telemetry";
import { getTripReadiness } from "@/features/trips/readiness";
import type {
  ItineraryConflictDto,
  ItineraryConflictSummaryDto,
} from "./types";

type ConflictTx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

type NumberLike = number | { toString: () => string } | null;

type DetectableTrip = {
  id: string;
  title?: string;
  status?: string;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  budgetAmount: NumberLike;
  budgetCurrency: string | null;
  destinations?: unknown[];
  preference: {
    pace: TravelPace | null;
  } | null;
  selectedPlaces?: {
    id: string;
    name: string;
  }[];
};

type DetectableItem = {
  id: string;
  placeSuggestionId?: string | null;
  title: string;
  startTime: Date | string | null;
  endTime: Date | string | null;
  durationMinutes: number | null;
  estimatedCostAmount: NumberLike;
  estimatedCostCurrency: string | null;
  placeSuggestion: {
    category: SuggestionCategory;
    city: string | null;
    country: string | null;
    metadata?: unknown;
  } | null;
};

type DetectableDay = {
  id: string;
  dayNumber: number;
  items: DetectableItem[];
};

export type ConflictCandidate = {
  itineraryItemId: string | null;
  type: ConflictType;
  severity: ConflictSeverity;
  message: string;
  recommendation: string | null;
  metadata?: Prisma.InputJsonValue;
};

const paceCapacity: Record<TravelPace, number> = {
  RELAXED: 3,
  BALANCED: 4,
  PACKED: 6,
};

const comfortThreshold: Record<TravelPace, number> = {
  RELAXED: 2,
  BALANCED: 3,
  PACKED: 5,
};

const activityCategories = new Set<SuggestionCategory>([
  "ATTRACTION",
  "ACTIVITY",
  "LANDMARK",
  "ENTERTAINMENT",
]);

const severityRank: Record<ConflictSeverity, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

const conflictTripSelect = {
  id: true,
  title: true,
  status: true,
  startDate: true,
  endDate: true,
  budgetAmount: true,
  budgetCurrency: true,
  destinations: {
    select: {
      id: true,
    },
  },
  preference: {
    select: {
      pace: true,
    },
  },
} satisfies Prisma.TripSelect;

const conflictDaySelect = {
  id: true,
  dayNumber: true,
  items: {
    select: {
      id: true,
      placeSuggestionId: true,
      title: true,
      startTime: true,
      endTime: true,
      durationMinutes: true,
      estimatedCostAmount: true,
      estimatedCostCurrency: true,
      placeSuggestion: {
        select: {
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
} satisfies Prisma.ItineraryDaySelect;

export const itineraryConflictSelect = {
  id: true,
  itineraryItemId: true,
  type: true,
  severity: true,
  status: true,
  message: true,
  recommendation: true,
  metadata: true,
} satisfies Prisma.ConflictSelect;

type ConflictTripRecord = Prisma.TripGetPayload<{
  select: typeof conflictTripSelect;
}>;

type ConflictDayRecord = Prisma.ItineraryDayGetPayload<{
  select: typeof conflictDaySelect;
}>;

export type ConflictAccessResult =
  | { status: "not_found" | "archived" }
  | { status: "not_ready"; missingRequirements: string[] };

function numberValue(value: NumberLike) {
  if (value === null) {
    return null;
  }

  return typeof value === "number" ? value : Number(value.toString());
}

function dateValue(value: Date | string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function category(item: DetectableItem) {
  return item.placeSuggestion?.category ?? null;
}

function locationKey(item: DetectableItem) {
  const city = item.placeSuggestion?.city?.trim();
  const country = item.placeSuggestion?.country?.trim();

  if (!city && !country) {
    return null;
  }

  return `${city ?? "Unknown city"}, ${country ?? "Unknown country"}`;
}

function isJsonObject(metadata: unknown): metadata is Record<string, unknown> {
  return (
    Boolean(metadata) &&
    !Array.isArray(metadata) &&
    typeof metadata === "object"
  );
}

function explicitUnavailable(metadata: unknown) {
  if (!isJsonObject(metadata)) {
    return false;
  }

  const availability = metadata.availability;

  return (
    metadata.unavailable === true ||
    metadata.isUnavailable === true ||
    metadata.closed === true ||
    metadata.isClosed === true ||
    metadata.closedOrUnavailable === true ||
    availability === "closed" ||
    availability === "unavailable"
  );
}

function itemLocationLabel(item: DetectableItem) {
  return locationKey(item) ?? "unknown location";
}

function conflictMetadata(input: Record<string, Prisma.InputJsonValue>) {
  return input satisfies Prisma.InputJsonObject;
}

function summarizeBySeverity(
  conflicts: readonly Pick<ItineraryConflictDto, "severity">[],
): ItineraryConflictSummaryDto {
  return conflicts.reduce(
    (summary, conflict) => {
      summary.total += 1;

      if (conflict.severity === "LOW") summary.low += 1;
      if (conflict.severity === "MEDIUM") summary.medium += 1;
      if (conflict.severity === "HIGH") summary.high += 1;

      return summary;
    },
    { total: 0, low: 0, medium: 0, high: 0 },
  );
}

function sortedConflicts<
  T extends Pick<ItineraryConflictDto, "severity" | "type">,
>(conflicts: T[]) {
  return conflicts.sort(
    (left, right) =>
      severityRank[left.severity] - severityRank[right.severity] ||
      left.type.localeCompare(right.type),
  );
}

function stableJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableJson);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => [key, stableJson(nestedValue)]),
  );
}

function conflictSignature(conflict: {
  itineraryItemId: string | null;
  type: ConflictType;
  severity: ConflictSeverity;
  message: string;
  recommendation: string | null;
  metadata?: unknown;
}) {
  return JSON.stringify({
    itineraryItemId: conflict.itineraryItemId ?? null,
    type: conflict.type,
    severity: conflict.severity,
    message: conflict.message,
    recommendation: conflict.recommendation ?? null,
    metadata: stableJson(conflict.metadata ?? null),
  });
}

function uniqueConflictCandidates(conflicts: readonly ConflictCandidate[]) {
  const seen = new Set<string>();

  return conflicts.filter((conflict) => {
    const signature = conflictSignature(conflict);

    if (seen.has(signature)) {
      return false;
    }

    seen.add(signature);
    return true;
  });
}

function uniqueConflictDtos(conflicts: readonly ItineraryConflictDto[]) {
  const seen = new Set<string>();
  const duplicateIds: string[] = [];
  const unique: ItineraryConflictDto[] = [];

  conflicts.forEach((conflict) => {
    const signature = conflictSignature(conflict);

    if (seen.has(signature)) {
      duplicateIds.push(conflict.id);
      return;
    }

    seen.add(signature);
    unique.push(conflict);
  });

  return { duplicateIds, unique };
}

function isForeignKeyConstraintError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: unknown; message?: unknown };

  return (
    candidate.code === "P2003" ||
    (typeof candidate.message === "string" &&
      candidate.message.includes("Foreign key constraint violated"))
  );
}

function planningAccessFailure(trip: ConflictTripRecord | null) {
  if (!trip) {
    return { status: "not_found" as const };
  }

  if (trip.status === "ARCHIVED") {
    return { status: "archived" as const };
  }

  const readiness = getTripReadiness(trip);

  if (!readiness.canUseFullPlanning) {
    return {
      status: "not_ready" as const,
      missingRequirements: readiness.missingRequirements,
    };
  }

  return null;
}

function budgetConflicts({
  trip,
  days,
}: {
  trip: DetectableTrip;
  days: readonly DetectableDay[];
}): ConflictCandidate[] {
  const budgetAmount = numberValue(trip.budgetAmount);

  if (!budgetAmount || !trip.budgetCurrency) {
    return [];
  }

  const items = days.flatMap((day) => day.items);
  const total = items.reduce((sum, item) => {
      if (item.estimatedCostCurrency !== trip.budgetCurrency) {
        return sum;
      }

      return sum + (numberValue(item.estimatedCostAmount) ?? 0);
    }, 0);
  const excludedCostCurrencies = [
    ...new Set(
      items
        .filter(
          (item) =>
            numberValue(item.estimatedCostAmount) !== null &&
            item.estimatedCostCurrency &&
            item.estimatedCostCurrency !== trip.budgetCurrency,
        )
        .map((item) => item.estimatedCostCurrency as string),
    ),
  ].sort();
  const conflicts: ConflictCandidate[] =
    excludedCostCurrencies.length > 0
      ? [
          {
            itineraryItemId: null,
            type: "BUDGET",
            severity: "MEDIUM",
            message: `The ${trip.budgetCurrency} itinerary estimate is partial because selected costs in ${excludedCostCurrencies.join(", ")} are excluded.`,
            recommendation:
              "Review the excluded currencies separately before comparing the partial estimate with the trip budget.",
            metadata: conflictMetadata({
              rule: "mixed_currency_cost_exclusions",
              currency: trip.budgetCurrency,
              excludedCostCurrencies,
            }),
          },
        ]
      : [];

  if (total <= budgetAmount) {
    return conflicts;
  }

  conflicts.push(
    {
      itineraryItemId: null,
      type: "BUDGET",
      severity: "HIGH",
      message: `Estimated itinerary cost ${trip.budgetCurrency} ${total} exceeds the trip budget of ${trip.budgetCurrency} ${budgetAmount}.`,
      recommendation:
        "Remove lower-priority places, refresh recommendations with a lower budget, or raise the trip budget.",
      metadata: conflictMetadata({
        rule: "trip_budget",
        budgetAmount,
        estimatedAmount: total,
        currency: trip.budgetCurrency,
      }),
    },
  );

  return conflicts;
}

function unscheduledOverflowConflicts({
  trip,
  days,
}: {
  trip: DetectableTrip;
  days: readonly DetectableDay[];
}): ConflictCandidate[] {
  const scheduledPlaceIds = new Set(
    days.flatMap((day) =>
      day.items.flatMap((item) =>
        item.placeSuggestionId ? [item.placeSuggestionId] : [],
      ),
    ),
  );
  const unscheduled = (trip.selectedPlaces ?? []).filter(
    (place) => !scheduledPlaceIds.has(place.id),
  );

  if (unscheduled.length === 0) {
    return [];
  }

  return [
    {
      itineraryItemId: null,
      type: "SCHEDULE_DENSITY",
      severity: "LOW",
      message: `${unscheduled.length} selected place${unscheduled.length === 1 ? " is" : "s are"} kept as unscheduled because the current itinerary pace has no remaining capacity.`,
      recommendation:
        "Keep these selections for review; a future scheduling step can place them after dates, pace, or priorities change.",
      metadata: conflictMetadata({
        rule: "unscheduled_selected_overflow",
        unscheduledCount: unscheduled.length,
        placeSuggestionIds: unscheduled.map((place) => place.id),
      }),
    },
  ];
}

function densityConflicts({
  trip,
  days,
}: {
  trip: DetectableTrip;
  days: readonly DetectableDay[];
}): ConflictCandidate[] {
  const pace = trip.preference?.pace ?? "BALANCED";

  return days.flatMap((day): ConflictCandidate[] => {
    const items = day.items.filter((item) => category(item) !== "HOTEL");
    const count = items.length;

    if (count > paceCapacity[pace]) {
      return [
        {
          itineraryItemId: null,
          type: "SCHEDULE_DENSITY" as const,
          severity: "MEDIUM" as const,
          message: `Day ${day.dayNumber} has ${count} non-hotel stops, above the ${pace.toLocaleLowerCase()} pace capacity of ${paceCapacity[pace]}.`,
          recommendation:
            "Move lower-priority stops to another day or remove one before detailed scheduling.",
          metadata: conflictMetadata({
            rule: "pace_capacity",
            dayId: day.id,
            dayNumber: day.dayNumber,
            itemCount: count,
            pace,
            capacity: paceCapacity[pace],
          }),
        },
      ];
    }

    if (count >= comfortThreshold[pace]) {
      return [
        {
          itineraryItemId: null,
          type: "SCHEDULE_DENSITY" as const,
          severity: "LOW" as const,
          message: `Day ${day.dayNumber} is close to the comfortable ${pace.toLocaleLowerCase()} pace limit with ${count} non-hotel stops.`,
          recommendation:
            "Keep an eye on this day once route times and activity durations are available.",
          metadata: conflictMetadata({
            rule: "comfort_buffer",
            dayId: day.id,
            dayNumber: day.dayNumber,
            itemCount: count,
            pace,
            threshold: comfortThreshold[pace],
          }),
        },
      ];
    }

    return [];
  });
}

function missingDurationConflicts(days: readonly DetectableDay[]) {
  return days.flatMap((day) =>
    day.items
      .filter((item) => category(item) !== "HOTEL")
      .filter((item) => item.durationMinutes === null)
      .map(
        (item): ConflictCandidate => ({
          itineraryItemId: item.id,
          type: "MISSING_DURATION",
          severity: "LOW",
          message: `${item.title} is missing a planned duration.`,
          recommendation: "Add a duration before detailed scheduling.",
          metadata: conflictMetadata({
            rule: "missing_duration",
            dayId: day.id,
            dayNumber: day.dayNumber,
          }),
        }),
      ),
  );
}

function distanceConflicts(days: readonly DetectableDay[]) {
  return days.flatMap((day) => {
    const locations = Array.from(
      new Set(
        day.items
          .map(locationKey)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    if (locations.length <= 1) {
      return [];
    }

    return [
      {
        itineraryItemId: null,
        type: "DISTANCE" as const,
        severity: "MEDIUM" as const,
        message: `Day ${day.dayNumber} includes places in multiple cities or countries: ${locations.join("; ")}.`,
        recommendation:
          "Group same-city places together or wait for route-duration optimization in a later phase.",
        metadata: conflictMetadata({
          rule: "mixed_city_day",
          dayId: day.id,
          dayNumber: day.dayNumber,
          locations,
        }),
      },
    ];
  });
}

function timeConflicts(days: readonly DetectableDay[]) {
  return days.flatMap((day) => {
    const conflicts: ConflictCandidate[] = [];

    for (let leftIndex = 0; leftIndex < day.items.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < day.items.length;
        rightIndex += 1
      ) {
        const left = day.items[leftIndex];
        const right = day.items[rightIndex];
        const leftStart = dateValue(left.startTime);
        const leftEnd = dateValue(left.endTime);
        const rightStart = dateValue(right.startTime);
        const rightEnd = dateValue(right.endTime);

        if (!leftStart || !leftEnd || !rightStart || !rightEnd) {
          continue;
        }

        if (leftStart < rightEnd && rightStart < leftEnd) {
          conflicts.push({
            itineraryItemId: right.id,
            type: "TIME",
            severity: "HIGH",
            message: `${right.title} overlaps with ${left.title} on Day ${day.dayNumber}.`,
            recommendation:
              "Move one item to a different time or day before publishing this itinerary.",
            metadata: conflictMetadata({
              rule: "time_overlap",
              dayId: day.id,
              dayNumber: day.dayNumber,
              overlappingItemId: left.id,
            }),
          });
        }
      }
    }

    return conflicts;
  });
}

function unavailableConflicts(days: readonly DetectableDay[]) {
  return days.flatMap((day) =>
    day.items
      .filter((item) => explicitUnavailable(item.placeSuggestion?.metadata))
      .map(
        (item): ConflictCandidate => ({
          itineraryItemId: item.id,
          type: "CLOSED_OR_UNAVAILABLE",
          severity: "MEDIUM",
          message: `${item.title} is marked closed or unavailable in saved place metadata.`,
          recommendation:
            "Refresh this recommendation or replace it before finalizing the itinerary.",
          metadata: conflictMetadata({
            rule: "explicit_unavailable",
            dayId: day.id,
            dayNumber: day.dayNumber,
          }),
        }),
      ),
  );
}

function hotelLocationConflicts(days: readonly DetectableDay[]) {
  const items = days.flatMap((day) => day.items);
  const nonHotelLocations = new Map<string, number>();

  items
    .filter((item) => category(item) !== "HOTEL")
    .map(locationKey)
    .filter((value): value is string => Boolean(value))
    .forEach((location) => {
      nonHotelLocations.set(
        location,
        (nonHotelLocations.get(location) ?? 0) + 1,
      );
    });

  const majorityLocation = Array.from(nonHotelLocations.entries()).sort(
    (left, right) => right[1] - left[1],
  )[0]?.[0];

  if (!majorityLocation) {
    return [];
  }

  return items
    .filter((item) => category(item) === "HOTEL")
    .filter(
      (item) => locationKey(item) && locationKey(item) !== majorityLocation,
    )
    .map(
      (item): ConflictCandidate => ({
        itineraryItemId: item.id,
        type: "HOTEL_LOCATION",
        severity: "MEDIUM",
        message: `${item.title} is in ${itemLocationLabel(item)}, while most planned non-hotel stops are in ${majorityLocation}.`,
        recommendation:
          "Consider selecting a hotel closer to the majority of planned activities.",
        metadata: conflictMetadata({
          rule: "hotel_majority_city_mismatch",
          hotelLocation: itemLocationLabel(item),
          majorityLocation,
        }),
      }),
    );
}

function restaurantCoverageConflicts(days: readonly DetectableDay[]) {
  return days.flatMap((day) => {
    const hasActivity = day.items.some((item) => {
      const itemCategory = category(item);

      return itemCategory ? activityCategories.has(itemCategory) : false;
    });
    const hasRestaurant = day.items.some(
      (item) => category(item) === "RESTAURANT",
    );

    if (!hasActivity || hasRestaurant) {
      return [];
    }

    // Phase 9 warns only; future phases should place restaurants by proximity and time.
    return [
      {
        itineraryItemId: null,
        type: "SCHEDULE_DENSITY" as const,
        severity: "LOW" as const,
        message: `Day ${day.dayNumber} has activities but no restaurant assigned.`,
        recommendation:
          "Select restaurants near this day's activities so a future builder can place meals by location and time.",
        metadata: conflictMetadata({
          rule: "restaurant_coverage",
          dayId: day.id,
          dayNumber: day.dayNumber,
        }),
      },
    ];
  });
}

export function detectItineraryConflicts({
  trip,
  days,
}: {
  trip: DetectableTrip;
  days: DetectableDay[];
}) {
  return sortedConflicts(
    uniqueConflictCandidates([
      ...budgetConflicts({ trip, days }),
      ...unscheduledOverflowConflicts({ trip, days }),
      ...densityConflicts({ trip, days }),
      ...missingDurationConflicts(days),
      ...distanceConflicts(days),
      ...timeConflicts(days),
      ...unavailableConflicts(days),
      ...hotelLocationConflicts(days),
      ...restaurantCoverageConflicts(days),
    ]),
  );
}

export function conflictDtoFromRecord(
  record: Prisma.ConflictGetPayload<{ select: typeof itineraryConflictSelect }>,
): ItineraryConflictDto {
  return {
    id: record.id,
    itineraryItemId: record.itineraryItemId,
    type: record.type,
    severity: record.severity,
    status: record.status,
    message: record.message,
    recommendation: record.recommendation,
    metadata: record.metadata,
  };
}

export function summarizeItineraryConflicts(
  conflicts: readonly Pick<ItineraryConflictDto, "severity">[],
) {
  return summarizeBySeverity(conflicts);
}

export async function getOpenItineraryConflictsForTripTx(
  tx: ConflictTx,
  tripId: string,
) {
  const records = await tx.conflict.findMany({
    where: {
      tripId,
      status: "OPEN",
    },
    select: itineraryConflictSelect,
  });

  const { duplicateIds, unique } = uniqueConflictDtos(
    records.map(conflictDtoFromRecord),
  );

  // Reads remain side-effect free. The next explicit refresh replaces duplicates.
  void duplicateIds;

  return sortedConflicts(unique);
}

async function conflictDays(tx: ConflictTx, tripId: string) {
  return tx.itineraryDay.findMany({
    where: {
      tripId,
    },
    select: conflictDaySelect,
    orderBy: {
      dayNumber: "asc",
    },
  });
}

async function existingItineraryItemIds(
  tx: ConflictTx,
  tripId: string,
  detected: readonly ConflictCandidate[],
) {
  const itemIds = Array.from(
    new Set(
      detected
        .map((conflict) => conflict.itineraryItemId)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  if (itemIds.length === 0) {
    return new Set<string>();
  }

  const records = await tx.itineraryItem.findMany({
    where: {
      tripId,
      id: {
        in: itemIds,
      },
    },
    select: {
      id: true,
    },
  });

  return new Set(records.map((record) => record.id));
}

async function createDetectedConflicts(
  tx: ConflictTx,
  tripId: string,
  detected: readonly ConflictCandidate[],
) {
  if (detected.length === 0) {
    return;
  }

  const existingItemIds = await existingItineraryItemIds(tx, tripId, detected);
  const data = detected.map((conflict) => ({
    tripId,
    itineraryItemId:
      conflict.itineraryItemId && existingItemIds.has(conflict.itineraryItemId)
        ? conflict.itineraryItemId
        : null,
    type: conflict.type,
    severity: conflict.severity,
    status: "OPEN" as ConflictStatus,
    message: conflict.message,
    recommendation: conflict.recommendation,
    metadata: conflict.metadata,
  }));

  try {
    await tx.conflict.createMany({
      data,
    });
  } catch (error) {
    if (!isForeignKeyConstraintError(error)) {
      throw error;
    }

    await tx.conflict.createMany({
      data: data.map((conflict) => ({
        ...conflict,
        itineraryItemId: null,
      })),
    });
  }
}

export async function refreshItineraryConflictsForTripTx(
  tx: ConflictTx,
  trip: DetectableTrip,
  options: {
    writeEvent?: boolean;
    operation?: PlanningOperationContext;
  } = {},
) {
  const operation =
    options.operation ?? createPlanningOperationContext(trip.id);

  return measurePlanningOperation(
    "conflict_refresh",
    operation,
    async () => {
      const days = await conflictDays(tx, trip.id);
      const selectedPlaces = await tx.placeSuggestion.findMany({
        where: {
          tripId: trip.id,
          status: "SELECTED",
        },
        select: {
          id: true,
          name: true,
        },
      });
      const detected = detectItineraryConflicts({
        trip: {
          ...trip,
          selectedPlaces,
        },
        days: days as ConflictDayRecord[],
      });

      await tx.conflict.deleteMany({
        where: {
          tripId: trip.id,
          status: "OPEN",
        },
      });

      await createDetectedConflicts(tx, trip.id, detected);

      if (options.writeEvent) {
        await tx.planningEvent.create({
          data: {
            tripId: trip.id,
            actor: "ENGINE",
            type: "CONFLICT_SUMMARY",
            title: "Conflict check completed",
            message:
              detected.length === 0
                ? "No open itinerary conflicts were detected."
                : `Detected ${detected.length} open itinerary conflict${detected.length === 1 ? "" : "s"}.`,
            visibleToUser: true,
            metadata: {
              conflictCount: detected.length,
              summary: summarizeBySeverity(detected),
            },
          },
        });
      }

      return getOpenItineraryConflictsForTripTx(tx, trip.id);
    },
    () => ({ status: "refreshed" }),
  );
}

export async function checkItineraryConflicts(
  userId: string,
  tripId: string,
  control?: PlanningMutationControl,
) {
  const operation = createPlanningOperationContext(
    tripId,
    control?.operationId,
  );

  return executePlanningMutation({
    userId,
    tripId,
    control,
    transaction: async (tx) => {
      const trip = await tx.trip.findFirst({
        where: buildTripOwnerWhere(userId, tripId),
        select: conflictTripSelect,
      });
      const accessFailure = planningAccessFailure(trip);

      if (accessFailure) {
        return accessFailure;
      }
      if (!trip) {
        return { status: "not_found" as const };
      }
      const replay = await getPlanningMutationReplayTx(tx, tripId, control);

      if (replay) return replay;

      const conflicts = await refreshItineraryConflictsForTripTx(tx, trip, {
        writeEvent: true,
        operation,
      });

      return finalizePlanningMutationTx(tx, {
        userId,
        tripId,
        kind: "conflicts_check",
        control,
        result: {
          status: "checked" as const,
          conflicts,
          summary: summarizeBySeverity(conflicts),
        },
      });
    },
  });
}

export async function updateItineraryConflictStatus(
  userId: string,
  tripId: string,
  input: {
    conflictId: string;
    status: Extract<ConflictStatus, "RESOLVED" | "IGNORED">;
  },
  control?: PlanningMutationControl,
) {
  return executePlanningMutation({
    userId,
    tripId,
    control,
    transaction: async (tx) => {
      const trip = await tx.trip.findFirst({
        where: buildTripOwnerWhere(userId, tripId),
        select: conflictTripSelect,
      });
      const accessFailure = planningAccessFailure(trip);

      if (accessFailure) {
        return accessFailure;
      }
      if (!trip) {
        return { status: "not_found" as const };
      }
      const replay = await getPlanningMutationReplayTx(tx, tripId, control);

      if (replay) return replay;

      const updateResult = await tx.conflict.updateMany({
        where: {
          id: input.conflictId,
          tripId,
        },
        data: {
          status: input.status,
        },
      });

      if (updateResult.count === 0) {
        return { status: "conflict_not_found" as const };
      }

      const action: FeedbackAction =
        input.status === "RESOLVED" ? "RESOLVE" : "IGNORE";

      await tx.planningFeedback.create({
        data: {
          tripId,
          targetType: "CONFLICT",
          targetId: input.conflictId,
          conflictId: input.conflictId,
          source: "USER",
          action,
          metadata: {
            source: "conflict_resolution",
            status: input.status,
          },
        },
      });

      return finalizePlanningMutationTx(tx, {
        userId,
        tripId,
        kind: "conflict_status_update",
        control,
        result: { status: "updated" as const },
      });
    },
  });
}

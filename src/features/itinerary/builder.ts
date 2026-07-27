import type {
  CityWindowSource,
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
} from "@/features/planning/telemetry";
import { getTripReadiness } from "@/features/trips/readiness";
import type {
  ItineraryDayDto,
  ItineraryDraft,
  ItineraryDraftPlace,
  ItineraryDraftTrip,
  ItineraryDraftTravelSegment,
  ItineraryDto,
  ItineraryItemDto,
  UnscheduledItineraryItemDto,
} from "./types";
import {
  getOpenItineraryConflictsForTripTx,
  refreshItineraryConflictsForTripTx,
  summarizeItineraryConflicts,
} from "./conflict-engine";

type ItineraryTx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

const paceCapacity: Record<TravelPace, number> = {
  RELAXED: 3,
  BALANCED: 4,
  PACKED: 6,
};

const categoryPriority: Partial<Record<SuggestionCategory, number>> = {
  ATTRACTION: 0,
  LANDMARK: 1,
  ACTIVITY: 2,
  RESTAURANT: 3,
  ENTERTAINMENT: 4,
};

const emptyItinerary = {
  version: null,
  days: [],
  totals: {
    itemCount: 0,
    estimatedCostAmount: null,
    estimatedCostCurrency: null,
    costIsComplete: true,
    excludedCostCurrencies: [],
  },
  unscheduledItems: [],
  conflicts: [],
  conflictSummary: {
    total: 0,
    low: 0,
    medium: 0,
    high: 0,
  },
} satisfies ItineraryDto;

const itineraryTripSelect = {
  id: true,
  activeItineraryVersionId: true,
  activePreferenceProfileVersionId: true,
  title: true,
  status: true,
  startDate: true,
  endDate: true,
  budgetAmount: true,
  budgetCurrency: true,
  logisticsMode: true,
  destinations: {
    select: {
      id: true,
      city: true,
      country: true,
      sortOrder: true,
    },
    orderBy: {
      sortOrder: "asc",
    },
  },
  travelSegments: {
    select: {
      id: true,
      mode: true,
      originCity: true,
      originCountry: true,
      destinationCity: true,
      destinationCountry: true,
      departAt: true,
      arriveAt: true,
      sortOrder: true,
    },
    orderBy: [
      {
        sortOrder: "asc",
      },
      {
        departAt: "asc",
      },
    ],
  },
  preference: {
    select: {
      pace: true,
    },
  },
} satisfies Prisma.TripSelect;

const itineraryVersionSelect = {
  id: true,
  version: true,
  parentVersionId: true,
  preferenceProfileVersionId: true,
  status: true,
  changeScope: true,
  changeSummary: true,
  createdAt: true,
  activatedAt: true,
} satisfies Prisma.ItineraryVersionSelect;

const selectedPlaceSelect = {
  id: true,
  tripId: true,
  category: true,
  name: true,
  description: true,
  city: true,
  country: true,
  score: true,
  estimatedCostAmount: true,
  estimatedCostCurrency: true,
} satisfies Prisma.PlaceSuggestionSelect;

const itineraryDaySelect = {
  id: true,
  dayNumber: true,
  date: true,
  title: true,
  notes: true,
  estimatedCostAmount: true,
  estimatedCostCurrency: true,
  cityWindows: {
    select: {
      id: true,
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
      sortOrder: true,
      startTime: true,
      endTime: true,
      estimatedCostAmount: true,
      estimatedCostCurrency: true,
      placeSuggestion: {
        select: {
          category: true,
          city: true,
          country: true,
        },
      },
    },
    orderBy: {
      sortOrder: "asc",
    },
  },
} satisfies Prisma.ItineraryDaySelect;

type ItineraryTripRecord = Prisma.TripGetPayload<{
  select: typeof itineraryTripSelect;
}>;

type ItineraryDayRecord = Prisma.ItineraryDayGetPayload<{
  select: typeof itineraryDaySelect;
}>;

type DatedTravelSegment = ItineraryDraftTravelSegment & {
  departAt: Date;
  arriveAt: Date;
};

export type ItineraryAccessResult =
  | { status: "not_found" | "archived" }
  | { status: "not_ready"; missingRequirements: string[] };

function numberValue(value: number | { toString: () => string } | null) {
  if (value === null) {
    return null;
  }

  return typeof value === "number" ? value : Number(value.toString());
}

function isoDate(value: Date | string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);

  next.setUTCDate(next.getUTCDate() + days);

  return next;
}

function dayStart(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

function dayEnd(date: string) {
  return addUtcDays(dayStart(date), 1);
}

function maxDate(left: Date, right: Date) {
  return left > right ? left : right;
}

function minDate(left: Date, right: Date) {
  return left < right ? left : right;
}

function datesOverlap(
  leftStart: Date,
  leftEnd: Date,
  rightStart: Date,
  rightEnd: Date,
) {
  return leftStart < rightEnd && rightStart < leftEnd;
}

function tripDates(trip: ItineraryDraftTrip) {
  if (!trip.startDate || !trip.endDate) {
    return [];
  }

  const startDate = new Date(trip.startDate);
  const endDate = new Date(trip.endDate);

  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime()) ||
    endDate < startDate
  ) {
    return [];
  }

  const days: string[] = [];
  let cursor = startDate;

  while (cursor <= endDate) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor = addUtcDays(cursor, 1);
  }

  return days;
}

function categoryRank(category: SuggestionCategory) {
  return categoryPriority[category] ?? 99;
}

function sortedNonHotels(places: readonly ItineraryDraftPlace[]) {
  return [...places]
    .filter((place) => place.category !== "HOTEL")
    .sort((left, right) => {
      const categoryDiff =
        categoryRank(left.category) - categoryRank(right.category);

      if (categoryDiff !== 0) {
        return categoryDiff;
      }

      const scoreDiff =
        (numberValue(right.score) ?? 0) - (numberValue(left.score) ?? 0);

      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      return left.name.localeCompare(right.name);
    });
}

function selectedHotels(places: readonly ItineraryDraftPlace[]) {
  return [...places]
    .filter((place) => place.category === "HOTEL")
    .sort((left, right) => {
      const scoreDiff =
        (numberValue(right.score) ?? 0) - (numberValue(left.score) ?? 0);

      return scoreDiff || left.name.localeCompare(right.name);
    });
}

function totalCost(
  items: readonly Pick<
    ItineraryItemDto,
    "estimatedCostAmount" | "estimatedCostCurrency"
  >[],
  preferredCurrency: string | null,
) {
  const pricedItems = items.filter((item) => item.estimatedCostAmount !== null);
  const currency =
    preferredCurrency ??
    pricedItems.find((item) => item.estimatedCostCurrency)
      ?.estimatedCostCurrency ??
    null;
  const excludedCostCurrencies = [
    ...new Set(
      pricedItems
        .filter(
          (item) =>
            item.estimatedCostCurrency &&
            item.estimatedCostCurrency !== currency,
        )
        .map((item) => item.estimatedCostCurrency as string),
    ),
  ].sort();
  const costIsComplete = pricedItems.every(
    (item) => item.estimatedCostCurrency === currency,
  );

  if (!currency) {
    return {
      estimatedCostAmount: null,
      estimatedCostCurrency: null,
      costIsComplete,
      excludedCostCurrencies,
    };
  }

  const amount = items.reduce((sum, item) => {
    if (
      item.estimatedCostAmount === null ||
      item.estimatedCostCurrency !== currency
    ) {
      return sum;
    }

    return sum + item.estimatedCostAmount;
  }, 0);

  return {
    estimatedCostAmount: amount > 0 ? amount : null,
    estimatedCostCurrency: amount > 0 ? currency : null,
    costIsComplete,
    excludedCostCurrencies,
  };
}

function draftItem(
  place: ItineraryDraftPlace,
  sortOrder: number,
): ItineraryItemDto {
  return {
    id: `draft-item-${place.id}`,
    placeSuggestionId: place.id,
    title: place.name,
    description: place.description,
    category: place.category,
    city: place.city ?? null,
    country: place.country ?? null,
    sortOrder,
    estimatedCostAmount: numberValue(place.estimatedCostAmount),
    estimatedCostCurrency: place.estimatedCostCurrency,
  };
}

function unscheduledDraftItem(
  place: ItineraryDraftPlace,
  sortOrder: number,
  reason: UnscheduledItineraryItemDto["reason"],
): UnscheduledItineraryItemDto {
  return {
    ...draftItem(place, sortOrder),
    id: `unscheduled-item-${place.id}`,
    reason,
    reasonMessage:
      reason === "NO_AVAILABLE_DAY"
        ? "No trip day is available for this selected place."
        : "This selected place exceeds the trip's current pace capacity.",
  };
}

function locationKey(city: string, country: string) {
  return `${city.trim().toLocaleLowerCase()}|${country.trim().toLocaleLowerCase()}`;
}

function destinationIdFor(
  trip: ItineraryDraftTrip,
  city: string,
  country: string,
) {
  const match = trip.destinations?.find(
    (destination) =>
      locationKey(destination.city, destination.country) ===
      locationKey(city, country),
  );

  return match?.id ?? null;
}

function validDate(value: Date | string) {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function travelSegmentsForDate(trip: ItineraryDraftTrip, date: string) {
  const start = dayStart(date);
  const end = dayEnd(date);
  const segments: DatedTravelSegment[] = [];

  for (const segment of trip.travelSegments ?? []) {
    const departAt = validDate(segment.departAt);
    const arriveAt = validDate(segment.arriveAt);

    if (
      !departAt ||
      !arriveAt ||
      departAt >= arriveAt ||
      !datesOverlap(departAt, arriveAt, start, end)
    ) {
      continue;
    }

    segments.push({
      ...segment,
      departAt,
      arriveAt,
    });
  }

  return segments.sort(
    (left, right) =>
      left.departAt.getTime() - right.departAt.getTime() ||
      left.arriveAt.getTime() - right.arriveAt.getTime(),
  );
}

function currentTicketedCity(
  trip: ItineraryDraftTrip,
  at: Date,
): { city: string; country: string } | null {
  const firstDestination = trip.destinations?.[0] ?? null;
  let current = firstDestination
    ? { city: firstDestination.city, country: firstDestination.country }
    : null;

  for (const segment of [...(trip.travelSegments ?? [])].sort(
    (left, right) =>
      new Date(left.arriveAt).getTime() - new Date(right.arriveAt).getTime(),
  )) {
    const departAt = validDate(segment.departAt);
    const arriveAt = validDate(segment.arriveAt);

    if (!departAt || !arriveAt) {
      continue;
    }

    if (!current && departAt > at) {
      current = {
        city: segment.originCity,
        country: segment.originCountry,
      };
    }

    if (arriveAt <= at) {
      current = {
        city: segment.destinationCity,
        country: segment.destinationCountry,
      };
    }
  }

  return current;
}

function cityWindowsForDate(
  trip: ItineraryDraftTrip,
  date: string,
  dayNumber: number,
) {
  if (trip.logisticsMode !== "TICKETED") {
    return [];
  }

  const start = dayStart(date);
  const end = dayEnd(date);
  const segments = travelSegmentsForDate(trip, date);
  const windows: ItineraryDayDto["cityWindows"] = [];
  let cursor = start;
  let currentCity = currentTicketedCity(trip, start);

  const pushCityWindow = (
    city: { city: string; country: string } | null,
    startTime: Date,
    endTime: Date,
  ) => {
    if (!city || startTime >= endTime) {
      return;
    }

    windows.push({
      id: `draft-window-${dayNumber}-${windows.length + 1}`,
      destinationId: destinationIdFor(trip, city.city, city.country),
      travelSegmentId: null,
      city: city.city,
      country: city.country,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      source: "TICKETED" satisfies CityWindowSource,
    });
  };

  for (const segment of segments) {
    const segmentStart = maxDate(segment.departAt, start);
    const segmentEnd = minDate(segment.arriveAt, end);

    pushCityWindow(currentCity, cursor, segmentStart);

    cursor = maxDate(cursor, segmentEnd);
    if (segment.arriveAt <= cursor) {
      currentCity = {
        city: segment.destinationCity,
        country: segment.destinationCountry,
      };
    } else {
      currentCity = null;
    }
  }

  pushCityWindow(currentCity, cursor, end);

  return windows;
}

function timeSlotsForDate(
  trip: ItineraryDraftTrip,
  date: string,
  cityWindows: ItineraryDayDto["cityWindows"],
): ItineraryDayDto["timeSlots"] {
  const start = dayStart(date);
  const segments = travelSegmentsForDate(trip, date);

  return Array.from({ length: 48 }, (_, index) => {
    const slotStart = new Date(start);
    slotStart.setUTCMinutes(index * 30);
    const slotEnd = new Date(slotStart);
    slotEnd.setUTCMinutes(slotEnd.getUTCMinutes() + 30);
    const travelSegment = segments.find((segment) =>
      datesOverlap(segment.departAt, segment.arriveAt, slotStart, slotEnd),
    );
    const cityWindow = cityWindows.find((window) =>
      datesOverlap(
        new Date(window.startTime),
        new Date(window.endTime),
        slotStart,
        slotEnd,
      ),
    );

    return {
      startTime: slotStart.toISOString(),
      endTime: slotEnd.toISOString(),
      city: travelSegment ? null : (cityWindow?.city ?? null),
      country: travelSegment ? null : (cityWindow?.country ?? null),
      travelSegmentId: travelSegment?.id ?? null,
      itemIds: [],
    };
  });
}

function persistedCityWindowDto(
  record: ItineraryDayRecord["cityWindows"][number],
) {
  return {
    id: record.id,
    destinationId: record.destinationId,
    travelSegmentId: record.travelSegmentId,
    city: record.city,
    country: record.country,
    startTime: record.startTime.toISOString(),
    endTime: record.endTime.toISOString(),
    source: record.source,
  };
}

function planningAccessFailure(trip: ItineraryTripRecord | null) {
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

function dayRecordDto(
  record: ItineraryDayRecord,
  trip: ItineraryTripRecord,
): ItineraryDayDto {
  const items = record.items.map(
    (item): ItineraryItemDto => ({
      id: item.id,
      placeSuggestionId: item.placeSuggestionId,
      title: item.title,
      description: item.description,
      category: item.placeSuggestion?.category ?? null,
      city: item.placeSuggestion?.city ?? null,
      country: item.placeSuggestion?.country ?? null,
      sortOrder: item.sortOrder,
      estimatedCostAmount: numberValue(item.estimatedCostAmount),
      estimatedCostCurrency: item.estimatedCostCurrency,
    }),
  );
  const cityWindows = record.cityWindows.map(persistedCityWindowDto);
  const date = isoDate(record.date);
  const cost = totalCost(items, trip.budgetCurrency);

  return {
    id: record.id,
    dayNumber: record.dayNumber,
    date,
    title: record.title,
    notes: record.notes,
    itemCount: items.length,
    ...cost,
    cityWindows,
    timeSlots: date ? timeSlotsForDate(trip, date, cityWindows) : [],
    items,
  };
}

function itineraryDtoFromDays(
  days: ItineraryDayDto[],
  currency: string | null,
  conflicts: ItineraryDto["conflicts"] = [],
  unscheduledItems: ItineraryDto["unscheduledItems"] = [],
  version: ItineraryDto["version"] = null,
) {
  const items = days.flatMap((day) => day.items);
  const cost = totalCost(items, currency);

  return {
    version,
    days,
    unscheduledItems,
    totals: {
      itemCount: items.length,
      ...cost,
    },
    conflicts,
    conflictSummary: summarizeItineraryConflicts(conflicts),
  } satisfies ItineraryDto;
}

function itineraryVersionDto(
  record: Prisma.ItineraryVersionGetPayload<{
    select: typeof itineraryVersionSelect;
  }> | null,
): ItineraryDto["version"] {
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    version: record.version,
    parentVersionId: record.parentVersionId,
    preferenceProfileVersionId: record.preferenceProfileVersionId,
    status: record.status,
    changeScope: record.changeScope,
    changeSummary: record.changeSummary,
    createdAt: record.createdAt.toISOString(),
    activatedAt: record.activatedAt?.toISOString() ?? null,
  };
}

export function buildItineraryDraft({
  trip,
  selectedPlaces,
}: {
  trip: ItineraryDraftTrip;
  selectedPlaces: readonly ItineraryDraftPlace[];
}): ItineraryDraft {
  if (selectedPlaces.length === 0) {
    return {
      status: "no_selected_places",
      ...emptyItinerary,
    };
  }

  const dates = tripDates(trip);
  const capacity = paceCapacity[trip.preference?.pace ?? "BALANCED"];
  const nonHotels = sortedNonHotels(selectedPlaces);
  const hotels = selectedHotels(selectedPlaces);

  const days = dates.map((date, index): ItineraryDayDto => {
    const dayNumber = index + 1;
    const dayPlaces =
      dayNumber === 1
        ? [
            ...hotels,
            ...nonHotels.slice(index * capacity, (index + 1) * capacity),
          ]
        : nonHotels.slice(index * capacity, (index + 1) * capacity);
    const items = dayPlaces.map((place, sortOrder) =>
      draftItem(place, sortOrder),
    );
    const cost = totalCost(items, trip.budgetCurrency);
    const cityWindows = cityWindowsForDate(trip, date, dayNumber);

    return {
      id: `draft-day-${dayNumber}`,
      dayNumber,
      date,
      title: `Day ${dayNumber}`,
      notes: null,
      itemCount: items.length,
      ...cost,
      cityWindows,
      timeSlots: timeSlotsForDate(trip, date, cityWindows),
      items,
    };
  });
  const scheduledPlaceIds = new Set(
    days.flatMap((day) =>
      day.items.flatMap((item) =>
        item.placeSuggestionId ? [item.placeSuggestionId] : [],
      ),
    ),
  );
  const unscheduledItems = selectedPlaces
    .filter((place) => !scheduledPlaceIds.has(place.id))
    .map((place, index) =>
      unscheduledDraftItem(
        place,
        index,
        dates.length === 0 ? "NO_AVAILABLE_DAY" : "PACE_CAPACITY_EXCEEDED",
      ),
    );

  return {
    status: "built",
    ...itineraryDtoFromDays(days, trip.budgetCurrency, [], unscheduledItems),
  };
}

async function selectedPlaces(tx: ItineraryTx, tripId: string) {
  return tx.placeSuggestion.findMany({
    where: {
      tripId,
      status: "SELECTED",
    },
    select: selectedPlaceSelect,
  });
}

async function persistedItinerary(
  tx: ItineraryTx,
  trip: ItineraryTripRecord,
  requestedVersion?: number,
): Promise<ItineraryDto | null> {
  if (requestedVersion === undefined && !trip.activeItineraryVersionId) {
    return emptyItinerary;
  }

  const version = await tx.itineraryVersion.findFirst({
    where:
      requestedVersion === undefined
        ? {
            id: trip.activeItineraryVersionId ?? "",
            tripId: trip.id,
          }
        : {
            tripId: trip.id,
            version: requestedVersion,
          },
    select: itineraryVersionSelect,
  });
  if (!version) {
    return requestedVersion === undefined ? emptyItinerary : null;
  }
  const conflicts = await getOpenItineraryConflictsForTripTx(
    tx,
    trip.id,
    version.id,
  );
  const days = await tx.itineraryDay.findMany({
    where: {
      tripId: trip.id,
      itineraryVersionId: version.id,
    },
    select: itineraryDaySelect,
    orderBy: {
      dayNumber: "asc",
    },
  });
  const places =
    version.id === trip.activeItineraryVersionId
      ? await selectedPlaces(tx, trip.id)
      : [];
  const dayDtos = days.map((day) => dayRecordDto(day, trip));
  const scheduledPlaceIds = new Set(
    dayDtos.flatMap((day) =>
      day.items.flatMap((item) =>
        item.placeSuggestionId ? [item.placeSuggestionId] : [],
      ),
    ),
  );
  const unscheduledItems = places
    .filter((place) => !scheduledPlaceIds.has(place.id))
    .map((place, index) =>
      unscheduledDraftItem(place, index, "PACE_CAPACITY_EXCEEDED"),
    );

  return itineraryDtoFromDays(
    dayDtos,
    trip.budgetCurrency,
    conflicts,
    unscheduledItems,
    itineraryVersionDto(version),
  );
}

export async function getPersistedItineraryForTripTx(
  tx: ItineraryTx,
  tripId: string,
) {
  const trip = await tx.trip.findUnique({
    where: {
      id: tripId,
    },
    select: itineraryTripSelect,
  });

  if (!trip) {
    return emptyItinerary;
  }

  return (await persistedItinerary(tx, trip)) ?? emptyItinerary;
}

async function persistDraft(
  tx: ItineraryTx,
  trip: ItineraryTripRecord,
  draft: ItineraryDraft,
) {
  const latestVersion = await tx.itineraryVersion.findFirst({
    where: {
      tripId: trip.id,
    },
    select: {
      version: true,
    },
    orderBy: {
      version: "desc",
    },
  });
  const createdVersion = await tx.itineraryVersion.create({
    data: {
      tripId: trip.id,
      version: (latestVersion?.version ?? 0) + 1,
      parentVersionId: trip.activeItineraryVersionId,
      preferenceProfileVersionId: trip.activePreferenceProfileVersionId,
      status: "DRAFT",
      changeScope: trip.activeItineraryVersionId ? "FULL" : "INITIAL",
      changeSummary: {
        reason: "selected_places_rebuild",
        itemCount: draft.totals.itemCount,
      },
    },
    select: itineraryVersionSelect,
  });

  const days: ItineraryDayDto[] = [];

  for (const day of draft.status === "built" ? draft.days : []) {
    const createdDay = await tx.itineraryDay.create({
      data: {
        tripId: trip.id,
        itineraryVersionId: createdVersion.id,
        dayNumber: day.dayNumber,
        date: day.date ? new Date(`${day.date}T00:00:00.000Z`) : null,
        title: day.title,
        notes: day.notes,
        estimatedCostAmount: day.estimatedCostAmount,
        estimatedCostCurrency: day.estimatedCostCurrency,
      },
      select: {
        id: true,
      },
    });
    const items: { id: string }[] = [];

    if (day.cityWindows.length > 0) {
      await tx.itineraryCityWindow.createMany({
        data: day.cityWindows.map((window) => ({
          tripId: trip.id,
          dayId: createdDay.id,
          destinationId: window.destinationId,
          travelSegmentId: window.travelSegmentId,
          city: window.city,
          country: window.country,
          startTime: new Date(window.startTime),
          endTime: new Date(window.endTime),
          source: window.source,
        })),
      });
    }

    for (const item of day.items) {
      items.push(
        await tx.itineraryItem.create({
          data: {
            tripId: trip.id,
            dayId: createdDay.id,
            placeSuggestionId: item.placeSuggestionId,
            title: item.title,
            description: item.description,
            sortOrder: item.sortOrder,
            startTime: null,
            endTime: null,
            durationMinutes: null,
            estimatedCostAmount: item.estimatedCostAmount,
            estimatedCostCurrency: item.estimatedCostCurrency,
          },
          select: {
            id: true,
          },
        }),
      );
    }

    days.push({
      ...day,
      id: createdDay.id,
      items: day.items.map((item, index) => ({
        ...item,
        id: items[index].id,
      })),
    });
  }

  if (trip.activeItineraryVersionId) {
    await tx.itineraryVersion.updateMany({
      where: {
        id: trip.activeItineraryVersionId,
        tripId: trip.id,
        status: "ACTIVE",
      },
      data: {
        status: "SUPERSEDED",
      },
    });
  }
  const activatedAt = new Date();
  const activeVersion = await tx.itineraryVersion.update({
    where: {
      id: createdVersion.id,
    },
    data: {
      status: "ACTIVE",
      activatedAt,
    },
    select: itineraryVersionSelect,
  });
  await tx.trip.update({
    where: {
      id: trip.id,
    },
    data: {
      activeItineraryVersionId: createdVersion.id,
    },
  });

  await tx.planningEvent.create({
    data: {
      tripId: trip.id,
      actor: "ENGINE",
      type: "ITINERARY_PROPOSAL",
      title: "Itinerary draft rebuilt",
      message:
        draft.status === "no_selected_places"
          ? "Created an empty itinerary version after all selected places were removed."
          : `Built ${days.length} day-by-day itinerary draft from ${draft.totals.itemCount} selected places.`,
      visibleToUser: true,
      metadata: {
        dayCount: days.length,
        itemCount: draft.totals.itemCount,
        pace: trip.preference?.pace ?? "BALANCED",
        itineraryVersion: activeVersion.version,
      },
    },
  });

  const conflicts = await refreshItineraryConflictsForTripTx(tx, trip, {
    itineraryVersionId: activeVersion.id,
  });

  return itineraryDtoFromDays(
    days,
    trip.budgetCurrency,
    conflicts,
    draft.unscheduledItems,
    itineraryVersionDto(activeVersion),
  );
}

export async function rebuildItineraryDraftForTripTx(
  tx: ItineraryTx,
  tripId: string,
  operation = createPlanningOperationContext(tripId),
) {
  return measurePlanningOperation(
    "itinerary_rebuild",
    operation,
    async () => {
      const trip = await tx.trip.findUnique({
        where: {
          id: tripId,
        },
        select: itineraryTripSelect,
      });

      if (!trip) {
        return {
          status: "not_found" as const,
        };
      }

      const places = await selectedPlaces(tx, tripId);
      const draft = buildItineraryDraft({
        trip,
        selectedPlaces: places,
      });

      const itinerary = await persistDraft(tx, trip, draft);

      if (draft.status === "no_selected_places") {
        return {
          status: "no_selected_places" as const,
          itinerary,
        };
      }

      return {
        status: "rebuilt" as const,
        itinerary,
      };
    },
    (result) => ({
      status: result.status,
      itineraryDayCount:
        result.status === "not_found"
          ? undefined
          : result.itinerary.days.length,
    }),
  );
}

export async function rebuildItinerary(
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
        select: itineraryTripSelect,
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

      const places = await selectedPlaces(tx, tripId);
      const draft = buildItineraryDraft({
        trip,
        selectedPlaces: places,
      });
      const itinerary = await measurePlanningOperation(
        "itinerary_rebuild",
        operation,
        () => persistDraft(tx, trip, draft),
        (result) => ({ itineraryDayCount: result.days.length }),
      );

      if (draft.status === "no_selected_places") {
        return finalizePlanningMutationTx(tx, {
          userId,
          tripId,
          kind: "itinerary_rebuild",
          control,
          result: {
            status: "no_selected_places" as const,
            itinerary,
          },
        });
      }

      return finalizePlanningMutationTx(tx, {
        userId,
        tripId,
        kind: "itinerary_rebuild",
        control,
        result: {
          status: "rebuilt" as const,
          itinerary,
        },
      });
    },
  });
}

export async function getItinerary(
  userId: string,
  tripId: string,
  version?: number,
) {
  if (
    version !== undefined &&
    (!Number.isInteger(version) || version <= 0 || version > 2_147_483_647)
  ) {
    return { status: "invalid_version" as const };
  }

  return db.$transaction(async (tx) => {
    const trip = await tx.trip.findFirst({
      where: buildTripOwnerWhere(userId, tripId),
      select: itineraryTripSelect,
    });
    const accessFailure = planningAccessFailure(trip);

    if (accessFailure) {
      return accessFailure;
    }
    if (!trip) {
      return { status: "not_found" as const };
    }

    const itinerary = await persistedItinerary(tx, trip, version);
    if (!itinerary) {
      return { status: "version_not_found" as const };
    }

    return {
      status: "ok" as const,
      itinerary,
    };
  });
}

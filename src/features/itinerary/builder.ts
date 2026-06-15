import type { Prisma, SuggestionCategory, TravelPace } from "@/generated/prisma/client";
import { buildTripOwnerWhere } from "@/lib/authorization-rules";
import { db } from "@/lib/db";
import { getTripReadiness } from "@/features/trips/readiness";
import type {
  ItineraryDayDto,
  ItineraryDraft,
  ItineraryDraftPlace,
  ItineraryDraftTrip,
  ItineraryDto,
  ItineraryItemDto,
} from "./types";

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
  days: [],
  totals: {
    itemCount: 0,
    estimatedCostAmount: null,
    estimatedCostCurrency: null,
  },
} satisfies ItineraryDto;

const itineraryTripSelect = {
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
  items: {
    select: {
      id: true,
      placeSuggestionId: true,
      title: true,
      description: true,
      sortOrder: true,
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
      const categoryDiff = categoryRank(left.category) - categoryRank(right.category);

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
  const currency =
    preferredCurrency ??
    items.find((item) => item.estimatedCostAmount !== null)
      ?.estimatedCostCurrency ??
    null;

  if (!currency) {
    return {
      estimatedCostAmount: null,
      estimatedCostCurrency: null,
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
  };
}

function draftItem(place: ItineraryDraftPlace, sortOrder: number): ItineraryItemDto {
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

function dayRecordDto(record: ItineraryDayRecord): ItineraryDayDto {
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

  return {
    id: record.id,
    dayNumber: record.dayNumber,
    date: isoDate(record.date),
    title: record.title,
    notes: record.notes,
    itemCount: items.length,
    estimatedCostAmount: numberValue(record.estimatedCostAmount),
    estimatedCostCurrency: record.estimatedCostCurrency,
    items,
  };
}

function itineraryDtoFromDays(days: ItineraryDayDto[], currency: string | null) {
  const items = days.flatMap((day) => day.items);
  const cost = totalCost(items, currency);

  return {
    days,
    totals: {
      itemCount: items.length,
      ...cost,
    },
  } satisfies ItineraryDto;
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

    return {
      id: `draft-day-${dayNumber}`,
      dayNumber,
      date,
      title: `Day ${dayNumber}`,
      notes: null,
      itemCount: items.length,
      ...cost,
      items,
    };
  });

  return {
    status: "built",
    ...itineraryDtoFromDays(days, trip.budgetCurrency),
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

async function persistedItinerary(tx: ItineraryTx, tripId: string) {
  const days = await tx.itineraryDay.findMany({
    where: {
      tripId,
    },
    select: itineraryDaySelect,
    orderBy: {
      dayNumber: "asc",
    },
  });

  return itineraryDtoFromDays(days.map(dayRecordDto), null);
}

export async function getPersistedItineraryForTripTx(
  tx: ItineraryTx,
  tripId: string,
) {
  return persistedItinerary(tx, tripId);
}

async function clearGeneratedItinerary(tx: ItineraryTx, tripId: string) {
  await tx.planningFeedback.updateMany({
    where: {
      tripId,
      OR: [
        {
          itineraryDayId: {
            not: null,
          },
        },
        {
          itineraryItemId: {
            not: null,
          },
        },
        {
          conflictId: {
            not: null,
          },
        },
      ],
    },
    data: {
      itineraryDayId: null,
      itineraryItemId: null,
      conflictId: null,
    },
  });
  await tx.conflict.deleteMany({
    where: {
      tripId,
    },
  });
  await tx.itineraryItem.deleteMany({
    where: {
      tripId,
    },
  });
  await tx.itineraryDay.deleteMany({
    where: {
      tripId,
    },
  });
}

async function persistDraft(
  tx: ItineraryTx,
  trip: ItineraryTripRecord,
  draft: ItineraryDraft,
) {
  await clearGeneratedItinerary(tx, trip.id);

  if (draft.status === "no_selected_places") {
    return emptyItinerary;
  }

  const days = await Promise.all(
    draft.days.map(async (day) => {
      const createdDay = await tx.itineraryDay.create({
        data: {
          tripId: trip.id,
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

      const items = await Promise.all(
        day.items.map((item) =>
          tx.itineraryItem.create({
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
        ),
      );

      return {
        ...day,
        id: createdDay.id,
        items: day.items.map((item, index) => ({
          ...item,
          id: items[index].id,
        })),
      };
    }),
  );

  await tx.planningEvent.create({
    data: {
      tripId: trip.id,
      actor: "ENGINE",
      type: "ITINERARY_PROPOSAL",
      title: "Itinerary draft rebuilt",
      message: `Built ${days.length} day-by-day itinerary draft from ${draft.totals.itemCount} selected places.`,
      visibleToUser: true,
      metadata: {
        dayCount: days.length,
        itemCount: draft.totals.itemCount,
        pace: trip.preference?.pace ?? "BALANCED",
      },
    },
  });

  return itineraryDtoFromDays(days, trip.budgetCurrency);
}

export async function rebuildItineraryDraftForTripTx(
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
}

export async function rebuildItinerary(userId: string, tripId: string) {
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
  });
}

export async function getItinerary(userId: string, tripId: string) {
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

    return {
      status: "ok" as const,
      itinerary: await persistedItinerary(tx, tripId),
    };
  });
}

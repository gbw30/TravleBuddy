import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type {
  FeedbackReason,
  Prisma,
  SuggestionCategory,
} from "@/generated/prisma/client";
import { buildTripOwnerWhere } from "@/lib/authorization-rules";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/authorization";
import type {
  PlanningContext,
  PlanningItineraryDto,
  PlanningMutationControl,
  PlanningReadiness,
  PlanningSnapshot,
} from "@/features/planning/types";
import {
  createPlanningOperationContext,
  measurePlanningOperation,
  type PlanningOperationContext,
} from "@/features/planning/telemetry";
import {
  executePlanningMutation,
  finalizePlanningMutationTx,
  getPlanningMutationReplayTx,
} from "@/features/planning/mutation";
import { getTripReadiness } from "@/features/trips/readiness";
import {
  getPersistedItineraryForTripTx,
  rebuildItineraryDraftForTripTx,
} from "@/features/itinerary/builder";
import { createExplicitPreferenceProfileVersionTx } from "@/features/adaptation/persistence";
import type { ItineraryDto } from "@/features/itinerary/types";
import {
  extractPreferenceSignals,
  hasTopicRecommendationReadiness,
  mergePreferenceSignals,
} from "./extraction";
import {
  recommendationRejectReasons,
  rejectedProviderPlaceIds,
} from "./feedback-policy";
import { getMockPlacesForCityTopic } from "./mock-places";
import { scoreMockPlace } from "./scoring";
import type {
  ExtractedPreferenceSignals,
  PlaceActionLogEntry,
  PlanningTopic,
  PlanningTimelineEvent,
  RecommendationFeedbackSignal,
  RecommendationDto,
  RecommendationPreferenceSnapshot,
  SelectedPlanningPlace,
} from "./types";

type PlanningTx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

const maxCustomPlaceEstimatedCost = 999_999.99;

const preferenceSelect = {
  id: true,
  tripId: true,
  budgetLevel: true,
  pace: true,
  interests: true,
  transportationModes: true,
  accommodationTypes: true,
  hotelPriority: true,
  walkingToleranceKm: true,
  dietaryRestrictions: true,
  accessibilityNeeds: true,
  mustAvoid: true,
  customNotes: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TripPreferenceSelect;

const tripPlanningSelect = {
  id: true,
  planningRevision: true,
  title: true,
  status: true,
  startDate: true,
  endDate: true,
  budgetAmount: true,
  budgetCurrency: true,
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
  preference: {
    select: preferenceSelect,
  },
} satisfies Prisma.TripSelect;

type TripPlanningRecord = Prisma.TripGetPayload<{
  select: typeof tripPlanningSelect;
}>;

type PlaceSuggestionRecord = Prisma.PlaceSuggestionGetPayload<{
  select: typeof placeSuggestionSelect;
}>;

const placeSuggestionSelect = {
  id: true,
  tripId: true,
  destinationId: true,
  provider: true,
  providerPlaceId: true,
  category: true,
  status: true,
  name: true,
  description: true,
  explanation: true,
  city: true,
  country: true,
  latitude: true,
  longitude: true,
  score: true,
  rating: true,
  priceLevel: true,
  estimatedCostAmount: true,
  estimatedCostCurrency: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PlaceSuggestionSelect;

const planningEventSelect = {
  id: true,
  actor: true,
  type: true,
  title: true,
  message: true,
  createdAt: true,
} satisfies Prisma.PlanningEventSelect;

const recommendationFeedbackSelect = {
  reason: true,
  userNote: true,
  placeSuggestion: {
    select: {
      providerPlaceId: true,
      category: true,
      name: true,
      estimatedCostAmount: true,
      priceLevel: true,
      latitude: true,
      longitude: true,
      metadata: true,
    },
  },
} satisfies Prisma.PlanningFeedbackSelect;

const placeActionLogSelect = {
  id: true,
  action: true,
  reason: true,
  userNote: true,
  createdAt: true,
  placeSuggestion: {
    select: {
      id: true,
      name: true,
      category: true,
      status: true,
      city: true,
      country: true,
    },
  },
} satisfies Prisma.PlanningFeedbackSelect;

type RecommendationFeedbackRecord = Prisma.PlanningFeedbackGetPayload<{
  select: typeof recommendationFeedbackSelect;
}>;

type PlaceActionLogRecord = Prisma.PlanningFeedbackGetPayload<{
  select: typeof placeActionLogSelect;
}>;

function toStringArray(value: Prisma.JsonValue | null | undefined) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function getMetadataStringArray(
  metadata: Prisma.JsonValue | null | undefined,
  key: string,
) {
  if (!metadata || Array.isArray(metadata) || typeof metadata !== "object") {
    return [];
  }

  return toStringArray(metadata[key]);
}

function getMetadataValue(
  metadata: Prisma.JsonValue | null | undefined,
  key: string,
) {
  if (!metadata || Array.isArray(metadata) || typeof metadata !== "object") {
    return undefined;
  }

  return metadata[key];
}

function normalizedDecisionText(value: string | null | undefined) {
  const normalized = value?.trim().toLocaleLowerCase();

  return normalized || null;
}

function serializeDecimalNumber(
  value: { toString: () => string } | number | null,
) {
  if (value === null) {
    return null;
  }

  return typeof value === "number" ? value : Number(value.toString());
}

function serializeDateOnly(value: Date | string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function preferenceSnapshot(
  preference: TripPlanningRecord["preference"],
): RecommendationPreferenceSnapshot {
  return {
    budgetLevel: preference?.budgetLevel ?? null,
    pace: preference?.pace ?? null,
    interests: preference?.interests ?? [],
    transportationModes: preference?.transportationModes ?? [],
    accommodationTypes: preference?.accommodationTypes ?? [],
    hotelPriority: preference?.hotelPriority ?? null,
    walkingToleranceKm: preference
      ? serializeDecimalNumber(preference.walkingToleranceKm)
      : null,
    customPreferences: getMetadataStringArray(
      preference?.metadata,
      "customPreferences",
    ),
    mustAvoid: toStringArray(preference?.mustAvoid),
  };
}

function toRecommendationDto(record: PlaceSuggestionRecord): RecommendationDto {
  return {
    id: record.id,
    tripId: record.tripId,
    destinationId: record.destinationId,
    topic:
      record.metadata &&
      !Array.isArray(record.metadata) &&
      typeof record.metadata === "object" &&
      typeof record.metadata.topic === "string"
        ? (record.metadata.topic as PlanningTopic)
        : null,
    name: record.name,
    category: record.category,
    status: record.status,
    description: record.description,
    explanation: record.explanation,
    city: record.city,
    country: record.country,
    score: serializeDecimalNumber(record.score),
    rating: serializeDecimalNumber(record.rating),
    estimatedCostAmount: serializeDecimalNumber(record.estimatedCostAmount),
    estimatedCostCurrency: record.estimatedCostCurrency,
  };
}

function selectedPlaceDto(
  record: Pick<
    PlaceSuggestionRecord,
    "id" | "name" | "category" | "city" | "country" | "latitude" | "longitude"
  >,
): SelectedPlanningPlace {
  return {
    id: record.id,
    name: record.name,
    category: record.category,
    city: record.city,
    country: record.country,
    latitude: serializeDecimalNumber(record.latitude),
    longitude: serializeDecimalNumber(record.longitude),
  };
}

function metadataTopic(metadata: Prisma.JsonValue | null | undefined) {
  if (!metadata || Array.isArray(metadata) || typeof metadata !== "object") {
    return null;
  }

  const topic = metadata.topic;

  return topic === "HOTEL_BASE" ||
    topic === "ACTIVITIES" ||
    topic === "FOOD_NIGHTLIFE" ||
    topic === "BUDGET_PACE"
    ? topic
    : null;
}

function timelineEventDto(
  record: Prisma.PlanningEventGetPayload<{
    select: typeof planningEventSelect;
  }>,
): PlanningTimelineEvent {
  return {
    id: record.id,
    actor: record.actor,
    type: record.type,
    title: record.title,
    message: record.message,
    createdAt: record.createdAt.toISOString(),
  };
}

function recommendationFeedbackSignal(
  record: RecommendationFeedbackRecord,
): RecommendationFeedbackSignal | null {
  const suggestion = record.placeSuggestion;

  if (!suggestion) {
    return null;
  }

  return {
    providerPlaceId: suggestion.providerPlaceId,
    topic: metadataTopic(suggestion.metadata),
    category: suggestion.category,
    name: suggestion.name,
    reason: record.reason,
    note: record.userNote,
    tags: getMetadataStringArray(suggestion.metadata, "tags"),
    estimatedCostAmount: serializeDecimalNumber(suggestion.estimatedCostAmount),
    priceLevel: suggestion.priceLevel,
    latitude: serializeDecimalNumber(suggestion.latitude),
    longitude: serializeDecimalNumber(suggestion.longitude),
  };
}

function placeActionLogEntry(
  record: PlaceActionLogRecord,
): PlaceActionLogEntry | null {
  if (
    !record.placeSuggestion ||
    (record.action !== "SELECT" &&
      record.action !== "REJECT" &&
      record.action !== "DESELECT")
  ) {
    return null;
  }

  return {
    id: record.id,
    action: record.action,
    reason: record.reason,
    note: record.userNote,
    createdAt: record.createdAt.toISOString(),
    place: {
      id: record.placeSuggestion.id,
      name: record.placeSuggestion.name,
      category: record.placeSuggestion.category,
      status: record.placeSuggestion.status,
      city: record.placeSuggestion.city,
      country: record.placeSuggestion.country,
    },
  };
}

async function getPlaceActionLog(tx: PlanningTx, tripId: string) {
  const records = await tx.planningFeedback.findMany({
    where: {
      tripId,
      targetType: "PLACE_SUGGESTION",
      action: {
        in: ["SELECT", "REJECT", "DESELECT"],
      },
      placeSuggestionId: {
        not: null,
      },
    },
    select: placeActionLogSelect,
    orderBy: {
      createdAt: "desc",
    },
    take: 20,
  });

  return records
    .map(placeActionLogEntry)
    .filter((item): item is PlaceActionLogEntry => item !== null);
}

async function getRejectedRecommendationFeedback(
  tx: PlanningTx,
  tripId: string,
) {
  const records = await tx.planningFeedback.findMany({
    where: {
      tripId,
      targetType: "PLACE_SUGGESTION",
      action: "REJECT",
      placeSuggestionId: {
        not: null,
      },
    },
    select: recommendationFeedbackSelect,
    orderBy: {
      createdAt: "desc",
    },
  });

  return records
    .map(recommendationFeedbackSignal)
    .filter((item): item is RecommendationFeedbackSignal => item !== null);
}

async function writeUserPlanningEvent(
  tx: PlanningTx,
  input: {
    tripId: string;
    title: string;
    message: string;
    metadata?: Prisma.InputJsonValue;
  },
) {
  await tx.planningEvent.create({
    data: {
      tripId: input.tripId,
      actor: "USER",
      type: "USER_FEEDBACK",
      title: input.title,
      message: input.message,
      visibleToUser: true,
      metadata: input.metadata,
    },
  });
}

function planningAccessFailure(trip: TripPlanningRecord | null) {
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

async function getPlanningTrip(tx: PlanningTx, userId: string, tripId: string) {
  return tx.trip.findFirst({
    where: buildTripOwnerWhere(userId, tripId),
    select: tripPlanningSelect,
  });
}

async function getSelectedPlaces(tx: PlanningTx, tripId: string) {
  const records = await tx.placeSuggestion.findMany({
    where: {
      tripId,
      status: "SELECTED",
    },
    select: placeSuggestionSelect,
    orderBy: {
      updatedAt: "desc",
    },
  });

  return records.map(selectedPlaceDto);
}

async function savePreferenceSignals(
  tx: PlanningTx,
  tripId: string,
  currentPreference: RecommendationPreferenceSnapshot,
  signals: ExtractedPreferenceSignals,
) {
  const merged = mergePreferenceSignals(currentPreference, signals);

  const projection = await tx.tripPreference.upsert({
    where: {
      tripId,
    },
    update: {
      budgetLevel: merged.budgetLevel,
      pace: merged.pace,
      interests: merged.interests,
      transportationModes: merged.transportationModes,
      accommodationTypes: merged.accommodationTypes,
      walkingToleranceKm: merged.walkingToleranceKm,
      mustAvoid: merged.mustAvoid,
      metadata: {
        customPreferences: merged.customPreferences,
      },
    },
    create: {
      tripId,
      budgetLevel: merged.budgetLevel,
      pace: merged.pace,
      interests: merged.interests,
      transportationModes: merged.transportationModes,
      accommodationTypes: merged.accommodationTypes,
      walkingToleranceKm: merged.walkingToleranceKm,
      mustAvoid: merged.mustAvoid,
      metadata: {
        customPreferences: merged.customPreferences,
      },
    },
    select: {
      interests: true,
      pace: true,
      updatedAt: true,
    },
  });
  await createExplicitPreferenceProfileVersionTx(tx, {
    tripId,
    projection,
  });

  return merged;
}

export type PlanningAccessResult =
  | { status: "not_found" | "archived" }
  | { status: "not_ready"; missingRequirements: string[] };

function findMatchingDestination(
  destinations: TripPlanningRecord["destinations"],
  city?: string | null,
  country?: string | null,
) {
  if (!city && !country) {
    return destinations[0] ?? null;
  }

  if (!city || !country) {
    return null;
  }

  return (
    destinations.find(
      (destination) =>
        destination.city === city && destination.country === country,
    ) ?? null
  );
}

function findDestinationById(
  destinations: TripPlanningRecord["destinations"],
  destinationId?: string | null,
) {
  if (!destinationId) {
    return destinations[0] ?? null;
  }

  return (
    destinations.find((destination) => destination.id === destinationId) ?? null
  );
}

function planningContextMetadata(input: {
  topic: PlanningTopic;
  destinationId?: string | null;
  planningDayNumber?: number | null;
}) {
  return {
    topic: input.topic,
    ...(input.destinationId ? { destinationId: input.destinationId } : {}),
    ...(input.planningDayNumber
      ? { planningDayNumber: input.planningDayNumber }
      : {}),
  } satisfies Prisma.InputJsonObject;
}

const readinessCandidates: Record<PlanningTopic, readonly string[]> = {
  HOTEL_BASE: [
    "accommodationTypes",
    "hotelPriority",
    "budgetLevel",
    "pace",
    "walkingToleranceKm",
    "selectedPlace",
    "customPreferences",
  ],
  ACTIVITIES: [
    "interests",
    "budgetLevel",
    "pace",
    "walkingToleranceKm",
    "selectedPlace",
    "customPreferences",
  ],
  FOOD_NIGHTLIFE: [
    "interests",
    "budgetLevel",
    "pace",
    "walkingToleranceKm",
    "selectedPlace",
    "customPreferences",
  ],
  BUDGET_PACE: [
    "budgetLevel",
    "pace",
    "transportationModes",
    "walkingToleranceKm",
    "selectedPlace",
    "customPreferences",
  ],
};

function availableReadinessKeys(
  preference: RecommendationPreferenceSnapshot,
  selectedPlaceCount: number,
) {
  return new Set(
    [
      preference.accommodationTypes.length > 0 && "accommodationTypes",
      preference.hotelPriority !== null && "hotelPriority",
      preference.budgetLevel && "budgetLevel",
      preference.pace && "pace",
      preference.walkingToleranceKm !== null && "walkingToleranceKm",
      selectedPlaceCount > 0 && "selectedPlace",
      preference.customPreferences.length > 0 && "customPreferences",
      preference.interests.length > 0 && "interests",
      preference.transportationModes.length > 0 && "transportationModes",
    ].filter((key): key is string => Boolean(key)),
  );
}

function planningReadiness(
  topic: PlanningTopic,
  preference: RecommendationPreferenceSnapshot,
  selectedPlaceCount: number,
): PlanningReadiness {
  const readiness = hasTopicRecommendationReadiness({
    topic,
    preference,
    selectedPlaceCount,
  });
  const available = availableReadinessKeys(preference, selectedPlaceCount);

  return {
    activeTopic: topic,
    isReady: readiness.isReady,
    missingQuestionKeys: readinessCandidates[topic]
      .filter((key) => !available.has(key))
      .slice(0, readiness.missingSignalCount),
  };
}

function planningItineraryDto(itinerary: ItineraryDto): PlanningItineraryDto {
  const conflicts = itinerary.conflicts ?? [];

  return {
    ...itinerary,
    conflicts: conflicts.map(({ metadata, ...conflict }) => {
      void metadata;
      return conflict;
    }),
    conflictSummary: itinerary.conflictSummary ?? {
      total: 0,
      low: 0,
      medium: 0,
      high: 0,
    },
  };
}

function normalizedPlanningContext(
  trip: TripPlanningRecord,
  input?: Partial<PlanningContext>,
): PlanningContext {
  const topic = input?.topic ?? "HOTEL_BASE";
  const destinationId = trip.destinations.some(
    (destination) => destination.id === input?.destinationId,
  )
    ? (input?.destinationId ?? null)
    : (trip.destinations[0]?.id ?? null);
  const planningDayNumber =
    Number.isInteger(input?.planningDayNumber) &&
    (input?.planningDayNumber ?? 0) > 0
      ? (input?.planningDayNumber ?? null)
      : 1;

  return { topic, destinationId, planningDayNumber };
}

function planningSnapshot(input: {
  trip: TripPlanningRecord;
  context: PlanningContext;
  preference: RecommendationPreferenceSnapshot;
  selectedPlaces: SelectedPlanningPlace[];
  recommendations: RecommendationDto[];
  itinerary: ItineraryDto;
  activeJobs: PlanningSnapshot["activeJobs"];
  itineraryVersions: PlanningSnapshot["itineraryVersions"];
}): PlanningSnapshot {
  const recommendations = input.recommendations
    .filter(
      (recommendation) =>
        recommendation.topic === input.context.topic &&
        (!input.context.destinationId ||
          recommendation.destinationId === input.context.destinationId),
    )
    .slice(0, 5);

  return {
    revision: input.trip.planningRevision ?? 0,
    conversationId: null,
    context: input.context,
    preference: input.preference,
    readiness: planningReadiness(
      input.context.topic,
      input.preference,
      input.selectedPlaces.length,
    ),
    recommendations,
    selectedPlaces: input.selectedPlaces,
    itinerary: planningItineraryDto(input.itinerary),
    activeJobs: input.activeJobs,
    itineraryVersions: input.itineraryVersions,
  };
}

type PlanningMessageInput = {
  topic: PlanningTopic;
  message: string;
  destinationId?: string | null;
  planningDayNumber?: number | null;
};

type GenerateRecommendationsInput = {
  topic: PlanningTopic;
  destinationId?: string | null;
  planningDayNumber?: number | null;
};

async function recordPlanningMessageForTripTx(
  tx: PlanningTx,
  trip: TripPlanningRecord,
  input: PlanningMessageInput,
  operation?: PlanningOperationContext,
) {
  const previousPreference = preferenceSnapshot(trip.preference);
  const signals = extractPreferenceSignals(input.message);
  const preference = await savePreferenceSignals(
    tx,
    trip.id,
    previousPreference,
    signals,
  );

  await tx.planningFeedback.create({
    data: {
      tripId: trip.id,
      targetType: "TRIP",
      targetId: trip.id,
      source: "USER",
      action: "REFINE",
      userNote: input.message,
      metadata: {
        ...planningContextMetadata(input),
        extractedSignals: signals,
      },
    },
  });
  await writeUserPlanningEvent(tx, {
    tripId: trip.id,
    title: "Planning note saved",
    message: input.message,
    metadata: {
      ...planningContextMetadata(input),
      extractedSignals: signals,
    },
  });
  if (previousPreference.pace !== preference.pace) {
    await rebuildItineraryDraftForTripTx(tx, trip.id, operation);
  }

  const selectedPlaces = await getSelectedPlaces(tx, trip.id);
  const readiness = hasTopicRecommendationReadiness({
    topic: input.topic,
    preference,
    selectedPlaceCount: selectedPlaces.length,
  });

  return {
    status: "recorded" as const,
    topic: input.topic,
    signals,
    preference,
    readiness,
  };
}

async function generateRecommendationsForTripTx(
  tx: PlanningTx,
  trip: TripPlanningRecord,
  input: GenerateRecommendationsInput,
) {
  const selectedPlaces = await getSelectedPlaces(tx, trip.id);
  const preference = preferenceSnapshot(trip.preference);
  const readiness = hasTopicRecommendationReadiness({
    topic: input.topic,
    preference,
    selectedPlaceCount: selectedPlaces.length,
  });

  if (!readiness.isReady) {
    return {
      status: "needs_more_context" as const,
      readiness,
    };
  }

  const destination =
    findDestinationById(trip.destinations, input.destinationId) ??
    trip.destinations[0];
  const rejectedFeedback = await getRejectedRecommendationFeedback(tx, trip.id);
  const rejectedIds = rejectedProviderPlaceIds(rejectedFeedback);
  const scored = getMockPlacesForCityTopic(
    destination.city,
    destination.country,
    input.topic,
  )
    .filter((place) => !rejectedIds.has(place.id))
    .map((place) =>
      scoreMockPlace(place, {
        topic: input.topic,
        preference,
        selectedPlaces,
        rejectedFeedback,
      }),
    )
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);
  const records: PlaceSuggestionRecord[] = [];

  for (const item of scored) {
    records.push(
      await tx.placeSuggestion.upsert({
        where: {
          tripId_provider_providerPlaceId: {
            tripId: trip.id,
            provider: "MOCK",
            providerPlaceId: item.place.id,
          },
        },
        update: {
          category: item.place.category,
          name: item.place.name,
          description: item.place.description,
          explanation: item.explanation,
          address: item.place.address,
          city: item.place.city,
          country: item.place.country,
          latitude: item.place.latitude,
          longitude: item.place.longitude,
          rating: item.place.rating,
          priceLevel: item.place.priceLevel,
          estimatedCostAmount: item.place.estimatedCostAmount,
          estimatedCostCurrency: item.place.estimatedCostCurrency,
          score: item.score,
          metadata: {
            ...planningContextMetadata({
              topic: input.topic,
              destinationId: destination.id,
              planningDayNumber: input.planningDayNumber,
            }),
            scoreBreakdown: item.breakdown,
            tags: item.place.tags,
          },
        },
        create: {
          tripId: trip.id,
          destinationId: destination.id,
          provider: "MOCK",
          providerPlaceId: item.place.id,
          category: item.place.category,
          status: "PENDING",
          name: item.place.name,
          description: item.place.description,
          explanation: item.explanation,
          address: item.place.address,
          city: item.place.city,
          country: item.place.country,
          latitude: item.place.latitude,
          longitude: item.place.longitude,
          rating: item.place.rating,
          priceLevel: item.place.priceLevel,
          estimatedCostAmount: item.place.estimatedCostAmount,
          estimatedCostCurrency: item.place.estimatedCostCurrency,
          score: item.score,
          metadata: {
            ...planningContextMetadata({
              topic: input.topic,
              destinationId: destination.id,
              planningDayNumber: input.planningDayNumber,
            }),
            scoreBreakdown: item.breakdown,
            tags: item.place.tags,
          },
        },
        select: placeSuggestionSelect,
      }),
    );
  }

  await tx.planningEvent.create({
    data: {
      tripId: trip.id,
      actor: "ENGINE",
      type: "RECOMMENDATION_BATCH",
      title: "Recommendation group generated",
      message: `Generated ${records.length} ${input.topic.toLocaleLowerCase().replaceAll("_", " ")} recommendations for ${destination.city}, ${destination.country}.`,
      visibleToUser: true,
      metadata: {
        ...planningContextMetadata({
          topic: input.topic,
          destinationId: destination.id,
          planningDayNumber: input.planningDayNumber,
        }),
        recommendationCount: records.length,
        topScore: records[0] ? serializeDecimalNumber(records[0].score) : null,
      },
    },
  });

  return {
    status: "generated" as const,
    topic: input.topic,
    recommendations: records.map(toRecommendationDto),
  };
}

export async function recordPlanningMessage(
  userId: string,
  tripId: string,
  input: {
    topic: PlanningTopic;
    message: string;
    destinationId?: string | null;
    planningDayNumber?: number | null;
  },
  control?: PlanningMutationControl,
) {
  const operation = createPlanningOperationContext(
    tripId,
    control?.operationId,
  );

  return measurePlanningOperation(
    "planning_message_persistence",
    operation,
    () =>
      executePlanningMutation({
        userId,
        tripId,
        control,
        transaction: async (tx) => {
          const trip = await getPlanningTrip(tx, userId, tripId);
          const accessFailure = planningAccessFailure(trip);

          if (accessFailure) {
            return accessFailure;
          }
          if (!trip) {
            return { status: "not_found" as const };
          }
          const replay = await getPlanningMutationReplayTx(tx, tripId, control);

          if (replay) return replay;

          const result = await recordPlanningMessageForTripTx(
            tx,
            trip,
            input,
            operation,
          );

          return finalizePlanningMutationTx(tx, {
            userId,
            tripId,
            kind: "planning_message_save",
            control,
            result,
          });
        },
      }),
    (result) => ({ status: result.status }),
  );
}

export async function generateRecommendations(
  userId: string,
  tripId: string,
  input: {
    topic: PlanningTopic;
    destinationId?: string | null;
    planningDayNumber?: number | null;
  },
  control?: PlanningMutationControl,
) {
  const operation = createPlanningOperationContext(
    tripId,
    control?.operationId,
  );

  return measurePlanningOperation(
    "recommendation_generation",
    operation,
    () =>
      executePlanningMutation({
        userId,
        tripId,
        control,
        transaction: async (tx) => {
          const trip = await getPlanningTrip(tx, userId, tripId);
          const accessFailure = planningAccessFailure(trip);

          if (accessFailure) {
            return accessFailure;
          }
          if (!trip) {
            return { status: "not_found" as const };
          }
          const replay = await getPlanningMutationReplayTx(tx, tripId, control);

          if (replay) return replay;

          const result = await generateRecommendationsForTripTx(
            tx,
            trip,
            input,
          );

          if (result.status !== "generated") return result;

          return finalizePlanningMutationTx(tx, {
            userId,
            tripId,
            kind: "recommendations_generate",
            control,
            result,
          });
        },
      }),
    (result) => ({
      status: result.status,
      selectedPlaceCount:
        result.status === "generated"
          ? result.recommendations.length
          : undefined,
    }),
  );
}

export async function listRecommendations(
  userId: string,
  tripId: string,
  topic?: PlanningTopic,
) {
  return db.$transaction(async (tx) => {
    const trip = await getPlanningTrip(tx, userId, tripId);
    const accessFailure = planningAccessFailure(trip);

    if (accessFailure) {
      return accessFailure;
    }
    if (!trip) {
      return { status: "not_found" as const };
    }

    const records = await tx.placeSuggestion.findMany({
      where: {
        tripId,
        status: {
          not: "REJECTED",
        },
        ...(topic
          ? {
              metadata: {
                path: ["topic"],
                equals: topic,
              },
            }
          : {}),
      },
      select: placeSuggestionSelect,
      orderBy: [
        {
          status: "asc",
        },
        {
          score: "desc",
        },
      ],
    });

    return {
      status: "ok" as const,
      recommendations: records.map(toRecommendationDto),
    };
  });
}

export async function addUserPlanningPlace(
  userId: string,
  tripId: string,
  input: {
    topic: PlanningTopic;
    name: string;
    category: SuggestionCategory;
    city?: string | null;
    country?: string | null;
    note?: string | null;
    estimatedCostAmount?: number | null;
    estimatedCostCurrency?: string | null;
    planningDayNumber?: number | null;
  },
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
      const trip = await getPlanningTrip(tx, userId, tripId);
      const accessFailure = planningAccessFailure(trip);

      if (accessFailure) {
        return accessFailure;
      }
      if (!trip) {
        return { status: "not_found" as const };
      }
      const replay = await getPlanningMutationReplayTx(tx, tripId, control);

      if (replay) return replay;

      const destination = findMatchingDestination(
        trip.destinations,
        input.city,
        input.country,
      );

      if (!destination) {
        return {
          status: "invalid_destination" as const,
        };
      }

      const estimatedCostAmount = input.estimatedCostAmount ?? null;
      const estimatedCostCurrency =
        estimatedCostAmount !== null
          ? (input.estimatedCostCurrency ?? trip.budgetCurrency)
          : null;

      if (
        estimatedCostAmount !== null &&
        estimatedCostAmount > maxCustomPlaceEstimatedCost
      ) {
        return {
          status: "invalid_estimated_cost" as const,
        };
      }

      const existingUserPlaces = await tx.placeSuggestion.findMany({
        where: {
          tripId,
          destinationId: destination.id,
          provider: "USER",
          category: input.category,
          status: "SELECTED",
        },
        select: placeSuggestionSelect,
      });
      const identicalPlace = existingUserPlaces.find((place) => {
        const existingDay = getMetadataValue(
          place.metadata,
          "planningDayNumber",
        );

        return (
          normalizedDecisionText(place.name) ===
            normalizedDecisionText(input.name) &&
          normalizedDecisionText(place.description) ===
            normalizedDecisionText(input.note) &&
          serializeDecimalNumber(place.estimatedCostAmount) ===
            estimatedCostAmount &&
          normalizedDecisionText(place.estimatedCostCurrency) ===
            normalizedDecisionText(estimatedCostCurrency) &&
          getMetadataValue(place.metadata, "topic") === input.topic &&
          (typeof existingDay === "number" ? existingDay : null) ===
            (input.planningDayNumber ?? null)
        );
      });

      if (identicalPlace) {
        return {
          status: "saved" as const,
          place: toRecommendationDto(identicalPlace),
          revision: trip.planningRevision,
        };
      }

      const record = await tx.placeSuggestion.create({
        data: {
          tripId,
          destinationId: destination.id,
          provider: "USER",
          category: input.category,
          status: "SELECTED",
          name: input.name,
          description: input.note ?? null,
          explanation: "Added by you as an already-decided place.",
          city: destination.city,
          country: destination.country,
          estimatedCostAmount,
          estimatedCostCurrency,
          metadata: {
            ...planningContextMetadata({
              topic: input.topic,
              destinationId: destination.id,
              planningDayNumber: input.planningDayNumber,
            }),
            source: "user_anchor",
          },
        },
        select: placeSuggestionSelect,
      });

      await tx.planningFeedback.create({
        data: {
          tripId,
          targetType: "PLACE_SUGGESTION",
          targetId: record.id,
          placeSuggestionId: record.id,
          source: "USER",
          action: "SELECT",
          userNote:
            input.note ?? `Added ${input.name} as an already-decided place.`,
          metadata: {
            ...planningContextMetadata({
              topic: input.topic,
              destinationId: destination.id,
              planningDayNumber: input.planningDayNumber,
            }),
            source: "user_anchor",
          },
        },
      });
      await writeUserPlanningEvent(tx, {
        tripId,
        title: "Already-decided place added",
        message: `${record.name} was added to the live plan preview.`,
        metadata: {
          ...planningContextMetadata({
            topic: input.topic,
            destinationId: destination.id,
            planningDayNumber: input.planningDayNumber,
          }),
          placeSuggestionId: record.id,
          source: "user_anchor",
        },
      });
      await rebuildItineraryDraftForTripTx(tx, tripId, operation);

      return finalizePlanningMutationTx(tx, {
        userId,
        tripId,
        kind: "planning_place_add",
        control,
        result: {
          status: "saved" as const,
          place: toRecommendationDto(record),
        },
      });
    },
  });
}

export async function selectRecommendation(
  userId: string,
  tripId: string,
  input: {
    suggestionId: string;
    destinationId?: string | null;
    planningDayNumber?: number | null;
  },
  control?: PlanningMutationControl,
) {
  const operation = createPlanningOperationContext(
    tripId,
    control?.operationId,
  );

  return measurePlanningOperation(
    "recommendation_select",
    operation,
    () =>
      executePlanningMutation({
        userId,
        tripId,
        control,
        transaction: async (tx) => {
          const trip = await getPlanningTrip(tx, userId, tripId);
          const accessFailure = planningAccessFailure(trip);

          if (accessFailure) {
            return accessFailure;
          }
          if (!trip) {
            return { status: "not_found" as const };
          }
          const replay = await getPlanningMutationReplayTx(tx, tripId, control);

          if (replay) return replay;

          const suggestion = await tx.placeSuggestion.findFirst({
            where: {
              id: input.suggestionId,
              tripId,
            },
            select: {
              id: true,
              tripId: true,
              destinationId: true,
              status: true,
              name: true,
              metadata: true,
            },
          });

          if (!suggestion) {
            return {
              status: "suggestion_not_found" as const,
            };
          }

          const requestedDestinationId =
            input.destinationId ?? suggestion.destinationId;
          const destinationIsValid =
            !requestedDestinationId ||
            trip.destinations.some(
              (destination) => destination.id === requestedDestinationId,
            );
          const destinationMatchesSuggestion =
            !input.destinationId ||
            !suggestion.destinationId ||
            input.destinationId === suggestion.destinationId;
          const generatedPlanningDayNumber = getMetadataValue(
            suggestion.metadata,
            "planningDayNumber",
          );
          const requestedPlanningDayNumber =
            input.planningDayNumber ??
            (typeof generatedPlanningDayNumber === "number"
              ? generatedPlanningDayNumber
              : null);
          const tripStart = trip.startDate?.getTime() ?? Number.NaN;
          const tripEnd = trip.endDate?.getTime() ?? Number.NaN;
          const tripDayCount =
            Number.isFinite(tripStart) &&
            Number.isFinite(tripEnd) &&
            tripEnd >= tripStart
              ? Math.floor((tripEnd - tripStart) / 86_400_000) + 1
              : 0;
          const planningDayIsValid =
            requestedPlanningDayNumber === null ||
            (Number.isInteger(requestedPlanningDayNumber) &&
              requestedPlanningDayNumber > 0 &&
              requestedPlanningDayNumber <= tripDayCount);

          if (
            !destinationIsValid ||
            !destinationMatchesSuggestion ||
            !planningDayIsValid
          ) {
            return {
              status: "invalid_context" as const,
            };
          }

          if (suggestion.status === "SELECTED") {
            return {
              status: "selected" as const,
              revision: trip.planningRevision,
            };
          }

          await tx.placeSuggestion.updateMany({
            where: {
              id: input.suggestionId,
              tripId,
            },
            data: {
              status: "SELECTED",
            },
          });

          await tx.planningFeedback.create({
            data: {
              tripId,
              targetType: "PLACE_SUGGESTION",
              targetId: input.suggestionId,
              placeSuggestionId: input.suggestionId,
              source: "USER",
              action: "SELECT",
              metadata: {
                ...(requestedDestinationId
                  ? { destinationId: requestedDestinationId }
                  : {}),
                ...(requestedPlanningDayNumber
                  ? { planningDayNumber: requestedPlanningDayNumber }
                  : {}),
                source: "recommendation_pick",
              },
            },
          });
          await writeUserPlanningEvent(tx, {
            tripId,
            title: "Recommendation selected",
            message: `${suggestion.name} was added to the live plan preview.`,
            metadata: {
              placeSuggestionId: input.suggestionId,
              ...(requestedDestinationId
                ? { destinationId: requestedDestinationId }
                : {}),
              ...(requestedPlanningDayNumber
                ? { planningDayNumber: requestedPlanningDayNumber }
                : {}),
              source: "recommendation_pick",
            },
          });
          await rebuildItineraryDraftForTripTx(tx, tripId, operation);

          return finalizePlanningMutationTx(tx, {
            userId,
            tripId,
            kind: "recommendation_select",
            control,
            result: { status: "selected" as const },
          });
        },
      }),
    (result) => ({ status: result.status }),
  );
}

export async function rejectRecommendation(
  userId: string,
  tripId: string,
  input: {
    suggestionId: string;
    reason: FeedbackReason;
    note?: string | null;
  },
  control?: PlanningMutationControl,
) {
  const operation = createPlanningOperationContext(
    tripId,
    control?.operationId,
  );

  return measurePlanningOperation(
    "recommendation_reject",
    operation,
    () =>
      executePlanningMutation({
        userId,
        tripId,
        control,
        transaction: async (tx) => {
          const trip = await getPlanningTrip(tx, userId, tripId);
          const accessFailure = planningAccessFailure(trip);

          if (accessFailure) {
            return accessFailure;
          }
          if (!trip) {
            return { status: "not_found" as const };
          }
          const replay = await getPlanningMutationReplayTx(tx, tripId, control);

          if (replay) return replay;

          const suggestion = await tx.placeSuggestion.findFirst({
            where: {
              id: input.suggestionId,
              tripId,
            },
            select: {
              id: true,
              tripId: true,
              status: true,
              name: true,
            },
          });

          if (!suggestion) {
            return {
              status: "suggestion_not_found" as const,
            };
          }

          await tx.placeSuggestion.updateMany({
            where: {
              id: input.suggestionId,
              tripId,
            },
            data: {
              status: "REJECTED",
            },
          });

          await tx.planningFeedback.create({
            data: {
              tripId,
              targetType: "PLACE_SUGGESTION",
              targetId: input.suggestionId,
              placeSuggestionId: input.suggestionId,
              source: "USER",
              action: "REJECT",
              reason: input.reason,
              userNote: input.note ?? null,
              metadata: {
                source: "recommendation_reject",
              },
            },
          });
          await writeUserPlanningEvent(tx, {
            tripId,
            title: "Recommendation rejected",
            message: input.note
              ? `${suggestion.name} was rejected: ${input.note}`
              : `${suggestion.name} was rejected because of ${input.reason.toLocaleLowerCase().replaceAll("_", " ")}.`,
            metadata: {
              placeSuggestionId: input.suggestionId,
              reason: input.reason,
              source: "recommendation_reject",
            },
          });
          if (suggestion.status === "SELECTED") {
            await rebuildItineraryDraftForTripTx(tx, tripId, operation);
          }

          return finalizePlanningMutationTx(tx, {
            userId,
            tripId,
            kind: "recommendation_reject",
            control,
            result: { status: "rejected" as const },
          });
        },
      }),
    (result) => ({ status: result.status }),
  );
}

export async function deselectRecommendation(
  userId: string,
  tripId: string,
  input: {
    suggestionId: string;
  },
  control?: PlanningMutationControl,
) {
  const operation = createPlanningOperationContext(
    tripId,
    control?.operationId,
  );

  return measurePlanningOperation(
    "recommendation_deselect",
    operation,
    () =>
      executePlanningMutation({
        userId,
        tripId,
        control,
        transaction: async (tx) => {
          const trip = await getPlanningTrip(tx, userId, tripId);
          const accessFailure = planningAccessFailure(trip);

          if (accessFailure) {
            return accessFailure;
          }
          if (!trip) {
            return { status: "not_found" as const };
          }
          const replay = await getPlanningMutationReplayTx(tx, tripId, control);

          if (replay) return replay;

          const suggestion = await tx.placeSuggestion.findFirst({
            where: {
              id: input.suggestionId,
              tripId,
            },
            select: {
              id: true,
              tripId: true,
              status: true,
              name: true,
            },
          });

          if (!suggestion) {
            return {
              status: "suggestion_not_found" as const,
            };
          }

          await tx.placeSuggestion.updateMany({
            where: {
              id: input.suggestionId,
              tripId,
            },
            data: {
              status: "PENDING",
            },
          });

          await tx.planningFeedback.create({
            data: {
              tripId,
              targetType: "PLACE_SUGGESTION",
              targetId: input.suggestionId,
              placeSuggestionId: input.suggestionId,
              source: "USER",
              action: "DESELECT",
              metadata: {
                source: "live_plan_remove",
              },
            },
          });
          await writeUserPlanningEvent(tx, {
            tripId,
            title: "Place removed from plan",
            message: `${suggestion.name} was removed from the live plan preview.`,
            metadata: {
              placeSuggestionId: input.suggestionId,
              source: "live_plan_remove",
            },
          });
          await rebuildItineraryDraftForTripTx(tx, tripId, operation);

          return finalizePlanningMutationTx(tx, {
            userId,
            tripId,
            kind: "recommendation_deselect",
            control,
            result: { status: "deselected" as const },
          });
        },
      }),
    (result) => ({ status: result.status }),
  );
}

export async function refreshRecommendations(
  userId: string,
  tripId: string,
  input: {
    topic: PlanningTopic;
    note: string;
    destinationId?: string | null;
    planningDayNumber?: number | null;
  },
  control?: PlanningMutationControl,
) {
  const operation = createPlanningOperationContext(
    tripId,
    control?.operationId,
  );

  return measurePlanningOperation(
    "recommendations_refresh",
    operation,
    () =>
      executePlanningMutation({
        userId,
        tripId,
        control,
        transaction: async (tx) => {
          const trip = await getPlanningTrip(tx, userId, tripId);
          const accessFailure = planningAccessFailure(trip);

          if (accessFailure) return accessFailure;
          if (!trip) return { status: "not_found" as const };

          const replay = await getPlanningMutationReplayTx(tx, tripId, control);

          if (replay) return replay;

          await recordPlanningMessageForTripTx(
            tx,
            trip,
            {
              topic: input.topic,
              message: input.note,
              destinationId: input.destinationId,
              planningDayNumber: input.planningDayNumber,
            },
            operation,
          );

          const updatedTrip = await getPlanningTrip(tx, userId, tripId);

          if (!updatedTrip) return { status: "not_found" as const };

          const result = await generateRecommendationsForTripTx(
            tx,
            updatedTrip,
            {
              topic: input.topic,
              destinationId: input.destinationId,
              planningDayNumber: input.planningDayNumber,
            },
          );

          return finalizePlanningMutationTx(tx, {
            userId,
            tripId,
            kind: "recommendations_refresh",
            control,
            result,
          });
        },
      }),
    (result) => ({ status: result.status }),
  );
}

export async function getPlanningWorkspace(
  userId: string,
  tripId: string,
  requestedContext?: Partial<PlanningContext>,
) {
  const operation = createPlanningOperationContext(tripId);

  return measurePlanningOperation(
    "planning_snapshot_query",
    operation,
    () =>
      db.$transaction(async (tx) => {
        const trip = await getPlanningTrip(tx, userId, tripId);
        const accessFailure = planningAccessFailure(trip);

        if (accessFailure) {
          return accessFailure;
        }
        if (!trip) {
          return { status: "not_found" as const };
        }

        const selectedPlaces = await getSelectedPlaces(tx, tripId);
        const suggestions = await tx.placeSuggestion.findMany({
          where: {
            tripId,
            status: {
              not: "REJECTED",
            },
          },
          select: placeSuggestionSelect,
          orderBy: [
            {
              status: "asc",
            },
            {
              score: "desc",
            },
          ],
        });
        const timelineEvents = await tx.planningEvent.findMany({
          where: {
            tripId,
            visibleToUser: true,
          },
          select: planningEventSelect,
          orderBy: {
            createdAt: "desc",
          },
          take: 6,
        });
        const placeActionLog = await getPlaceActionLog(tx, tripId);
        const itineraryPreview = await getPersistedItineraryForTripTx(
          tx,
          tripId,
        );
        const activeJobs = (
          await tx.generationJob.findMany({
            where: {
              tripId,
              status: {
                in: ["PENDING", "RUNNING", "RETRYING"],
              },
            },
            select: {
              id: true,
              type: true,
              status: true,
              progress: true,
              progressMessage: true,
              attemptCount: true,
              errorCode: true,
              createdAt: true,
              updatedAt: true,
            },
            orderBy: {
              createdAt: "desc",
            },
            take: 5,
          })
        ).map((job) => ({
          ...job,
          createdAt: job.createdAt.toISOString(),
          updatedAt: job.updatedAt.toISOString(),
        }));
        const itineraryVersions = (
          await tx.itineraryVersion.findMany({
            where: {
              tripId,
            },
            select: {
              id: true,
              version: true,
              status: true,
              changeScope: true,
              createdAt: true,
              activatedAt: true,
            },
            orderBy: {
              version: "desc",
            },
            take: 10,
          })
        ).map((version) => ({
          ...version,
          createdAt: version.createdAt.toISOString(),
          activatedAt: version.activatedAt?.toISOString() ?? null,
        }));
        const preference = preferenceSnapshot(trip.preference);
        const context = normalizedPlanningContext(trip, requestedContext);
        const recommendations = suggestions.map(toRecommendationDto);
        const snapshot = planningSnapshot({
          trip,
          context,
          preference,
          selectedPlaces,
          recommendations,
          itinerary: itineraryPreview,
          activeJobs,
          itineraryVersions,
        });

        return {
          status: "ok" as const,
          trip: {
            id: trip.id,
            title: trip.title,
            startDate: serializeDateOnly(trip.startDate),
            endDate: serializeDateOnly(trip.endDate),
            budgetCurrency: trip.budgetCurrency,
            destinations: trip.destinations,
          },
          preference,
          selectedPlaces,
          recommendations,
          timelineEvents: timelineEvents.map(timelineEventDto),
          placeActionLog,
          itineraryPreview,
          activeJobs,
          itineraryVersions,
          snapshot,
        };
      }),
    (result) => ({
      status: result.status,
      selectedPlaceCount:
        result.status === "ok" ? result.selectedPlaces.length : undefined,
      itineraryDayCount:
        result.status === "ok"
          ? result.itineraryPreview.days.length
          : undefined,
    }),
  );
}

function formString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function formOptionalNumber(value: FormDataEntryValue | null) {
  const raw = formString(value);

  if (!raw) {
    return null;
  }

  const number = Number(raw);

  return Number.isFinite(number) && number >= 0 ? number : null;
}

function formOptionalPositiveInteger(value: FormDataEntryValue | null) {
  const raw = formString(value);

  if (!raw) {
    return null;
  }

  const number = Number(raw);

  return Number.isInteger(number) && number > 0 ? number : null;
}

function formTopic(value: FormDataEntryValue | null): PlanningTopic {
  const topic = formString(value);

  if (
    topic === "HOTEL_BASE" ||
    topic === "ACTIVITIES" ||
    topic === "FOOD_NIGHTLIFE" ||
    topic === "BUDGET_PACE"
  ) {
    return topic;
  }

  return "HOTEL_BASE";
}

function formRejectReason(
  value: FormDataEntryValue | null,
): FeedbackReason | null {
  const reason = formString(value);
  const allowedReasons = new Set<string>(recommendationRejectReasons);

  return allowedReasons.has(reason) ? (reason as FeedbackReason) : null;
}

function planningRedirect(tripId: string, query: string) {
  redirect(`/trips/${tripId}/planning?${query}`);
}

function planningQuery(input: {
  topic?: PlanningTopic;
  destinationId?: string | null;
  planningDayNumber?: number | null;
  message?: string;
  error?: string;
  generated?: string;
  refreshed?: string;
}) {
  const params = new URLSearchParams();

  if (input.topic) params.set("topic", input.topic);
  if (input.destinationId) params.set("destinationId", input.destinationId);
  if (input.planningDayNumber)
    params.set("day", String(input.planningDayNumber));
  if (input.message) params.set("message", input.message);
  if (input.error) params.set("error", input.error);
  if (input.generated) params.set("generated", input.generated);
  if (input.refreshed) params.set("refreshed", input.refreshed);

  return params.toString();
}

function planningFormContext(formData: FormData) {
  return {
    destinationId: formString(formData.get("destinationId")) || null,
    planningDayNumber: formOptionalPositiveInteger(
      formData.get("planningDayNumber"),
    ),
  };
}

function refreshPlanningMutation(tripId: string) {
  revalidatePath(`/trips/${tripId}/planning`);
  revalidatePath(`/trips/${tripId}/itinerary`);
  refresh();
}

export async function recordPlanningMessageFormAction(formData: FormData) {
  "use server";

  const userId = await requireUser();
  const tripId = formString(formData.get("tripId"));
  const message = formString(formData.get("message"));
  const topic = formTopic(formData.get("topic"));
  const context = planningFormContext(formData);

  if (!tripId || !message) {
    redirect("/trips?error=invalid-planning-message");
  }

  const result = await recordPlanningMessage(userId, tripId, {
    topic,
    message,
    ...context,
  });

  if (result.status === "not_found") redirect("/trips?error=not-found");
  if (result.status === "archived") {
    planningRedirect(
      tripId,
      planningQuery({ topic, ...context, error: "archived" }),
    );
  }
  if (result.status === "not_ready") {
    planningRedirect(
      tripId,
      planningQuery({ topic, ...context, error: "not-ready" }),
    );
  }

  revalidatePath(`/trips/${tripId}/planning`);
  revalidatePath(`/trips/${tripId}/itinerary`);
  planningRedirect(
    tripId,
    planningQuery({ topic, ...context, message: "recorded" }),
  );
}

export async function generateRecommendationsFormAction(formData: FormData) {
  "use server";

  const userId = await requireUser();
  const tripId = formString(formData.get("tripId"));
  const topic = formTopic(formData.get("topic"));
  const context = planningFormContext(formData);

  if (!tripId) {
    redirect("/trips?error=invalid-trip");
  }

  const result = await generateRecommendations(userId, tripId, {
    topic,
    ...context,
  });

  if (result.status === "not_found") redirect("/trips?error=not-found");
  if (result.status === "archived") {
    planningRedirect(
      tripId,
      planningQuery({ topic, ...context, error: "archived" }),
    );
  }
  if (result.status === "not_ready") {
    planningRedirect(
      tripId,
      planningQuery({ topic, ...context, error: "not-ready" }),
    );
  }
  if (result.status === "needs_more_context") {
    planningRedirect(
      tripId,
      planningQuery({ topic, ...context, error: "needs-more-context" }),
    );
  }

  revalidatePath(`/trips/${tripId}/planning`);
  planningRedirect(
    tripId,
    planningQuery({ topic, ...context, generated: "1" }),
  );
}

export async function addUserPlanningPlaceFormAction(formData: FormData) {
  "use server";

  const userId = await requireUser();
  const tripId = formString(formData.get("tripId"));
  const topic = formTopic(formData.get("topic"));
  const name = formString(formData.get("name"));
  const category = formString(formData.get("category")) as SuggestionCategory;
  const context = planningFormContext(formData);

  if (!tripId || !name || !category) {
    redirect("/trips?error=invalid-place");
  }

  const result = await addUserPlanningPlace(userId, tripId, {
    topic,
    name,
    category,
    city: formString(formData.get("city")) || null,
    country: formString(formData.get("country")) || null,
    note: formString(formData.get("note")) || null,
    estimatedCostAmount: formOptionalNumber(
      formData.get("estimatedCostAmount"),
    ),
    estimatedCostCurrency:
      formString(formData.get("estimatedCostCurrency")) || null,
    planningDayNumber: context.planningDayNumber,
  });

  if (result.status === "not_found") redirect("/trips?error=not-found");
  if (result.status === "archived") {
    planningRedirect(
      tripId,
      planningQuery({ topic, ...context, error: "archived" }),
    );
  }
  if (result.status === "not_ready") {
    planningRedirect(
      tripId,
      planningQuery({ topic, ...context, error: "not-ready" }),
    );
  }
  if (result.status === "invalid_destination") {
    planningRedirect(
      tripId,
      planningQuery({ topic, ...context, error: "invalid-destination" }),
    );
  }
  if (result.status === "invalid_estimated_cost") {
    planningRedirect(
      tripId,
      planningQuery({ topic, ...context, error: "invalid-cost" }),
    );
  }

  refreshPlanningMutation(tripId);
}

export async function selectRecommendationFormAction(formData: FormData) {
  "use server";

  const userId = await requireUser();
  const tripId = formString(formData.get("tripId"));
  const topic = formTopic(formData.get("topic"));
  const suggestionId = formString(formData.get("suggestionId"));
  const context = planningFormContext(formData);

  if (!tripId || !suggestionId) {
    redirect("/trips?error=invalid-suggestion");
  }

  const result = await selectRecommendation(userId, tripId, {
    suggestionId,
    ...context,
  });

  if (result.status === "not_found") redirect("/trips?error=not-found");
  if (result.status === "archived") {
    planningRedirect(
      tripId,
      planningQuery({ topic, ...context, error: "archived" }),
    );
  }
  if (result.status === "not_ready") {
    planningRedirect(
      tripId,
      planningQuery({ topic, ...context, error: "not-ready" }),
    );
  }
  if (result.status === "suggestion_not_found") {
    planningRedirect(
      tripId,
      planningQuery({ topic, ...context, error: "suggestion-not-found" }),
    );
  }
  if (result.status === "invalid_context") {
    planningRedirect(
      tripId,
      planningQuery({ topic, ...context, error: "invalid-planning-context" }),
    );
  }

  refreshPlanningMutation(tripId);
}

export async function rejectRecommendationFormAction(formData: FormData) {
  "use server";

  const userId = await requireUser();
  const tripId = formString(formData.get("tripId"));
  const topic = formTopic(formData.get("topic"));
  const suggestionId = formString(formData.get("suggestionId"));
  const reason = formRejectReason(formData.get("reason"));
  const note = formString(formData.get("note")) || null;
  const context = planningFormContext(formData);

  if (!tripId || !suggestionId || !reason) {
    redirect("/trips?error=invalid-rejection");
  }

  const result = await rejectRecommendation(userId, tripId, {
    suggestionId,
    reason,
    note,
  });

  if (result.status === "not_found") redirect("/trips?error=not-found");
  if (result.status === "archived") {
    planningRedirect(
      tripId,
      planningQuery({ topic, ...context, error: "archived" }),
    );
  }
  if (result.status === "not_ready") {
    planningRedirect(
      tripId,
      planningQuery({ topic, ...context, error: "not-ready" }),
    );
  }
  if (result.status === "suggestion_not_found") {
    planningRedirect(
      tripId,
      planningQuery({ topic, ...context, error: "suggestion-not-found" }),
    );
  }

  refreshPlanningMutation(tripId);
}

export async function deselectRecommendationFormAction(formData: FormData) {
  "use server";

  const userId = await requireUser();
  const tripId = formString(formData.get("tripId"));
  const topic = formTopic(formData.get("topic"));
  const suggestionId = formString(formData.get("suggestionId"));
  const context = planningFormContext(formData);

  if (!tripId || !suggestionId) {
    redirect("/trips?error=invalid-deselect");
  }

  const result = await deselectRecommendation(userId, tripId, { suggestionId });

  if (result.status === "not_found") redirect("/trips?error=not-found");
  if (result.status === "archived") {
    planningRedirect(
      tripId,
      planningQuery({ topic, ...context, error: "archived" }),
    );
  }
  if (result.status === "not_ready") {
    planningRedirect(
      tripId,
      planningQuery({ topic, ...context, error: "not-ready" }),
    );
  }
  if (result.status === "suggestion_not_found") {
    planningRedirect(
      tripId,
      planningQuery({ topic, ...context, error: "suggestion-not-found" }),
    );
  }

  refreshPlanningMutation(tripId);
}

export async function refreshRecommendationsFormAction(formData: FormData) {
  "use server";

  const userId = await requireUser();
  const tripId = formString(formData.get("tripId"));
  const topic = formTopic(formData.get("topic"));
  const note = formString(formData.get("note"));
  const context = planningFormContext(formData);

  if (!tripId || !note) {
    redirect("/trips?error=invalid-refresh");
  }

  const result = await refreshRecommendations(userId, tripId, {
    topic,
    note,
    ...context,
  });

  if (result.status === "not_found") redirect("/trips?error=not-found");
  if (result.status === "archived") {
    planningRedirect(
      tripId,
      planningQuery({ topic, ...context, error: "archived" }),
    );
  }
  if (result.status === "not_ready") {
    planningRedirect(
      tripId,
      planningQuery({ topic, ...context, error: "not-ready" }),
    );
  }
  if (result.status === "needs_more_context") {
    planningRedirect(
      tripId,
      planningQuery({ topic, ...context, error: "needs-more-context" }),
    );
  }

  revalidatePath(`/trips/${tripId}/planning`);
  revalidatePath(`/trips/${tripId}/itinerary`);
  planningRedirect(
    tripId,
    planningQuery({ topic, ...context, refreshed: "1" }),
  );
}

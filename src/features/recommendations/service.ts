import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma, SuggestionCategory } from "@/generated/prisma/client";
import { buildTripOwnerWhere } from "@/lib/authorization-rules";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/authorization";
import { getTripReadiness } from "@/features/trips/readiness";
import {
  extractPreferenceSignals,
  hasTopicRecommendationReadiness,
  mergePreferenceSignals,
} from "./extraction";
import { getMockPlacesForCityTopic } from "./mock-places";
import { scoreMockPlace } from "./scoring";
import type {
  ExtractedPreferenceSignals,
  PlanningTopic,
  RecommendationDto,
  RecommendationPreferenceSnapshot,
  SelectedPlanningPlace,
} from "./types";

type PlanningTx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

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
  provider: true,
  providerPlaceId: true,
  category: true,
  status: true,
  name: true,
  description: true,
  explanation: true,
  city: true,
  country: true,
  score: true,
  rating: true,
  estimatedCostAmount: true,
  estimatedCostCurrency: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PlaceSuggestionSelect;

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

function serializeDecimalNumber(
  value: { toString: () => string } | number | null,
) {
  if (value === null) {
    return null;
  }

  return typeof value === "number" ? value : Number(value.toString());
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
    "id" | "name" | "category" | "city" | "country"
  >,
): SelectedPlanningPlace {
  return {
    id: record.id,
    name: record.name,
    category: record.category,
    city: record.city,
    country: record.country,
  };
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

async function getPlanningTrip(
  tx: PlanningTx,
  userId: string,
  tripId: string,
) {
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

  await tx.tripPreference.upsert({
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
  });

  return merged;
}

export type PlanningAccessResult =
  | { status: "not_found" | "archived" }
  | { status: "not_ready"; missingRequirements: string[] };

export async function recordPlanningMessage(
  userId: string,
  tripId: string,
  input: {
    topic: PlanningTopic;
    message: string;
  },
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

    const signals = extractPreferenceSignals(input.message);
    const preference = await savePreferenceSignals(
      tx,
      tripId,
      preferenceSnapshot(trip.preference),
      signals,
    );

    await tx.planningFeedback.create({
      data: {
        tripId,
        targetType: "TRIP",
        targetId: tripId,
        source: "USER",
        action: "REFINE",
        userNote: input.message,
        metadata: {
          topic: input.topic,
          extractedSignals: signals,
        },
      },
    });

    const selectedPlaces = await getSelectedPlaces(tx, tripId);
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
  });
}

export async function generateRecommendations(
  userId: string,
  tripId: string,
  input: {
    topic: PlanningTopic;
  },
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

    const selectedPlaces = await getSelectedPlaces(tx, tripId);
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

    const destination = trip.destinations[0];
    const existingRejected = await tx.placeSuggestion.findMany({
      where: {
        tripId,
        provider: "MOCK",
        status: "REJECTED",
      },
      select: {
        providerPlaceId: true,
      },
    });
    const rejectedIds = new Set(
      existingRejected
        .map((item) => item.providerPlaceId)
        .filter((item): item is string => Boolean(item)),
    );
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
        }),
      )
      .sort((left, right) => right.score - left.score)
      .slice(0, 5);

    const records = await Promise.all(
      scored.map((item) =>
        tx.placeSuggestion.upsert({
          where: {
            tripId_provider_providerPlaceId: {
              tripId,
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
              topic: input.topic,
              scoreBreakdown: item.breakdown,
              tags: item.place.tags,
            },
          },
          create: {
            tripId,
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
              topic: input.topic,
              scoreBreakdown: item.breakdown,
              tags: item.place.tags,
            },
          },
          select: placeSuggestionSelect,
        }),
      ),
    );

    await tx.planningEvent.create({
      data: {
        tripId,
        actor: "ENGINE",
        type: "RECOMMENDATION_BATCH",
        title: "Recommendation group generated",
        message: `Generated ${records.length} ${input.topic.toLocaleLowerCase().replaceAll("_", " ")} recommendations from your current planning preferences.`,
        visibleToUser: true,
        metadata: {
          topic: input.topic,
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
  });
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
  },
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

    const destination = trip.destinations[0];
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
        city: input.city ?? destination.city,
        country: input.country ?? destination.country,
        metadata: {
          topic: input.topic,
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
        userNote: input.note ?? `Added ${input.name} as an already-decided place.`,
        metadata: {
          topic: input.topic,
          source: "user_anchor",
        },
      },
    });

    return {
      status: "saved" as const,
      place: toRecommendationDto(record),
    };
  });
}

export async function selectRecommendation(
  userId: string,
  tripId: string,
  input: {
    suggestionId: string;
  },
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

    const suggestion = await tx.placeSuggestion.findFirst({
      where: {
        id: input.suggestionId,
        tripId,
      },
      select: {
        id: true,
        tripId: true,
        status: true,
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
          source: "recommendation_pick",
        },
      },
    });

    return {
      status: "selected" as const,
    };
  });
}

export async function refreshRecommendations(
  userId: string,
  tripId: string,
  input: {
    topic: PlanningTopic;
    note: string;
  },
) {
  const messageResult = await recordPlanningMessage(userId, tripId, {
    topic: input.topic,
    message: input.note,
  });

  if (messageResult.status !== "recorded") {
    return messageResult;
  }

  return generateRecommendations(userId, tripId, {
    topic: input.topic,
  });
}

export async function getPlanningWorkspace(userId: string, tripId: string) {
  return db.$transaction(async (tx) => {
    const trip = await getPlanningTrip(tx, userId, tripId);
    const accessFailure = planningAccessFailure(trip);

    if (accessFailure) {
      return accessFailure;
    }
    if (!trip) {
      return { status: "not_found" as const };
    }

    const [selectedPlaces, suggestions] = await Promise.all([
      getSelectedPlaces(tx, tripId),
      tx.placeSuggestion.findMany({
        where: {
          tripId,
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
      }),
    ]);
    const preference = preferenceSnapshot(trip.preference);

    return {
      status: "ok" as const,
      trip: {
        id: trip.id,
        title: trip.title,
        destinations: trip.destinations,
      },
      preference,
      selectedPlaces,
      recommendations: suggestions.map(toRecommendationDto),
    };
  });
}

function formString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
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

function planningRedirect(tripId: string, query: string) {
  redirect(`/trips/${tripId}/planning?${query}`);
}

export async function recordPlanningMessageFormAction(formData: FormData) {
  "use server";

  const userId = await requireUser();
  const tripId = formString(formData.get("tripId"));
  const message = formString(formData.get("message"));
  const topic = formTopic(formData.get("topic"));

  if (!tripId || !message) {
    redirect("/trips?error=invalid-planning-message");
  }

  const result = await recordPlanningMessage(userId, tripId, { topic, message });

  if (result.status === "not_found") redirect("/trips?error=not-found");
  if (result.status === "archived") planningRedirect(tripId, "error=archived");
  if (result.status === "not_ready") planningRedirect(tripId, "error=not-ready");

  revalidatePath(`/trips/${tripId}/planning`);
  planningRedirect(tripId, `topic=${topic}&message=recorded`);
}

export async function generateRecommendationsFormAction(formData: FormData) {
  "use server";

  const userId = await requireUser();
  const tripId = formString(formData.get("tripId"));
  const topic = formTopic(formData.get("topic"));

  if (!tripId) {
    redirect("/trips?error=invalid-trip");
  }

  const result = await generateRecommendations(userId, tripId, { topic });

  if (result.status === "not_found") redirect("/trips?error=not-found");
  if (result.status === "archived") planningRedirect(tripId, "error=archived");
  if (result.status === "not_ready") planningRedirect(tripId, "error=not-ready");
  if (result.status === "needs_more_context") {
    planningRedirect(tripId, `topic=${topic}&error=needs-more-context`);
  }

  revalidatePath(`/trips/${tripId}/planning`);
  planningRedirect(tripId, `topic=${topic}&generated=1`);
}

export async function addUserPlanningPlaceFormAction(formData: FormData) {
  "use server";

  const userId = await requireUser();
  const tripId = formString(formData.get("tripId"));
  const topic = formTopic(formData.get("topic"));
  const name = formString(formData.get("name"));
  const category = formString(formData.get("category")) as SuggestionCategory;

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
  });

  if (result.status === "not_found") redirect("/trips?error=not-found");
  if (result.status === "archived") planningRedirect(tripId, "error=archived");
  if (result.status === "not_ready") planningRedirect(tripId, "error=not-ready");

  revalidatePath(`/trips/${tripId}/planning`);
  planningRedirect(tripId, `topic=${topic}&anchor=saved`);
}

export async function selectRecommendationFormAction(formData: FormData) {
  "use server";

  const userId = await requireUser();
  const tripId = formString(formData.get("tripId"));
  const topic = formTopic(formData.get("topic"));
  const suggestionId = formString(formData.get("suggestionId"));

  if (!tripId || !suggestionId) {
    redirect("/trips?error=invalid-suggestion");
  }

  const result = await selectRecommendation(userId, tripId, { suggestionId });

  if (result.status === "not_found") redirect("/trips?error=not-found");
  if (result.status === "archived") planningRedirect(tripId, "error=archived");
  if (result.status === "not_ready") planningRedirect(tripId, "error=not-ready");
  if (result.status === "suggestion_not_found") {
    planningRedirect(tripId, `topic=${topic}&error=suggestion-not-found`);
  }

  revalidatePath(`/trips/${tripId}/planning`);
  planningRedirect(tripId, `topic=${topic}&selected=1`);
}

export async function refreshRecommendationsFormAction(formData: FormData) {
  "use server";

  const userId = await requireUser();
  const tripId = formString(formData.get("tripId"));
  const topic = formTopic(formData.get("topic"));
  const note = formString(formData.get("note"));

  if (!tripId || !note) {
    redirect("/trips?error=invalid-refresh");
  }

  const result = await refreshRecommendations(userId, tripId, { topic, note });

  if (result.status === "not_found") redirect("/trips?error=not-found");
  if (result.status === "archived") planningRedirect(tripId, "error=archived");
  if (result.status === "not_ready") planningRedirect(tripId, "error=not-ready");
  if (result.status === "needs_more_context") {
    planningRedirect(tripId, `topic=${topic}&error=needs-more-context`);
  }

  revalidatePath(`/trips/${tripId}/planning`);
  planningRedirect(tripId, `topic=${topic}&refreshed=1`);
}

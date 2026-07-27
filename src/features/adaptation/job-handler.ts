import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getPlaceProvider } from "@/lib/providers/places/server";
import { refreshItineraryConflictsForTripTx } from "@/features/itinerary/conflict-engine";
import {
  JobExecutionError,
  JobLeaseLostError,
  type JobHandlerResult,
  type JobProgressReporter,
} from "@/features/jobs/runner";
import type { JsonValue } from "@/features/jobs/contracts";
import {
  applyFeedbackPreferencePolicy,
  buildAdaptiveReplacementProposal,
  findNewBlockingHighConflicts,
  parseAdaptivePreferenceSnapshot,
  recomputeAffectedDayEstimatedCost,
  rescoreReplacementCandidates,
  scoreReplacementCandidate,
  suggestionProjectionMutationForOutcome,
  type AdaptivePreferenceSnapshot,
  type ReplacementCandidate,
} from "./index";

type ProcessFeedbackEventJobInput = {
  jobId: string;
  workerId: string;
  attempt: number;
  signal: AbortSignal;
  reportProgress: JobProgressReporter;
};

type ActiveJobClaim = Pick<
  ProcessFeedbackEventJobInput,
  "jobId" | "workerId" | "attempt"
>;

const lockActiveJobClaimSql = `
SELECT id
FROM generation_jobs
WHERE id = $1
  AND status = 'RUNNING'
  AND worker_id = $2
  AND attempt_count = $3
  AND lease_expires_at > clock_timestamp()
FOR UPDATE
`;

async function assertActiveJobClaim(
  tx: Prisma.TransactionClient,
  claim: ActiveJobClaim,
) {
  const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
    lockActiveJobClaimSql,
    claim.jobId,
    claim.workerId,
    claim.attempt,
  );

  if (rows.length !== 1) {
    throw new JobLeaseLostError();
  }
}

async function verifyActiveJobClaim(claim: ActiveJobClaim) {
  await db.$transaction(async (tx) => {
    await assertActiveJobClaim(tx, claim);
  });
}

const itinerarySnapshotSelect = {
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

type ItinerarySnapshot = Prisma.ItineraryVersionGetPayload<{
  select: typeof itinerarySnapshotSelect;
}>;

const candidateSelect = {
  id: true,
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
  rating: true,
  priceLevel: true,
  score: true,
  estimatedCostAmount: true,
  estimatedCostCurrency: true,
  metadata: true,
} satisfies Prisma.PlaceSuggestionSelect;

type CandidateRecord = Prisma.PlaceSuggestionGetPayload<{
  select: typeof candidateSelect;
}>;

function numberValue(
  value: number | { toString: () => string } | null | undefined,
) {
  if (value == null) return null;
  return typeof value === "number" ? value : Number(value.toString());
}

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function jsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) {
    throw new JobExecutionError("WORKER_SHUTDOWN", {
      retryable: true,
      publicMessage: "Worker shutdown interrupted feedback processing.",
    });
  }
}

function candidateDto(
  candidate: CandidateRecord,
  score = numberValue(candidate.score),
): ReplacementCandidate | null {
  if (!candidate.destinationId || !candidate.providerPlaceId) {
    return null;
  }

  return {
    id: candidate.id,
    providerPlaceId: candidate.providerPlaceId,
    destinationId: candidate.destinationId,
    category: candidate.category,
    name: candidate.name,
    score,
    rating: numberValue(candidate.rating),
  };
}

async function loadJobState(jobId: string, workerId: string, attempt: number) {
  const job = await db.generationJob.findFirst({
    where: {
      id: jobId,
      status: "RUNNING",
      workerId,
      attemptCount: attempt,
    },
    select: {
      id: true,
      tripId: true,
      tripVersion: true,
      result: true,
      preferenceProfileVersionId: true,
      parentItineraryVersionId: true,
      feedback: {
        select: {
          id: true,
          action: true,
          reason: true,
          createdAt: true,
          processingStatus: true,
          metadata: true,
          itineraryItemId: true,
          capturedTripVersion: true,
          capturedPreferenceProfileVersionId: true,
          capturedItineraryVersionId: true,
        },
      },
      trip: {
        select: {
          id: true,
          tripVersion: true,
          activePreferenceProfileVersionId: true,
          activeItineraryVersionId: true,
          destinations: {
            select: {
              id: true,
              city: true,
              country: true,
              latitude: true,
              longitude: true,
            },
            orderBy: {
              sortOrder: "asc",
            },
          },
        },
      },
      preferenceProfileVersion: {
        select: {
          id: true,
          snapshot: true,
        },
      },
    },
  });

  if (!job) {
    throw new JobLeaseLostError();
  }

  return job;
}

function jobIsStale(job: Awaited<ReturnType<typeof loadJobState>>) {
  return (
    job.trip.tripVersion !== job.tripVersion ||
    job.trip.activePreferenceProfileVersionId !==
      job.preferenceProfileVersionId ||
    job.trip.activeItineraryVersionId !== job.parentItineraryVersionId ||
    job.feedback?.capturedTripVersion !== job.tripVersion ||
    job.feedback?.capturedPreferenceProfileVersionId !==
      job.preferenceProfileVersionId ||
    job.feedback?.capturedItineraryVersionId !== job.parentItineraryVersionId
  );
}

async function markFeedbackSuperseded(
  feedbackId: string | undefined,
  message: string,
  claim: ActiveJobClaim,
) {
  if (!feedbackId) return;

  const updated = await db.$transaction(async (tx) => {
    await assertActiveJobClaim(tx, claim);
    const result = await tx.planningFeedback.updateMany({
      where: {
        id: feedbackId,
        processingStatus: {
          in: ["QUEUED", "PROCESSING"],
        },
      },
      data: {
        processingStatus: "SUPERSEDED",
        processedAt: new Date(),
      },
    });
    await assertActiveJobClaim(tx, claim);

    return result.count;
  });

  if (updated === 0) return;

  console.info(
    JSON.stringify({
      event: "adaptive_feedback",
      activity: "SUPERSEDED",
      feedbackId,
      message,
    }),
  );
}

async function markFeedbackProcessing(
  feedbackId: string,
  claim: ActiveJobClaim,
) {
  await db.$transaction(async (tx) => {
    await assertActiveJobClaim(tx, claim);
    await tx.planningFeedback.updateMany({
      where: {
        id: feedbackId,
        processingStatus: {
          in: ["QUEUED", "PROCESSING"],
        },
      },
      data: {
        processingStatus: "PROCESSING",
      },
    });
    await assertActiveJobClaim(tx, claim);
  });
}

async function persistedCandidates(input: {
  tripId: string;
  destinationId: string;
  category: CandidateRecord["category"];
}) {
  return db.placeSuggestion.findMany({
    where: {
      tripId: input.tripId,
      destinationId: input.destinationId,
      category: input.category,
      status: "PENDING",
      providerPlaceId: {
        not: null,
      },
    },
    select: candidateSelect,
    orderBy: [{ score: "desc" }, { rating: "desc" }, { name: "asc" }],
    take: 50,
  });
}

async function fetchAndPersistCandidates(input: {
  tripId: string;
  tripVersion: number;
  preferenceProfileVersionId: string | null;
  parentItineraryVersionId: string | null;
  destination: {
    id: string;
    city: string;
    country: string;
    latitude: Prisma.Decimal | null;
    longitude: Prisma.Decimal | null;
  };
  category: CandidateRecord["category"];
  snapshot: AdaptivePreferenceSnapshot;
  claim: ActiveJobClaim;
  signal: AbortSignal;
}) {
  throwIfAborted(input.signal);
  const provider = getPlaceProvider();
  const outcome = await provider.search({
    query: input.category.toLocaleLowerCase(),
    destination: {
      city: input.destination.city,
      country: input.destination.country,
      ...(input.destination.latitude !== null &&
      input.destination.longitude !== null
        ? {
            location: {
              latitude: Number(input.destination.latitude.toString()),
              longitude: Number(input.destination.longitude.toString()),
            },
          }
        : {}),
    },
    category: input.category,
    maxResults: 10,
  });
  throwIfAborted(input.signal);

  if (outcome.status === "unavailable") {
    if (outcome.retryable) {
      throw new JobExecutionError(`PLACE_PROVIDER_${outcome.code}`, {
        retryable: true,
        publicMessage: outcome.message,
      });
    }

    return {
      state: "UNAVAILABLE" as const,
      code: outcome.code,
      message: outcome.message,
      provider: outcome.provider,
      candidates: [] as CandidateRecord[],
    };
  }

  const candidates = await db.$transaction(async (tx) => {
    await assertActiveJobClaim(tx, input.claim);
    const current = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id
       FROM trips
       WHERE id = $1
         AND trip_version = $2
         AND active_preference_profile_version_id IS NOT DISTINCT FROM $3
         AND active_itinerary_version_id IS NOT DISTINCT FROM $4
       FOR UPDATE`,
      input.tripId,
      input.tripVersion,
      input.preferenceProfileVersionId,
      input.parentItineraryVersionId,
    );

    if (current.length !== 1) {
      return null;
    }

    for (const place of outcome.places) {
      const scoring = scoreReplacementCandidate({
        rating: place.rating,
        priceLevel: place.priceLevel,
        priceSensitivity: input.snapshot.priceSensitivity.weight,
      });
      const data = {
        destinationId: input.destination.id,
        category: place.category,
        name: place.name,
        description: place.description,
        explanation: scoring.explanation,
        address: place.address,
        city: place.city,
        country: place.country,
        latitude: place.latitude,
        longitude: place.longitude,
        rating: place.rating,
        priceLevel: place.priceLevel,
        score: scoring.score,
        rawProviderData: place.rawProviderData,
        metadata: {
          scoring,
          provenance: outcome.provenance,
          fallback: outcome.fallback,
        },
      };

      await tx.placeSuggestion.upsert({
        where: {
          tripId_provider_providerPlaceId: {
            tripId: input.tripId,
            provider: place.provider,
            providerPlaceId: place.providerPlaceId,
          },
        },
        update: data,
        create: {
          tripId: input.tripId,
          provider: place.provider,
          providerPlaceId: place.providerPlaceId,
          status: "PENDING",
          ...data,
        },
      });
    }

    const persisted = await tx.placeSuggestion.findMany({
      where: {
        tripId: input.tripId,
        destinationId: input.destination.id,
        category: input.category,
        status: "PENDING",
        providerPlaceId: {
          not: null,
        },
      },
      select: candidateSelect,
      orderBy: [{ score: "desc" }, { rating: "desc" }, { name: "asc" }],
      take: 50,
    });
    await assertActiveJobClaim(tx, input.claim);

    return persisted;
  });

  if (!candidates) {
    return {
      state: "STALE" as const,
      candidates: [] as CandidateRecord[],
    };
  }

  return {
    state: "FETCHED" as const,
    provider: outcome.provider,
    provenance: outcome.provenance,
    candidates,
  };
}

async function cloneReplacementItinerary(
  tx: Prisma.TransactionClient,
  input: {
    tripId: string;
    jobId: string;
    source: ItinerarySnapshot;
    preferenceProfileVersionId: string;
    targetItemId: string;
    replacement: CandidateRecord;
    preferenceExplanation: string;
  },
) {
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
  const affectedDay = input.source.days.find((day) =>
    day.items.some((item) => item.id === input.targetItemId),
  );

  if (!affectedDay) {
    throw new JobExecutionError("TARGET_ITEM_SUPERSEDED", {
      retryable: false,
      publicMessage: "The rejected itinerary item is no longer active.",
    });
  }

  const version = await tx.itineraryVersion.create({
    data: {
      tripId: input.tripId,
      version: (latest?.version ?? 0) + 1,
      parentVersionId: input.source.id,
      preferenceProfileVersionId: input.preferenceProfileVersionId,
      sourceJobId: input.jobId,
      status: "DRAFT",
      changeScope: "ITEM",
      changeSummary: {
        outcome: "REPLACED",
        affectedDay: affectedDay.dayNumber,
        rejectedItemId: input.targetItemId,
        replacementSuggestionId: input.replacement.id,
        explanation: input.preferenceExplanation,
      },
    },
    select: {
      id: true,
      version: true,
    },
  });
  let replacementItemId: string | null = null;

  for (const sourceDay of input.source.days) {
    const dayCost =
      sourceDay.id === affectedDay.id
        ? recomputeAffectedDayEstimatedCost({
            declaredCurrency: sourceDay.estimatedCostCurrency,
            items: sourceDay.items.map((sourceItem) =>
              sourceItem.id === input.targetItemId
                ? {
                    estimatedCostAmount: input.replacement.estimatedCostAmount,
                    estimatedCostCurrency:
                      input.replacement.estimatedCostCurrency,
                  }
                : sourceItem,
            ),
          })
        : {
            estimatedCostAmount: sourceDay.estimatedCostAmount,
            estimatedCostCurrency: sourceDay.estimatedCostCurrency,
          };
    const day = await tx.itineraryDay.create({
      data: {
        tripId: input.tripId,
        itineraryVersionId: version.id,
        dayNumber: sourceDay.dayNumber,
        date: sourceDay.date,
        title: sourceDay.title,
        notes: sourceDay.notes,
        estimatedCostAmount: dayCost.estimatedCostAmount,
        estimatedCostCurrency: dayCost.estimatedCostCurrency,
      },
      select: {
        id: true,
      },
    });

    if (sourceDay.cityWindows.length > 0) {
      await tx.itineraryCityWindow.createMany({
        data: sourceDay.cityWindows.map((window) => ({
          tripId: input.tripId,
          dayId: day.id,
          destinationId: window.destinationId,
          travelSegmentId: window.travelSegmentId,
          city: window.city,
          country: window.country,
          startTime: window.startTime,
          endTime: window.endTime,
          source: window.source,
        })),
      });
    }

    for (const sourceItem of sourceDay.items) {
      const replacing = sourceItem.id === input.targetItemId;
      const item = await tx.itineraryItem.create({
        data: {
          tripId: input.tripId,
          dayId: day.id,
          placeSuggestionId: replacing
            ? input.replacement.id
            : sourceItem.placeSuggestionId,
          title: replacing ? input.replacement.name : sourceItem.title,
          description: replacing
            ? input.replacement.description
            : sourceItem.description,
          startTime: sourceItem.startTime,
          endTime: sourceItem.endTime,
          durationMinutes: sourceItem.durationMinutes,
          sortOrder: sourceItem.sortOrder,
          estimatedCostAmount: replacing
            ? input.replacement.estimatedCostAmount
            : sourceItem.estimatedCostAmount,
          estimatedCostCurrency: replacing
            ? input.replacement.estimatedCostCurrency
            : sourceItem.estimatedCostCurrency,
          notes: sourceItem.notes,
        },
        select: {
          id: true,
        },
      });

      if (replacing) replacementItemId = item.id;
    }
  }

  if (!replacementItemId) {
    throw new JobExecutionError("REPLACEMENT_NOT_MATERIALIZED", {
      retryable: false,
      publicMessage: "The replacement itinerary could not be materialized.",
    });
  }

  return {
    ...version,
    affectedDay: affectedDay.dayNumber,
    replacementItemId,
  };
}

export async function processFeedbackEventJob(
  input: ProcessFeedbackEventJobInput,
): Promise<JobHandlerResult> {
  const claim: ActiveJobClaim = {
    jobId: input.jobId,
    workerId: input.workerId,
    attempt: input.attempt,
  };
  await verifyActiveJobClaim(claim);
  const initial = await loadJobState(
    input.jobId,
    input.workerId,
    input.attempt,
  );
  const feedback = initial.feedback;

  if (!feedback) {
    throw new JobExecutionError("FEEDBACK_EVENT_NOT_FOUND", {
      retryable: false,
      publicMessage: "The feedback event no longer exists.",
    });
  }

  const replayResult = initial.result ? jsonValue(initial.result) : null;
  if (feedback.processingStatus === "PROCESSED" && replayResult) {
    return {
      status: "SUCCEEDED",
      result: replayResult,
    };
  }
  if (jobIsStale(initial)) {
    await markFeedbackSuperseded(
      feedback.id,
      "The trip changed before feedback processing began.",
      claim,
    );
    return {
      status: "SUPERSEDED",
      result: {
        outcome: "SUPERSEDED",
        feedbackId: feedback.id,
      },
    };
  }
  if (
    !feedback.itineraryItemId ||
    !feedback.action ||
    !feedback.reason ||
    !initial.parentItineraryVersionId
  ) {
    throw new JobExecutionError("INVALID_FEEDBACK_EVENT", {
      retryable: false,
      publicMessage: "The feedback event is incomplete.",
    });
  }
  const targetItemId = feedback.itineraryItemId;
  const parentItineraryVersionId = initial.parentItineraryVersionId;

  const snapshot = parseAdaptivePreferenceSnapshot(
    initial.preferenceProfileVersion?.snapshot,
  );
  if (!snapshot) {
    throw new JobExecutionError("INVALID_PREFERENCE_SNAPSHOT", {
      retryable: false,
      publicMessage: "The active preference snapshot is invalid.",
    });
  }
  const adaptationFeedback = {
    eventId: feedback.id,
    action: feedback.action,
    reason: feedback.reason,
    observedAt: feedback.createdAt.toISOString(),
  };
  const preferencePolicyResult = applyFeedbackPreferencePolicy(
    snapshot,
    adaptationFeedback,
  );

  await markFeedbackProcessing(feedback.id, claim);
  await input.reportProgress(
    "UPDATING_PREFERENCES",
    25,
    "Updating preference signals.",
  );
  throwIfAborted(input.signal);

  const sourceItinerary = await db.itineraryVersion.findFirst({
    where: {
      id: parentItineraryVersionId,
      tripId: initial.tripId,
    },
    select: itinerarySnapshotSelect,
  });
  if (!sourceItinerary) {
    await markFeedbackSuperseded(
      feedback.id,
      "The captured itinerary version no longer exists.",
      claim,
    );
    return {
      status: "SUPERSEDED",
      result: {
        outcome: "SUPERSEDED",
        feedbackId: feedback.id,
      },
    };
  }

  const target = sourceItinerary.days
    .flatMap((day) => day.items)
    .find((item) => item.id === targetItemId);
  if (!target) {
    await markFeedbackSuperseded(
      feedback.id,
      "The captured itinerary item no longer exists.",
      claim,
    );
    return {
      status: "SUPERSEDED",
      result: {
        outcome: "SUPERSEDED",
        feedbackId: feedback.id,
      },
    };
  }

  await input.reportProgress(
    "FINDING_REPLACEMENT",
    50,
    "Finding a compatible replacement.",
  );
  const destinationId = target.placeSuggestion?.destinationId ?? null;
  const destination = destinationId
    ? initial.trip.destinations.find((item) => item.id === destinationId)
    : null;
  let candidates: CandidateRecord[] = [];
  let providerState:
    | { state: "PERSISTED"; provider: null }
    | {
        state: "FETCHED";
        provider: string;
        provenance: unknown;
      }
    | {
        state: "UNAVAILABLE";
        provider: string;
        code: string;
        message: string;
      } = {
    state: "PERSISTED",
    provider: null,
  };

  if (destination && target.placeSuggestion) {
    candidates = await persistedCandidates({
      tripId: initial.tripId,
      destinationId: destination.id,
      category: target.placeSuggestion.category,
    });

    if (candidates.length === 0) {
      const fetched = await fetchAndPersistCandidates({
        tripId: initial.tripId,
        tripVersion: initial.tripVersion,
        preferenceProfileVersionId: initial.preferenceProfileVersionId,
        parentItineraryVersionId,
        destination,
        category: target.placeSuggestion.category,
        snapshot: preferencePolicyResult.snapshot,
        claim,
        signal: input.signal,
      });
      if (fetched.state === "STALE") {
        await markFeedbackSuperseded(
          feedback.id,
          "The trip changed while provider candidates were being fetched.",
          claim,
        );
        return {
          status: "SUPERSEDED",
          result: {
            outcome: "SUPERSEDED",
            feedbackId: feedback.id,
          },
        };
      }
      candidates = fetched.candidates;
      providerState =
        fetched.state === "UNAVAILABLE"
          ? {
              state: fetched.state,
              provider: fetched.provider,
              code: fetched.code,
              message: fetched.message,
            }
          : {
              state: fetched.state,
              provider: fetched.provider,
              provenance: fetched.provenance,
            };
    }
  }

  const rejectedSuggestions = await db.planningFeedback.findMany({
    where: {
      tripId: initial.tripId,
      placeSuggestionId: {
        not: null,
      },
      action: {
        in: ["REJECT", "REQUEST_ALTERNATIVE"],
      },
    },
    select: {
      placeSuggestionId: true,
      placeSuggestion: {
        select: {
          providerPlaceId: true,
        },
      },
    },
    take: 1_000,
  });
  const rescoredCandidates = rescoreReplacementCandidates(
    candidates,
    preferencePolicyResult.snapshot.priceSensitivity.weight,
  );
  const candidateMap = new Map(
    candidates.map((candidate) => [candidate.id, candidate]),
  );
  const candidateScoringMap = new Map(
    rescoredCandidates.map(({ candidate, scoring }) => [candidate.id, scoring]),
  );
  const proposal = buildAdaptiveReplacementProposal({
    preference: snapshot,
    feedback: adaptationFeedback,
    preferencePolicyResult,
    itinerary: sourceItinerary,
    targetItemId,
    candidates: rescoredCandidates
      .map(({ candidate, scoring }) => candidateDto(candidate, scoring.score))
      .filter((candidate): candidate is ReplacementCandidate =>
        Boolean(candidate),
      ),
    candidateFilter: {
      destinationId: destination?.id ?? "unavailable-destination",
      category: target.placeSuggestion?.category ?? "ACTIVITY",
      rejectedCandidateIds: rejectedSuggestions.flatMap((item) =>
        item.placeSuggestionId ? [item.placeSuggestionId] : [],
      ),
      rejectedProviderPlaceIds: rejectedSuggestions.flatMap((item) =>
        item.placeSuggestion?.providerPlaceId
          ? [item.placeSuggestion.providerPlaceId]
          : [],
      ),
    },
    createReplacementItem: (candidate, replacedItem) => {
      const record = candidateMap.get(candidate.id);

      return {
        ...replacedItem,
        id: randomUUID(),
        placeSuggestionId: candidate.id,
        title: candidate.name,
        description: record?.description ?? null,
        estimatedCostAmount: record?.estimatedCostAmount ?? null,
        estimatedCostCurrency: record?.estimatedCostCurrency ?? null,
      };
    },
  });

  if (proposal.status === "TARGET_NOT_FOUND") {
    await markFeedbackSuperseded(
      feedback.id,
      "The target changed while a replacement was being prepared.",
      claim,
    );
    return {
      status: "SUPERSEDED",
      result: {
        outcome: "SUPERSEDED",
        feedbackId: feedback.id,
      },
    };
  }
  if (proposal.status === "INVALID_REPLACEMENT") {
    throw new JobExecutionError(`INVALID_REPLACEMENT_${proposal.reason}`, {
      retryable: false,
      publicMessage: "The proposed replacement was invalid.",
    });
  }

  await input.reportProgress(
    "VALIDATING_ITINERARY",
    75,
    proposal.status === "PROPOSED"
      ? "Validating the updated day."
      : "Validating the preference-only update.",
  );
  throwIfAborted(input.signal);

  const commit = await db.$transaction(async (tx) => {
    await assertActiveJobClaim(tx, claim);
    const alreadyProcessed = await tx.planningFeedback.findUnique({
      where: {
        id: feedback.id,
      },
      select: {
        processingStatus: true,
      },
    });
    const existingJob = await tx.generationJob.findUnique({
      where: {
        id: initial.id,
      },
      select: {
        result: true,
      },
    });
    const existingResult = existingJob?.result
      ? jsonValue(existingJob.result)
      : null;

    if (alreadyProcessed?.processingStatus === "PROCESSED" && existingResult) {
      await assertActiveJobClaim(tx, claim);
      return {
        state: "COMMITTED" as const,
        result: existingResult,
      };
    }

    const locked = await tx.trip.updateMany({
      where: {
        id: initial.tripId,
        tripVersion: initial.tripVersion,
        activePreferenceProfileVersionId: initial.preferenceProfileVersionId,
        activeItineraryVersionId: initial.parentItineraryVersionId,
      },
      data: {
        tripVersion: {
          increment: 1,
        },
        planningRevision: {
          increment: 1,
        },
      },
    });

    if (locked.count !== 1) {
      return {
        state: "STALE" as const,
      };
    }

    const latestPreference = await tx.preferenceProfileVersion.findFirst({
      where: {
        tripId: initial.tripId,
      },
      select: {
        version: true,
      },
      orderBy: {
        version: "desc",
      },
    });
    const preferenceVersion = await tx.preferenceProfileVersion.create({
      data: {
        tripId: initial.tripId,
        version: (latestPreference?.version ?? 0) + 1,
        parentVersionId: initial.preferenceProfileVersionId,
        sourceFeedbackId: feedback.id,
        snapshot: proposal.preference.snapshot,
        delta: proposal.preference.delta ?? undefined,
      },
      select: {
        id: true,
        version: true,
      },
    });
    const preferenceProjection = await tx.tripPreference.findUnique({
      where: {
        tripId: initial.tripId,
      },
      select: {
        metadata: true,
      },
    });

    await tx.tripPreference.updateMany({
      where: {
        tripId: initial.tripId,
      },
      data: {
        metadata: {
          ...jsonObject(preferenceProjection?.metadata),
          adaptive: {
            priceSensitivity: proposal.preference.snapshot.priceSensitivity,
          },
        },
      },
    });

    let itineraryVersion: {
      id: string;
      version: number;
      affectedDay: number;
      replacementItemId: string;
    } | null = null;
    let replacement: CandidateRecord | null = null;
    let validation:
      | {
          status: "NOT_APPLICABLE";
        }
      | {
          status: "PASSED";
        }
      | {
          status: "BLOCKED";
          draftVersion: {
            id: string;
            version: number;
          };
          blockingConflicts: Array<{
            type: string;
            severity: string;
            message: string;
          }>;
        } = {
      status: "NOT_APPLICABLE",
    };
    let selectionProjection =
      suggestionProjectionMutationForOutcome("NO_REPLACEMENT");

    if (proposal.status === "PROPOSED") {
      replacement = candidateMap.get(proposal.candidate.id) ?? null;
      if (!replacement) {
        throw new JobExecutionError("REPLACEMENT_RECORD_NOT_FOUND", {
          retryable: false,
          publicMessage: "The selected replacement is no longer available.",
        });
      }

      const conflictTrip = await tx.trip.findUniqueOrThrow({
        where: {
          id: initial.tripId,
        },
        select: {
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
        },
      });
      const baselineConflicts = await refreshItineraryConflictsForTripTx(
        tx,
        conflictTrip,
        {
          itineraryVersionId: parentItineraryVersionId,
        },
      );
      const draftItineraryVersion = await cloneReplacementItinerary(tx, {
        tripId: initial.tripId,
        jobId: initial.id,
        source: sourceItinerary,
        preferenceProfileVersionId: preferenceVersion.id,
        targetItemId,
        replacement,
        preferenceExplanation: proposal.preference.explanation,
      });
      const proposedConflicts = await refreshItineraryConflictsForTripTx(
        tx,
        conflictTrip,
        {
          itineraryVersionId: draftItineraryVersion.id,
        },
      );
      const blockingConflicts = findNewBlockingHighConflicts({
        baseline: baselineConflicts,
        proposed: proposedConflicts,
        affectedDay: draftItineraryVersion.affectedDay,
      });

      if (blockingConflicts.length > 0) {
        const conflictSummary = blockingConflicts
          .slice(0, 10)
          .map((conflict) => ({
            type: conflict.type,
            severity: conflict.severity,
            message: conflict.message,
          }));
        await tx.itineraryVersion.update({
          where: {
            id: draftItineraryVersion.id,
          },
          data: {
            status: "FAILED",
            changeSummary: {
              outcome: "VALIDATION_BLOCKED",
              affectedDay: draftItineraryVersion.affectedDay,
              rejectedItemId: targetItemId,
              replacementSuggestionId: replacement.id,
              blockingConflicts: conflictSummary,
            },
          },
        });
        validation = {
          status: "BLOCKED",
          draftVersion: {
            id: draftItineraryVersion.id,
            version: draftItineraryVersion.version,
          },
          blockingConflicts: conflictSummary,
        };
      } else {
        const replacementScoring = candidateScoringMap.get(replacement.id);
        if (!replacementScoring) {
          throw new JobExecutionError("REPLACEMENT_SCORE_NOT_FOUND", {
            retryable: false,
            publicMessage:
              "The selected replacement score is no longer available.",
          });
        }

        await tx.placeSuggestion.update({
          where: {
            id: replacement.id,
          },
          data: {
            status: "SELECTED",
            score: replacementScoring.score,
            explanation: proposal.preference.explanation,
            metadata: {
              ...jsonObject(replacement.metadata),
              scoring: replacementScoring,
              scoringPreference: {
                feedbackId: feedback.id,
                priceSensitivity:
                  proposal.preference.snapshot.priceSensitivity.weight,
              },
            },
          },
        });
        itineraryVersion = draftItineraryVersion;
        selectionProjection =
          suggestionProjectionMutationForOutcome("REPLACED");
        validation = {
          status: "PASSED",
        };

        const superseded = await tx.itineraryVersion.updateMany({
          where: {
            id: parentItineraryVersionId,
            tripId: initial.tripId,
            status: "ACTIVE",
          },
          data: {
            status: "SUPERSEDED",
          },
        });
        if (superseded.count !== 1) {
          throw new JobExecutionError("PARENT_ITINERARY_NOT_ACTIVE", {
            retryable: false,
            publicMessage:
              "The captured itinerary is no longer the active version.",
          });
        }
        await tx.itineraryVersion.update({
          where: {
            id: itineraryVersion.id,
          },
          data: {
            status: "ACTIVE",
            activatedAt: new Date(),
          },
        });
      }
    }

    if (
      target.placeSuggestionId &&
      selectionProjection.rejectedSuggestionStatus
    ) {
      await tx.placeSuggestion.updateMany({
        where: {
          id: target.placeSuggestionId,
          tripId: initial.tripId,
        },
        data: {
          status: selectionProjection.rejectedSuggestionStatus,
        },
      });
    }

    await tx.trip.update({
      where: {
        id: initial.tripId,
      },
      data: {
        activePreferenceProfileVersionId: preferenceVersion.id,
        ...(itineraryVersion
          ? { activeItineraryVersionId: itineraryVersion.id }
          : {}),
      },
    });
    const processingResult = jsonValue({
      outcome: itineraryVersion ? "REPLACED" : "NO_REPLACEMENT",
      feedbackId: feedback.id,
      preferenceVersion: {
        id: preferenceVersion.id,
        version: preferenceVersion.version,
        delta: proposal.preference.delta,
        explanation: proposal.preference.explanation,
      },
      affectedDay:
        itineraryVersion?.affectedDay ??
        sourceItinerary.days.find((day) =>
          day.items.some((item) => item.id === targetItemId),
        )?.dayNumber ??
        null,
      itineraryVersion: itineraryVersion
        ? {
            id: itineraryVersion.id,
            version: itineraryVersion.version,
          }
        : null,
      replacement:
        replacement && itineraryVersion
          ? {
              itemId: itineraryVersion.replacementItemId,
              suggestionId: replacement.id,
              name: replacement.name,
              score: candidateScoringMap.get(replacement.id)?.score ?? null,
              explanation:
                replacement.explanation ?? proposal.preference.explanation,
            }
          : null,
      validation,
      provider: providerState,
      retryGuidance:
        validation.status === "BLOCKED"
          ? "The proposed replacement introduced a new blocking conflict. Review the failed draft or submit feedback for another alternative."
          : providerState.state === "UNAVAILABLE"
            ? "Configure the place provider or add a compatible persisted candidate, then submit new feedback."
            : null,
    });

    await tx.planningFeedback.update({
      where: {
        id: feedback.id,
      },
      data: {
        processingStatus: "PROCESSED",
        processedAt: new Date(),
      },
    });
    const jobResult = await tx.generationJob.updateMany({
      where: {
        id: initial.id,
        status: "RUNNING",
        workerId: input.workerId,
        attemptCount: input.attempt,
      },
      data: {
        result: processingResult as Prisma.InputJsonValue,
      },
    });
    if (jobResult.count !== 1) {
      throw new JobLeaseLostError();
    }
    await tx.planningEvent.create({
      data: {
        tripId: initial.tripId,
        actor: "ENGINE",
        type: "ENGINE_EXPLANATION",
        title: itineraryVersion
          ? "Itinerary item replaced"
          : validation.status === "BLOCKED"
            ? "Replacement blocked by itinerary validation"
            : "Preferences updated; no replacement found",
        message: itineraryVersion
          ? `${target.title} was replaced with ${replacement?.name}.`
          : validation.status === "BLOCKED"
            ? "The preference update was preserved, but the current itinerary remains active because the proposed replacement introduced a new blocking conflict."
            : "The feedback changed the active preference profile, but no compatible replacement was available.",
        metadata: processingResult as Prisma.InputJsonValue,
      },
    });
    await assertActiveJobClaim(tx, claim);

    return {
      state: "COMMITTED" as const,
      result: processingResult,
    };
  });

  if (commit.state === "STALE") {
    await markFeedbackSuperseded(
      feedback.id,
      "The trip changed before the adaptive result could be activated.",
      claim,
    );
    return {
      status: "SUPERSEDED",
      result: {
        outcome: "SUPERSEDED",
        feedbackId: feedback.id,
      },
    };
  }

  return {
    status: "SUCCEEDED",
    result: commit.result,
  };
}

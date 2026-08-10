import type {
  GenerationJobStatus,
  JobEventType,
  JsonValue,
} from "@/features/jobs/contracts";
import type { PlanningJobSummary } from "@/features/planning/types";

const terminalStatuses = new Set<GenerationJobStatus>([
  "SUCCEEDED",
  "FAILED",
  "DEAD_LETTERED",
  "SUPERSEDED",
]);

export type JobEventDto = {
  id: string;
  type: JobEventType;
  progress: number | null;
  message: string | null;
  createdAt: string;
};

export type PlanningJobDetail = PlanningJobSummary & {
  maxAttempts?: number;
  availableAt?: string;
  completedAt?: string | null;
  result?: JsonValue | null;
  events?: JobEventDto[];
};

export type QueuedFeedbackResponse = {
  feedbackId: string;
  jobId: string;
  revision: number;
  status: GenerationJobStatus;
};

export type RemovedFeedbackResponse = {
  status: "REMOVED";
  feedbackId: string;
  revision: number;
  affectedDay: number;
  itineraryVersion: {
    id: string;
    version: number;
  };
  preferenceDelta: unknown;
  preferenceExplanation: string;
};

export function isRemovedFeedbackResponse(
  value: Record<string, unknown> | null,
): value is RemovedFeedbackResponse {
  const itineraryVersion = asRecord(value?.itineraryVersion);

  return Boolean(
    value?.status === "REMOVED" &&
    typeof value.feedbackId === "string" &&
    typeof value.revision === "number" &&
    typeof value.affectedDay === "number" &&
    typeof value.preferenceExplanation === "string" &&
    typeof itineraryVersion?.id === "string" &&
    typeof itineraryVersion.version === "number",
  );
}

export function setOptimisticRemoval(
  current: ReadonlySet<string>,
  itemId: string,
  hidden: boolean,
) {
  const next = new Set(current);

  if (hidden) {
    next.add(itemId);
  } else {
    next.delete(itemId);
  }

  return next;
}

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export function isTerminalPlanningJob(status: GenerationJobStatus) {
  return terminalStatuses.has(status);
}

export function planningJobPollDelay(elapsedMilliseconds: number) {
  return elapsedMilliseconds < 15_000 ? 1_000 : 3_000;
}

export function isGenerationJobStatus(
  value: unknown,
): value is GenerationJobStatus {
  return (
    typeof value === "string" &&
    [
      "PENDING",
      "RUNNING",
      "RETRYING",
      "SUCCEEDED",
      "FAILED",
      "DEAD_LETTERED",
      "SUPERSEDED",
    ].includes(value)
  );
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseJobDetail(value: unknown): PlanningJobDetail | null {
  const body = asRecord(value);
  const job = asRecord(body?.job);

  if (
    !job ||
    typeof job.id !== "string" ||
    typeof job.type !== "string" ||
    !isGenerationJobStatus(job.status) ||
    typeof job.progress !== "number" ||
    typeof job.attemptCount !== "number" ||
    typeof job.createdAt !== "string" ||
    typeof job.updatedAt !== "string"
  ) {
    return null;
  }

  return job as PlanningJobDetail;
}

export async function fetchPlanningJobDetail(
  fetcher: FetchLike,
  tripId: string,
  jobId: string,
) {
  const response = await fetcher(
    `/api/trips/${encodeURIComponent(tripId)}/jobs/${encodeURIComponent(jobId)}`,
    {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    },
  );
  if (!response.ok) {
    return null;
  }

  return parseJobDetail(await response.json());
}

export function mergePlanningJobs(
  current: readonly PlanningJobDetail[],
  incoming: readonly PlanningJobDetail[],
) {
  const merged = new Map(current.map((job) => [job.id, job]));

  incoming.forEach((job) => {
    const previous = merged.get(job.id);
    merged.set(job.id, {
      ...previous,
      ...job,
      events: job.events ?? previous?.events,
      result: job.result ?? previous?.result,
    });
  });

  return Array.from(merged.values()).sort(
    (left, right) =>
      right.createdAt.localeCompare(left.createdAt) ||
      right.id.localeCompare(left.id),
  );
}

export function planningJobEventLabel(type: JobEventType) {
  switch (type) {
    case "RECEIVED":
      return "Feedback received";
    case "CLAIMED":
      return "Preparing the update";
    case "UPDATING_PREFERENCES":
      return "Updating preferences";
    case "FINDING_REPLACEMENT":
      return "Finding a replacement";
    case "VALIDATING_ITINERARY":
      return "Validating the affected day";
    case "RETRY_SCHEDULED":
      return "Retry scheduled";
    case "COMPLETED":
      return "Itinerary updated";
    case "FAILED":
      return "Update failed";
    case "DEAD_LETTERED":
      return "Update needs attention";
    case "SUPERSEDED":
      return "Superseded by a newer change";
    case "RECOVERED":
      return "Recovered after an interruption";
  }
}

export function planningJobLabel(job: PlanningJobDetail) {
  const latestEvent = job.events?.at(-1);
  if (latestEvent) {
    return planningJobEventLabel(latestEvent.type);
  }

  switch (job.status) {
    case "PENDING":
      return "Waiting for a planning worker";
    case "RUNNING":
      return "Updating your itinerary";
    case "RETRYING":
      return "Retry scheduled";
    case "SUCCEEDED":
      return "Itinerary updated";
    case "FAILED":
      return "Update failed";
    case "DEAD_LETTERED":
      return "Update needs attention";
    case "SUPERSEDED":
      return "Superseded by a newer change";
  }
}

export function stablePlanningTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

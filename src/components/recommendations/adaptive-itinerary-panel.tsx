"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ItineraryDayDto } from "@/features/itinerary/types";
import type {
  PlanningItineraryVersionSummary,
  PlanningJobSummary,
} from "@/features/planning/types";
import {
  AdaptiveItineraryView,
  type AdaptiveItemMessage,
} from "./adaptive-itinerary-view";
import {
  asRecord,
  fetchPlanningJobDetail,
  isGenerationJobStatus,
  isRemovedFeedbackResponse,
  isTerminalPlanningJob,
  mergePlanningJobs,
  planningJobPollDelay,
  setOptimisticRemoval,
  type PlanningJobDetail,
  type QueuedFeedbackResponse,
} from "./adaptive-itinerary-model";

export {
  fetchPlanningJobDetail,
  isTerminalPlanningJob,
  planningJobPollDelay,
} from "./adaptive-itinerary-model";
export type { PlanningJobDetail } from "./adaptive-itinerary-model";

export function AdaptiveItineraryPanel({
  tripId,
  initialRevision,
  days,
  initialJobs,
  itineraryVersions,
}: {
  tripId: string;
  initialRevision: number;
  days: ItineraryDayDto[];
  initialJobs: PlanningJobSummary[];
  itineraryVersions: PlanningItineraryVersionSummary[];
}) {
  const router = useRouter();
  const [queuedRevision, setQueuedRevision] = useState<number | null>(null);
  const [observedJobs, setObservedJobs] = useState<PlanningJobDetail[]>([]);
  const [pendingItemIds, setPendingItemIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [hiddenItemIds, setHiddenItemIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [panelMessage, setPanelMessage] = useState<string | null>(null);
  const [itemMessages, setItemMessages] = useState<
    Record<string, AdaptiveItemMessage>
  >({});
  const [pollError, setPollError] = useState(false);
  const firstSeenAt = useRef(new Map<string, number>());
  const refreshedTerminalJobs = useRef(new Set<string>());
  const revision = Math.max(initialRevision, queuedRevision ?? initialRevision);
  const jobs = useMemo(
    () => mergePlanningJobs(initialJobs, observedJobs),
    [initialJobs, observedJobs],
  );

  const activeJobIds = useMemo(
    () =>
      jobs
        .filter((job) => !isTerminalPlanningJob(job.status))
        .map((job) => job.id)
        .sort(),
    [jobs],
  );
  const activeJobKey = activeJobIds.join("|");

  useEffect(() => {
    if (!activeJobKey) {
      return;
    }

    const jobIds = activeJobKey.split("|");
    const now = Date.now();
    jobIds.forEach((jobId) => {
      if (!firstSeenAt.current.has(jobId)) {
        firstSeenAt.current.set(jobId, now);
      }
    });

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const nextDelay = () =>
      Math.min(
        ...jobIds.map((jobId) =>
          planningJobPollDelay(
            Date.now() - (firstSeenAt.current.get(jobId) ?? Date.now()),
          ),
        ),
      );

    const poll = async () => {
      const loaded = await Promise.all(
        jobIds.map(async (jobId) => {
          try {
            return await fetchPlanningJobDetail(fetch, tripId, jobId);
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) {
        return;
      }

      const details = loaded.filter(
        (job): job is PlanningJobDetail => job !== null,
      );
      setPollError(details.length !== jobIds.length);
      if (details.length > 0) {
        setObservedJobs((current) => mergePlanningJobs(current, details));
      }

      details.forEach((job) => {
        if (
          isTerminalPlanningJob(job.status) &&
          !refreshedTerminalJobs.current.has(job.id)
        ) {
          refreshedTerminalJobs.current.add(job.id);
          router.refresh();
        }
      });

      const everyLoadedJobIsTerminal =
        details.length === jobIds.length &&
        details.every((job) => isTerminalPlanningJob(job.status));
      if (!everyLoadedJobIsTerminal) {
        timer = setTimeout(poll, nextDelay());
      }
    };

    timer = setTimeout(poll, nextDelay());
    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [activeJobKey, tripId, router]);

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const itemId = form.dataset.itemId;
    if (!itemId || pendingItemIds.has(itemId)) {
      return;
    }

    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    const action =
      submitter?.value === "REJECT" ? "REJECT" : "REQUEST_ALTERNATIVE";
    const data = new FormData(form);
    const reason = String(data.get("reason") ?? "NOT_INTERESTED");

    setPendingItemIds((current) => new Set(current).add(itemId));
    if (action === "REJECT") {
      setHiddenItemIds((current) =>
        setOptimisticRemoval(current, itemId, true),
      );
      setPanelMessage("Removing the activity from the itinerary.");
    }
    setItemMessages((current) => {
      const next = { ...current };
      delete next[itemId];
      return next;
    });

    try {
      const response = await fetch(
        `/api/trips/${encodeURIComponent(tripId)}/itinerary-items/${encodeURIComponent(itemId)}/feedback`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            expectedRevision: revision,
            operationId: crypto.randomUUID(),
            action,
            reason,
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as unknown;
      const body = asRecord(payload);

      if (response.status === 200 && isRemovedFeedbackResponse(body)) {
        setQueuedRevision(body.revision);
        setPanelMessage(
          `Activity removed from day ${body.affectedDay}. ${body.preferenceExplanation}`,
        );
        router.refresh();
        return;
      }

      if (
        response.status === 202 &&
        typeof body?.feedbackId === "string" &&
        typeof body.jobId === "string" &&
        typeof body.revision === "number" &&
        isGenerationJobStatus(body.status)
      ) {
        const queued = body as QueuedFeedbackResponse;
        setQueuedRevision(queued.revision);
        firstSeenAt.current.set(queued.jobId, Date.now());
        setObservedJobs((current) =>
          mergePlanningJobs(current, [
            {
              id: queued.jobId,
              type: "PROCESS_FEEDBACK_EVENT",
              status: queued.status,
              progress: 0,
              progressMessage: "Feedback received.",
              attemptCount: 0,
              errorCode: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ]),
        );
        setItemMessages((current) => ({
          ...current,
          [itemId]: {
            kind: "success",
            text: "Feedback queued. We are finding a compatible replacement.",
          },
        }));
        return;
      }

      if (response.status === 409 && typeof body?.revision === "number") {
        setQueuedRevision(body.revision);
        router.refresh();
      }
      if (action === "REJECT") {
        setHiddenItemIds((current) =>
          setOptimisticRemoval(current, itemId, false),
        );
        setPanelMessage(null);
      }
      setItemMessages((current) => ({
        ...current,
        [itemId]: {
          kind: "error",
          text:
            response.status === 409
              ? "The plan changed before this feedback was applied. Review the latest itinerary and try again."
              : action === "REJECT"
                ? "The activity could not be removed. The itinerary was restored."
                : "Feedback could not be queued. Try again.",
        },
      }));
    } catch {
      if (action === "REJECT") {
        setHiddenItemIds((current) =>
          setOptimisticRemoval(current, itemId, false),
        );
        setPanelMessage(null);
      }
      setItemMessages((current) => ({
        ...current,
        [itemId]: {
          kind: "error",
          text: "The connection was interrupted. Your itinerary was not changed.",
        },
      }));
    } finally {
      setPendingItemIds((current) => {
        const next = new Set(current);
        next.delete(itemId);
        return next;
      });
    }
  }

  return (
    <AdaptiveItineraryView
      revision={revision}
      days={days}
      jobs={jobs}
      pendingItemIds={pendingItemIds}
      itemMessages={itemMessages}
      hiddenItemIds={hiddenItemIds}
      panelMessage={panelMessage}
      pollError={pollError}
      itineraryVersions={itineraryVersions}
      onSubmitFeedback={submitFeedback}
    />
  );
}

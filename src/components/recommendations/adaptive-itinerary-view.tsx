import { History, ThumbsDown, Trash2 } from "lucide-react";
import type { FormEventHandler } from "react";
import type { ItineraryDayDto } from "@/features/itinerary/types";
import type { PlanningItineraryVersionSummary } from "@/features/planning/types";
import { AdaptiveJobStatusList } from "./adaptive-job-status-list";
import {
  stablePlanningTimestamp,
  type PlanningJobDetail,
} from "./adaptive-itinerary-model";

const feedbackReasons = [
  ["NOT_INTERESTED", "Not interested"],
  ["TOO_EXPENSIVE", "Too expensive"],
  ["TOO_FAR", "Too far"],
  ["WRONG_VIBE", "Wrong vibe"],
  ["ALREADY_BEEN_THERE", "Already been there"],
  ["OTHER", "Other"],
] as const;

export type AdaptiveItemMessage = {
  kind: "success" | "error";
  text: string;
};

export function AdaptiveItineraryView({
  revision,
  days,
  jobs,
  pendingItemIds,
  itemMessages,
  hiddenItemIds,
  panelMessage,
  pollError,
  itineraryVersions,
  onSubmitFeedback,
}: {
  revision: number;
  days: readonly ItineraryDayDto[];
  jobs: readonly PlanningJobDetail[];
  pendingItemIds: ReadonlySet<string>;
  itemMessages: Readonly<Record<string, AdaptiveItemMessage>>;
  hiddenItemIds: ReadonlySet<string>;
  panelMessage: string | null;
  pollError: boolean;
  itineraryVersions: readonly PlanningItineraryVersionSummary[];
  onSubmitFeedback: FormEventHandler<HTMLFormElement>;
}) {
  return (
    <section
      aria-labelledby="adaptive-itinerary-title"
      className="rounded-lg border border-sky-200 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-sky-700">Adaptive planning</p>
          <h2
            id="adaptive-itinerary-title"
            className="mt-1 text-base font-semibold text-zinc-950"
          >
            Shape the itinerary as you react
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-600">
            Remove an item immediately, or ask a durable background job to find
            and validate a replacement for the affected day.
          </p>
        </div>
        <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-800">
          Revision {revision}
        </span>
      </div>

      {panelMessage ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        >
          {panelMessage}
        </p>
      ) : null}

      {days.length > 0 ? (
        <div className="mt-5 grid gap-4">
          {days.map((day) => (
            <section
              key={day.id}
              aria-labelledby={`adaptive-day-${day.id}`}
              className="rounded-md border border-zinc-200 p-3"
            >
              <h3
                id={`adaptive-day-${day.id}`}
                className="text-sm font-semibold text-zinc-950"
              >
                Day {day.dayNumber}
              </h3>
              {day.items.some((item) => !hiddenItemIds.has(item.id)) ? (
                <ul className="mt-3 grid gap-3">
                  {day.items
                    .filter((item) => !hiddenItemIds.has(item.id))
                    .map((item) => {
                      const pending = pendingItemIds.has(item.id);
                      const message = itemMessages[item.id];
                      const selectId = `feedback-reason-${item.id}`;

                      return (
                        <li key={item.id} className="rounded-md bg-zinc-50 p-3">
                          <p className="text-sm font-medium text-zinc-950">
                            {item.title}
                          </p>
                          <form
                            data-item-id={item.id}
                            onSubmit={onSubmitFeedback}
                            className="mt-3 flex flex-wrap items-end gap-2"
                          >
                            <label
                              htmlFor={selectId}
                              className="grid gap-1 text-xs font-medium text-zinc-700"
                            >
                              Reason
                              <select
                                id={selectId}
                                name="reason"
                                disabled={pending}
                                defaultValue="NOT_INTERESTED"
                                className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900"
                              >
                                {feedbackReasons.map(([value, label]) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button
                              type="submit"
                              name="action"
                              value="REQUEST_ALTERNATIVE"
                              disabled={pending}
                              aria-label={`Dislike ${item.title} and find a replacement`}
                              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-zinc-950 px-3 text-xs font-medium text-white hover:bg-zinc-800 disabled:cursor-wait disabled:opacity-60"
                            >
                              <ThumbsDown
                                aria-hidden="true"
                                className="size-3.5"
                              />
                              {pending ? "Queuing..." : "Dislike & replace"}
                            </button>
                            <button
                              type="submit"
                              name="action"
                              value="REJECT"
                              disabled={pending}
                              aria-label={`Remove ${item.title} from the itinerary`}
                              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-wait disabled:opacity-60"
                            >
                              <Trash2 aria-hidden="true" className="size-3.5" />
                              Remove
                            </button>
                          </form>
                          {message ? (
                            <p
                              role={
                                message.kind === "error" ? "alert" : "status"
                              }
                              className={
                                message.kind === "error"
                                  ? "mt-2 text-xs leading-5 text-red-700"
                                  : "mt-2 text-xs leading-5 text-emerald-700"
                              }
                            >
                              {message.text}
                            </p>
                          ) : null}
                        </li>
                      );
                    })}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-zinc-500">
                  No itinerary items are assigned to this day.
                </p>
              )}
            </section>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm leading-6 text-zinc-600">
          Build an itinerary to start giving item-level feedback.
        </p>
      )}

      <AdaptiveJobStatusList jobs={jobs} pollError={pollError} />

      <details className="mt-5 border-t border-zinc-200 pt-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-zinc-950">
          <span className="inline-flex items-center gap-2">
            <History aria-hidden="true" className="size-4" />
            Itinerary version history
          </span>
          <span className="text-xs font-medium text-zinc-500">
            {itineraryVersions.length}
          </span>
        </summary>
        {itineraryVersions.length > 0 ? (
          <ol className="mt-3 grid gap-2">
            {itineraryVersions.map((version) => (
              <li
                key={version.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600"
              >
                <span>
                  <strong className="font-semibold text-zinc-950">
                    Version {version.version}
                  </strong>{" "}
                  · {version.changeScope.toLocaleLowerCase()}
                </span>
                <span
                  aria-current={
                    version.status === "ACTIVE" ? "true" : undefined
                  }
                  className={
                    version.status === "ACTIVE"
                      ? "font-semibold text-emerald-700"
                      : "text-zinc-500"
                  }
                >
                  {version.status.toLocaleLowerCase()} ·{" "}
                  <time dateTime={version.createdAt}>
                    {stablePlanningTimestamp(version.createdAt)}
                  </time>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">
            Version history appears after the first persisted itinerary.
          </p>
        )}
      </details>
    </section>
  );
}

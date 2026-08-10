import {
  AlertTriangle,
  CheckCircle2,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import type { JsonValue } from "@/features/jobs/contracts";
import {
  asRecord,
  isTerminalPlanningJob,
  planningJobLabel,
  type PlanningJobDetail,
} from "./adaptive-itinerary-model";

function numberFrom(
  record: Record<string, unknown> | null,
  keys: readonly string[],
) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function textFrom(
  record: Record<string, unknown> | null,
  keys: readonly string[],
) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function JobResultDetails({
  result,
}: {
  result: JsonValue | null | undefined;
}) {
  const record = asRecord(result);
  if (!record) {
    return null;
  }

  const status = textFrom(record, ["status", "outcome"]);
  const preferenceVersion = asRecord(record.preferenceVersion);
  const preferenceDelta = asRecord(
    preferenceVersion?.delta ??
      record.preferenceDelta ??
      record.preferenceChange,
  );
  const priceDelta =
    preferenceDelta?.field === "priceSensitivity"
      ? preferenceDelta
      : asRecord(preferenceDelta?.priceSensitivity ?? preferenceDelta?.price);
  const beforeSignal = asRecord(priceDelta?.before);
  const afterSignal = asRecord(priceDelta?.after);
  const previousPrice =
    numberFrom(beforeSignal, ["weight"]) ??
    numberFrom(priceDelta, ["from", "previous", "previousWeight"]);
  const nextPrice =
    numberFrom(afterSignal, ["weight"]) ??
    numberFrom(priceDelta, ["to", "next", "nextWeight"]);
  const replacement = asRecord(record.replacement ?? record.candidate);
  const replacementName = textFrom(replacement, ["name", "title"]);
  const explanation =
    textFrom(replacement, ["explanation"]) ??
    textFrom(preferenceVersion, ["explanation"]) ??
    textFrom(record, ["explanation", "message"]);
  const affectedDay = numberFrom(record, [
    "affectedDay",
    "affectedDayNumber",
    "dayNumber",
  ]);
  const itineraryVersion = asRecord(record.itineraryVersion);
  const itineraryVersionNumber = numberFrom(itineraryVersion, ["version"]);
  const provider = asRecord(record.provider);
  const providerName = textFrom(provider, ["provider"]);
  const providerState = textFrom(provider, ["state"]);
  const providerProvenance = asRecord(provider?.provenance);
  const providerLabel = textFrom(providerProvenance, ["label"]);
  const retryGuidance = textFrom(record, ["retryGuidance"]);

  if (
    !status &&
    previousPrice === null &&
    nextPrice === null &&
    !replacementName &&
    !explanation &&
    affectedDay === null &&
    itineraryVersionNumber === null &&
    !providerName &&
    !providerState &&
    !providerLabel &&
    !retryGuidance
  ) {
    return null;
  }

  return (
    <dl className="mt-3 grid gap-2 rounded-md bg-white/70 p-3 text-xs text-zinc-700">
      {status === "NO_REPLACEMENT" ? (
        <div>
          <dt className="font-semibold text-zinc-900">Result</dt>
          <dd className="mt-0.5">
            No compatible replacement was available. The previous itinerary
            remains active.
          </dd>
        </div>
      ) : null}
      {previousPrice !== null && nextPrice !== null ? (
        <div>
          <dt className="font-semibold text-zinc-900">Preference change</dt>
          <dd className="mt-0.5">
            Price sensitivity {previousPrice.toFixed(2)} →{" "}
            {nextPrice.toFixed(2)}
          </dd>
        </div>
      ) : null}
      {replacementName ? (
        <div>
          <dt className="font-semibold text-zinc-900">Replacement</dt>
          <dd className="mt-0.5">{replacementName}</dd>
        </div>
      ) : null}
      {affectedDay !== null ? (
        <div>
          <dt className="font-semibold text-zinc-900">Affected day</dt>
          <dd className="mt-0.5">Day {affectedDay}</dd>
        </div>
      ) : null}
      {itineraryVersionNumber !== null ? (
        <div>
          <dt className="font-semibold text-zinc-900">Itinerary version</dt>
          <dd className="mt-0.5">Version {itineraryVersionNumber}</dd>
        </div>
      ) : null}
      {providerName || providerState || providerLabel ? (
        <div>
          <dt className="font-semibold text-zinc-900">Candidate source</dt>
          <dd className="mt-0.5 text-zinc-600">
            {providerLabel ?? providerName ?? "Persisted candidates"}
            {providerState ? ` · ${providerState.toLocaleLowerCase()}` : null}
          </dd>
        </div>
      ) : null}
      {explanation ? (
        <div>
          <dt className="font-semibold text-zinc-900">Why this changed</dt>
          <dd className="mt-0.5 leading-5">{explanation}</dd>
        </div>
      ) : null}
      {retryGuidance ? (
        <div>
          <dt className="font-semibold text-zinc-900">Next step</dt>
          <dd className="mt-0.5 leading-5">{retryGuidance}</dd>
        </div>
      ) : null}
    </dl>
  );
}

function JobStatusCard({ job }: { job: PlanningJobDetail }) {
  const progress = Math.max(0, Math.min(100, Math.round(job.progress)));
  const label = planningJobLabel(job);
  const latestMessage = job.events?.at(-1)?.message ?? job.progressMessage;
  const isFailure = job.status === "FAILED" || job.status === "DEAD_LETTERED";
  const failureGuidance = (() => {
    switch (job.errorCode) {
      case "DATABASE_CONNECTION_UNAVAILABLE":
      case "DATABASE_POOL_TIMEOUT":
        return "Confirm the local worker can reach the QA database, then submit a new replacement request.";
      case "DATABASE_TRANSACTION_TIMEOUT":
      case "DATABASE_DEADLOCK":
      case "DATABASE_SERIALIZATION_FAILURE":
        return "The database could not commit the replacement in time. Submit a new request; the current itinerary was preserved.";
      case "ADAPTATION_VALIDATION_FAILED":
      case "DATABASE_CONSTRAINT_FAILED":
        return "Refresh the itinerary before submitting another replacement request.";
      default:
        return `The current itinerary is still safe. Share error code ${job.errorCode ?? "JOB_EXECUTION_FAILED"} with the developer before retrying.`;
    }
  })();

  return (
    <li className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <div className="flex items-start gap-2">
        {job.status === "SUCCEEDED" ? (
          <CheckCircle2
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-emerald-600"
          />
        ) : isFailure ? (
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-amber-600"
          />
        ) : isTerminalPlanningJob(job.status) ? (
          <RefreshCw
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-zinc-500"
          />
        ) : (
          <LoaderCircle
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 animate-spin text-sky-600 motion-reduce:animate-none"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-zinc-950">{label}</p>
            <span className="text-xs font-medium text-zinc-500">
              {progress}%
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200"
          >
            <div
              className="h-full rounded-full bg-sky-600 transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
          {latestMessage ? (
            <p className="mt-2 text-xs leading-5 text-zinc-600">
              {latestMessage}
            </p>
          ) : null}
          {job.status === "RETRYING" ? (
            <p className="mt-2 text-xs text-zinc-600">
              Attempt {job.attemptCount + 1} of {job.maxAttempts ?? 3} will
              start automatically.
            </p>
          ) : null}
          {job.status === "PENDING" ? (
            <p className="mt-2 text-xs leading-5 text-sky-800">
              The request is safely stored. Start the local planning worker to
              process it; reloading this page will not lose the job.
            </p>
          ) : null}
          {isFailure ? (
            <p className="mt-2 text-xs leading-5 text-amber-800">
              {failureGuidance}
            </p>
          ) : null}
          {job.status === "SUPERSEDED" ? (
            <p className="mt-2 text-xs leading-5 text-zinc-600">
              A newer trip or itinerary change won. This job did not overwrite
              it.
            </p>
          ) : null}
          <JobResultDetails result={job.result} />
        </div>
      </div>
    </li>
  );
}

export function AdaptiveJobStatusList({
  jobs,
  pollError,
}: {
  jobs: readonly PlanningJobDetail[];
  pollError: boolean;
}) {
  return (
    <section
      aria-labelledby="adaptive-progress-title"
      aria-live="polite"
      className="mt-5 border-t border-zinc-200 pt-5"
    >
      <h3
        id="adaptive-progress-title"
        className="text-sm font-semibold text-zinc-950"
      >
        Processing status
      </h3>
      {pollError ? (
        <p role="status" className="mt-2 text-xs leading-5 text-amber-800">
          Live status is temporarily unavailable. TravleBuddy will keep
          processing in the background and retry this connection.
        </p>
      ) : null}
      {jobs.length > 0 ? (
        <ol className="mt-3 grid gap-3">
          {jobs.slice(0, 5).map((job) => (
            <JobStatusCard key={job.id} job={job} />
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-zinc-500">
          No itinerary updates are processing.
        </p>
      )}
    </section>
  );
}

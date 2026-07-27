import {
  JobExecutionError,
  type GenerationJobHandlers,
  type JobHandlerResult,
  type JobProgressReporter,
} from "@/features/jobs/runner";

export type ProcessFeedbackEventJobInput = {
  jobId: string;
  workerId: string;
  attempt: number;
  signal: AbortSignal;
  reportProgress: JobProgressReporter;
};

export type ProcessFeedbackEventJob = (
  input: ProcessFeedbackEventJobInput,
) => Promise<JobHandlerResult>;

type FeedbackJobHandlerModule = {
  processFeedbackEventJob?: unknown;
};

const feedbackJobHandlerUrl = new URL(
  "../features/adaptation/job-handler.ts",
  import.meta.url,
);

export async function loadProcessFeedbackEventJob() {
  const loadedModule = (await import(
    feedbackJobHandlerUrl.href
  )) as FeedbackJobHandlerModule;

  if (typeof loadedModule.processFeedbackEventJob !== "function") {
    throw new JobExecutionError("INVALID_JOB_HANDLER_MODULE", {
      retryable: false,
      publicMessage: "The feedback job handler is unavailable.",
    });
  }

  return loadedModule.processFeedbackEventJob as ProcessFeedbackEventJob;
}

function isJobHandlerResult(value: unknown): value is JobHandlerResult {
  if (!value || typeof value !== "object") return false;

  const candidate = value as { status?: unknown; result?: unknown };
  return (
    (candidate.status === "SUCCEEDED" && "result" in candidate) ||
    candidate.status === "SUPERSEDED"
  );
}

export function createGenerationJobHandlers(
  processFeedbackEventJob: ProcessFeedbackEventJob,
): GenerationJobHandlers {
  return {
    PROCESS_FEEDBACK_EVENT: async ({ job, signal, reportProgress }) => {
      const result = await processFeedbackEventJob({
        jobId: job.id,
        workerId: job.workerId,
        attempt: job.attempt,
        signal,
        reportProgress,
      });

      if (!isJobHandlerResult(result)) {
        throw new JobExecutionError("INVALID_JOB_HANDLER_RESULT", {
          retryable: false,
          publicMessage: "The feedback job returned an invalid result.",
        });
      }

      return result;
    },
  };
}

import type {
  GenerationJobPayloadByType,
  GenerationJobStatus,
  GenerationJobType,
  JobEventType,
  JsonValue,
  ProcessFeedbackEventJobPayload,
} from "./contracts";

export type ClaimedGenerationJob<
  TType extends GenerationJobType = GenerationJobType,
> = {
  id: string;
  tripId: string;
  feedbackId: string | null;
  type: TType;
  status: "RUNNING";
  idempotencyKey: string;
  tripVersion: number;
  preferenceProfileVersionId: string | null;
  parentItineraryVersionId: string | null;
  payload: GenerationJobPayloadByType[TType];
  attemptId: string;
  attempt: number;
  maxAttempts: number;
  workerId: string;
  leaseExpiresAt: Date;
  createdAt?: Date;
};

export type EnqueueFeedbackJobInput = {
  tripId: string;
  feedbackId: string;
  idempotencyKey: string;
  tripVersion: number;
  preferenceProfileVersionId: string | null;
  parentItineraryVersionId: string | null;
  payload: ProcessFeedbackEventJobPayload;
};

export type EnqueuedGenerationJob = {
  id: string;
  tripId: string;
  type: "PROCESS_FEEDBACK_EVENT";
  status: GenerationJobStatus;
  created: boolean;
};

export type ClaimNextJobInput = {
  workerId: string;
  leaseDurationMs?: number;
};

export type JobClaimReference = Pick<
  ClaimedGenerationJob,
  "id" | "attemptId" | "attempt" | "maxAttempts" | "workerId"
>;

export type JobFailure = {
  code: string;
  message: string | null;
  retryable: boolean;
};

export type JobFailureResult = {
  applied: boolean;
  status: "RETRYING" | "FAILED" | "DEAD_LETTERED";
  availableAt: Date | null;
  delayMs: number | null;
};

export type JobRecoveryResult = {
  recovered: number;
  deadLettered: number;
};

export type ReportJobProgressInput = {
  claim: JobClaimReference;
  type: Extract<
    JobEventType,
    "UPDATING_PREFERENCES" | "FINDING_REPLACEMENT" | "VALIDATING_ITINERARY"
  >;
  progress: number;
  message?: string | null;
  metadata?: JsonValue | null;
};

export interface GenerationJobStore {
  enqueueFeedbackJob(
    input: EnqueueFeedbackJobInput,
  ): Promise<EnqueuedGenerationJob>;
  claimNext(input: ClaimNextJobInput): Promise<ClaimedGenerationJob | null>;
  heartbeat(
    claim: JobClaimReference,
    leaseDurationMs?: number,
  ): Promise<boolean>;
  release(claim: JobClaimReference): Promise<boolean>;
  reportProgress(input: ReportJobProgressInput): Promise<boolean>;
  complete(claim: JobClaimReference, result: JsonValue): Promise<boolean>;
  fail(
    claim: JobClaimReference,
    failure: JobFailure,
  ): Promise<JobFailureResult>;
  supersede(claim: JobClaimReference, result?: JsonValue): Promise<boolean>;
  recoverExpiredClaims(): Promise<JobRecoveryResult>;
}

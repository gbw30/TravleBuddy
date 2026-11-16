import { randomUUID } from "node:crypto";

import {
  GENERATION_JOB_TYPES,
  MAX_JOB_EVENT_METADATA_BYTES,
  MAX_JOB_RESULT_BYTES,
  assertBoundedJson,
  boundedErrorCode,
  boundedErrorMessage,
  boundedProgressMessage,
  parseJobPayload,
  type GenerationJobStatus,
  type GenerationJobType,
  type JsonValue,
} from "./contracts";
import { JOB_LEASE_DURATION_MS, failurePlan } from "./policy";
import type {
  ClaimedGenerationJob,
  ClaimNextJobInput,
  EnqueuedGenerationJob,
  EnqueueFeedbackJobInput,
  GenerationJobStore,
  JobClaimReference,
  JobFailure,
  JobFailureResult,
  JobRecoveryResult,
  ReportJobProgressInput,
} from "./store";

export interface JobDatabaseClient {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

export type JobDatabaseProvider = () =>
  | JobDatabaseClient
  | Promise<JobDatabaseClient>;

type ClaimRow = {
  id: string;
  tripId: string;
  feedbackId: string | null;
  type: string;
  status: string;
  idempotencyKey: string;
  tripVersion: number;
  preferenceProfileVersionId: string | null;
  parentItineraryVersionId: string | null;
  payload: unknown;
  attemptId: string;
  attempt: number;
  maxAttempts: number;
  workerId: string;
  leaseExpiresAt: Date | string;
  createdAt?: Date | string;
};

type EnqueueRow = {
  id: string;
  tripId: string;
  feedbackId: string | null;
  type: string;
  status: GenerationJobStatus;
  tripVersion: number;
  preferenceProfileVersionId: string | null;
  parentItineraryVersionId: string | null;
  payload: unknown;
  created: boolean;
};

type AppliedRow = {
  applied: number | bigint;
};

type FailureAppliedRow = AppliedRow & {
  availableAt: Date | string | null;
};

const CLAIM_NEXT_JOB_SQL = `
WITH job_clock AS MATERIALIZED (
  SELECT clock_timestamp() AS now
),
candidate AS (
  SELECT job.id
  FROM generation_jobs AS job
  CROSS JOIN job_clock
  WHERE job.status IN ('PENDING', 'RETRYING')
    AND job.available_at <= job_clock.now
    AND job.attempt_count < job.max_attempts
  ORDER BY job.available_at ASC, job.created_at ASC, job.id ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED
),
claimed AS (
  UPDATE generation_jobs AS job
  SET
    status = 'RUNNING',
    attempt_count = job.attempt_count + 1,
    claimed_at = job_clock.now,
    heartbeat_at = job_clock.now,
    lease_expires_at =
      job_clock.now + ($1::double precision * INTERVAL '1 millisecond'),
    worker_id = $2,
    progress = GREATEST(job.progress, 5),
    progress_message = 'Processing started.',
    error_code = NULL,
    error_message = NULL,
    updated_at = job_clock.now
  FROM candidate, job_clock
  WHERE job.id = candidate.id
  RETURNING job.*
),
attempt AS (
  INSERT INTO job_attempts (
    id,
    job_id,
    attempt,
    status,
    worker_id,
    started_at,
    heartbeat_at
  )
  SELECT
    $3,
    claimed.id,
    claimed.attempt_count,
    'RUNNING',
    $2,
    job_clock.now,
    job_clock.now
  FROM claimed
  CROSS JOIN job_clock
  RETURNING id, job_id
),
feedback AS (
  UPDATE planning_feedback
  SET
    processing_status = 'PROCESSING',
    processed_at = NULL
  FROM claimed
  WHERE planning_feedback.id = claimed.feedback_id
  RETURNING planning_feedback.id
),
event AS (
  INSERT INTO job_events (id, job_id, type, progress, message, created_at)
  SELECT
    $4,
    claimed.id,
    'CLAIMED',
    claimed.progress,
    'Worker claimed job.',
    job_clock.now
  FROM claimed
  CROSS JOIN job_clock
  RETURNING id
)
SELECT
  claimed.id,
  claimed.trip_id AS "tripId",
  claimed.feedback_id AS "feedbackId",
  claimed.type::text AS "type",
  claimed.status::text AS "status",
  claimed.idempotency_key AS "idempotencyKey",
  claimed.trip_version AS "tripVersion",
  claimed.preference_profile_version_id AS "preferenceProfileVersionId",
  claimed.parent_itinerary_version_id AS "parentItineraryVersionId",
  claimed.payload,
  attempt.id AS "attemptId",
  claimed.attempt_count AS "attempt",
  claimed.max_attempts AS "maxAttempts",
  claimed.worker_id AS "workerId",
  claimed.lease_expires_at AS "leaseExpiresAt",
  claimed.created_at AS "createdAt"
FROM claimed
JOIN attempt ON attempt.job_id = claimed.id
`;

const ENQUEUE_FEEDBACK_JOB_SQL = `
WITH job_clock AS MATERIALIZED (
  SELECT clock_timestamp() AS now
),
inserted AS (
  INSERT INTO generation_jobs (
    id,
    trip_id,
    feedback_id,
    type,
    status,
    idempotency_key,
    trip_version,
    preference_profile_version_id,
    parent_itinerary_version_id,
    payload,
    progress,
    progress_message,
    attempt_count,
    max_attempts,
    available_at,
    created_at,
    updated_at
  )
  VALUES (
    $1,
    $2,
    $3,
    'PROCESS_FEEDBACK_EVENT',
    'PENDING',
    $4,
    $5,
    $6,
    $7,
    $8::jsonb,
    0,
    'Feedback received.',
    0,
    3,
    (SELECT now FROM job_clock),
    (SELECT now FROM job_clock),
    (SELECT now FROM job_clock)
  )
  ON CONFLICT (trip_id, idempotency_key) DO NOTHING
  RETURNING
    id,
    trip_id,
    feedback_id,
    type,
    status,
    trip_version,
    preference_profile_version_id,
    parent_itinerary_version_id,
    payload
),
feedback AS (
  UPDATE planning_feedback
  SET
    processing_status = 'QUEUED',
    processed_at = NULL
  FROM inserted
  WHERE planning_feedback.id = inserted.feedback_id
  RETURNING planning_feedback.id
),
event AS (
  INSERT INTO job_events (id, job_id, type, progress, message, created_at)
  SELECT $9, inserted.id, 'RECEIVED', 0, 'Feedback received.', job_clock.now
  FROM inserted
  CROSS JOIN job_clock
  RETURNING id
)
SELECT
  inserted.id,
  inserted.trip_id AS "tripId",
  inserted.feedback_id AS "feedbackId",
  inserted.type::text AS "type",
  inserted.status::text AS "status",
  inserted.trip_version AS "tripVersion",
  inserted.preference_profile_version_id AS "preferenceProfileVersionId",
  inserted.parent_itinerary_version_id AS "parentItineraryVersionId",
  inserted.payload,
  TRUE AS "created"
FROM inserted
`;

const FIND_ENQUEUED_JOB_SQL = `
SELECT
  id,
  trip_id AS "tripId",
  feedback_id AS "feedbackId",
  type::text AS "type",
  status::text AS "status",
  trip_version AS "tripVersion",
  preference_profile_version_id AS "preferenceProfileVersionId",
  parent_itinerary_version_id AS "parentItineraryVersionId",
  payload,
  FALSE AS "created"
FROM generation_jobs
WHERE trip_id = $1
  AND idempotency_key = $2
LIMIT 1
`;

const HEARTBEAT_SQL = `
WITH job_clock AS MATERIALIZED (
  SELECT clock_timestamp() AS now
),
renewed AS (
  UPDATE generation_jobs
  SET
    heartbeat_at = job_clock.now,
    lease_expires_at =
      job_clock.now + ($4::double precision * INTERVAL '1 millisecond'),
    updated_at = job_clock.now
  FROM job_clock
  WHERE id = $1
    AND status = 'RUNNING'
    AND worker_id = $2
    AND attempt_count = $3
    AND lease_expires_at > job_clock.now
  RETURNING id
),
attempt AS (
  UPDATE job_attempts
  SET heartbeat_at = job_clock.now
  FROM job_clock
  WHERE id = $5
    AND job_id = $1
    AND attempt = $3
    AND status = 'RUNNING'
    AND EXISTS (SELECT 1 FROM renewed)
  RETURNING id
)
SELECT COUNT(*)::int AS applied
FROM renewed
`;

const REPORT_PROGRESS_SQL = `
WITH job_clock AS MATERIALIZED (
  SELECT clock_timestamp() AS now
),
updated AS (
  UPDATE generation_jobs
  SET
    progress = GREATEST(progress, $4),
    progress_message = $5,
    updated_at = job_clock.now
  FROM job_clock
  WHERE id = $1
    AND status = 'RUNNING'
    AND worker_id = $2
    AND attempt_count = $3
    AND lease_expires_at > job_clock.now
  RETURNING id, progress
),
event AS (
  INSERT INTO job_events (
    id,
    job_id,
    type,
    progress,
    message,
    metadata,
    created_at
  )
  SELECT
    $7,
    updated.id,
    $6::"JobEventType",
    updated.progress,
    $5,
    $8::jsonb,
    job_clock.now
  FROM updated
  CROSS JOIN job_clock
  RETURNING id
)
SELECT COUNT(*)::int AS applied
FROM updated
`;

const COMPLETE_JOB_SQL = `
WITH job_clock AS MATERIALIZED (
  SELECT clock_timestamp() AS now
),
updated AS (
  UPDATE generation_jobs
  SET
    status = 'SUCCEEDED',
    result = $4::jsonb,
    progress = 100,
    progress_message = 'Completed.',
    completed_at = job_clock.now,
    heartbeat_at = job_clock.now,
    lease_expires_at = NULL,
    worker_id = NULL,
    error_code = NULL,
    error_message = NULL,
    updated_at = job_clock.now
  FROM job_clock
  WHERE id = $1
    AND status = 'RUNNING'
    AND worker_id = $2
    AND attempt_count = $3
    AND lease_expires_at > job_clock.now
  RETURNING id, feedback_id
),
attempt AS (
  UPDATE job_attempts
  SET
    status = 'SUCCEEDED',
    heartbeat_at = job_clock.now,
    completed_at = job_clock.now
  FROM job_clock
  WHERE id = $5
    AND job_id = $1
    AND attempt = $3
    AND status = 'RUNNING'
    AND EXISTS (SELECT 1 FROM updated)
  RETURNING id
),
feedback AS (
  UPDATE planning_feedback
  SET
    processing_status = 'PROCESSED',
    processed_at = job_clock.now
  FROM updated
  CROSS JOIN job_clock
  WHERE planning_feedback.id = updated.feedback_id
  RETURNING planning_feedback.id
),
event AS (
  INSERT INTO job_events (id, job_id, type, progress, message, created_at)
  SELECT $6, updated.id, 'COMPLETED', 100, 'Completed.', job_clock.now
  FROM updated
  CROSS JOIN job_clock
  RETURNING id
)
SELECT COUNT(*)::int AS applied
FROM updated
`;

const FAIL_JOB_SQL = `
WITH job_clock AS MATERIALIZED (
  SELECT clock_timestamp() AS now
),
updated AS (
  UPDATE generation_jobs
  SET
    status = $4::"GenerationJobStatus",
    available_at = (
      CASE
        WHEN $4::"GenerationJobStatus" = 'RETRYING'
          THEN job_clock.now
            + ($5::double precision * INTERVAL '1 millisecond')
        ELSE available_at
      END
    ),
    progress_message = $6,
    completed_at = (
      CASE
        WHEN $4::"GenerationJobStatus" = 'RETRYING' THEN NULL
        ELSE job_clock.now
      END
    ),
    heartbeat_at = job_clock.now,
    lease_expires_at = NULL,
    worker_id = NULL,
    error_code = $7,
    error_message = $8,
    updated_at = job_clock.now
  FROM job_clock
  WHERE id = $1
    AND status = 'RUNNING'
    AND worker_id = $2
    AND attempt_count = $3
    AND lease_expires_at > job_clock.now
  RETURNING id, feedback_id, status, available_at
),
attempt AS (
  UPDATE job_attempts
  SET
    status = 'FAILED',
    heartbeat_at = job_clock.now,
    completed_at = job_clock.now,
    error_code = $7,
    error_message = $8
  FROM job_clock
  WHERE id = $9
    AND job_id = $1
    AND attempt = $3
    AND status = 'RUNNING'
    AND EXISTS (SELECT 1 FROM updated)
  RETURNING id
),
feedback AS (
  UPDATE planning_feedback
  SET
    processing_status = (
      CASE
        WHEN updated.status = 'RETRYING' THEN 'PROCESSING'
        ELSE 'FAILED'
      END
    )::"FeedbackProcessingStatus",
    processed_at = (
      CASE
        WHEN updated.status = 'RETRYING' THEN NULL
        ELSE job_clock.now
      END
    )
  FROM updated
  CROSS JOIN job_clock
  WHERE planning_feedback.id = updated.feedback_id
  RETURNING planning_feedback.id
),
event AS (
  INSERT INTO job_events (id, job_id, type, progress, message, created_at)
  SELECT $10, updated.id, $11::"JobEventType", NULL, $6, job_clock.now
  FROM updated
  CROSS JOIN job_clock
  RETURNING id
)
SELECT
  COUNT(*)::int AS applied,
  MAX(available_at) AS "availableAt"
FROM updated
`;

const SUPERSEDE_JOB_SQL = `
WITH job_clock AS MATERIALIZED (
  SELECT clock_timestamp() AS now
),
updated AS (
  UPDATE generation_jobs
  SET
    status = 'SUPERSEDED',
    result = $4::jsonb,
    progress_message = 'Superseded by newer planning state.',
    completed_at = job_clock.now,
    heartbeat_at = job_clock.now,
    lease_expires_at = NULL,
    worker_id = NULL,
    error_code = 'STALE_JOB_VERSION',
    error_message = NULL,
    updated_at = job_clock.now
  FROM job_clock
  WHERE id = $1
    AND status = 'RUNNING'
    AND worker_id = $2
    AND attempt_count = $3
    AND lease_expires_at > job_clock.now
  RETURNING id, feedback_id
),
attempt AS (
  UPDATE job_attempts
  SET
    status = 'SUPERSEDED',
    heartbeat_at = job_clock.now,
    completed_at = job_clock.now,
    error_code = 'STALE_JOB_VERSION'
  FROM job_clock
  WHERE id = $5
    AND job_id = $1
    AND attempt = $3
    AND status = 'RUNNING'
    AND EXISTS (SELECT 1 FROM updated)
  RETURNING id
),
feedback AS (
  UPDATE planning_feedback
  SET
    processing_status = 'SUPERSEDED',
    processed_at = job_clock.now
  FROM updated
  CROSS JOIN job_clock
  WHERE planning_feedback.id = updated.feedback_id
  RETURNING planning_feedback.id
),
event AS (
  INSERT INTO job_events (id, job_id, type, progress, message, created_at)
  SELECT
    $6,
    updated.id,
    'SUPERSEDED',
    NULL,
    'Superseded by newer planning state.',
    job_clock.now
  FROM updated
  CROSS JOIN job_clock
  RETURNING id
)
SELECT COUNT(*)::int AS applied
FROM updated
`;

const RELEASE_CLAIM_SQL = `
WITH job_clock AS MATERIALIZED (
  SELECT clock_timestamp() AS now
),
released AS (
  UPDATE generation_jobs
  SET
    status = 'RETRYING',
    max_attempts = generation_jobs.max_attempts + 1,
    available_at = job_clock.now,
    progress_message = 'Worker shutdown; job requeued.',
    claimed_at = NULL,
    heartbeat_at = NULL,
    lease_expires_at = NULL,
    worker_id = NULL,
    completed_at = NULL,
    error_code = 'WORKER_SHUTDOWN',
    error_message = NULL,
    updated_at = job_clock.now
  FROM job_clock
  WHERE generation_jobs.id = $1
    AND generation_jobs.status = 'RUNNING'
    AND generation_jobs.worker_id = $2
    AND generation_jobs.attempt_count = $3
    AND generation_jobs.lease_expires_at > job_clock.now
    AND EXISTS (
      SELECT 1
      FROM job_attempts
      WHERE job_attempts.id = $4
        AND job_attempts.job_id = generation_jobs.id
        AND job_attempts.attempt = generation_jobs.attempt_count
        AND job_attempts.status = 'RUNNING'
    )
  RETURNING
    generation_jobs.id,
    generation_jobs.feedback_id,
    generation_jobs.progress
),
attempt AS (
  UPDATE job_attempts
  SET
    status = 'ABANDONED',
    completed_at = job_clock.now,
    error_code = 'WORKER_SHUTDOWN',
    error_message = NULL
  FROM released
  CROSS JOIN job_clock
  WHERE job_attempts.id = $4
    AND job_attempts.job_id = released.id
    AND job_attempts.status = 'RUNNING'
  RETURNING job_attempts.id
),
feedback AS (
  UPDATE planning_feedback
  SET
    processing_status = 'QUEUED',
    processed_at = NULL
  FROM released
  WHERE planning_feedback.id = released.feedback_id
  RETURNING planning_feedback.id
),
event AS (
  INSERT INTO job_events (id, job_id, type, progress, message, created_at)
  SELECT
    $5,
    released.id,
    'RECOVERED',
    released.progress,
    'Worker shutdown before execution; job requeued.',
    job_clock.now
  FROM released
  CROSS JOIN job_clock
  RETURNING id
)
SELECT COUNT(*)::int AS applied
FROM released
`;

const RECOVER_EXPIRED_CLAIMS_SQL = `
WITH job_clock AS MATERIALIZED (
  SELECT clock_timestamp() AS now
),
expired AS (
  SELECT job.id, job.attempt_count, job.max_attempts
  FROM generation_jobs AS job
  CROSS JOIN job_clock
  WHERE job.status = 'RUNNING'
    AND job.lease_expires_at <= job_clock.now
  ORDER BY job.lease_expires_at ASC, job.id ASC
  LIMIT 100
  FOR UPDATE OF job SKIP LOCKED
),
attempt AS (
  UPDATE job_attempts
  SET
    status = 'ABANDONED',
    completed_at = job_clock.now,
    error_code = 'LEASE_EXPIRED',
    error_message = 'The worker lease expired before completion.'
  FROM expired
  CROSS JOIN job_clock
  WHERE job_attempts.job_id = expired.id
    AND job_attempts.attempt = expired.attempt_count
    AND job_attempts.status = 'RUNNING'
  RETURNING job_attempts.id
),
updated AS (
  UPDATE generation_jobs AS job
  SET
    status = (
      CASE
        WHEN expired.attempt_count >= expired.max_attempts
          THEN 'DEAD_LETTERED'
        ELSE 'RETRYING'
      END
    )::"GenerationJobStatus",
    available_at = (
      CASE
        WHEN expired.attempt_count = 1
          THEN job_clock.now + INTERVAL '5 seconds'
        WHEN expired.attempt_count = 2
          THEN job_clock.now + INTERVAL '20 seconds'
        ELSE job_clock.now + INTERVAL '60 seconds'
      END
    ),
    progress_message = (
      CASE
        WHEN expired.attempt_count >= expired.max_attempts
          THEN 'Worker lease expired; retry limit reached.'
        ELSE 'Worker lease expired; retry scheduled.'
      END
    ),
    claimed_at = NULL,
    heartbeat_at = NULL,
    lease_expires_at = NULL,
    worker_id = NULL,
    completed_at = (
      CASE
        WHEN expired.attempt_count >= expired.max_attempts
          THEN job_clock.now
        ELSE NULL
      END
    ),
    error_code = 'LEASE_EXPIRED',
    error_message = 'The worker lease expired before completion.',
    updated_at = job_clock.now
  FROM expired
  CROSS JOIN job_clock
  WHERE job.id = expired.id
  RETURNING
    job.id,
    job.feedback_id,
    job.status,
    job.progress,
    job.attempt_count
),
feedback AS (
  UPDATE planning_feedback
  SET
    processing_status = (
      CASE
        WHEN updated.status = 'DEAD_LETTERED' THEN 'FAILED'
        ELSE 'PROCESSING'
      END
    )::"FeedbackProcessingStatus",
    processed_at = (
      CASE
        WHEN updated.status = 'DEAD_LETTERED' THEN job_clock.now
        ELSE NULL
      END
    )
  FROM updated
  CROSS JOIN job_clock
  WHERE planning_feedback.id = updated.feedback_id
  RETURNING planning_feedback.id
),
event AS (
  INSERT INTO job_events (id, job_id, type, progress, message, created_at)
  SELECT
    'evt_' || md5(updated.id || ':' || updated.attempt_count::text || ':recovery'),
    updated.id,
    (
      CASE
        WHEN updated.status = 'DEAD_LETTERED' THEN 'DEAD_LETTERED'
        ELSE 'RECOVERED'
      END
    )::"JobEventType",
    updated.progress,
    (
      CASE
        WHEN updated.status = 'DEAD_LETTERED'
          THEN 'Worker lease expired; retry limit reached.'
        ELSE 'Expired worker claim recovered.'
      END
    ),
    job_clock.now
  FROM updated
  CROSS JOIN job_clock
  RETURNING id
)
SELECT
  COUNT(*) FILTER (WHERE status = 'RETRYING')::int AS recovered,
  COUNT(*) FILTER (WHERE status = 'DEAD_LETTERED')::int AS "deadLettered"
FROM updated
`;

function positiveCount(rows: AppliedRow[]) {
  return Number(rows[0]?.applied ?? 0) > 0;
}

function positiveDurationMs(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer.`);
  }

  return value;
}

function assertIdentifier(value: string, label: string) {
  const normalized = value.trim();

  if (!normalized || normalized.length > 128) {
    throw new TypeError(`${label} must contain 1 to 128 characters.`);
  }

  return normalized;
}

function asGenerationJobType(value: string): GenerationJobType {
  if ((GENERATION_JOB_TYPES as readonly string[]).includes(value)) {
    return value as GenerationJobType;
  }

  throw new TypeError(`Unsupported generation job type: ${value}`);
}

function serializeJson(value: JsonValue) {
  return JSON.stringify(value);
}

export class JobIdempotencyConflictError extends Error {
  readonly code = "JOB_IDEMPOTENCY_CONFLICT";

  constructor() {
    super("The idempotency key belongs to a different job request.");
    this.name = "JobIdempotencyConflictError";
  }
}

async function defaultDatabaseProvider(): Promise<JobDatabaseClient> {
  const { getDb } = await import("@/lib/db");
  return getDb() as unknown as JobDatabaseClient;
}

export class PostgresGenerationJobStore implements GenerationJobStore {
  constructor(
    private readonly databaseProvider: JobDatabaseProvider = defaultDatabaseProvider,
  ) {}

  private async database() {
    return this.databaseProvider();
  }

  async enqueueFeedbackJob(
    input: EnqueueFeedbackJobInput,
  ): Promise<EnqueuedGenerationJob> {
    const database = await this.database();
    const tripId = assertIdentifier(input.tripId, "tripId");
    const feedbackId = assertIdentifier(input.feedbackId, "feedbackId");
    const idempotencyKey = assertIdentifier(
      input.idempotencyKey,
      "idempotencyKey",
    );
    const payload = parseJobPayload("PROCESS_FEEDBACK_EVENT", input.payload);

    if (
      input.tripVersion !== payload.tripVersion ||
      input.preferenceProfileVersionId !== payload.preferenceProfileVersionId ||
      input.parentItineraryVersionId !== payload.parentItineraryVersionId ||
      feedbackId !== payload.feedbackId
    ) {
      throw new TypeError(
        "The job row versions and identifiers must match its payload.",
      );
    }

    const rows = await database.$queryRawUnsafe<EnqueueRow[]>(
      ENQUEUE_FEEDBACK_JOB_SQL,
      randomUUID(),
      tripId,
      feedbackId,
      idempotencyKey,
      input.tripVersion,
      input.preferenceProfileVersionId,
      input.parentItineraryVersionId,
      JSON.stringify(payload),
      randomUUID(),
    );

    const row =
      rows[0] ??
      (
        await database.$queryRawUnsafe<EnqueueRow[]>(
          FIND_ENQUEUED_JOB_SQL,
          tripId,
          idempotencyKey,
        )
      )[0];

    if (!row) {
      throw new Error("The feedback job could not be created or recovered.");
    }

    const existingPayload = parseJobPayload(
      "PROCESS_FEEDBACK_EVENT",
      row.payload,
    );

    if (
      row.type !== "PROCESS_FEEDBACK_EVENT" ||
      row.feedbackId !== feedbackId ||
      row.tripVersion !== input.tripVersion ||
      row.preferenceProfileVersionId !== input.preferenceProfileVersionId ||
      row.parentItineraryVersionId !== input.parentItineraryVersionId ||
      existingPayload.operationId !== payload.operationId
    ) {
      throw new JobIdempotencyConflictError();
    }

    return {
      id: row.id,
      tripId: row.tripId,
      type: "PROCESS_FEEDBACK_EVENT",
      status: row.status,
      created: row.created,
    };
  }

  async claimNext(
    input: ClaimNextJobInput,
  ): Promise<ClaimedGenerationJob | null> {
    const database = await this.database();
    const workerId = assertIdentifier(input.workerId, "workerId");
    const leaseDurationMs = positiveDurationMs(
      input.leaseDurationMs ?? JOB_LEASE_DURATION_MS,
      "leaseDurationMs",
    );
    const rows = await database.$queryRawUnsafe<ClaimRow[]>(
      CLAIM_NEXT_JOB_SQL,
      leaseDurationMs,
      workerId,
      randomUUID(),
      randomUUID(),
    );
    const row = rows[0];

    if (!row) return null;

    const type = asGenerationJobType(row.type);

    return {
      id: row.id,
      tripId: row.tripId,
      feedbackId: row.feedbackId,
      type,
      status: "RUNNING",
      idempotencyKey: row.idempotencyKey,
      tripVersion: row.tripVersion,
      preferenceProfileVersionId: row.preferenceProfileVersionId,
      parentItineraryVersionId: row.parentItineraryVersionId,
      payload: parseJobPayload(type, row.payload),
      attemptId: row.attemptId,
      attempt: row.attempt,
      maxAttempts: row.maxAttempts,
      workerId: row.workerId,
      leaseExpiresAt:
        row.leaseExpiresAt instanceof Date
          ? row.leaseExpiresAt
          : new Date(row.leaseExpiresAt),
      ...(row.createdAt
        ? {
            createdAt:
              row.createdAt instanceof Date
                ? row.createdAt
                : new Date(row.createdAt),
          }
        : {}),
    };
  }

  async heartbeat(
    claim: JobClaimReference,
    leaseDurationMs = JOB_LEASE_DURATION_MS,
  ) {
    const database = await this.database();
    const rows = await database.$queryRawUnsafe<AppliedRow[]>(
      HEARTBEAT_SQL,
      claim.id,
      claim.workerId,
      claim.attempt,
      positiveDurationMs(leaseDurationMs, "leaseDurationMs"),
      claim.attemptId,
    );

    return positiveCount(rows);
  }

  async release(claim: JobClaimReference) {
    const database = await this.database();
    const rows = await database.$queryRawUnsafe<AppliedRow[]>(
      RELEASE_CLAIM_SQL,
      claim.id,
      claim.workerId,
      claim.attempt,
      claim.attemptId,
      randomUUID(),
    );

    return positiveCount(rows);
  }

  async reportProgress(input: ReportJobProgressInput) {
    if (
      !Number.isInteger(input.progress) ||
      input.progress < 0 ||
      input.progress > 99
    ) {
      throw new RangeError("Job progress must be an integer from 0 to 99.");
    }

    const database = await this.database();
    const message = boundedProgressMessage(input.message);
    const metadata = input.metadata ?? null;
    assertBoundedJson(
      metadata,
      MAX_JOB_EVENT_METADATA_BYTES,
      "job event metadata",
    );
    const rows = await database.$queryRawUnsafe<AppliedRow[]>(
      REPORT_PROGRESS_SQL,
      input.claim.id,
      input.claim.workerId,
      input.claim.attempt,
      input.progress,
      message,
      input.type,
      randomUUID(),
      JSON.stringify(metadata),
    );

    return positiveCount(rows);
  }

  async complete(claim: JobClaimReference, result: JsonValue) {
    assertBoundedJson(result, MAX_JOB_RESULT_BYTES, "job result");
    const database = await this.database();
    const rows = await database.$queryRawUnsafe<AppliedRow[]>(
      COMPLETE_JOB_SQL,
      claim.id,
      claim.workerId,
      claim.attempt,
      serializeJson(result),
      claim.attemptId,
      randomUUID(),
    );

    return positiveCount(rows);
  }

  async fail(
    claim: JobClaimReference,
    failure: JobFailure,
  ): Promise<JobFailureResult> {
    const plan = failurePlan({
      failedAttempt: claim.attempt,
      maxAttempts: claim.maxAttempts,
      retryable: failure.retryable,
    });
    const database = await this.database();
    const code = boundedErrorCode(failure.code);
    const message = boundedErrorMessage(failure.message);
    const progressMessage =
      plan.status === "RETRYING"
        ? "Attempt failed; retry scheduled."
        : plan.status === "DEAD_LETTERED"
          ? "Retry limit reached."
          : "Processing failed.";
    const eventType =
      plan.status === "RETRYING" ? "RETRY_SCHEDULED" : plan.status;
    const rows = await database.$queryRawUnsafe<FailureAppliedRow[]>(
      FAIL_JOB_SQL,
      claim.id,
      claim.workerId,
      claim.attempt,
      plan.status,
      plan.delayMs,
      progressMessage,
      code,
      message,
      claim.attemptId,
      randomUUID(),
      eventType,
    );

    return {
      applied: positiveCount(rows),
      status: plan.status,
      availableAt:
        plan.status === "RETRYING" && rows[0]?.availableAt
          ? rows[0].availableAt instanceof Date
            ? rows[0].availableAt
            : new Date(rows[0].availableAt)
          : null,
      delayMs: plan.delayMs,
    };
  }

  async supersede(claim: JobClaimReference, result: JsonValue = null) {
    assertBoundedJson(result, MAX_JOB_RESULT_BYTES, "job result");
    const database = await this.database();
    const rows = await database.$queryRawUnsafe<AppliedRow[]>(
      SUPERSEDE_JOB_SQL,
      claim.id,
      claim.workerId,
      claim.attempt,
      serializeJson(result),
      claim.attemptId,
      randomUUID(),
    );

    return positiveCount(rows);
  }

  async recoverExpiredClaims(): Promise<JobRecoveryResult> {
    const database = await this.database();
    const rows = await database.$queryRawUnsafe<
      Array<{ recovered: number | bigint; deadLettered: number | bigint }>
    >(RECOVER_EXPIRED_CLAIMS_SQL);

    return {
      recovered: Number(rows[0]?.recovered ?? 0),
      deadLettered: Number(rows[0]?.deadLettered ?? 0),
    };
  }
}

export function createPostgresGenerationJobStore(
  databaseProvider?: JobDatabaseProvider,
) {
  return new PostgresGenerationJobStore(databaseProvider);
}

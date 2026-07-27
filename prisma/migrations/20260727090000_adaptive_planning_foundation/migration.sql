-- Adaptive planning foundation: immutable feedback context, versioned preferences
-- and itineraries, plus a PostgreSQL-backed durable job queue.

CREATE TYPE "PreferenceSignalSource" AS ENUM ('EXPLICIT', 'INFERRED', 'DEFAULT');
CREATE TYPE "FeedbackProcessingStatus" AS ENUM ('RECORDED', 'QUEUED', 'PROCESSING', 'PROCESSED', 'FAILED', 'SUPERSEDED');
CREATE TYPE "ItineraryVersionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUPERSEDED', 'FAILED');
CREATE TYPE "ItineraryChangeScope" AS ENUM ('INITIAL', 'ITEM', 'DAY', 'FULL', 'MIGRATED');
CREATE TYPE "GenerationJobType" AS ENUM ('PROCESS_FEEDBACK_EVENT');
CREATE TYPE "GenerationJobStatus" AS ENUM ('PENDING', 'RUNNING', 'RETRYING', 'SUCCEEDED', 'FAILED', 'DEAD_LETTERED', 'SUPERSEDED');
CREATE TYPE "JobAttemptStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'ABANDONED', 'SUPERSEDED');
CREATE TYPE "JobEventType" AS ENUM ('RECEIVED', 'CLAIMED', 'UPDATING_PREFERENCES', 'FINDING_REPLACEMENT', 'VALIDATING_ITINERARY', 'RETRY_SCHEDULED', 'COMPLETED', 'FAILED', 'DEAD_LETTERED', 'SUPERSEDED', 'RECOVERED');

ALTER TABLE "trips"
  ADD COLUMN "trip_version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "active_preference_profile_version_id" TEXT,
  ADD COLUMN "active_itinerary_version_id" TEXT;

ALTER TABLE "planning_feedback"
  ADD COLUMN "event_key" VARCHAR(128),
  ADD COLUMN "user_id" TEXT,
  ADD COLUMN "captured_trip_version" INTEGER,
  ADD COLUMN "captured_preference_profile_version_id" TEXT,
  ADD COLUMN "captured_itinerary_version_id" TEXT,
  ADD COLUMN "processing_status" "FeedbackProcessingStatus" NOT NULL DEFAULT 'RECORDED',
  ADD COLUMN "processed_at" TIMESTAMP(3);

ALTER TABLE "itinerary_days"
  ADD COLUMN "itinerary_version_id" TEXT;

ALTER TABLE "conflicts"
  ADD COLUMN "itinerary_version_id" TEXT;

CREATE TABLE "preference_profile_versions" (
  "id" TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "parent_version_id" TEXT,
  "source_feedback_id" TEXT,
  "snapshot" JSONB NOT NULL,
  "delta" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "preference_profile_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "itinerary_versions" (
  "id" TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "parent_version_id" TEXT,
  "preference_profile_version_id" TEXT,
  "source_job_id" TEXT,
  "status" "ItineraryVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "change_scope" "ItineraryChangeScope" NOT NULL DEFAULT 'FULL',
  "change_summary" JSONB,
  "activated_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "itinerary_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "generation_jobs" (
  "id" TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "feedback_id" TEXT,
  "type" "GenerationJobType" NOT NULL,
  "status" "GenerationJobStatus" NOT NULL DEFAULT 'PENDING',
  "idempotency_key" VARCHAR(128) NOT NULL,
  "trip_version" INTEGER NOT NULL,
  "preference_profile_version_id" TEXT,
  "parent_itinerary_version_id" TEXT,
  "payload" JSONB NOT NULL,
  "result" JSONB,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "progress_message" VARCHAR(240),
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 3,
  "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimed_at" TIMESTAMP(3),
  "heartbeat_at" TIMESTAMP(3),
  "lease_expires_at" TIMESTAMP(3),
  "worker_id" VARCHAR(128),
  "completed_at" TIMESTAMP(3),
  "error_code" VARCHAR(64),
  "error_message" VARCHAR(500),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "generation_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "job_attempts" (
  "id" TEXT NOT NULL,
  "job_id" TEXT NOT NULL,
  "attempt" INTEGER NOT NULL,
  "status" "JobAttemptStatus" NOT NULL DEFAULT 'RUNNING',
  "worker_id" VARCHAR(128) NOT NULL,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "heartbeat_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "error_code" VARCHAR(64),
  "error_message" VARCHAR(500),
  CONSTRAINT "job_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "job_events" (
  "id" TEXT NOT NULL,
  "job_id" TEXT NOT NULL,
  "type" "JobEventType" NOT NULL,
  "progress" INTEGER,
  "message" VARCHAR(240),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "job_events_pkey" PRIMARY KEY ("id")
);

-- Preserve the existing mutable preference projection while introducing an
-- append-only, validated snapshot history.
INSERT INTO "preference_profile_versions" (
  "id",
  "trip_id",
  "version",
  "snapshot",
  "delta",
  "created_at"
)
SELECT
  'prefv_migrated_' || p."trip_id",
  p."trip_id",
  1,
  jsonb_build_object(
    'schemaVersion', 1,
    'interests',
    COALESCE(
      (
        SELECT jsonb_object_agg(
          interest,
          jsonb_build_object(
            'weight', 1.0,
            'confidence', 1.0,
            'source', 'EXPLICIT',
            'observedAt', to_char(
              p."updated_at",
              'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
            )
          )
        )
        FROM unnest(p."interests") AS interest
      ),
      '{}'::jsonb
    ),
    'priceSensitivity',
    jsonb_build_object(
      'weight', 0.5,
      'confidence', 0.0,
      'source', 'DEFAULT',
      'observedAt', to_char(
        p."updated_at",
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      )
    ),
    'pace',
    CASE
      WHEN p."pace" IS NULL THEN 'null'::jsonb
      ELSE jsonb_build_object(
        'value', p."pace",
        'confidence', 1.0,
        'source', 'EXPLICIT',
        'observedAt', to_char(
          p."updated_at",
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        )
      )
    )
  ),
  jsonb_build_object('kind', 'MIGRATED'),
  p."updated_at"
FROM "trip_preferences" p;

UPDATE "trips" t
SET "active_preference_profile_version_id" = v."id"
FROM "preference_profile_versions" v
WHERE v."trip_id" = t."id" AND v."version" = 1;

-- Create one active version for every existing persisted itinerary and attach
-- generated rows without rewriting their user-visible content.
INSERT INTO "itinerary_versions" (
  "id",
  "trip_id",
  "version",
  "preference_profile_version_id",
  "status",
  "change_scope",
  "change_summary",
  "activated_at",
  "created_at"
)
SELECT
  'itv_migrated_' || t."id",
  t."id",
  1,
  t."active_preference_profile_version_id",
  'ACTIVE',
  'MIGRATED',
  jsonb_build_object('kind', 'MIGRATED'),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "trips" t
WHERE EXISTS (
  SELECT 1 FROM "itinerary_days" d WHERE d."trip_id" = t."id"
)
OR EXISTS (
  SELECT 1 FROM "conflicts" c WHERE c."trip_id" = t."id"
);

UPDATE "trips" t
SET "active_itinerary_version_id" = v."id"
FROM "itinerary_versions" v
WHERE v."trip_id" = t."id" AND v."version" = 1;

UPDATE "itinerary_days" d
SET "itinerary_version_id" = t."active_itinerary_version_id"
FROM "trips" t
WHERE d."trip_id" = t."id";

UPDATE "conflicts" c
SET "itinerary_version_id" = COALESCE(
  (
    SELECT d."itinerary_version_id"
    FROM "itinerary_items" i
    JOIN "itinerary_days" d ON d."id" = i."day_id"
    WHERE i."id" = c."itinerary_item_id"
  ),
  (
    SELECT t."active_itinerary_version_id"
    FROM "trips" t
    WHERE t."id" = c."trip_id"
  )
);

ALTER TABLE "itinerary_days"
  ALTER COLUMN "itinerary_version_id" SET NOT NULL;
ALTER TABLE "conflicts"
  ALTER COLUMN "itinerary_version_id" SET NOT NULL;

DROP INDEX "itinerary_days_trip_id_day_number_key";

CREATE UNIQUE INDEX "preference_profile_versions_trip_id_id_key"
  ON "preference_profile_versions"("trip_id", "id");
CREATE UNIQUE INDEX "preference_profile_versions_trip_id_version_key"
  ON "preference_profile_versions"("trip_id", "version");
CREATE UNIQUE INDEX "preference_profile_versions_trip_id_source_feedback_id_key"
  ON "preference_profile_versions"("trip_id", "source_feedback_id");
CREATE INDEX "preference_profile_versions_trip_id_created_at_idx"
  ON "preference_profile_versions"("trip_id", "created_at");
CREATE INDEX "preference_profile_versions_parent_version_id_idx"
  ON "preference_profile_versions"("parent_version_id");

CREATE UNIQUE INDEX "itinerary_versions_trip_id_id_key"
  ON "itinerary_versions"("trip_id", "id");
CREATE UNIQUE INDEX "itinerary_versions_trip_id_version_key"
  ON "itinerary_versions"("trip_id", "version");
CREATE UNIQUE INDEX "itinerary_versions_trip_id_source_job_id_key"
  ON "itinerary_versions"("trip_id", "source_job_id");
CREATE INDEX "itinerary_versions_trip_id_status_created_at_idx"
  ON "itinerary_versions"("trip_id", "status", "created_at");
CREATE INDEX "itinerary_versions_parent_version_id_idx"
  ON "itinerary_versions"("parent_version_id");
CREATE INDEX "itinerary_versions_preference_profile_version_id_idx"
  ON "itinerary_versions"("preference_profile_version_id");

CREATE UNIQUE INDEX "generation_jobs_trip_id_idempotency_key_key"
  ON "generation_jobs"("trip_id", "idempotency_key");
CREATE UNIQUE INDEX "generation_jobs_trip_id_id_key"
  ON "generation_jobs"("trip_id", "id");
CREATE INDEX "generation_jobs_status_available_at_idx"
  ON "generation_jobs"("status", "available_at");
CREATE INDEX "generation_jobs_status_lease_expires_at_idx"
  ON "generation_jobs"("status", "lease_expires_at");
CREATE INDEX "generation_jobs_trip_id_created_at_idx"
  ON "generation_jobs"("trip_id", "created_at");
CREATE INDEX "generation_jobs_feedback_id_idx"
  ON "generation_jobs"("feedback_id");

CREATE UNIQUE INDEX "job_attempts_job_id_attempt_key"
  ON "job_attempts"("job_id", "attempt");
CREATE INDEX "job_attempts_job_id_started_at_idx"
  ON "job_attempts"("job_id", "started_at");
CREATE INDEX "job_events_job_id_created_at_idx"
  ON "job_events"("job_id", "created_at");

CREATE UNIQUE INDEX "planning_feedback_trip_id_event_key_key"
  ON "planning_feedback"("trip_id", "event_key");
CREATE UNIQUE INDEX "planning_feedback_trip_id_id_key"
  ON "planning_feedback"("trip_id", "id");
CREATE INDEX "planning_feedback_user_id_idx"
  ON "planning_feedback"("user_id");
CREATE INDEX "planning_feedback_processing_status_idx"
  ON "planning_feedback"("processing_status");
CREATE UNIQUE INDEX "itinerary_days_itinerary_version_id_day_number_key"
  ON "itinerary_days"("itinerary_version_id", "day_number");
CREATE INDEX "itinerary_days_itinerary_version_id_idx"
  ON "itinerary_days"("itinerary_version_id");
CREATE INDEX "conflicts_itinerary_version_id_idx"
  ON "conflicts"("itinerary_version_id");
CREATE INDEX "trips_active_preference_profile_version_id_idx"
  ON "trips"("active_preference_profile_version_id");
CREATE INDEX "trips_active_itinerary_version_id_idx"
  ON "trips"("active_itinerary_version_id");

ALTER TABLE "preference_profile_versions"
  ADD CONSTRAINT "preference_profile_versions_trip_id_fkey"
  FOREIGN KEY ("trip_id") REFERENCES "trips"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "preference_profile_versions"
  ADD CONSTRAINT "preference_profile_versions_parent_version_id_fkey"
  FOREIGN KEY ("trip_id", "parent_version_id")
  REFERENCES "preference_profile_versions"("trip_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "preference_profile_versions"
  ADD CONSTRAINT "preference_profile_versions_source_feedback_id_fkey"
  FOREIGN KEY ("trip_id", "source_feedback_id")
  REFERENCES "planning_feedback"("trip_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "itinerary_versions"
  ADD CONSTRAINT "itinerary_versions_trip_id_fkey"
  FOREIGN KEY ("trip_id") REFERENCES "trips"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "itinerary_versions"
  ADD CONSTRAINT "itinerary_versions_parent_version_id_fkey"
  FOREIGN KEY ("trip_id", "parent_version_id")
  REFERENCES "itinerary_versions"("trip_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "itinerary_versions"
  ADD CONSTRAINT "itinerary_versions_preference_profile_version_id_fkey"
  FOREIGN KEY ("trip_id", "preference_profile_version_id")
  REFERENCES "preference_profile_versions"("trip_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "trips"
  ADD CONSTRAINT "trips_active_preference_profile_version_id_fkey"
  FOREIGN KEY ("id", "active_preference_profile_version_id")
  REFERENCES "preference_profile_versions"("trip_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "trips"
  ADD CONSTRAINT "trips_active_itinerary_version_id_fkey"
  FOREIGN KEY ("id", "active_itinerary_version_id")
  REFERENCES "itinerary_versions"("trip_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "planning_feedback"
  ADD CONSTRAINT "planning_feedback_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "planning_feedback"
  ADD CONSTRAINT "planning_feedback_captured_preference_profile_version_id_fkey"
  FOREIGN KEY ("trip_id", "captured_preference_profile_version_id")
  REFERENCES "preference_profile_versions"("trip_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "planning_feedback"
  ADD CONSTRAINT "planning_feedback_captured_itinerary_version_id_fkey"
  FOREIGN KEY ("trip_id", "captured_itinerary_version_id")
  REFERENCES "itinerary_versions"("trip_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "itinerary_days"
  ADD CONSTRAINT "itinerary_days_itinerary_version_id_fkey"
  FOREIGN KEY ("trip_id", "itinerary_version_id")
  REFERENCES "itinerary_versions"("trip_id", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conflicts"
  ADD CONSTRAINT "conflicts_itinerary_version_id_fkey"
  FOREIGN KEY ("trip_id", "itinerary_version_id")
  REFERENCES "itinerary_versions"("trip_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "generation_jobs"
  ADD CONSTRAINT "generation_jobs_trip_id_fkey"
  FOREIGN KEY ("trip_id") REFERENCES "trips"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "generation_jobs"
  ADD CONSTRAINT "generation_jobs_feedback_id_fkey"
  FOREIGN KEY ("trip_id", "feedback_id")
  REFERENCES "planning_feedback"("trip_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "generation_jobs"
  ADD CONSTRAINT "generation_jobs_preference_profile_version_id_fkey"
  FOREIGN KEY ("trip_id", "preference_profile_version_id")
  REFERENCES "preference_profile_versions"("trip_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "generation_jobs"
  ADD CONSTRAINT "generation_jobs_parent_itinerary_version_id_fkey"
  FOREIGN KEY ("trip_id", "parent_itinerary_version_id")
  REFERENCES "itinerary_versions"("trip_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "itinerary_versions"
  ADD CONSTRAINT "itinerary_versions_source_job_id_fkey"
  FOREIGN KEY ("trip_id", "source_job_id")
  REFERENCES "generation_jobs"("trip_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "job_attempts"
  ADD CONSTRAINT "job_attempts_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "generation_jobs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_events"
  ADD CONSTRAINT "job_events_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "generation_jobs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Stage 0 planning revision and idempotent mutation ledger.
ALTER TABLE "trips"
ADD COLUMN "planning_revision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "planning_mutations" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "operation_id" VARCHAR(128) NOT NULL,
    "kind" VARCHAR(64) NOT NULL,
    "requested_revision" INTEGER,
    "resulting_revision" INTEGER NOT NULL,
    "result_version" INTEGER NOT NULL DEFAULT 1,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planning_mutations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "planning_mutations_trip_id_operation_id_key"
ON "planning_mutations"("trip_id", "operation_id");

CREATE INDEX "planning_mutations_trip_id_created_at_idx"
ON "planning_mutations"("trip_id", "created_at");

ALTER TABLE "planning_mutations"
ADD CONSTRAINT "planning_mutations_trip_id_fkey"
FOREIGN KEY ("trip_id") REFERENCES "trips"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

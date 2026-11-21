-- CreateTable
CREATE TABLE "wording_records" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "trip_id" TEXT NOT NULL,
    "subject" VARCHAR(160) NOT NULL,
    "facts_key" VARCHAR(64) NOT NULL,
    "sentences" JSONB NOT NULL,
    "shown" TEXT NOT NULL,
    "worded_by" VARCHAR(10) NOT NULL,
    "fallback" VARCHAR(40),
    "model" VARCHAR(40),
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wording_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wording_records_trip_id_subject_facts_key_worded_by_key" ON "wording_records"("trip_id", "subject", "facts_key", "worded_by");

-- AddForeignKey
ALTER TABLE "wording_records" ADD CONSTRAINT "wording_records_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;


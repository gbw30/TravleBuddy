-- CreateTable
CREATE TABLE "profiles" (
    "user_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "learn_after" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "profile_entries" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "user_id" TEXT NOT NULL,
    "topic" VARCHAR(30) NOT NULL,
    "value" VARCHAR(80) NOT NULL,
    "sureness" VARCHAR(10) NOT NULL,
    "source_trip_id" TEXT,
    "source_trip_title" VARCHAR(120),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_notes" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "user_id" TEXT NOT NULL,
    "text" VARCHAR(300) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_history" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT,
    "trip_id" TEXT,
    "revision" INTEGER,
    "topic" VARCHAR(30) NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "cause" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forgotten_evidence" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "user_id" TEXT NOT NULL,
    "topic" VARCHAR(30) NOT NULL,
    "value" VARCHAR(80) NOT NULL,
    "trip_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "forgotten_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profile_entries_user_id_topic_value_key" ON "profile_entries"("user_id", "topic", "value");

-- CreateIndex
CREATE INDEX "profile_notes_user_id_idx" ON "profile_notes"("user_id");

-- CreateIndex
CREATE INDEX "profile_history_user_id_id_idx" ON "profile_history"("user_id", "id");

-- CreateIndex
CREATE INDEX "profile_history_trip_id_id_idx" ON "profile_history"("trip_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "forgotten_evidence_user_id_topic_value_key" ON "forgotten_evidence"("user_id", "topic", "value");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_entries" ADD CONSTRAINT "profile_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_notes" ADD CONSTRAINT "profile_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_history" ADD CONSTRAINT "profile_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_history" ADD CONSTRAINT "profile_history_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trip_profiles"("trip_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forgotten_evidence" ADD CONSTRAINT "forgotten_evidence_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;


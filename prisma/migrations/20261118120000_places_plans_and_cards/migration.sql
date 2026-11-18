-- CreateEnum
CREATE TYPE "PlaceOrigin" AS ENUM ('OSM', 'SAMPLE', 'USER');

-- CreateEnum
CREATE TYPE "CardAction" AS ENUM ('PRESENTED', 'PICKED', 'SAVED', 'DISCARDED');

-- CreateTable
CREATE TABLE "places" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "origin" "PlaceOrigin" NOT NULL,
    "origin_ref" VARCHAR(80),
    "city_key" VARCHAR(170) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "address" VARCHAR(240),
    "opening_hours" VARCHAR(400),
    "notable" BOOLEAN NOT NULL DEFAULT false,
    "added_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_fetches" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "city_key" VARCHAR(170) NOT NULL,
    "scope" VARCHAR(40) NOT NULL,
    "place_count" INTEGER NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_fetches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_calls" (
    "day" DATE NOT NULL,
    "service" VARCHAR(20) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "provider_calls_pkey" PRIMARY KEY ("day","service")
);

-- CreateTable
CREATE TABLE "plans" (
    "trip_id" TEXT NOT NULL,
    "active_version_id" TEXT,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("trip_id")
);

-- CreateTable
CREATE TABLE "plan_versions" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "trip_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "parent_version_id" TEXT,
    "state" JSONB NOT NULL,
    "summary" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_events" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "trip_id" TEXT NOT NULL,
    "slot_id" VARCHAR(40) NOT NULL,
    "place_id" TEXT NOT NULL,
    "action" "CardAction" NOT NULL,
    "reason" VARCHAR(40),
    "note" VARCHAR(300),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "places_city_key_kind_idx" ON "places"("city_key", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "places_origin_origin_ref_key" ON "places"("origin", "origin_ref");

-- CreateIndex
CREATE UNIQUE INDEX "place_fetches_city_key_scope_key" ON "place_fetches"("city_key", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "plan_versions_trip_id_version_key" ON "plan_versions"("trip_id", "version");

-- CreateIndex
CREATE INDEX "card_events_trip_id_action_idx" ON "card_events"("trip_id", "action");

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "plans"("trip_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_events" ADD CONSTRAINT "card_events_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;


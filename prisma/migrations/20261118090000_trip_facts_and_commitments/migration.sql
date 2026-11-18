-- CreateEnum
CREATE TYPE "TripVisibility" AS ENUM ('PRIVATE');

-- CreateEnum
CREATE TYPE "Firmness" AS ENUM ('FIXED', 'FLEXIBLE');

-- CreateEnum
CREATE TYPE "BudgetBasis" AS ENUM ('TRIP', 'DAY');

-- CreateEnum
CREATE TYPE "PlanningMode" AS ENUM ('GUIDED', 'QUICK');

-- CreateEnum
CREATE TYPE "CommitmentKind" AS ENUM ('TRANSPORT', 'STAY', 'RESERVATION', 'MUST_SEE', 'OTHER');

-- AlterTable
ALTER TABLE "trip_destinations" ADD COLUMN     "nights" INTEGER;

-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "adults" INTEGER,
ADD COLUMN     "budget_basis" "BudgetBasis",
ADD COLUMN     "budget_firmness" "Firmness",
ADD COLUMN     "children" INTEGER,
ADD COLUMN     "dates_firmness" "Firmness",
ADD COLUMN     "length_nights" INTEGER,
ADD COLUMN     "plan_finished_at" TIMESTAMP(3),
ADD COLUMN     "planning_mode" "PlanningMode",
ADD COLUMN     "purpose" VARCHAR(120),
ADD COLUMN     "time_of_year" INTEGER,
ADD COLUMN     "visibility" "TripVisibility" NOT NULL DEFAULT 'PRIVATE';

-- CreateTable
CREATE TABLE "fixed_commitments" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "trip_id" TEXT NOT NULL,
    "kind" "CommitmentKind" NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "date" DATE,
    "start_time" VARCHAR(5),
    "end_date" DATE,
    "end_time" VARCHAR(5),
    "reference" VARCHAR(80),
    "note" VARCHAR(500),
    "transport_mode" "TravelSegmentMode",
    "origin" VARCHAR(120),
    "destination" VARCHAR(120),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixed_commitments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "city_lookups" (
    "query" VARCHAR(120) NOT NULL,
    "results" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "city_lookups_pkey" PRIMARY KEY ("query")
);

-- CreateIndex
CREATE INDEX "fixed_commitments_trip_id_date_idx" ON "fixed_commitments"("trip_id", "date");

-- AddForeignKey
ALTER TABLE "fixed_commitments" ADD CONSTRAINT "fixed_commitments_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;


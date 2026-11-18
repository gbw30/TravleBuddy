-- AlterTable
ALTER TABLE "trip_profiles" ADD COLUMN     "differs" BOOLEAN,
ADD COLUMN     "differs_because" VARCHAR(120);


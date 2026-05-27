ALTER TABLE "trips"
ADD COLUMN "departure_city" TEXT,
ADD COLUMN "departure_country" TEXT,
ADD COLUMN "departure_time_zone" TEXT;

ALTER TABLE "trip_destinations"
ADD COLUMN "time_zone" TEXT;

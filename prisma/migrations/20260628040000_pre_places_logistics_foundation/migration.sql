CREATE TYPE "TripLogisticsMode" AS ENUM ('FLEXIBLE', 'TICKETED');

CREATE TYPE "TravelSegmentMode" AS ENUM ('FLIGHT', 'TRAIN', 'BUS', 'CAR', 'FERRY', 'OTHER');

CREATE TYPE "CityWindowSource" AS ENUM ('FLEXIBLE', 'TICKETED');

ALTER TABLE "trips"
  ADD COLUMN "logistics_mode" "TripLogisticsMode" NOT NULL DEFAULT 'FLEXIBLE';

CREATE TABLE "trip_travel_segments" (
  "id" TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "mode" "TravelSegmentMode" NOT NULL,
  "origin_city" TEXT NOT NULL,
  "origin_country" TEXT NOT NULL,
  "destination_city" TEXT NOT NULL,
  "destination_country" TEXT NOT NULL,
  "depart_at" TIMESTAMP(3) NOT NULL,
  "arrive_at" TIMESTAMP(3) NOT NULL,
  "carrier" TEXT,
  "reference_code" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "trip_travel_segments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "itinerary_city_windows" (
  "id" TEXT NOT NULL,
  "trip_id" TEXT NOT NULL,
  "day_id" TEXT NOT NULL,
  "destination_id" TEXT,
  "travel_segment_id" TEXT,
  "city" TEXT NOT NULL,
  "country" TEXT NOT NULL,
  "start_time" TIMESTAMP(3) NOT NULL,
  "end_time" TIMESTAMP(3) NOT NULL,
  "source" "CityWindowSource" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "itinerary_city_windows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "trip_travel_segments_trip_id_id_key"
  ON "trip_travel_segments"("trip_id", "id");

CREATE INDEX "trip_travel_segments_trip_id_idx"
  ON "trip_travel_segments"("trip_id");

CREATE INDEX "trip_travel_segments_trip_id_sort_order_idx"
  ON "trip_travel_segments"("trip_id", "sort_order");

CREATE INDEX "trip_travel_segments_depart_at_arrive_at_idx"
  ON "trip_travel_segments"("depart_at", "arrive_at");

CREATE UNIQUE INDEX "itinerary_city_windows_trip_id_id_key"
  ON "itinerary_city_windows"("trip_id", "id");

CREATE INDEX "itinerary_city_windows_trip_id_idx"
  ON "itinerary_city_windows"("trip_id");

CREATE INDEX "itinerary_city_windows_day_id_idx"
  ON "itinerary_city_windows"("day_id");

CREATE INDEX "itinerary_city_windows_destination_id_idx"
  ON "itinerary_city_windows"("destination_id");

CREATE INDEX "itinerary_city_windows_travel_segment_id_idx"
  ON "itinerary_city_windows"("travel_segment_id");

CREATE INDEX "itinerary_city_windows_start_time_end_time_idx"
  ON "itinerary_city_windows"("start_time", "end_time");

ALTER TABLE "trip_travel_segments"
  ADD CONSTRAINT "trip_travel_segments_trip_id_fkey"
  FOREIGN KEY ("trip_id")
  REFERENCES "trips"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "itinerary_city_windows"
  ADD CONSTRAINT "itinerary_city_windows_trip_id_fkey"
  FOREIGN KEY ("trip_id")
  REFERENCES "trips"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "itinerary_city_windows"
  ADD CONSTRAINT "itinerary_city_windows_trip_id_day_id_fkey"
  FOREIGN KEY ("trip_id", "day_id")
  REFERENCES "itinerary_days"("trip_id", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "itinerary_city_windows"
  ADD CONSTRAINT "itinerary_city_windows_trip_id_destination_id_fkey"
  FOREIGN KEY ("trip_id", "destination_id")
  REFERENCES "trip_destinations"("trip_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "itinerary_city_windows"
  ADD CONSTRAINT "itinerary_city_windows_trip_id_travel_segment_id_fkey"
  FOREIGN KEY ("trip_id", "travel_segment_id")
  REFERENCES "trip_travel_segments"("trip_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

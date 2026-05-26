-- Preserve feedback target lookup while making target_id required.
UPDATE "planning_feedback"
SET "target_id" = CASE
    WHEN "target_type" = 'TRIP' THEN "trip_id"
    WHEN "target_type" = 'PREFERENCE' THEN "trip_preference_id"
    WHEN "target_type" = 'PLACE_SUGGESTION' THEN "place_suggestion_id"
    WHEN "target_type" = 'ITINERARY_DAY' THEN "itinerary_day_id"
    WHEN "target_type" = 'ITINERARY_ITEM' THEN "itinerary_item_id"
    WHEN "target_type" = 'CONFLICT' THEN "conflict_id"
    ELSE "target_id"
  END
WHERE "target_id" IS NULL;

ALTER TABLE "planning_feedback" ALTER COLUMN "target_id" SET NOT NULL;

-- Replace globally unique provider IDs with trip-scoped provider IDs.
DROP INDEX "place_suggestions_provider_provider_place_id_key";

-- Replace single-column child foreign keys with composite foreign keys that
-- guarantee child records belong to the same trip as the row referencing them.
ALTER TABLE "place_suggestions" DROP CONSTRAINT "place_suggestions_destination_id_fkey";
ALTER TABLE "planning_feedback" DROP CONSTRAINT "planning_feedback_trip_preference_id_fkey";
ALTER TABLE "planning_feedback" DROP CONSTRAINT "planning_feedback_place_suggestion_id_fkey";
ALTER TABLE "planning_feedback" DROP CONSTRAINT "planning_feedback_itinerary_day_id_fkey";
ALTER TABLE "planning_feedback" DROP CONSTRAINT "planning_feedback_itinerary_item_id_fkey";
ALTER TABLE "planning_feedback" DROP CONSTRAINT "planning_feedback_conflict_id_fkey";
ALTER TABLE "itinerary_items" DROP CONSTRAINT "itinerary_items_day_id_fkey";
ALTER TABLE "itinerary_items" DROP CONSTRAINT "itinerary_items_place_suggestion_id_fkey";
ALTER TABLE "conflicts" DROP CONSTRAINT "conflicts_itinerary_item_id_fkey";

CREATE UNIQUE INDEX "trip_destinations_trip_id_id_key" ON "trip_destinations"("trip_id", "id");
CREATE UNIQUE INDEX "trip_preferences_trip_id_id_key" ON "trip_preferences"("trip_id", "id");
CREATE UNIQUE INDEX "place_suggestions_trip_id_id_key" ON "place_suggestions"("trip_id", "id");
CREATE UNIQUE INDEX "place_suggestions_trip_id_provider_provider_place_id_key" ON "place_suggestions"("trip_id", "provider", "provider_place_id");
CREATE UNIQUE INDEX "itinerary_days_trip_id_id_key" ON "itinerary_days"("trip_id", "id");
CREATE UNIQUE INDEX "itinerary_items_trip_id_id_key" ON "itinerary_items"("trip_id", "id");
CREATE UNIQUE INDEX "conflicts_trip_id_id_key" ON "conflicts"("trip_id", "id");
CREATE INDEX "planning_feedback_target_type_target_id_idx" ON "planning_feedback"("target_type", "target_id");

ALTER TABLE "place_suggestions"
  ADD CONSTRAINT "place_suggestions_trip_id_destination_id_fkey"
  FOREIGN KEY ("trip_id", "destination_id")
  REFERENCES "trip_destinations"("trip_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "planning_feedback"
  ADD CONSTRAINT "planning_feedback_trip_id_trip_preference_id_fkey"
  FOREIGN KEY ("trip_id", "trip_preference_id")
  REFERENCES "trip_preferences"("trip_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "planning_feedback"
  ADD CONSTRAINT "planning_feedback_trip_id_place_suggestion_id_fkey"
  FOREIGN KEY ("trip_id", "place_suggestion_id")
  REFERENCES "place_suggestions"("trip_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "planning_feedback"
  ADD CONSTRAINT "planning_feedback_trip_id_itinerary_day_id_fkey"
  FOREIGN KEY ("trip_id", "itinerary_day_id")
  REFERENCES "itinerary_days"("trip_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "planning_feedback"
  ADD CONSTRAINT "planning_feedback_trip_id_itinerary_item_id_fkey"
  FOREIGN KEY ("trip_id", "itinerary_item_id")
  REFERENCES "itinerary_items"("trip_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "planning_feedback"
  ADD CONSTRAINT "planning_feedback_trip_id_conflict_id_fkey"
  FOREIGN KEY ("trip_id", "conflict_id")
  REFERENCES "conflicts"("trip_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "itinerary_items"
  ADD CONSTRAINT "itinerary_items_trip_id_day_id_fkey"
  FOREIGN KEY ("trip_id", "day_id")
  REFERENCES "itinerary_days"("trip_id", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "itinerary_items"
  ADD CONSTRAINT "itinerary_items_trip_id_place_suggestion_id_fkey"
  FOREIGN KEY ("trip_id", "place_suggestion_id")
  REFERENCES "place_suggestions"("trip_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "conflicts"
  ADD CONSTRAINT "conflicts_trip_id_itinerary_item_id_fkey"
  FOREIGN KEY ("trip_id", "itinerary_item_id")
  REFERENCES "itinerary_items"("trip_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

-- Keep PlanningFeedback's generic target_id synchronized with the typed target
-- columns so persisted feedback remains unambiguous.
ALTER TABLE "planning_feedback"
  ADD CONSTRAINT "planning_feedback_target_consistency_chk"
  CHECK (
    (
      "target_type" = 'TRIP'
      AND "target_id" = "trip_id"
      AND "trip_preference_id" IS NULL
      AND "place_suggestion_id" IS NULL
      AND "itinerary_day_id" IS NULL
      AND "itinerary_item_id" IS NULL
      AND "conflict_id" IS NULL
    )
    OR (
      "target_type" = 'PREFERENCE'
      AND "target_id" = "trip_preference_id"
      AND "trip_preference_id" IS NOT NULL
      AND "place_suggestion_id" IS NULL
      AND "itinerary_day_id" IS NULL
      AND "itinerary_item_id" IS NULL
      AND "conflict_id" IS NULL
    )
    OR (
      "target_type" = 'PLACE_SUGGESTION'
      AND "target_id" = "place_suggestion_id"
      AND "trip_preference_id" IS NULL
      AND "place_suggestion_id" IS NOT NULL
      AND "itinerary_day_id" IS NULL
      AND "itinerary_item_id" IS NULL
      AND "conflict_id" IS NULL
    )
    OR (
      "target_type" = 'ITINERARY_DAY'
      AND "target_id" = "itinerary_day_id"
      AND "trip_preference_id" IS NULL
      AND "place_suggestion_id" IS NULL
      AND "itinerary_day_id" IS NOT NULL
      AND "itinerary_item_id" IS NULL
      AND "conflict_id" IS NULL
    )
    OR (
      "target_type" = 'ITINERARY_ITEM'
      AND "target_id" = "itinerary_item_id"
      AND "trip_preference_id" IS NULL
      AND "place_suggestion_id" IS NULL
      AND "itinerary_day_id" IS NULL
      AND "itinerary_item_id" IS NOT NULL
      AND "conflict_id" IS NULL
    )
    OR (
      "target_type" = 'CONFLICT'
      AND "target_id" = "conflict_id"
      AND "trip_preference_id" IS NULL
      AND "place_suggestion_id" IS NULL
      AND "itinerary_day_id" IS NULL
      AND "itinerary_item_id" IS NULL
      AND "conflict_id" IS NOT NULL
    )
  );

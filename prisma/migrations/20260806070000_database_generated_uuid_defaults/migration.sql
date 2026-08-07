-- Generate text primary keys inside PostgreSQL so inserts remain safe when a
-- client runtime does not materialize Prisma-level cuid() defaults. Existing
-- CUID values remain valid; only new rows receive UUID text defaults.

ALTER TABLE "users" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;
ALTER TABLE "user_travel_preferences" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;
ALTER TABLE "accounts" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;
ALTER TABLE "sessions" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;
ALTER TABLE "trips" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;
ALTER TABLE "trip_destinations" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;
ALTER TABLE "planning_mutations" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;
ALTER TABLE "trip_travel_segments" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;
ALTER TABLE "trip_preferences" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;
ALTER TABLE "place_suggestions" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;
ALTER TABLE "planning_feedback" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;
ALTER TABLE "preference_profile_versions" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;
ALTER TABLE "itinerary_versions" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;
ALTER TABLE "generation_jobs" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;
ALTER TABLE "job_attempts" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;
ALTER TABLE "job_events" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;
ALTER TABLE "planning_events" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;
ALTER TABLE "itinerary_days" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;
ALTER TABLE "itinerary_city_windows" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;
ALTER TABLE "itinerary_items" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;
ALTER TABLE "conflicts" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;

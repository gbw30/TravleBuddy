-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('DRAFT', 'PLANNING', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BudgetLevel" AS ENUM ('BUDGET', 'MODERATE', 'LUXURY');

-- CreateEnum
CREATE TYPE "TravelPace" AS ENUM ('RELAXED', 'BALANCED', 'PACKED');

-- CreateEnum
CREATE TYPE "TransportationMode" AS ENUM ('WALKING', 'PUBLIC_TRANSIT', 'RIDE_SHARE', 'RENTAL_CAR', 'MIXED');

-- CreateEnum
CREATE TYPE "AccommodationType" AS ENUM ('HOSTEL', 'HOTEL', 'RESORT', 'AIRBNB', 'OTHER');

-- CreateEnum
CREATE TYPE "Provider" AS ENUM ('MOCK', 'GOOGLE_PLACES', 'GEMINI', 'USER');

-- CreateEnum
CREATE TYPE "SuggestionCategory" AS ENUM ('DESTINATION', 'HOTEL', 'ATTRACTION', 'RESTAURANT', 'ACTIVITY', 'LANDMARK', 'ENTERTAINMENT');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('PENDING', 'SELECTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PlanningActor" AS ENUM ('USER', 'ENGINE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "PlanningEventType" AS ENUM ('USER_FEEDBACK', 'ENGINE_EXPLANATION', 'READINESS_WARNING', 'RECOMMENDATION_BATCH', 'ITINERARY_PROPOSAL', 'BUDGET_WARNING', 'CONFLICT_SUMMARY', 'SYSTEM_NOTE');

-- CreateEnum
CREATE TYPE "FeedbackTargetType" AS ENUM ('TRIP', 'PREFERENCE', 'PLACE_SUGGESTION', 'ITINERARY_DAY', 'ITINERARY_ITEM', 'CONFLICT');

-- CreateEnum
CREATE TYPE "FeedbackAction" AS ENUM ('ACCEPT', 'REJECT', 'REFRESH', 'REFINE', 'SELECT', 'DESELECT', 'IGNORE', 'RESOLVE', 'REQUEST_ALTERNATIVE');

-- CreateEnum
CREATE TYPE "FeedbackReason" AS ENUM ('NOT_INTERESTED', 'TOO_EXPENSIVE', 'TOO_FAR', 'WRONG_VIBE', 'ALREADY_BEEN_THERE', 'TOO_BUSY', 'TOO_SLOW', 'GOOD_MATCH', 'OTHER');

-- CreateEnum
CREATE TYPE "ConflictType" AS ENUM ('TIME', 'DISTANCE', 'BUDGET', 'SCHEDULE_DENSITY', 'HOTEL_LOCATION', 'MISSING_DURATION', 'CLOSED_OR_UNAVAILABLE');

-- CreateEnum
CREATE TYPE "ConflictSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ConflictStatus" AS ENUM ('OPEN', 'RESOLVED', 'IGNORED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "email_verified" TIMESTAMP(3),
    "image" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "session_token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "trips" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'DRAFT',
    "destination_search_text" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "budget_amount" DECIMAL(12,2),
    "budget_currency" VARCHAR(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_destinations" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "region" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_destinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_preferences" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "budget_level" "BudgetLevel",
    "pace" "TravelPace",
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "transportation_modes" "TransportationMode"[] DEFAULT ARRAY[]::"TransportationMode"[],
    "accommodation_types" "AccommodationType"[] DEFAULT ARRAY[]::"AccommodationType"[],
    "hotel_priority" INTEGER,
    "walking_tolerance_km" DECIMAL(5,2),
    "dietary_restrictions" JSONB,
    "accessibility_needs" JSONB,
    "must_avoid" JSONB,
    "custom_notes" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_suggestions" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "destination_id" TEXT,
    "provider" "Provider" NOT NULL DEFAULT 'MOCK',
    "provider_place_id" TEXT,
    "category" "SuggestionCategory" NOT NULL,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "explanation" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "rating" DECIMAL(3,2),
    "price_level" INTEGER,
    "estimated_cost_amount" DECIMAL(12,2),
    "estimated_cost_currency" VARCHAR(3),
    "score" DECIMAL(6,2),
    "raw_provider_data" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "place_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_feedback" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "target_type" "FeedbackTargetType" NOT NULL,
    "target_id" TEXT,
    "source" "PlanningActor" NOT NULL DEFAULT 'USER',
    "action" "FeedbackAction",
    "reason" "FeedbackReason",
    "user_note" TEXT,
    "metadata" JSONB,
    "trip_preference_id" TEXT,
    "place_suggestion_id" TEXT,
    "itinerary_day_id" TEXT,
    "itinerary_item_id" TEXT,
    "conflict_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planning_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_events" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "actor" "PlanningActor" NOT NULL,
    "type" "PlanningEventType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "visible_to_user" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planning_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itinerary_days" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "day_number" INTEGER NOT NULL,
    "date" TIMESTAMP(3),
    "title" TEXT,
    "notes" TEXT,
    "estimated_cost_amount" DECIMAL(12,2),
    "estimated_cost_currency" VARCHAR(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "itinerary_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itinerary_items" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "day_id" TEXT NOT NULL,
    "place_suggestion_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "start_time" TIMESTAMP(3),
    "end_time" TIMESTAMP(3),
    "duration_minutes" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "estimated_cost_amount" DECIMAL(12,2),
    "estimated_cost_currency" VARCHAR(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "itinerary_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conflicts" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "itinerary_item_id" TEXT,
    "type" "ConflictType" NOT NULL,
    "severity" "ConflictSeverity" NOT NULL,
    "status" "ConflictStatus" NOT NULL DEFAULT 'OPEN',
    "message" TEXT NOT NULL,
    "recommendation" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- CreateIndex
CREATE INDEX "trips_user_id_idx" ON "trips"("user_id");

-- CreateIndex
CREATE INDEX "trips_status_idx" ON "trips"("status");

-- CreateIndex
CREATE INDEX "trips_start_date_end_date_idx" ON "trips"("start_date", "end_date");

-- CreateIndex
CREATE INDEX "trip_destinations_trip_id_idx" ON "trip_destinations"("trip_id");

-- CreateIndex
CREATE INDEX "trip_destinations_trip_id_sort_order_idx" ON "trip_destinations"("trip_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "trip_preferences_trip_id_key" ON "trip_preferences"("trip_id");

-- CreateIndex
CREATE INDEX "trip_preferences_trip_id_idx" ON "trip_preferences"("trip_id");

-- CreateIndex
CREATE INDEX "place_suggestions_trip_id_idx" ON "place_suggestions"("trip_id");

-- CreateIndex
CREATE INDEX "place_suggestions_destination_id_idx" ON "place_suggestions"("destination_id");

-- CreateIndex
CREATE INDEX "place_suggestions_trip_id_category_idx" ON "place_suggestions"("trip_id", "category");

-- CreateIndex
CREATE INDEX "place_suggestions_trip_id_status_idx" ON "place_suggestions"("trip_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "place_suggestions_provider_provider_place_id_key" ON "place_suggestions"("provider", "provider_place_id");

-- CreateIndex
CREATE INDEX "planning_feedback_trip_id_idx" ON "planning_feedback"("trip_id");

-- CreateIndex
CREATE INDEX "planning_feedback_target_type_idx" ON "planning_feedback"("target_type");

-- CreateIndex
CREATE INDEX "planning_feedback_trip_preference_id_idx" ON "planning_feedback"("trip_preference_id");

-- CreateIndex
CREATE INDEX "planning_feedback_place_suggestion_id_idx" ON "planning_feedback"("place_suggestion_id");

-- CreateIndex
CREATE INDEX "planning_feedback_itinerary_day_id_idx" ON "planning_feedback"("itinerary_day_id");

-- CreateIndex
CREATE INDEX "planning_feedback_itinerary_item_id_idx" ON "planning_feedback"("itinerary_item_id");

-- CreateIndex
CREATE INDEX "planning_feedback_conflict_id_idx" ON "planning_feedback"("conflict_id");

-- CreateIndex
CREATE INDEX "planning_events_trip_id_idx" ON "planning_events"("trip_id");

-- CreateIndex
CREATE INDEX "planning_events_actor_idx" ON "planning_events"("actor");

-- CreateIndex
CREATE INDEX "planning_events_type_idx" ON "planning_events"("type");

-- CreateIndex
CREATE INDEX "planning_events_created_at_idx" ON "planning_events"("created_at");

-- CreateIndex
CREATE INDEX "itinerary_days_trip_id_idx" ON "itinerary_days"("trip_id");

-- CreateIndex
CREATE UNIQUE INDEX "itinerary_days_trip_id_day_number_key" ON "itinerary_days"("trip_id", "day_number");

-- CreateIndex
CREATE INDEX "itinerary_items_trip_id_idx" ON "itinerary_items"("trip_id");

-- CreateIndex
CREATE INDEX "itinerary_items_day_id_idx" ON "itinerary_items"("day_id");

-- CreateIndex
CREATE INDEX "itinerary_items_place_suggestion_id_idx" ON "itinerary_items"("place_suggestion_id");

-- CreateIndex
CREATE INDEX "itinerary_items_day_id_sort_order_idx" ON "itinerary_items"("day_id", "sort_order");

-- CreateIndex
CREATE INDEX "conflicts_trip_id_idx" ON "conflicts"("trip_id");

-- CreateIndex
CREATE INDEX "conflicts_itinerary_item_id_idx" ON "conflicts"("itinerary_item_id");

-- CreateIndex
CREATE INDEX "conflicts_type_idx" ON "conflicts"("type");

-- CreateIndex
CREATE INDEX "conflicts_severity_idx" ON "conflicts"("severity");

-- CreateIndex
CREATE INDEX "conflicts_status_idx" ON "conflicts"("status");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_destinations" ADD CONSTRAINT "trip_destinations_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_preferences" ADD CONSTRAINT "trip_preferences_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_suggestions" ADD CONSTRAINT "place_suggestions_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_suggestions" ADD CONSTRAINT "place_suggestions_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "trip_destinations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_feedback" ADD CONSTRAINT "planning_feedback_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_feedback" ADD CONSTRAINT "planning_feedback_trip_preference_id_fkey" FOREIGN KEY ("trip_preference_id") REFERENCES "trip_preferences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_feedback" ADD CONSTRAINT "planning_feedback_place_suggestion_id_fkey" FOREIGN KEY ("place_suggestion_id") REFERENCES "place_suggestions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_feedback" ADD CONSTRAINT "planning_feedback_itinerary_day_id_fkey" FOREIGN KEY ("itinerary_day_id") REFERENCES "itinerary_days"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_feedback" ADD CONSTRAINT "planning_feedback_itinerary_item_id_fkey" FOREIGN KEY ("itinerary_item_id") REFERENCES "itinerary_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_feedback" ADD CONSTRAINT "planning_feedback_conflict_id_fkey" FOREIGN KEY ("conflict_id") REFERENCES "conflicts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_events" ADD CONSTRAINT "planning_events_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_days" ADD CONSTRAINT "itinerary_days_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_day_id_fkey" FOREIGN KEY ("day_id") REFERENCES "itinerary_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_place_suggestion_id_fkey" FOREIGN KEY ("place_suggestion_id") REFERENCES "place_suggestions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflicts" ADD CONSTRAINT "conflicts_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflicts" ADD CONSTRAINT "conflicts_itinerary_item_id_fkey" FOREIGN KEY ("itinerary_item_id") REFERENCES "itinerary_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

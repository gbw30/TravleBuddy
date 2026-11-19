-- DropForeignKey
ALTER TABLE "conflicts" DROP CONSTRAINT "conflicts_itinerary_version_id_fkey";

-- DropForeignKey
ALTER TABLE "conflicts" DROP CONSTRAINT "conflicts_trip_id_fkey";

-- DropForeignKey
ALTER TABLE "conflicts" DROP CONSTRAINT "conflicts_trip_id_itinerary_item_id_fkey";

-- DropForeignKey
ALTER TABLE "generation_jobs" DROP CONSTRAINT "generation_jobs_feedback_id_fkey";

-- DropForeignKey
ALTER TABLE "generation_jobs" DROP CONSTRAINT "generation_jobs_parent_itinerary_version_id_fkey";

-- DropForeignKey
ALTER TABLE "generation_jobs" DROP CONSTRAINT "generation_jobs_preference_profile_version_id_fkey";

-- DropForeignKey
ALTER TABLE "generation_jobs" DROP CONSTRAINT "generation_jobs_trip_id_fkey";

-- DropForeignKey
ALTER TABLE "itinerary_city_windows" DROP CONSTRAINT "itinerary_city_windows_trip_id_day_id_fkey";

-- DropForeignKey
ALTER TABLE "itinerary_city_windows" DROP CONSTRAINT "itinerary_city_windows_trip_id_destination_id_fkey";

-- DropForeignKey
ALTER TABLE "itinerary_city_windows" DROP CONSTRAINT "itinerary_city_windows_trip_id_fkey";

-- DropForeignKey
ALTER TABLE "itinerary_city_windows" DROP CONSTRAINT "itinerary_city_windows_trip_id_travel_segment_id_fkey";

-- DropForeignKey
ALTER TABLE "itinerary_days" DROP CONSTRAINT "itinerary_days_itinerary_version_id_fkey";

-- DropForeignKey
ALTER TABLE "itinerary_days" DROP CONSTRAINT "itinerary_days_trip_id_fkey";

-- DropForeignKey
ALTER TABLE "itinerary_items" DROP CONSTRAINT "itinerary_items_trip_id_day_id_fkey";

-- DropForeignKey
ALTER TABLE "itinerary_items" DROP CONSTRAINT "itinerary_items_trip_id_fkey";

-- DropForeignKey
ALTER TABLE "itinerary_items" DROP CONSTRAINT "itinerary_items_trip_id_place_suggestion_id_fkey";

-- DropForeignKey
ALTER TABLE "itinerary_versions" DROP CONSTRAINT "itinerary_versions_parent_version_id_fkey";

-- DropForeignKey
ALTER TABLE "itinerary_versions" DROP CONSTRAINT "itinerary_versions_preference_profile_version_id_fkey";

-- DropForeignKey
ALTER TABLE "itinerary_versions" DROP CONSTRAINT "itinerary_versions_source_job_id_fkey";

-- DropForeignKey
ALTER TABLE "itinerary_versions" DROP CONSTRAINT "itinerary_versions_trip_id_fkey";

-- DropForeignKey
ALTER TABLE "job_attempts" DROP CONSTRAINT "job_attempts_job_id_fkey";

-- DropForeignKey
ALTER TABLE "job_events" DROP CONSTRAINT "job_events_job_id_fkey";

-- DropForeignKey
ALTER TABLE "place_suggestions" DROP CONSTRAINT "place_suggestions_trip_id_destination_id_fkey";

-- DropForeignKey
ALTER TABLE "place_suggestions" DROP CONSTRAINT "place_suggestions_trip_id_fkey";

-- DropForeignKey
ALTER TABLE "planning_events" DROP CONSTRAINT "planning_events_trip_id_fkey";

-- DropForeignKey
ALTER TABLE "planning_feedback" DROP CONSTRAINT "planning_feedback_captured_itinerary_version_id_fkey";

-- DropForeignKey
ALTER TABLE "planning_feedback" DROP CONSTRAINT "planning_feedback_captured_preference_profile_version_id_fkey";

-- DropForeignKey
ALTER TABLE "planning_feedback" DROP CONSTRAINT "planning_feedback_trip_id_conflict_id_fkey";

-- DropForeignKey
ALTER TABLE "planning_feedback" DROP CONSTRAINT "planning_feedback_trip_id_fkey";

-- DropForeignKey
ALTER TABLE "planning_feedback" DROP CONSTRAINT "planning_feedback_trip_id_itinerary_day_id_fkey";

-- DropForeignKey
ALTER TABLE "planning_feedback" DROP CONSTRAINT "planning_feedback_trip_id_itinerary_item_id_fkey";

-- DropForeignKey
ALTER TABLE "planning_feedback" DROP CONSTRAINT "planning_feedback_trip_id_place_suggestion_id_fkey";

-- DropForeignKey
ALTER TABLE "planning_feedback" DROP CONSTRAINT "planning_feedback_trip_id_trip_preference_id_fkey";

-- DropForeignKey
ALTER TABLE "planning_feedback" DROP CONSTRAINT "planning_feedback_user_id_fkey";

-- DropForeignKey
ALTER TABLE "preference_profile_versions" DROP CONSTRAINT "preference_profile_versions_parent_version_id_fkey";

-- DropForeignKey
ALTER TABLE "preference_profile_versions" DROP CONSTRAINT "preference_profile_versions_source_feedback_id_fkey";

-- DropForeignKey
ALTER TABLE "preference_profile_versions" DROP CONSTRAINT "preference_profile_versions_trip_id_fkey";

-- DropForeignKey
ALTER TABLE "trip_preferences" DROP CONSTRAINT "trip_preferences_trip_id_fkey";

-- DropForeignKey
ALTER TABLE "trip_travel_segments" DROP CONSTRAINT "trip_travel_segments_trip_id_fkey";

-- DropForeignKey
ALTER TABLE "trips" DROP CONSTRAINT "trips_active_itinerary_version_id_fkey";

-- DropForeignKey
ALTER TABLE "trips" DROP CONSTRAINT "trips_active_preference_profile_version_id_fkey";

-- DropForeignKey
ALTER TABLE "user_travel_preferences" DROP CONSTRAINT "user_travel_preferences_user_id_fkey";

-- DropIndex
DROP INDEX "trips_active_itinerary_version_id_idx";

-- DropIndex
DROP INDEX "trips_active_preference_profile_version_id_idx";

-- AlterTable
ALTER TABLE "trips" DROP COLUMN "active_itinerary_version_id",
DROP COLUMN "active_preference_profile_version_id";

-- DropTable
DROP TABLE "conflicts";

-- DropTable
DROP TABLE "generation_jobs";

-- DropTable
DROP TABLE "itinerary_city_windows";

-- DropTable
DROP TABLE "itinerary_days";

-- DropTable
DROP TABLE "itinerary_items";

-- DropTable
DROP TABLE "itinerary_versions";

-- DropTable
DROP TABLE "job_attempts";

-- DropTable
DROP TABLE "job_events";

-- DropTable
DROP TABLE "place_suggestions";

-- DropTable
DROP TABLE "planning_events";

-- DropTable
DROP TABLE "planning_feedback";

-- DropTable
DROP TABLE "preference_profile_versions";

-- DropTable
DROP TABLE "trip_preferences";

-- DropTable
DROP TABLE "trip_travel_segments";

-- DropTable
DROP TABLE "user_travel_preferences";

-- DropEnum
DROP TYPE "AccommodationType";

-- DropEnum
DROP TYPE "BudgetLevel";

-- DropEnum
DROP TYPE "CityWindowSource";

-- DropEnum
DROP TYPE "ConflictSeverity";

-- DropEnum
DROP TYPE "ConflictStatus";

-- DropEnum
DROP TYPE "ConflictType";

-- DropEnum
DROP TYPE "FeedbackAction";

-- DropEnum
DROP TYPE "FeedbackProcessingStatus";

-- DropEnum
DROP TYPE "FeedbackReason";

-- DropEnum
DROP TYPE "FeedbackTargetType";

-- DropEnum
DROP TYPE "GenerationJobStatus";

-- DropEnum
DROP TYPE "GenerationJobType";

-- DropEnum
DROP TYPE "ItineraryChangeScope";

-- DropEnum
DROP TYPE "ItineraryVersionStatus";

-- DropEnum
DROP TYPE "JobAttemptStatus";

-- DropEnum
DROP TYPE "JobEventType";

-- DropEnum
DROP TYPE "PlanningActor";

-- DropEnum
DROP TYPE "PlanningEventType";

-- DropEnum
DROP TYPE "PreferenceSignalSource";

-- DropEnum
DROP TYPE "Provider";

-- DropEnum
DROP TYPE "SuggestionCategory";

-- DropEnum
DROP TYPE "SuggestionStatus";

-- DropEnum
DROP TYPE "TransportationMode";

-- DropEnum
DROP TYPE "TravelPace";


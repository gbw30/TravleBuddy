CREATE TABLE "user_travel_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
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
    "custom_preferences" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_travel_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_travel_preferences_user_id_key" ON "user_travel_preferences"("user_id");
CREATE INDEX "user_travel_preferences_user_id_idx" ON "user_travel_preferences"("user_id");

ALTER TABLE "user_travel_preferences" ADD CONSTRAINT "user_travel_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

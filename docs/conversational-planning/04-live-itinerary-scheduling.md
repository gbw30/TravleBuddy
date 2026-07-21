# Stage 2A - Live Itinerary Scheduling

Status: not started  
Depends on: Stage 1B and the Phase 9A time-grid foundation; Google Places is not required  
Estimated effort: 3-5 working days

## Goal

Place selected activities and restaurants into persisted 30-minute itinerary slots while the conversation continues. The scheduler must be deterministic, preserve all selected places, respect ticketed city/travel windows, and expose assumptions where Routes or opening hours are unavailable.

## Architecture Decisions

### Extend `TripPreference` or create a scheduling policy

Options:

- Add many scheduling columns to `TripPreference`: fewer models, but mixes taste with execution constraints.
- Store all scheduling limits in metadata JSON: flexible, but weak validation and querying.
- Add one typed `TripSchedulePolicy` per trip with JSON only for maps. Recommended.

### Basic scheduling or route-aware scheduling

Options:

- Day assignment only: lowest risk, but does not demonstrate the final concept.
- Deterministic slot scheduler with explicit buffers and Haversine proximity. Recommended.
- Routes and opening-hours optimization now: more accurate but expands provider and failure scope before the core loop is proven.

## Data Model

Add one `TripSchedulePolicy` per trip:

```text
dayStartMinutes: 540
dayEndMinutes: 1260
maxActivitiesPerDay: nullable
maxRestaurantsPerDay: 2
mealWindows: JSON
categoryDurations: JSON
lighterTransferDays: true
bufferMinutes: 30
metadata: JSON nullable
createdAt
updatedAt
```

Validation:

- minute values align to 30-minute boundaries
- day end is after day start
- category durations are 30-480 minutes
- daily limits are 0-20
- buffer is 0-120 minutes

Defaults:

- attraction: 120 minutes
- activity: 120 minutes
- landmark: 60 minutes
- entertainment: 120 minutes
- restaurant: 90 minutes
- lunch: 12:00-14:00
- dinner: 18:00-20:30
- hotel and destination: unscheduled anchors

## DTO Changes

Extend `ItineraryItemDto`:

```ts
startTime: string | null;
endTime: string | null;
durationMinutes: number | null;
scheduleStatus: "SCHEDULED" | "UNSCHEDULED" | "ANCHOR";
scheduleReason: string | null;
```

Extend `ItineraryDto` with revision and human-readable scheduling assumptions.

## Step-by-Step Implementation

### Step 1: Add schedule-policy persistence and chat mutation

Purpose: support natural-language constraints without embedding them in prompt history.

1. Add schema and migration.
2. Add validated get/update service methods.
3. Interpret limits such as “only one restaurant per day” through the Stage 1B intent contract.
4. Record source message and prior values in planning feedback metadata.
5. Rebuild the itinerary once after a policy change.

### Step 2: Separate assignment from persistence

Purpose: keep the scheduler unit-testable.

Implement a pure scheduling function that accepts trip dates, city windows, travel segments, selected places, preference pace, and schedule policy. It returns scheduled days, unscheduled items, totals, and assumptions without database access.

Persistence remains a transaction-owned service that replaces generated rows safely and refreshes conflicts after insertion.

### Step 3: Implement activity scheduling

Algorithm:

1. Create all days from the original trip date range.
2. Block ticketed travel slots.
3. Determine candidate days from explicit planning-day context, matching city/country windows, and remaining capacity.
4. Sort by explicit day choice, recommendation score, category priority, then stable name.
5. Place each item into the earliest contiguous slots within the matching city window and daily bounds.
6. Apply duration and buffer.
7. Use explicit activity limit when provided; otherwise retain existing pace capacities: relaxed 3, balanced 4, packed 6.
8. Reduce transfer-day capacity by one when enabled.
9. Keep hotel/destination records as visible anchors without consuming activity slots.
10. If no slot exists, preserve the item as unscheduled with a reason.

### Step 4: Implement restaurant coverage

Purpose: fulfill the documented requirement that activity days receive restaurant coverage when restaurants are selected.

1. Schedule activities before restaurants.
2. Calculate each activity day's geographic centroid from scheduled place coordinates.
3. Rank selected restaurants by Haversine distance to that centroid.
4. Prefer lunch, then dinner windows.
5. Respect the restaurant daily maximum.
6. Avoid assigning the same selected restaurant more than once unless future policy explicitly permits repeat visits.
7. If restaurants are insufficient, cover the closest feasible days and retain low-severity missing-restaurant conflicts for the rest.
8. If coordinates are missing, use stable city match and selected order as fallback.

### Step 5: Persist and refresh conflicts safely

1. Persist `startTime`, `endTime`, `durationMinutes`, and sort order.
2. Populate time-slot `itemIds` from persisted items.
3. Run the conflict engine after all generated rows exist.
4. Preserve resolved and ignored history.
5. Detect overlaps, density, budget, mixed-city mismatch, missing duration, and restaurant coverage.
6. Create a recoverable unscheduled-item conflict instead of dropping or crashing.

### Step 6: Connect live UI updates

- Selection and policy changes return the new compact itinerary snapshot.
- Highlight newly scheduled items without relying on a full page refresh.
- Show scheduled time, city, estimated duration, and cost.
- Show unscheduled selections in a dedicated section.
- Display that timing uses estimated buffers until route and hours verification exists.

## Time Semantics

For this prototype, retain the current UTC-anchored itinerary-day slot convention and display it as trip timeline wall-clock labels. Ticketed travel blocks remain authoritative. Full IANA time-zone normalization is required before production-grade international scheduling and is explicitly deferred.

## Test Requirements

- Every day still has 48 slots.
- Activities occupy contiguous slots of the configured duration.
- Travel slots cannot receive activities.
- Explicit day/city context is honored when feasible.
- Flexible and ticketed trips both schedule correctly.
- Same-day transfers can schedule in origin and destination windows.
- Pace and explicit limits behave correctly.
- Restaurant assignment uses proximity and meal windows.
- Missing coordinates use deterministic fallback.
- Insufficient capacity preserves unscheduled items and creates conflicts.
- Rebuilding the same inputs produces the same schedule.
- One planning turn rebuilds once.

## Developer Actions

- Provide QA trips with one and multiple cities, same-day transfer, missing coordinates, insufficient restaurants, dense selections, and custom scheduling limits.
- Review default durations and meal windows as product assumptions.
- Confirm that estimated timing labels are clear before user testing.

## Exit Criteria

- Selected activities and restaurants appear in persisted time slots.
- Restaurant coverage works across activity days.
- No selection disappears when scheduling fails.
- Ticketed travel windows remain intact.
- Chat-driven schedule limits update the itinerary.
- Full verification and scheduling QA pass.

## Fresh-Chat Handoff Prompt

```text
Implement Stage 2A from docs/conversational-planning/04-live-itinerary-scheduling.md. Reuse existing itinerary days, city windows, time slots, selected mock/user places, and conflict services. Add the typed schedule policy and pure deterministic scheduler, including proximity-based restaurant coverage. Do not require Google Places and do not add Google Routes, opening-hours optimization, maps, or final time-zone handling.
```

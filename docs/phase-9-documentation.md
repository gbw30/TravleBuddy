# Phase 9 Documentation

This document records Stage 9 Conflict Detection decisions, implementation details, validation notes, and remaining developer responsibilities.

It must not include secrets, API keys, database URLs, OAuth credentials, `.env` values, or sensitive terminal output.

---

## Phase Goal

Detect deterministic itinerary issues from persisted itinerary data while keeping the planning selection flow responsive.

Phase 9 conflict detection runs from persisted itinerary rows and is refreshed by deterministic, database-local actions:

- itinerary page load
- selected-place itinerary rebuilds
- trip settings changes that affect itinerary shape or budget
- manual conflict checks from `/trips/[tripId]/itinerary`
- `POST /api/trips/[tripId]/conflicts/check`

It must stay cheap: Phase 9 does not call maps, AI, route-duration, hours, or provider availability APIs during selection or page render. Future expensive checks should move behind an explicit check action or an async job queue.

---

## Implemented Scope

- `src/features/itinerary/conflict-engine.ts` contains the pure detector plus persistence services.
- `src/features/itinerary/conflict-actions.ts` contains itinerary-page Server Actions so the engine remains testable without importing Auth.js page helpers.
- Itinerary DTOs now include open conflicts and a severity summary.
- The itinerary page displays a conflict check panel, open warnings, and resolve/ignore actions.
- Itinerary reads and rebuilds refresh open conflicts automatically so the read-only itinerary draft does not initially show stale `0 open issues`.
- Trip settings updates that change dates, destinations, budget, or pace rebuild the draft and refresh open conflicts.
- User-entered already-decided places can include an estimated cost in the trip budget currency so budget conflicts include custom anchors.
- Custom place estimated costs are server-validated before Prisma writes. Values above the current Phase 9 guardrail are rejected with a timed planning error instead of crashing on decimal overflow; valid high costs still feed budget conflict detection.
- Multi-destination planning can now switch the planning context by saved trip city and day from `/trips/[tripId]/planning`. Generated recommendations use the selected city instead of always using the first trip destination.
- The selected planning day is preserved in recommendation, feedback, and already-decided-place metadata for future scheduling. Phase 9 does not manually force exact day placement; the Stage 8 deterministic builder still owns draft distribution.
- Planning workspace transaction reads and itinerary rebuild writes are sequential inside interactive Prisma transactions to avoid `pg` concurrent-query deprecation warnings and race-prone rebuild behavior.
- If rapid itinerary rebuilds remove item rows while conflicts are being persisted, conflict generation keeps the warning and drops stale item links instead of crashing on itinerary-item foreign keys.
- Planning and settings notices use timed fade-out alerts instead of persistent banners.
- API routes are thin authenticated App Router handlers:
  - `POST /api/trips/[tripId]/conflicts/check`
  - `PATCH /api/trips/[tripId]/conflicts/[conflictId]/resolve`
- Conflict generation deletes only existing `OPEN` conflicts for the trip, then writes the current open set. `RESOLVED` and `IGNORED` history is preserved; item references are detached before generated itinerary rows are replaced.
- Conflict candidates and open conflict reads are deduplicated by deterministic signature so concurrent checks or rapid page interactions cannot display repeated copies of the same warning.
- Conflict warning cards use severity-specific colors: low as blue/info, medium as amber/warning, and high as red/danger.
- Manual conflict checks write a visible `CONFLICT_SUMMARY` planning event.

---

## Conflict Rules

- `BUDGET`: high severity when itinerary item costs in the trip budget currency exceed the trip budget. Other currencies are ignored until currency conversion exists.
- `SCHEDULE_DENSITY`: low warning at comfort thresholds and medium warning above builder capacity:
  - `RELAXED`: low at 2+ non-hotel stops, medium above 3
  - `BALANCED`: low at 3+ non-hotel stops, medium above 4
  - `PACKED`: low at 5+ non-hotel stops, medium above 6
- `MISSING_DURATION`: low warning for non-hotel itinerary items with no `durationMinutes`.
- `DISTANCE`: medium warning when a day contains places in more than one city/country.
- `TIME`: high warning when two items have complete start/end times and overlap.
- `CLOSED_OR_UNAVAILABLE`: medium warning only when saved place metadata explicitly marks the place closed or unavailable.
- `HOTEL_LOCATION`: medium warning when selected hotel location differs from the majority location of non-hotel itinerary items.
- Restaurant coverage: low `SCHEDULE_DENSITY` warning when a day has activity-like items but no restaurant. Phase 9 warns only; it does not move or auto-insert restaurants.

---

## Final Vision Notes

The final itinerary builder should ensure each planned day contains restaurant coverage when the user has selected restaurants and activities. Restaurants should be assigned to days by closeness to the selected activities for that day, then placed by realistic time windows.

Phase 9 intentionally does not implement proximity assignment because accurate meal placement needs:

- geocoded coordinates for selected places
- route duration or distance data
- opening hours and reservation/availability data
- daily meal-window assumptions
- failure behavior for missing provider data

This belongs after Google Places and Google Routes integration.

---

## Pre-Places Logistics Foundation Addendum

The post-Phase-9 foundation adds trip logistics before Google Places integration:

- `/trips/[tripId]/logistics` lets the user choose ticketed timing or flexible city timing before planning.
- `Trip.logisticsMode` stores `TICKETED` or `FLEXIBLE`.
- `TripTravelSegment` stores structured transfer timing with mode, origin/destination city-country, depart/arrive date-time, optional carrier/reference, and sort order.
- Saving a ticket keeps the user on `/trips/[tripId]/logistics` so every known segment can be entered before the user chooses to continue into planning.
- Ticketed itinerary rebuilds derive `ItineraryCityWindow` rows.
- Transfer days can split one date into origin city context, travel time, and destination city context.
- Itinerary DTOs expose `cityWindows` and 48 read-only 30-minute `timeSlots` per day.
- Travel blocks are rendered in the timeline foundation; selected places without clock times remain unscheduled.
- Flexible mode keeps the existing manual city/day planning selector. Planning day options are derived from the trip's original start/end date range so ticket entry never reduces a multi-day trip to only Day 1.
- Preference completion now routes to logistics before planning, while direct planning access remains available for existing trips.

This foundation deliberately does not implement full activity auto-scheduling, drag/drop editing, route-duration optimization, opening-hours checks, ticket uploads, or chat-controlled daily limits.

Future scheduler work should let users control limits through chat or guided controls, including max restaurants/day, max attractions/day, preferred visit durations, meal windows, daily start/end limits, pacing, and transfer-day activity load.

The settings-crash fix belongs to this addendum: generated itinerary rebuild cleanup must retarget child planning feedback to `TRIP` before generated itinerary days/items/conflicts are deleted, preserving database consistency under `planning_feedback_target_consistency_chk`.

---

## Validation Plan

Run the repository's full verification sequence:

```text
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run prisma:validate
npm.cmd run build
```

Optional local smoke check:

```text
npm.cmd run dev -- --hostname 127.0.0.1 --port 3024
```

## Validation Results

Focused Phase 9 tests passed:

```text
cmd /c npm run test -- src/features/itinerary/builder.test.ts src/features/itinerary/conflict-engine.test.ts src/features/recommendations/service.test.ts src/features/trips/actions.test.ts src/components/recommendations/planning-workspace.test.tsx "src/app/(dashboard)/trips/[tripId]/planning/page.test.tsx" "src/app/(dashboard)/trips/[tripId]/itinerary/page.test.tsx"
```

Result:

- 7 focused files passed.
- 40 focused tests passed.
- TypeScript passed with `npx tsc --noEmit`.

Full verification:

```text
cmd /c npm run test
npx tsc --noEmit
cmd /c npm run lint
cmd /c npm run prisma:validate
cmd /c npm run build
```

Results:

- Full Vitest suite passed: 45 test files and 186 tests.
- TypeScript passed.
- ESLint passed.
- Prisma schema validation passed; the first sandboxed attempt was blocked while fetching Prisma engine checksums, and the rerun with network access passed.
- Production build passed and listed both conflict API routes; the first sandboxed attempt was blocked while `next/font` fetched Google Fonts, and the rerun with network access passed.

Pre-Places logistics foundation verification:

```text
npm.cmd run typecheck
npm.cmd run test
npm.cmd run lint
npm.cmd run prisma:validate
npm.cmd run build
```

Results:

- TypeScript passed.
- Full Vitest suite passed: 47 test files and 196 tests.
- ESLint passed.
- Prisma schema validation passed.
- Production build passed and listed `/trips/[tripId]/logistics`.

---

## Developer Responsibilities

- Confirm production, preview, and local environment parity for `DATABASE_URL`, `AUTH_SECRET`, OAuth provider keys, and deployment URLs.
- Add production monitoring for route latency, conflict-check error rate, and build/rebuild failure rate before real users rely on conflict checks.
- Add QA seed trips for no selected places, single-city balanced plans, over-budget plans, mixed-city days, missing-restaurant days, and dense packed itineraries.
- Configure Google Places and Google Routes before proximity-based restaurant assignment or route-duration conflict detection.
- Define provider quota, caching, rate-limit, and fallback behavior before any route-distance or hours checks call external APIs.

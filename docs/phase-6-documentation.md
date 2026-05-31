# Phase 6 Documentation

This document records Stage 6 Conversational Planning Recommendations decisions, implementation details, and validation notes.

It must not include secrets, API keys, database URLs, OAuth credentials, `.env` values, or sensitive terminal output.

---

## Phase Goal

Implement the core TravleBuddy planning loop:

- Users describe trip preferences in natural English.
- The app stores raw planning messages as durable feedback.
- Deterministic v1 extraction saves visible preference signals into the trip-local profile.
- The system generates topic-specific recommendation groups when enough context exists.
- Selected anchors and picked recommendations appear in a live plan preview inside the same workspace.

The primary route is:

```text
/trips/[tripId]/planning
```

Recommendations and the live plan preview are part of the planning workspace, not separate primary pages.

---

## Product Decisions

- Stage 6 does not call Gemini, Google Places, Google Routes, Google Maps, or Redis.
- Postgres remains the source of truth for preferences, feedback, selected places, recommendation history, and planning events.
- Natural-language interpretation is deterministic and testable in Stage 6.
- User messages are stored in `PlanningFeedback` with `targetType = TRIP` and `action = REFINE`.
- Extracted signals are autosaved into `TripPreference` and displayed as preference chips.
- Already-decided places can be any suggestion category and are saved as `PlaceSuggestion` rows with `provider = USER` and `status = SELECTED`.
- Starting priorities are:
  - `HOTEL_BASE`
  - `ACTIVITIES`
  - `FOOD_NIGHTLIFE`
  - `BUDGET_PACE`
- Recommendation generation requires at least two usable topic signals.
- Mock recommendations are stored with stable upserts using `tripId + provider + providerPlaceId`.
- Recommendation batches write one visible `RECOMMENDATION_BATCH` planning event.
- The live plan preview uses selected `PlaceSuggestion` rows only. Scheduled itinerary days and times remain future scope.

---

## Implemented Interfaces

```text
GET  /api/trips/[tripId]/recommendations?topic=HOTEL_BASE
POST /api/trips/[tripId]/recommendations/generate
POST /api/trips/[tripId]/recommendations/[suggestionId]/select
POST /api/trips/[tripId]/recommendations/refresh
```

The route handlers use Next.js 16 async `params`, authenticate with `assertAuthenticatedApiUser`, and rely on service-level ownership checks.

---

## Implementation Notes

Created recommendation domain modules:

- `src/features/recommendations/extraction.ts`
- `src/features/recommendations/mock-places.ts`

Changed recommendation domain modules:

- `src/features/recommendations/types.ts`
- `src/features/recommendations/schemas.ts`
- `src/features/recommendations/scoring.ts`
- `src/features/recommendations/service.ts`

Created API routes:

- `src/app/api/trips/[tripId]/recommendations/route.ts`
- `src/app/api/trips/[tripId]/recommendations/generate/route.ts`
- `src/app/api/trips/[tripId]/recommendations/[suggestionId]/select/route.ts`
- `src/app/api/trips/[tripId]/recommendations/refresh/route.ts`

Created UI:

- `src/app/(dashboard)/trips/[tripId]/planning/page.tsx`
- `src/components/recommendations/planning-workspace.tsx`

Changed UI:

- `src/components/trips/trip-readiness-panel.tsx`

---

## Future Redis Optimization

Redis preference caching is intentionally deferred to the final MVP optimization stage.

Future Redis scope:

- Cache derived preference/readiness/recommendation-input DTOs.
- Keep Postgres as source of truth.
- Invalidate cache after preference updates, planning feedback refinements, selected-place changes, and trip settings updates.
- Include before/after latency measurements so the optimization demonstrates concrete system-design value.

Redis should not be introduced during Stage 6 because preference reads are still local Postgres reads and the app does not yet have external-provider latency pressure.

---

## Validation Results

Stage 6 focused tests:

```text
npm.cmd run test -- src/features/recommendations/extraction.test.ts src/features/recommendations/scoring.test.ts src/features/recommendations/service.test.ts src/app/api/trips/[tripId]/recommendations/route.test.ts src/app/api/trips/[tripId]/recommendations/generate/route.test.ts src/app/api/trips/[tripId]/recommendations/[suggestionId]/select/route.test.ts src/app/api/trips/[tripId]/recommendations/refresh/route.test.ts 'src/app/(dashboard)/trips/[tripId]/planning/page.test.tsx'
```

Result:

- 8 test files pass.
- 21 tests pass.

TypeScript check:

```text
npm.cmd run typecheck
```

Result:

- Typecheck passes.

Full verification:

```text
npm.cmd run test
npm.cmd run lint
npm.cmd run prisma:validate
npm.cmd run build
```

Results:

- Full Vitest suite passes: 29 test files and 126 tests.
- ESLint passes with no warnings after cleanup.
- Prisma schema validation passes.
- The first production build generated Prisma Client but failed because the sandbox could not fetch Google Fonts for `next/font`.
- The production build passed after rerunning with network permission for the font fetch.
- The successful build generated the new `/trips/[tripId]/planning` route and recommendation API routes.

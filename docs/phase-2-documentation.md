# Phase 2 Documentation

This document records Phase 2 implementation decisions and validation results.

It must not include secrets, API keys, database URLs, OAuth credentials, `.env` values, or sensitive terminal output.

---

## Phase Goal

Create the persistent data foundation for TravleBuddy with:

- Draft and full-planning trip modes
- Ordered destination cities
- Trip-level maximum budget tracking
- Structured preferences plus JSON for flexible preferences
- Persistent planning feedback loop
- Auth.js-compatible user/session/account storage

---

## Implementation Log

### Documentation First

Changed:

- `docs/requirements.md`
- `docs/travlebuddy_agent_development_plan.md`
- `docs/phase-2-documentation.md`

Decision logic:

- Requirements now explicitly distinguish draft discovery from full planning.
- Full planning is locked until destinations, dates, and budget are available.
- The feedback loop is modeled as structured persisted context rather than freeform chat.

Implementation notes:

- Draft trips can support destination and attraction discovery.
- Itinerary, route maps, conflict checks, and full exports require a full-planning-ready trip.
- Feedback-loop records are intended to feed later recommendation, itinerary, Gemini explanation, and chat features.

## Prisma Schema

Changed:

- `prisma/schema.prisma`

Decision logic:

- Auth.js-compatible models are included so the database foundation can support Google OAuth sessions in the next phase.
- `Trip.status` separates draft discovery from planning-ready trips.
- `TripDestination` stores ordered city/country destinations instead of a single freeform destination string.
- `Trip.budgetAmount` and `Trip.budgetCurrency` support the MVP's single trip-level budget cap.
- `TripPreference` uses structured fields for common preferences and JSON for flexible details.
- `PlanningFeedback` generalizes recommendation feedback so the user can respond to any planning object.
- `PlanningEvent` stores the persistent planning timeline for user actions, engine explanations, warnings, proposals, and summaries.

Implementation notes:

- Draft/full-planning rules are enforced by app helpers and tests because Prisma cannot express "at least one child destination" as a portable schema constraint.
- Estimated cost fields were added to suggestions, itinerary days, and itinerary items to support future in-session budget tracking.
- All user-owned planning data relates back to `Trip`, which relates back to `User`.

---

## Runtime Dependencies

Changed:

- `package.json`
- `package-lock.json`

Decision logic:

- Prisma 7's generated client requires `@prisma/client`.
- The generated client expects a driver adapter, so `@prisma/adapter-pg` and `pg` were added for PostgreSQL/Neon connections.

Implementation notes:

- Dependency installation reported moderate audit findings. No forced audit fix was run because that could introduce unrelated breaking dependency changes.

---

## Prisma Client Setup

Changed:

- `src/lib/db.ts`
- Removed stale duplicate placeholder `src/prisma/schema.prisma`

Decision logic:

- A shared Prisma client prevents excess clients during development hot reloads.
- `PrismaPg` uses the validated `DATABASE_URL` without logging or exposing the value.
- The root `prisma/schema.prisma` is the only Prisma schema source of truth.

Implementation notes:

- The database helper uses the generated client from `src/generated/prisma/client`.
- The helper relies on `src/lib/env.ts` for server environment validation.

---

## Trip Readiness Helpers

Changed:

- `src/features/trips/readiness.ts`
- `src/features/trips/readiness.test.ts`
- `src/features/trips/types.ts`
- `src/features/trips/schemas.ts`

Decision logic:

- Draft trips should support discovery without enabling costly or misleading itinerary/map/conflict work.
- Full planning requires planning status, destination list, date range, budget amount, and budget currency.
- Missing requirements are returned as strings so the UI and reasoning engine can explain what the user needs to provide next.

Implementation notes:

- `canUseDiscovery` allows `DRAFT` and `PLANNING`.
- `canUseFullPlanning` gates itinerary, map, conflict, and full export workflows.
- Tests cover draft access, incomplete planning trips, complete planning trips, and missing requirement messages.

---

## Planning Feedback Helpers

Changed:

- `src/features/trips/planning-feedback.ts`
- `src/features/trips/planning-feedback.test.ts`

Decision logic:

- The feedback loop needs structured targets so future recommendation and itinerary logic can use feedback safely.
- Feedback can target one planning object at a time to avoid ambiguous engine context.

Implementation notes:

- Trip-level feedback is valid without a child target.
- Preference, suggestion, itinerary-day, itinerary-item, and conflict feedback require their matching typed target id.
- Tests cover valid trip-level feedback, normalized target IDs, suggestion feedback, itinerary item feedback, missing targets, target mismatches, and multiple-target rejection.

---

## Integrity Hardening

Changed:

- `prisma/schema.prisma`
- `prisma/migrations/20260525234000_phase_2_integrity/migration.sql`
- `src/features/trips/readiness.ts`
- `src/features/trips/readiness.test.ts`
- `src/features/trips/planning-feedback.ts`
- `src/features/trips/planning-feedback.test.ts`

Decision logic:

- Trip-owned child records should not be able to reference records from another trip.
- Provider place IDs should be reusable across different trips because two users can reasonably receive the same attraction suggestion.
- `PlanningFeedback.targetId` should be deterministic and match the typed target column so the feedback timeline remains queryable without becoming ambiguous.
- Full-planning readiness should require a positive numeric budget, not just any present value.

Implementation notes:

- Added composite same-trip foreign keys for destination suggestions, itinerary days/items, conflicts, and feedback targets.
- Added supporting unique indexes on `[tripId, id]` for trip-scoped child records.
- Changed place suggestion provider uniqueness from global provider/place ID to trip-scoped provider/place ID.
- Made `PlanningFeedback.targetId` required and added a database check constraint that keeps it synchronized with the typed target field.
- Updated feedback helper validation to normalize `targetId` from the typed target field and reject mismatches.
- Updated readiness helper validation to reject zero, negative, nonnumeric, and missing budgets.

Validation notes:

- The first `prisma migrate dev` attempt created warnings that require interactive confirmation, so the migration was written explicitly and applied with `prisma migrate deploy`.
- The integrity migration was successfully applied to the configured development database.
- No secret values were inspected or copied into this documentation.

---

## Folder Structure Documentation

Changed:

- `docs/folder-structure.md`

Decision logic:

- Prisma schema and migrations live at the repository root under `prisma/`.
- The stale `src/prisma/schema.prisma` placeholder was removed to prevent future agents from editing the wrong schema.

Implementation notes:

- The folder guide now lists Phase 2 documentation, trip readiness helpers, planning feedback helpers, and `src/lib/env.ts`.

---

## Initial Migration

Changed:

- `prisma/migrations/20260525231955_init/migration.sql`
- `prisma/migrations/migration_lock.toml`

Decision logic:

- A real initial migration gives Phase 2 a concrete database baseline instead of schema-only intent.

Implementation notes:

- The migration was created and applied with Prisma against the configured development database.
- The first attempt failed in the sandbox with a schema engine error.
- The second attempt succeeded after allowing network access for Prisma.
- No connection string, password, API key, or environment value is recorded here.

---

## Validation Results

Commands run:

```text
npm run prisma:validate
npm run prisma:generate
npm run typecheck
npm run lint
npm run test
npm run build
npx prisma migrate deploy
npx prisma migrate status
```

Results:

- Prisma schema validation passed.
- Prisma client generation passed.
- TypeScript typecheck passed.
- ESLint passed.
- Vitest passed with 2 test files and 19 tests after the integrity hardening tests were added.
- The first production build attempt failed because the sandbox could not fetch Google Fonts.
- The production build passed after rerunning with network permission.
- The Phase 2 integrity migration was applied successfully with `prisma migrate deploy`.
- `prisma migrate status` reported the configured development database is up to date.

Notes:

- No secret values were inspected or copied into this documentation.
- Dependency installation reported moderate audit findings. They were not automatically fixed because forced audit fixes can introduce unrelated breaking changes.

# Phase 4 Documentation

This document records Phase 4 Trip CRUD implementation decisions, technical details, security considerations, and validation results.

It must not include secrets, API keys, database URLs, OAuth credentials, `.env` values, or sensitive terminal output.

---

## Phase Goal

Implement authenticated trip management so signed-in users can:

- Create a new trip from the same trip-details fields available during edit.
- View their own trips.
- View a specific trip they own.
- Edit trip basics.
- Delete a trip they own.
- See readiness warnings before full planning is unlocked.

---

## Product Decisions

Stage 4 uses these locked decisions:

- Trip creation shows full trip basics: title, departure origin, ordered destinations, dates, budget, and travel style.
- Only `title` is required to persist the trip.
- Trips may exist without dates as `DRAFT`.
- The new-trip form has two actions: `Save as draft` and `Continue trip creation`.
- `Save as draft` is available whenever the trip has a title and stores the trip as `DRAFT`.
- `Continue trip creation` requires title, at least one destination, valid dates, budget, currency, and travel style; incomplete attempts show missing requirements.
- `Trip.id` remains the database and route key; trip titles are user-facing labels and are not unique.
- Multi-city routes are modeled as one trip with multiple ordered `TripDestination` rows.
- Departure origin is stored on the trip for future jet lag and time-zone-aware planning.
- Destination and departure dropdowns use a curated static city/country/time-zone catalog during Stage 4.
- Stage 4 supports only `USD` and `EUR`.
- The database stores the user-entered `budgetAmount` and `budgetCurrency`; it does not normalize budgets to USD.
- Future currency conversion should be implemented as derived budget intelligence with exchange-rate snapshots, not as the source of truth.
- Stage 4 supports ordered destination rows, stored as `TripDestination` records with increasing `sortOrder`.
- `travelStyle` maps to `TripPreference.pace`.
- `PATCH /api/trips/[tripId]` uses true partial-update semantics.
- `ARCHIVED` trips cannot be edited or deleted through Stage 4 CRUD.
- Date inputs must be strict `YYYY-MM-DD` calendar dates; impossible dates such as `2026-02-31` are rejected.

---

## Implementation Log

### Validation and Readiness Rules

Changed:

- `docs/requirements.md`
- `docs/travlebuddy_agent_development_plan.md`
- `docs/phase-4-documentation.md`
- `src/features/trips/schemas.ts`
- `src/features/trips/schemas.test.ts`
- `src/features/trips/types.ts`
- `src/features/trips/location-catalog.ts`
- `vitest.config.ts`

Decision logic:

- The new-trip screen uses full trip details so users can create either a draft or a planning-ready trip in one flow.
- Draft creation intent stores `DRAFT`; continue creation intent stores `PLANNING` only when required planning fields are complete.
- Continue attempts that are incomplete remain client-side and list missing requirements.
- Trip titles are not unique; generated trip ids are used as stable keys.
- Optional form fields treat blank HTML input strings as omitted values.
- Departure city and country must be selected together when provided.
- Destination city and country must be provided together.
- Start date and end date must be provided together.
- End date must be on or after start date.
- Budget amount and currency must be provided together.
- Budget amount must be positive.
- Supported currencies are limited to `USD` and `EUR`.
- A trip is derived as `PLANNING` only when destination, valid date range, and budget are present; otherwise it remains `DRAFT`.
- Archived trip status is preserved and cannot be changed through Stage 4 edits.
- API patch payloads may include any subset of editable fields but cannot be empty.
- Destination, date, and budget pair rules are validated after merging a partial patch with the existing trip state.

Technical notes:

- `deriveTripStatusFromDetails` reuses the existing readiness helper instead of duplicating readiness rules.
- Budget values are serialized as strings in trip DTOs so Prisma decimals do not leak into UI or API clients.
- `vitest.config.ts` maps the `@/*` alias for direct module tests that import production files using the app alias.

### Backend Operations

Changed:

- `src/features/trips/queries.ts`
- `src/features/trips/queries.test.ts`
- `src/features/trips/actions.ts`
- `src/features/trips/actions.test.ts`
- `prisma/schema.prisma`
- `prisma/migrations/20260526190000_stage4_full_detail_trip_creation/migration.sql`

Implemented operations:

- `createTrip`
- `getTripsForUser`
- `getTripByIdForUser`
- `updateTrip`
- `deleteTrip`

Decision logic:

- All trip reads and writes are scoped by both `tripId` and authenticated `userId`.
- Trip creation can persist departure origin, ordered destinations, travel dates, budget, and travel pace in one request.
- Update operations keep ownership verification, trip updates, destination edits, preference pace edits, and status derivation inside one transaction.
- Deletion is a hard delete for Phase 4 and relies on existing cascading Prisma relations for child planning records.
- `ARCHIVED` remains reserved for a later archive/restore feature and is immutable in Phase 4 CRUD.
- Mutation operations return explicit outcomes: updated/deleted, not found, archived, or invalid.

Security notes:

- Server Actions call `requireUser`.
- Route Handlers call `assertAuthenticatedApiUser`.
- Ownership is verified at the database query level with `id` and `userId`.
- Delete form confirmation is checked in the server action, not only in the browser UI.
- Proxy route protection remains defense in depth, not the only authorization layer.
- Tests verify owner-scoped query shapes and archived mutation blocking without writing to Neon.

### API Routes

Created:

- `src/app/api/trips/route.ts`
- `src/app/api/trips/[tripId]/route.ts`
- `src/app/api/trips/route.test.ts`
- `src/app/api/trips/[tripId]/route.test.ts`

Implemented routes:

```text
GET    /api/trips
POST   /api/trips
GET    /api/trips/[tripId]
PATCH  /api/trips/[tripId]
DELETE /api/trips/[tripId]
```

Decision logic:

- Next.js 16 dynamic route params are awaited as promises.
- Invalid request bodies return `400`.
- Unauthenticated API requests return `401`.
- Missing or non-owned trips return `404`.
- Archived trip mutations return `409`.
- Unexpected failures return generic `500` messages without leaking internal details.
- `PATCH /api/trips/[tripId]` accepts partial JSON payloads rather than requiring the full settings form shape.

Changed route protection:

- `src/lib/auth-routes.ts`
- `src/lib/auth-routes.test.ts`
- `src/proxy.ts`

### UI

Created:

- `src/app/(dashboard)/trips/new/page.tsx`
- `src/app/(dashboard)/trips/[tripId]/page.tsx`
- `src/app/(dashboard)/trips/[tripId]/preferences/page.tsx`
- `src/app/(dashboard)/trips/[tripId]/settings/page.tsx`
- `src/components/trips/new-trip-form.tsx`
- `src/components/trips/trip-readiness-panel.tsx`
- `src/components/trips/trip-settings-form.tsx`
- `src/components/trips/trip-summary-card.tsx`
- `src/components/auth/sign-out-confirm-form.tsx`

Changed:

- `src/app/(dashboard)/dashboard/page.tsx`
- `src/app/(dashboard)/trips/page.tsx`
- `src/components/layout/app-nav.tsx`
- `src/components/auth/auth-buttons.tsx`

Decision logic:

- Pages are protected through the existing dashboard route group and server-side `requireUser` calls.
- Dashboard shows recent trips and a creation CTA.
- `/trips` lists all signed-in user's trips.
- `/trips/new` offers full trip details, a draft save action, and a gated continue action.
- `/trips/[tripId]/preferences` is a guarded workflow entry placeholder for later preference, recommendation, feedback, and itinerary phases.
- `/trips/[tripId]` displays trip basics and readiness warnings.
- `/trips/[tripId]/settings` edits details and deletes the trip.
- Sign out prompts for confirmation before submitting the server action.
- Full-planning readiness is surfaced before later itinerary, map, conflict, and export phases are implemented.
- Archived mutation attempts redirect back to the settings page with an archived-trip warning.

---

## Validation Results

Commands run during implementation:

```text
npm.cmd run test -- src/features/trips/schemas.test.ts
npm.cmd run test -- src/features/trips/creation-readiness.test.ts
npm.cmd run test -- src/features/trips/actions.test.ts
npm.cmd run test -- src/features/trips/queries.test.ts
npm.cmd run test -- src/lib/auth-routes.test.ts
npm.cmd run test -- src/app/api/trips/route.test.ts
npm.cmd run test -- src/app/api/trips/[tripId]/route.test.ts
npm.cmd run test -- src/components/auth/sign-out-confirm-form.test.ts
npm.cmd run test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

Results:

- New trip schema tests pass.
- New trip continue-readiness tests pass.
- Trip action tests cover draft creation, continue creation, ordered destinations, duplicate titles, ownership failures, archived mutation blocking, and status derivation.
- Trip query tests cover owner-scoped query shapes.
- Trip API route tests cover `GET`, `POST`, `PATCH`, `DELETE`, `400`, `401`, `404`, and `409` behavior.
- Sign-out confirmation helper tests pass.
- Auth route protection tests pass.
- Full Vitest suite passes: 12 test files and 75 tests.
- TypeScript typecheck passes.
- ESLint passes.
- The first production build attempt generated Prisma Client successfully but failed because the sandbox could not fetch Google Fonts for `next/font`.
- The production build passed after rerunning with network permission for the font fetch.
- The successful build generated the expected dynamic routes for `/api/trips`, `/api/trips/[tripId]`, `/trips`, `/trips/new`, `/trips/[tripId]`, `/trips/[tripId]/preferences`, and `/trips/[tripId]/settings`.

Post-audit update:

- Deleted the local ignored `.env.production.local` file because it was untracked, contained blank secret assignments, and masked valid `.env.local` values during `next build`.
- After the cleanup, `npm.cmd run build` passed with Next.js loading `.env.local` and `.env`.

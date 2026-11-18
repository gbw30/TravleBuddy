# New Shell, Trip Start and Fixed Commitments (Milestone 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old Home, navigation and start-a-trip screens with the approved keepsake design, backed by real accounts and saved trips, and add trip facts, tickets, any-city destinations and fixed commitments.

**Architecture:** The Trips service gains a new model (facts, cities with nights, fixed commitments) and one public interface. A new Places folder adds city lookup on OpenStreetMap's Nominatim, saved in the database. Every change goes through a versioned HTTP route under `/api/v1`, which runs a use case that passes one transaction through the Trips service and the existing replay ledger.

**Tech Stack:** Next.js 16.2 App Router, React 19, Prisma 7 on PostgreSQL (Neon), Zod 4, Vitest, Playwright, Tailwind CSS 4.

**Spec:** [PRD](../../prd.md) sections 3, 4, 5, 7.2 and 10; [requirements](../../requirements.md) TB-ACC, TB-HOM, TB-FAC, TB-STA-01 to 03, TB-FIX-01, 02, 06, TB-SYS-13; [roadmap](../../roadmap.md) Milestone 3; [ADR-008](../../architecture/adr-008-modular-services-in-one-deployment.md), [ADR-009](../../architecture/adr-009-place-data-provider.md), [ADR-010](../../architecture/adr-010-service-borders-by-shrinking-exceptions.md).

## Global Constraints

- Service borders: import a service only through `index.ts` or `contracts.ts`; query only tables the service owns; never add to `eslint-suppressions.json` ([service-borders.md](../../architecture/service-borders.md)).
- Every action that changes data goes through a route under `/api/v1` (TB-SYS-04). Server-rendered pages may call service interfaces directly.
- Every change to an existing trip carries `operationId` (UUID) and `expectedRevision`; repeating it returns the first result; a stale revision is refused (TB-SYS-05, TB-SYS-07). Each change commits completely or not at all (TB-SYS-06).
- A traveller reaches only their own trips (TB-ACC-01). Another traveller's trip answers 404, never 403.
- Nominatim: search on submit only, no auto-complete; at most one request a second; identify the application; save every result (ADR-009).
- Migrations are written with `prisma migrate diff` and applied with `prisma migrate deploy`. `prisma migrate dev` is not used: it creates a shadow database, which the operating constraints do not allow.
- Dates and times of commitments are wall-clock values at the place: `YYYY-MM-DD` and `HH:MM`. No time-zone conversion is applied to them.
- Tests and QA run with `PLACE_PROVIDER_MODE=mock`.
- Keep the keepsake look: reuse `src/components/keepsake/styles.ts`, `TicketStub`, `Stamp`, `PlaceArt`.

## Decisions made by the builder

These are not stated in the PRD. Each is open to change.

1. **Addresses.** Home is `/home`, Create is `/trips/new`, a trip is `/trips/{id}`, Profile stays `/profile`. `/dashboard` and `/trips` redirect to `/home`.
2. **Tickets are fixed commitments of kind transport**, stored in the new `fixed_commitments` table with mode, origin and destination. The old `trip_travel_segments` table is left to the old itinerary builder and goes with it in Milestone 4.
3. **Ticket places are typed as text.** When the trip is created, each ticket destination is looked up once and the best match becomes a trip city. A place that cannot be matched is skipped, and the traveller sets it in the facts.
4. **Trip dates from tickets:** the start is the first ticket's arrival date. The end is the last ticket's departure date when that ticket returns to the first ticket's origin. Nights in a city are the days between arriving and the next departure.
5. **Rough time of year is a month** (1 to 12), so provisional dates can be worked out later without the AI model.
6. **A commitment's date is optional** for a must-see not yet dated. A start time needs a date.
7. **A clash** is two commitments with a date and start time whose periods overlap. Stays are not compared: a hotel stay overlaps everything during it by design.
8. **Archive uses the existing `status = ARCHIVED`.** New trips are created as `PLANNING`. `DRAFT` belongs to the old screens.
9. **Trip state:** planning until `plan_finished_at` is set, then upcoming while today is on or before the end date, then past. "Today" is taken in the last city's time zone, or UTC when unknown.
10. **Time zones** come from the `@photostructure/tz-lookup` package (coordinates to IANA zone, no network), the source ADR-009 left to this milestone.
11. **Creating a trip is not replay-protected** (there is no trip yet to hold the ledger entry). The button is disabled while the request runs.
12. **The way of planning is asked and saved**, as in the approved design. Guided planning and Quick plan themselves arrive in Milestones 5 and 7; until then the trip page shows the facts and commitments.
13. **The old preferences, planning and itinerary pages stay reachable** from the trip page until Milestones 4 to 6 replace them. The old logistics and settings pages are removed.
14. **A trip's picture** is a postcard back with the city name until photos exist (ADR-009).

## Review Focus

1. Another traveller's trip id in any `/api/v1` route answers 404 and changes nothing.
2. A repeated request with the same `operationId` returns the first result and does not apply twice; a different body with the same id answers 409.
3. A stale `expectedRevision` answers 409 and changes nothing.
4. A flight that lands "before" it leaves in local time (west across the date line) is accepted.
5. City lookup failing or returning nothing never blocks creating a trip or saving other facts.

## File structure

| File                                                                                                              | Responsibility                                          |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `prisma/migrations/20261118090000_trip_facts_and_commitments/migration.sql`                                       | New columns, enums, `fixed_commitments`, `city_lookups` |
| `src/lib/currency.ts`                                                                                             | Moved from `src/features/prototype/currency.ts`         |
| `src/features/trips/contracts.ts`                                                                                 | Browser-safe schemas and types for the Trips routes     |
| `src/features/trips/trip-state.ts`                                                                                | `tripState`, `todayIn`, `missingFacts`                  |
| `src/features/trips/tickets.ts`                                                                                   | `factsFromTickets`                                      |
| `src/features/trips/clashes.ts`                                                                                   | `findClashes`                                           |
| `src/features/trips/trip-store.ts`                                                                                | Reads and writes of trips in the new model              |
| `src/features/trips/commitment-store.ts`                                                                          | Reads and writes of fixed commitments                   |
| `src/features/trips/index.ts`                                                                                     | The Trips interface                                     |
| `src/features/places/contracts.ts`, `nominatim.ts`, `mock-cities.ts`, `city-lookup.ts`, `index.ts`                | City lookup                                             |
| `src/features/planning/index.ts`                                                                                  | Interface to the replay ledger                          |
| `src/use-cases/trip-action.ts`, `start-trip.ts`                                                                   | Work that spans Trips, Places and the ledger            |
| `src/app/api/v1/**`                                                                                               | Routes; `docs/api/v1.md` documents them                 |
| `src/app/(app)/**`                                                                                                | The signed-in shell, Home, Create, the trip page        |
| `src/components/keepsake/trip-card-actions.tsx`, `trip-facts-form.tsx`, `trip-commitments.tsx`, `city-picker.tsx` | New client components                                   |

## Tasks

### Task 1: Schema

- [ ] Add to `prisma/schema.prisma`: enums `TripVisibility { PRIVATE }`, `Firmness { FIXED FLEXIBLE }`, `BudgetBasis { TRIP DAY }`, `PlanningMode { GUIDED QUICK }`, `CommitmentKind { TRANSPORT STAY RESERVATION MUST_SEE OTHER }`; on `Trip`: `visibility` (default `PRIVATE`), `planningMode?`, `planFinishedAt?`, `lengthNights?`, `timeOfYear?`, `adults?`, `children?`, `budgetBasis?`, `datesFirmness?`, `budgetFirmness?`, `purpose?` (120); on `TripDestination`: `nights?`; models `FixedCommitment` (Trips) and `CityLookup` (Places).
- [ ] Add both models to `service-map.json`; add `src/features/places/**` to Places.
- [ ] Write the migration with `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`, apply with `prisma migrate deploy`, run `prisma generate`.
- [ ] `npm run test -- prisma` passes.

### Task 2: Trips rules (pure)

**Produces:** `contracts.ts` schemas `ticketInputSchema`, `startTripSchema`, `tripFactsSchema`, `commitmentInputSchema`, `tripActionSchema`; types `TripSummary`, `TripDetail`, `TripFacts`, `CommitmentDto`, `Clash`, `TripState`. `tripState(trip, today)`, `todayIn(timeZone, now)`, `missingFacts(facts)`, `factsFromTickets(tickets)`, `findClashes(commitments)`.

- [ ] Tests first: `trip-state.test.ts`, `tickets.test.ts`, `clashes.test.ts`, `contracts.test.ts`, including Review Focus 4.
- [ ] Implement; tests pass.

### Task 3: City lookup

**Produces:** `findCities(query): Promise<{ status: "ok"; cities: City[] } | { status: "unavailable" }>`.

- [ ] Tests first: Nominatim reply mapping (Tokyo as a province, Sintra as a municipality), the saved-result path, the unavailable path, mock mode.
- [ ] Implement with a one-request-a-second gate per process and the `city_lookups` table.

### Task 4: Stores and use cases

**Produces:** `listTrips(userId)`, `getTrip(userId, tripId)`, `createTrip(userId, input)`, `renameTrip`, `saveTripFacts`, `setTripArchived`, `setPlanFinished`, `removeTrip`, `addCommitment`, `updateCommitment`, `removeCommitment` (each change takes the transaction first); `runTripAction(input)` and `startTrip(userId, input)`.

- [ ] Add the new kinds to `PlanningMutationKind`; export the ledger through `src/features/planning/index.ts`.
- [ ] Tests first for `runTripAction` outcomes: ok, not found, archived, stale, conflict.
- [ ] Implement.

### Task 5: Routes

`POST /api/v1/trips`; `PATCH`, `DELETE /api/v1/trips/{tripId}`; `POST /api/v1/trips/{tripId}/commitments`; `PATCH`, `DELETE /api/v1/trips/{tripId}/commitments/{commitmentId}`; `GET /api/v1/places/cities?q=`.

- [ ] Tests first: 401 signed out, 422 invalid body, 404 not owner (Review Focus 1), 409 stale and conflict (Review Focus 2, 3), 200 and 201 shapes.
- [ ] Implement; add `/home` and `/api/v1` to the protected routes; write `docs/api/v1.md`.

### Task 6: Shell and Home

- [ ] `(app)/layout.tsx` in the keepsake shell with Home, Create, Profile and Sign out; restyle the landing and sign-in pages.
- [ ] `/home`: the trip in planning first, the other trips, an archived list, the empty welcome; rename, archive, restore and delete with confirmation.

### Task 7: Create

- [ ] `StartTrip` takes full ticket details (leaves on, at, arrives on, at) and, outside the sample prototype, posts to `/api/v1/trips` and opens the new trip.

### Task 8: The trip page

- [ ] Facts form (where with city lookup, when, who, budget, firmness, purpose) and fixed commitments (add, edit, remove, clash notice), mark the plan finished and reopen it.

### Task 9: Remove what was replaced

- [ ] Delete the old dashboard, trips list, new-trip form, logistics and settings pages, `AppNav`, and components and actions nothing uses any more. Prune `eslint-suppressions.json`.
- [ ] Update `e2e/` and the auth tests to the new addresses.

### Task 10: Evidence

- [ ] `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` pass.
- [ ] Browser walk on wide and phone widths: sign in, empty Home, create with a ticket, facts, commitments with a clash, rename, archive, delete. Axe: no serious violations.
- [ ] Update `docs/status/current-implementation.md` and the roadmap's Milestone 3 entry.

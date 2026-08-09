# TravleBuddy Agent-Friendly Development Plan

Status: historical
Authority: Preserved phase-oriented development plan only
Superseded by: [Active roadmap](../roadmap.md)
Related: [Canonical target](../requirements.md), [current implementation](../status/current-implementation.md)
Last reviewed: 2026-08-09

> **Historical document:** Do not use this document as current product requirements or implementation order. It preserves the original phase-oriented plan and its implementation rationale.

> Historical plan. The canonical product direction is
> [requirements.md](../requirements.md), and the active delivery sequence is
> [roadmap.md](../roadmap.md). Retain this file only as implementation history;
> conflicting conversation-, map-, export-, or static-itinerary priorities are
> superseded.

## Purpose

TravleBuddy is a travel-planning web app that helps users create personalized trip itineraries. Users create a trip, answer preference questions, receive place suggestions, select places, and generate an itinerary that accounts for budget, pacing, location, and travel-time conflicts.

This document is written for an AI coding agent such as Codex. It separates work that the **agent can implement** from work that the **user must do manually**, especially around secrets, billing, accounts, and product decisions.

---

## Core MVP Goal

Build a working MVP where:

1. A user can sign in.
2. A user can create and manage trips.
3. A user can answer structured travel preference questions.
4. The app can generate 5 place suggestions using mock data first.
5. The user can select or reject suggestions.
6. The app can persist feedback, engine explanations, readiness warnings, and suggested next actions as planning context.
7. The app can build a simple day-by-day itinerary after the trip has destinations, dates, and budget.
8. The app can detect basic conflicts after the trip has destinations, dates, and budget.
9. The app can display selected places on a map after the trip has destinations, dates, and budget.
10. The user can export/download a copy of the trip.

The MVP should prioritize correctness, clean architecture, and testable logic over visual polish.

---

## Assumed Stack

Use these assumptions unless the repository already proves otherwise:

- Framework: Next.js App Router
- Language: TypeScript
- Styling: Tailwind CSS
- Database: Neon Postgres
- ORM: Prisma
- Auth: NextAuth/Auth.js using Google login first
- Deployment: Vercel
- AI: Gemini API
- Maps/place data: Google Maps, Places, and Routes APIs
- Testing: Vitest for core logic
- CI/CD: GitHub Actions plus Vercel GitHub integration

If the existing repository uses a different stack, inspect the repo and adapt the implementation without rewriting the project unnecessarily.

### Current Repository State

As of this plan, the repository uses:

- Package manager: npm
- Next.js: 16.x App Router
- React: 19.x
- Prisma: 7.x
- Auth direction: Auth.js v5-style setup with `next-auth@beta`, Google OAuth, and `@auth/prisma-adapter`
- Test runner installed: Vitest

### Project Structure Convention

Use the existing project convention instead of introducing a parallel `src/server` tree:

```text
src/
  app/       route handlers, layouts, pages, route groups
  components/ shared UI components
  features/ domain logic, actions, queries, schemas, types
  lib/       cross-cutting infrastructure adapters and utilities
  types/     shared ambient or app-wide types
```

Recommended placement:

- Trip, preference, recommendation, itinerary, and conflict domain logic belongs in `src/features/*`.
- Google, Gemini, database, auth, env, and export infrastructure belongs in `src/lib/*`.
- Route Handlers and pages belong in `src/app/*`.

---

## Non-Negotiable Agent Rules

The coding agent must follow these rules throughout the project:

1. **Do not hardcode secrets.**
   - Never commit API keys, database URLs, auth secrets, or service tokens.
   - Use environment variables only.

2. **Do not build social features before the MVP works.**
   - No followers, public profiles, trip feeds, likes, comments, or photo uploads during MVP phases.

3. **Do not start with Gemini or Google API calls.**
   - Build mock data, schemas, scoring, and itinerary logic first.
   - External APIs should be adapters plugged into already-working internal logic.

4. **Do not let Gemini become the source of truth.**
   - Gemini may parse text, summarize, or explain.
   - The backend owns validation, scoring, conflict checks, database writes, and permissions.

5. **All user-owned data must be protected by ownership checks.**
   - Every trip, preference, suggestion, itinerary item, and conflict lookup must verify the authenticated user owns the parent trip.

6. **Preserve the planning feedback loop.**
   - User feedback, engine reasoning, readiness warnings, budget warnings, conflict summaries, and proposed next actions should be stored as durable planning context.
   - The MVP feedback loop is structured and persisted, not a chat-first interface.

7. **Every major phase must end with build/test verification.**
   - Run lint, typecheck, tests, and build when available.

8. **Prefer small, reviewable changes.**
   - Implement one phase at a time.
   - Do not combine auth, database schema, Google APIs, and UI polish in one giant change.

---

## Environment Variables

### Required Server-Side Variables

These should be present locally in `.env.local` and on Vercel as encrypted environment variables:

```env
DATABASE_URL=
DIRECT_URL=
AUTH_SECRET=
AUTH_URL=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
```

`DIRECT_URL` is required for migration workflows even if app startup can temporarily fall back to `DATABASE_URL`.

Legacy aliases may exist only as local migration aids during the move away from v4-style naming:

```env
NEXTAUTH_SECRET=
NEXTAUTH_URL=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

These are required only after the matching integrations are enabled:

```env
GEMINI_API_KEY=
GOOGLE_MAPS_API_KEY=
GOOGLE_PLACES_API_KEY=
GOOGLE_ROUTES_API_KEY=
```

### Optional Browser-Side Variable

Only use this if the frontend directly renders a Google Map using the Maps JavaScript API:

```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
```

### Agent Responsibilities

- Create or update `.env.example` with placeholder keys only.
- Add environment validation, preferably using `zod`.
- Ensure server-only secrets are never imported into client components.
- Ensure browser-exposed variables use `NEXT_PUBLIC_` only when needed.

### User Responsibilities

- Create the real `.env.local` file.
- Add real values to Vercel Project Settings.
- Generate and rotate API keys when necessary.
- Restrict Google API keys in Google Cloud Console.
- Confirm the production `AUTH_URL` after Vercel deployment.

---

## Recommended Branch Strategy

### Simple Solo Developer Strategy

```text
main       = production-ready branch
feature/*  = individual features
```

Flow:

```text
feature branch -> pull request -> CI checks -> merge to main -> Vercel production deploy
```

### Agent Responsibilities

- Keep changes scoped to the current feature/phase.
- Avoid unrelated formatting churn.
- Update documentation when behavior changes.

### User Responsibilities

- Review pull requests before merge.
- Check Vercel preview deployments.
- Approve production deploys by merging to `main`.

---

## Validation Commands

The agent should use the repository's actual scripts. If scripts are missing, add them gradually.

Recommended scripts:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests",
    "prisma:validate": "prisma validate",
    "prisma:generate": "prisma generate",
    "db:deploy": "prisma migrate deploy"
  }
}
```

Recommended verification sequence:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run dev
```

If a command does not exist yet, the agent should either add it or clearly document why it is skipped.

`npm run dev` is a local smoke check: start the development server, confirm it reaches the ready state, then stop it before completing the phase.

`--passWithNoTests` is acceptable while the repo is still pre-MVP and has no test files. Once core logic tests exist, remove that flag so an accidentally empty test suite fails CI.

---

# Phase 1 - Repository Foundation

## Goal

Prepare the project so future work is reliable, typed, and easy to validate.

## Agent Tasks

- Inspect the existing repository structure.
- Confirm whether the app uses Next.js App Router.
- Confirm package manager: npm, pnpm, yarn, or bun.
- Add or clean up base folders:

```text
src/
  app/
  components/
  lib/
  features/
  types/
  tests/
prisma/
```

- Add or update:

```text
.env.example
.gitignore
README.md
```

- Add environment validation:

```text
src/lib/env.ts
```

- Add shared utility modules:

```text
src/lib/db.ts
src/lib/auth.ts
src/lib/utils.ts
src/lib/errors.ts
```

- Add basic CI if missing:

```text
.github/workflows/ci.yml
```

## User Tasks

- Confirm the final app name.
- Confirm the package manager only if changing from npm.
- Confirm whether Neon branching should use one project with multiple branches or separate dev/prod projects.
- Add real secrets to `.env.local`.
- Add real secrets to Vercel.

## Exit Criteria

- App runs locally.
- `.env.example` exists with no real secrets.
- CI file exists or is intentionally deferred.
- Build command works or known blockers are documented.

---

# Phase 2 - Database and Prisma Setup

## Goal

Create the persistent data foundation for users, trips, destinations, preferences, suggestions, planning feedback, planning events, itinerary items, and conflicts.

## Agent Tasks

- Add Prisma if missing.
- Create or update `prisma/schema.prisma`.
- Define initial models:

```text
User
Account
Session
VerificationToken
Trip
TripDestination
TripPreference
PlaceSuggestion
PlanningFeedback
PlanningEvent
ItineraryDay
ItineraryItem
Conflict
```

- Add ownership relationships:

```text
User -> Trip -> child records
```

Child records that carry `tripId` must not reference child records from a different trip. Use database-level same-trip foreign keys where possible and service-level ownership checks for every authenticated lookup.

- Add draft and full-planning rules:

```text
DRAFT trips can use discovery only.
PLANNING trips can use itinerary, map, conflicts, and full export only when destination list, date range, budget amount, and budget currency exist.
```

- Add planning feedback loop storage:

```text
PlanningFeedback = user response or structured feedback on trip objects
PlanningEvent = append-only planning timeline for user actions, engine explanations, warnings, proposals, and summaries
```

`PlanningFeedback.targetId` must be derived from the typed target field and kept synchronized with it. Do not allow arbitrary target IDs that disagree with `tripPreferenceId`, `placeSuggestionId`, `itineraryDayId`, `itineraryItemId`, or `conflictId`.

- Add timestamps:

```text
createdAt
updatedAt
```

- Add indexes where useful:

```text
Trip.userId
TripDestination.tripId
TripPreference.tripId
PlaceSuggestion.tripId
PlanningFeedback.tripId
PlanningEvent.tripId
ItineraryDay.tripId
Conflict.tripId
```

- Generate Prisma Client.
- Add safe database helper in `src/lib/db.ts`.
- Add trip readiness helpers in `src/features/trips`.
- Add unit tests for readiness and feedback-target validation.
- Create or update `docs/phase-2-documentation.md` throughout the work.

## User Tasks

- Provide Neon pooled connection string as `DATABASE_URL`.
- Provide Neon direct connection string as `DIRECT_URL`.
- Run or approve production migrations.
- Confirm whether preview deployments should use the production database or a separate preview database.

## Exit Criteria

- Prisma Client generates successfully.
- Local database connection works.
- Initial migration exists.
- Draft/full-planning readiness rules have tests.
- Planning feedback target rules have tests.
- No secrets are committed.

---

# Phase 3 - Authentication

## Goal

Allow users to sign in with Google OAuth and protect user-specific data with both route-level session checks and server-side ownership checks.

## Documentation and Comment Review First

- Review `docs/phase-2-documentation.md` against the current Phase 2 codebase.
- Confirm Phase 2 schema, migration, helper, dependency, and validation changes are recorded.
- Fix stale Phase 2 documentation notes before Phase 3 implementation begins.
- Confirm Phase 2 docs do not include environment values, API keys, database URLs, OAuth credentials, or sensitive terminal output.
- Review Phase 2 code comments with this policy:

```text
Add comments only for non-obvious business rules, security invariants, schema constraints, or future agent responsibilities.
Do not add comments that restate straightforward code.
Prefer short comments near complex Prisma constraints and auth/ownership boundaries.
Prefer documentation entries for broader rationale.
```

- Create and maintain:

```text
docs/phase-3-documentation.md
```

Record every Phase 3 change, implementation decision, command, validation result, manual test result, and any remaining user task without exposing secrets.

## Agent Tasks

- Upgrade to `next-auth@beta` and add `@auth/prisma-adapter`.
- Configure Auth.js / NextAuth v5-style auth.
- Use Google OAuth only for MVP.
- Do not add a dev-only auth bypass.
- Add auth route:

```text
src/app/api/auth/[...nextauth]/route.ts
```

- Add session helper:

```text
src/lib/auth.ts
```

- Add protected dashboard route:

```text
src/app/dashboard/page.tsx
```

- Add sign-in and sign-out UI.
- Add auth-aware navigation.
- Ensure authenticated user ID is available server-side.
- Add route protection in `src/proxy.ts` because this project uses Next.js 16.
- Redirect signed-out protected-route requests to `/login`.
- Redirect signed-in `/login` requests to `/dashboard`.
- Add ownership guard helper, for example:

```ts
requireTripOwner(userId: string, tripId: string)
```

## User Tasks

- Create OAuth credentials in Google Cloud Console.
- Add authorized redirect URIs.
- Add provider client ID and secret to `.env.local` and Vercel if required.
- Confirm final production domain for auth callback settings.
- Manually verify Google sign-in/sign-out in a browser once local credentials are present.

## Exit Criteria

- `docs/phase-3-documentation.md` records documentation review, implementation decisions, commands, and validation results.
- User can sign in locally.
- User can sign out.
- Dashboard is inaccessible when signed out.
- Session user is available to server routes/actions.
- Protected APIs reject unauthenticated requests.
- No trip data can be accessed without auth and ownership checks.
- No secrets are committed or documented.

---

# Phase 4 - Trip CRUD

## Goal

Users can create, view, edit, and delete trips.

## Agent Tasks

- Build backend operations for:

```text
createTrip
getTripsForUser
getTripByIdForUser
updateTrip
deleteTrip
```

- Add routes and server actions for:

```text
POST   /api/trips
GET    /api/trips
GET    /api/trips/[tripId]
PATCH  /api/trips/[tripId]
DELETE /api/trips/[tripId]
```

- Build pages:

```text
/dashboard
/trips/new
/trips/[tripId]
/trips/[tripId]/settings
```

- Add forms with validation for:

```text
title
departureCity
departureCountry
destinationCity
destinationCountry
startDate
endDate
budgetAmount
budgetCurrency
travelStyle
```

- Ensure all trip operations check ownership.
- Use the same core trip-detail fields on the new-trip screen and the settings screen.
- Require only `title` for trip creation.
- Use generated `Trip.id` values as database and route keys; do not make trip names unique.
- Add `Save as draft` and `Continue trip creation` actions on the new-trip screen.
- Keep `Save as draft` available whenever title is filled and persist the trip as `DRAFT`.
- Gate `Continue trip creation` until title, at least one destination, valid date range, positive budget amount, budget currency, and travel style are complete.
- Explain missing requirements when the user tries to continue before the trip is complete.
- Redirect successful continue creation to `/trips/[tripId]/preferences`.
- Add a guarded `/trips/[tripId]/preferences` entry page as the future preference/recommendation/itinerary workflow start.
- Model multi-city routes as one trip with ordered `TripDestination` rows, not linked trip records.
- Add optional departure city/country/time-zone fields for future jet lag and time-zone-aware planning.
- Use a curated static city/country/time-zone dropdown catalog during Phase 4.
- Automatically save incomplete named trips as `DRAFT`.
- Allow undated draft trips.
- Support only `USD` and `EUR` during Phase 4.
- Store the user's original budget amount and budget currency.
- Do not normalize budgets to USD in Phase 4. Future conversion should be a derived budgeting feature with exchange-rate snapshots.
- Store Phase 4 destinations as ordered `TripDestination` rows.
- Map `travelStyle` to `TripPreference.pace`.
- Treat `PATCH /api/trips/[tripId]` as a true partial update endpoint.
- Reject empty PATCH payloads.
- Validate destination, date, and budget pairs after merging PATCH payloads with existing trip state.
- Reject impossible calendar dates such as `2026-02-31`.
- Block edits and deletes for `ARCHIVED` trips until a future explicit restore/archive workflow exists.
- Keep trips in `DRAFT` until destination list, dates, budget amount, and budget currency are present.
- Surface missing requirements before enabling full planning.
- Add sign-out confirmation before submitting the sign-out server action.
- Create and maintain:

```text
docs/phase-4-documentation.md
```

Record Phase 4 decisions, implementation details, security considerations, commands, validation results, manual test notes, and remaining user tasks without exposing secrets.

## User Tasks

- Review the implemented full-detail creation flow and confirm whether any fields should be visually grouped or deferred.
- Confirm when future currency conversion should be added to budget/conflict features.
- Confirm whether future trip settings should support multiple destinations.

## Exit Criteria

- Signed-in user can create a trip.
- Signed-in user can view their trips.
- Signed-in user can edit a trip.
- Signed-in user can delete a trip.
- User cannot access another user's trip by URL guessing.
- PATCH supports partial trip updates.
- Archived trips cannot be edited or deleted.
- Automated tests cover trip schemas, query ownership, mutations, and route-handler success/error responses.

---

# Phase 5 - Preference Questionnaire

## Goal

Collect structured, trip-local user preferences for each planning-ready trip.

Product direction:

- Phase 5's current single-page form is the backend and CRUD foundation for preferences.
- The final MVP should expose preference modification through a separate Preferences tab in trip settings.
- The final MVP and product should collect and save preferences primarily through a guided feedback loop, not through a static all-fields-at-once form.
- Phase 5 includes a basic profile tab where users can edit their name and view saved travel preference defaults.
- Saved user travel preferences use a separate `UserTravelPreference` model extracted from trip preferences.
- New trip creation should offer an option to apply saved profile preferences.

## Agent Tasks

- Add `TripPreference` create/read/update operations using the existing schema.
- Add `UserTravelPreference` persistence for reusable profile defaults.
- Build a planning-ready-only route/page:

```text
/trips/[tripId]/preferences
```

- If trip details are incomplete, keep the locked-state guidance and route users back to trip settings.
- If the trip is archived, block mutation and explain that preferences cannot be updated.
- If the trip is planning-ready, show a single-page questionnaire plus a right-side summary panel.
- Keep the user on the page after save and show a saved confirmation.
- Add authenticated JSON interfaces:

```text
GET /api/trips/[tripId]/preferences
PUT /api/trips/[tripId]/preferences
```

- Add structured fields:

```text
pace
budgetLevel
interests
transportationModes
accommodationTypes
hotelPriority
walkingToleranceKm
dietaryRestrictions
accessibilityNeeds
mustAvoid
customNotes
customPreferences
```

- Require `pace`, `budgetLevel`, at least one interest, and at least one transportation mode for a complete profile.
- Use the expanded Travel MVP interest list: Food, History, Museums, Nature, Adventure, Nightlife, Shopping, Photography, Beaches, Art, Architecture, Music, Wellness, Local Culture, and Hidden Gems.
- Use enum-backed options for budget, pace, transportation, and accommodation.
- Use sliders for hotel priority and walking tolerance.
- Store dietary restrictions, accessibility needs, and must-avoid items as parsed arrays.
- Store blank custom notes as `null`.
- Store custom non-core preferences as deduped structured values in `TripPreference.metadata.customPreferences`.
- Keep `TripPreference.pace` as the source of truth for Phase 4 travel style.
- Add preference summary component.
- Add a visible `SYSTEM_NOTE` planning event on successful preference create/update.
- Expose the serialized preference DTO for Phase 6 recommendations.
- Document that reset/delete preferences and user-level learned preferences are future scope.
- Add a settings Preferences tab so users can discover and modify saved preferences from `/trips/[tripId]/settings`.
- In the settings Preferences tab, display non-core preferences as removable boxes or chips with a clickable `x`.
- Add a search-based preference entry control:
  - Matching known preference options are shown as selectable results.
  - If there are no matches, the user can create a custom preference from the search query.
  - Creating a custom preference adds a new visible preference box.
- Preserve the same trip-local preference DTO as the source consumed by Phase 6.
- Upsert saved user travel preferences when trip preferences are saved.
- Let users edit their display name in `/profile`.
- Show saved travel preference defaults in `/profile`.
- Add a `Use my saved travel preferences` option to `/trips/new`.
- When profile preference autofill is enabled, create the new trip with a trip-local `TripPreference` seeded from the saved user defaults.
- Plan the final MVP preference capture as a question-by-question feedback loop:
  - Ask focused preference questions during planning.
  - Let users choose from options or enter a custom answer.
  - Save answers into the trip-local preference profile.
  - Persist meaningful changes as planning context.

## User Tasks

- Review the implemented questionnaire and confirm whether any labels or default option ordering should change.
- Confirm future rules for resetting preferences.
- Confirm the product direction for user-level learned preferences before cross-trip learning is implemented.
- Review the settings-tab preference editing model.
- Confirm which non-core preference categories should support custom chips first.
- Confirm when the static Phase 5 form can be retired in favor of the guided feedback loop.

## Exit Criteria

- User can save preferences for a trip.
- User can edit preferences.
- User can discover preference editing from a separate tab in trip settings.
- User can add and remove non-core custom preference boxes.
- User can edit their profile name.
- User can see saved travel preference defaults in their profile.
- User can apply saved profile preferences while creating a new trip.
- Preferences reload from the database.
- Preferences are available to the recommendation engine.
- Preference create/update writes a summary planning event.
- API route tests cover success and access/error responses.
- The implementation docs clearly distinguish the current Phase 5 form foundation from the final MVP feedback-loop UX.

---

# Phase 6 - Conversational Planning Recommendations

## Goal

Build the core conversational planning loop before connecting external APIs.

Users describe trip ideas in natural English, the app saves extracted preference signals, and the system generates topic-specific recommendation groups once enough context exists. The live plan preview grows inside the planning workspace instead of sending users to a separate itinerary page.

## Agent Tasks

- Add planning workspace:

```text
/trips/[tripId]/planning
```

- Add deterministic preference extraction:

```text
src/features/recommendations/extraction.ts
```

- Create mock place dataset:

```text
src/features/recommendations/mock-places.ts
```

- Create recommendation scoring module:

```text
src/features/recommendations/scoring.ts
```

- Score places using:

```text
interest match
budget fit
rating
distance from base/destination
pace fit
penalties
```

- Add routes/actions:

```text
GET  /api/trips/[tripId]/recommendations?topic=HOTEL_BASE
POST /api/trips/[tripId]/recommendations/generate
POST /api/trips/[tripId]/recommendations/[suggestionId]/select
POST /api/trips/[tripId]/recommendations/refresh
```

- Store user planning messages in `PlanningFeedback`.
- Autosave extracted preference signals into `TripPreference`.
- Save already-decided user places as selected `PlaceSuggestion` rows with `provider = USER`.
- Generate 5 topic-specific suggestions.
- Store mock suggestions in `PlaceSuggestion` with stable upserts by `tripId + provider + providerPlaceId`.
- Add explanation text for each suggestion.
- Show selected anchors and picked recommendations in a live plan preview.
- Add Vitest tests for extraction, topic readiness, scoring, service persistence, route behavior, and planning page rendering.

## User Tasks

- Review scoring weights.
- Review the conversational planning workspace.
- Confirm whether deterministic extraction labels feel understandable before Gemini is added later.

## Exit Criteria

- User can open `/trips/[tripId]/planning` for a planning-ready trip.
- User can save natural-language planning feedback.
- Extracted preference signals are persisted to the trip-local preference profile.
- User can add already-decided places as selected anchors.
- App generates 5 topic-specific mock recommendations.
- Recommendations are stored in the database with stable upserts.
- Each recommendation has a score and explanation.
- User can pick a recommendation into the live plan preview.
- User can refresh recommendations with a natural-language note.
- Planning feedback and recommendation batch events are stored.
- Focused Stage 6 tests pass.
- No Google or Gemini API call is required yet.

## Final MVP Optimization Note

Redis preference caching should be evaluated as the final MVP optimization stage, after core planning, recommendations, itinerary, maps, export, and polish are working. Redis should cache derived preference/readiness/recommendation-input DTOs, not replace Postgres. The optimization stage should include cache invalidation rules and before/after latency measurements.

---

# Phase 7 - Recommendation Feedback and Itinerary Handoff

## Goal

Complete the deterministic feedback loop inside the unified planning workspace before building day-by-day itineraries.

Stage 6 already moved recommendation selection and refresh into `/trips/[tripId]/planning`, so Phase 7 must not add the old separate `/suggestions` page. It should strengthen the existing planning workspace with reject/remove semantics, structured feedback reasons, feedback-aware scoring, visible planning history, and a clean selected-place handoff for Phase 8.

## Agent Tasks

- Keep recommendations inside:

```text
/trips/[tripId]/planning
```

- Use the existing soft status model:
  - `PENDING` = available but not selected
  - `SELECTED` = included in the live plan preview and future itinerary input
  - `REJECTED` = excluded from future batches and used for feedback penalties
- Add explicit routes:

```text
POST /api/trips/[tripId]/recommendations/[suggestionId]/reject
POST /api/trips/[tripId]/recommendations/[suggestionId]/deselect
```

- Add structured reject reasons:
  - Not interested
  - Too expensive
  - Too far
  - Wrong vibe
  - Already been there
  - Other
- Keep `TOO_BUSY`, `TOO_SLOW`, and `GOOD_MATCH` for later itinerary/conflict feedback.
- Add optional rejection notes.
- Add remove/deselect behavior so selected places can return to `PENDING` without being rejected.
- Save every major select, reject, remove, and refresh action to `PlanningFeedback`.
- Write visible `PlanningEvent` rows for the compact planning timeline.
- Add deterministic v1 feedback penalties so rejected feedback influences later mock recommendation batches.
- Show a compact planning timeline in the planning workspace sidebar.
- Add soft itinerary handoff messaging once at least one place is selected.
- Keep a future migration path open for a separate selection model if itinerary versions, collaboration, or saved/maybe lists are added later.

## User Tasks

- Review the Stage 7 feedback UX and confirm whether the reject reason labels feel natural.
- Confirm later whether a separate selection model is needed once itinerary versioning or collaboration is designed.

## Exit Criteria

- User can select a suggestion.
- User can reject a suggestion.
- User can remove a selected place without rejecting it.
- User can refresh recommendations.
- Rejection reasons and optional notes are stored.
- Rejected feedback affects later mock recommendation scoring.
- Engine explanations, recommendation batches, and user feedback are visible in the planning timeline.
- Selected places persist after page reload.
- Stage 8 can build from `PlaceSuggestion` rows where `status = SELECTED`.

---

# Phase 8 - Basic Itinerary Builder

## Goal

Convert selected places into a deterministic, persistent day-by-day itinerary draft.

Itinerary building is locked unless the trip is full-planning ready.

## Agent Tasks

- Add itinerary service:

```text
src/features/itinerary/builder.ts
```

- Add route/action:

```text
POST /api/trips/[tripId]/itinerary/build
GET  /api/trips/[tripId]/itinerary
```

- Create `ItineraryDay` rows for every date from `Trip.startDate` through `Trip.endDate`, inclusive.
- Build from `PlaceSuggestion` rows where `status = SELECTED`.
- Persist rebuilds by replacing generated itinerary rows for the trip.
- Rebuild automatically after selected-place changes and pace changes.
- Respect exact pace rules:

```text
RELAXED  = 3 non-hotel items/day
BALANCED = 4 non-hotel items/day
PACKED   = 6 non-hotel items/day
```

- Place hotels at the start of Day 1.
- Order non-hotel places by category priority, then recommendation score.
- Show daily and trip estimated cost totals when selected places have estimated costs.
- Add a compact itinerary preview inside `/trips/[tripId]/planning`.
- Add itinerary page:

```text
/trips/[tripId]/itinerary
```

- Keep itinerary page read-only in Phase 8.
- Add tests for grouping logic.

## User Tasks

- Confirm later whether manual itinerary reorder belongs in the MVP.
- Confirm later whether itinerary times should be automatically assigned.
- Confirm later whether hotel check-in/check-out and daily start/end windows need explicit settings.

## Exit Criteria

- Selected places can be converted into itinerary days.
- Itinerary persists in the database.
- User can view itinerary after reload.
- Pace rules are respected.
- Tests cover basic itinerary grouping.
- Manual edits, clock times, route duration, budget warnings, maps, export, Gemini, Google APIs, and Redis remain out of scope for Phase 8.

---

# Phase 9 - Conflict Detection

## Goal

Warn users when selected itinerary items are unrealistic or inconsistent.

Conflict detection is locked unless the trip is full-planning ready.

## Agent Tasks

- Add conflict service:

```text
src/features/itinerary/conflict-engine.ts
```

- Keep the detector deterministic and persisted:
  - evaluate existing `ItineraryDay` and `ItineraryItem` rows
  - write `Conflict` rows with `status = OPEN`
  - replace only stale `OPEN` conflicts on rerun
  - preserve `RESOLVED` and `IGNORED` conflict history
  - write a visible `CONFLICT_SUMMARY` planning event
- Add conflict checks for:

```text
budget conflict
schedule density conflict
time overlap conflict
missing duration conflict
mixed-city/country distance placeholder conflict
hotel location mismatch conflict
explicit closed/unavailable placeholder conflict
missing restaurant coverage warning
```

- Add route/action:

```text
POST  /api/trips/[tripId]/conflicts/check
PATCH /api/trips/[tripId]/conflicts/[conflictId]/resolve
```

- Keep routes thin:
  - authenticate
  - await route params
  - call the conflict service
  - return small JSON payloads
  - revalidate only `/trips/[tripId]/itinerary` after conflict mutations
- Display conflicts on itinerary page with a manual "check conflicts" action.
- Refresh deterministic open conflicts automatically when persisted itinerary rows are read or rebuilt, and when trip settings changes affect dates, destinations, budget, or pace.
- Keep automatic Phase 9 conflict refresh database-local. Future maps, AI, route-duration, hours, or availability checks must move behind explicit checks or async jobs.
- Let user-entered already-decided places include optional estimated cost in the trip budget currency so budget conflicts include custom anchors.
- Let users change the planning context by saved destination city and day in the planning workspace. Phase 9 uses this to generate recommendations for the selected city and stores the selected day as planning metadata; exact manual day placement remains a future itinerary-scheduling feature.
- Deduplicate open conflict warnings before display so rapid rebuilds or repeated checks do not show repeated copies of the same issue.
- Style conflict warnings by severity using standard visual priority: low/info, medium/warning, high/danger.
- Add severity levels:

```text
low
medium
high
```

- Selection, rejection, and deselection must stay responsive. Automatic Phase 9 checks may run only as part of the existing persisted itinerary rebuild/read path and must not add external provider latency.
- Add tests for conflict detection.

## User Tasks

- Confirm production and preview environment parity for database and auth variables.
- Add QA seed trips for:
  - no selected places
  - single-city balanced plan
  - over-budget plan
  - mixed-city day
  - missing-restaurant day
  - dense packed itinerary
- Before proximity-based restaurant assignment or route-duration checks:
  - enable Google Places and Google Routes APIs
  - configure server-side keys and restrictions
  - define provider quotas, cache policy, rate-limit behavior, and fallback behavior
  - provide or approve opening-hours and availability data sources

## Exit Criteria

- App detects and displays conflicts.
- Conflicts are stored.
- User can mark conflicts as resolved or ignored.
- Tests cover budget, density, overlap, missing duration, mixed-city, unavailable metadata, hotel mismatch, missing restaurant coverage, routes, and page display.
- Documentation records the final vision that restaurants should be assigned to every activity day by proximity and time, while Phase 9 remains warning-only.

---

# Phase 9A - Pre-Places Logistics and Time Grid Foundation

## Goal

Prepare the itinerary system for multi-city timing before Google Places, route durations, or the full scheduler are introduced.

Users should choose one logistics mode before entering the planning loop:

- `TICKETED`: the user already knows transfer/ticket timing, so city windows can be derived automatically.
- `FLEXIBLE`: the user will decide city timing while planning, so the existing manual city/day selector remains active.

Ticketed trips must support same-day transfers where one itinerary date can contain two cities and a travel block.

## Agent Tasks

- Add logistics mode persistence:

```text
Trip.logisticsMode
TripTravelSegment
ItineraryCityWindow
```

- Add `/trips/[tripId]/logistics` between preferences and the planning loop.
- Route normal preference completion to logistics, while keeping direct planning access allowed for existing trips.
- Add ticketed transfer input:
  - mode
  - origin city/country
  - destination city/country
  - depart date-time
  - arrive date-time
  - optional carrier
  - optional reference
- Keep the user on `/trips/[tripId]/logistics` after each ticket save so all known transfers can be entered before planning.
- Validate ticket timing before writes:
  - required city/country fields
  - valid date-times
  - arrival after departure
  - depart/arrive inside the trip date range
- Rebuild the itinerary when logistics mode or ticket timing changes.
- Derive `ItineraryCityWindow` rows during rebuild for ticketed trips.
- Split transfer days around travel segments so a single date can contain origin-city context, travel time, and destination-city context.
- Expose `ItineraryDayDto.cityWindows` and `ItineraryDayDto.timeSlots`.
- Build 48 read-only 30-minute slots per itinerary day.
- Show city-window context and travel blocks in the itinerary time grid.
- Keep selected places without start/end times unscheduled within their day.
- Keep planning day choices based on the trip's original start/end date range, regardless of ticket count or whether selected places exist yet.
- Default the planning workspace to the ticket-assigned city for the selected day when city windows exist.
- Fix itinerary rebuild cleanup so planning feedback tied to generated itinerary days/items/conflicts is retargeted to trip-level feedback before generated child rows are deleted.

## Deferred Scope

- No ticket upload parsing.
- No PDF/email confirmation parsing.
- No seat, confirmation, or reservation management.
- No drag/drop schedule editor.
- No exact auto-placement of activities into clock times.
- No route-duration optimization.
- No opening-hours or availability checks.
- No chat-controlled scheduler implementation yet.

## Final MVP Scheduling Notes

The final MVP scheduler should let users express limits through chat or guided controls, including:

- maximum restaurants or food stops per day
- maximum attractions or activities per day
- preferred visit duration by category
- meal frequency and meal windows
- daily start/end limits
- pacing and rest preferences
- lighter schedules on transfer days

Future restaurant placement must assign selected restaurants near each day's selected activities by proximity, time windows, and route feasibility.

## User Tasks

- QA ticketed and flexible logistics flows from the home/dashboard flow.
- Provide QA seed trips with:
  - no transfer segments
  - one same-day transfer
  - multiple-city trips with a day between transfers
  - invalid reversed transfer times
  - transfer times outside trip range
- Before final scheduler work, configure maps/places provider keys, quotas, caching, rate limits, and provider-failure behavior.

## Exit Criteria

- User can choose ticketed or flexible logistics before planning.
- Ticketed transfer timing is persisted.
- Flexible mode preserves manual planning context.
- Ticketed itinerary rebuilds derive city windows.
- Itinerary days expose 48 read-only half-hour slots.
- Transfer slots render without moving unscheduled selected places.
- Settings changes no longer crash from invalid `planning_feedback` retargeting.
- Documentation records the deferred full scheduler and chat-controlled daily limits.

---

# Conversational Planning Roadmap Override

The implementation order from Phase 10 onward is superseded by the standalone conversational planning development pack in [`docs/conversational-planning/README.md`](../conversational-planning/README.md). The original Phase 10-15 sections remain below as historical scope references, but new implementation chats should follow the staged pack so chat persistence, deterministic orchestration, provider integration, scheduling, performance, and caching are introduced behind explicit QA gates.

---

# Phase 10 - Google Places Integration

## Goal

Replace or supplement mock places with real place data.

## Agent Tasks

- Create Google Places adapter:

```text
src/lib/google/places.ts
```

- Keep all Google Places calls server-side.
- Normalize provider responses into internal type:

```ts
type NormalizedPlace = {
  provider: "google_places";
  providerPlaceId: string;
  name: string;
  category: string;
  address?: string;
  latitude: number;
  longitude: number;
  rating?: number;
  priceLevel?: number;
  googleMapsUrl?: string;
  raw: unknown;
};
```

- Add caching where reasonable to avoid repeated calls.
- Update recommendation engine to support:

```text
mock provider
google provider
```

- Validate all external response data before storing.
- Add graceful error handling for API failures.

## User Tasks

- Enable Google Places API in Google Cloud.
- Add billing if required.
- Add and restrict `GOOGLE_PLACES_API_KEY`.
- Confirm target API fields to keep costs controlled.

## Exit Criteria

- App can fetch real places server-side.
- Real places are normalized before storage.
- The app still works if Google API fails.
- No Google Places secret is exposed to the browser.

---

# Phase 11 - Google Routes Integration

## Goal

Improve travel-time and distance conflict detection.

## Agent Tasks

- Create Routes adapter:

```text
src/lib/google/routes.ts
```

- Use selected itinerary items as inputs.
- Request travel time between consecutive itinerary items.
- Update conflict logic to use route duration instead of approximate distance when available.
- Cache route results where appropriate.
- Add fallback to approximate distance if Routes API fails.

## User Tasks

- Enable Google Routes API.
- Add and restrict `GOOGLE_ROUTES_API_KEY`.
- Confirm supported transportation modes:
  - walking
  - driving
  - transit
  - mixed

## Exit Criteria

- App can compute travel time between itinerary items.
- Long-distance conflicts become more accurate.
- App falls back gracefully if Routes API fails.
- API key remains server-side.

---

# Phase 12 - Gemini Integration

## Goal

Use Gemini for structured interpretation and natural-language explanation, not as the source of truth.

## Agent Tasks

- Create Gemini adapter:

```text
src/lib/ai/gemini.ts
```

- Add use cases only after deterministic logic works:

```text
parse custom preference text into structured tags
summarize itinerary
explain why a place was recommended
interpret user feedback
```

- Use schema validation on all Gemini outputs.
- Never write Gemini output directly to the database without validation.
- Add fallback explanations if Gemini fails.

## User Tasks

- Enable Gemini API.
- Add `GEMINI_API_KEY` locally and on Vercel.
- Confirm tone for AI-generated explanations.

## Exit Criteria

- Gemini can assist with explanations or parsing.
- Invalid Gemini outputs are rejected safely.
- App still works without Gemini.
- Gemini does not control auth, ownership, scoring, or database writes.

---

# Phase 13 - Map UI

## Goal

Show itinerary places visually on a map.

Route maps and day-by-day map filtering are locked unless the trip is full-planning ready.

## Agent Tasks

- Add map page or split itinerary/map view:

```text
/trips/[tripId]/map
```

or:

```text
/trips/[tripId]/itinerary
```

with a side-by-side map panel.

- Add markers for selected places.
- Add marker popovers.
- Add day filtering if simple.
- Keep map rendering client-side only where required.
- Use `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` only for browser map rendering.

## User Tasks

- Enable Google Maps JavaScript API if using embedded map.
- Add and restrict `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` by HTTP referrer.
- Confirm whether the map is required for MVP demo or can be post-MVP polish.

## Exit Criteria

- Selected places appear on a map.
- Markers match itinerary items.
- Browser key is restricted.
- App still works if map fails to load.

---

# Phase 14 - Export and Download

## Goal

Allow users to download their trip data.

## Agent Tasks

- Add export route:

```text
GET /api/trips/[tripId]/export?format=json
```

- Implement JSON export first.
- Include:

```text
trip basics
preferences
selected places
itinerary days
itinerary items
conflicts
estimated budget data
```

- Add PDF export later if requested.
- Ensure export route checks ownership.

## User Tasks

- Confirm preferred export format:
  - JSON first
  - PDF later
  - both
- Confirm whether exported files should include raw provider data.

## Exit Criteria

- User can download their trip.
- Exported data is complete enough to be useful.
- User cannot export another user's trip.

---

# Phase 15 - UI Polish and Portfolio Readiness

## Goal

Make the MVP presentable for demos, recruiters, and portfolio review.

## Agent Tasks

- Improve layouts:

```text
landing page
dashboard
trip overview
questionnaire
suggestion cards
itinerary page
map view
profile page
```

- Add loading states.
- Add error states.
- Add empty states.
- Add responsive design pass.
- Add demo screenshots if requested.
- Improve README with:

```text
project overview
features
architecture
tech stack
local setup
env variables
known limitations
future roadmap
```

## User Tasks

- Provide branding preferences.
- Review user flow manually.
- Take portfolio screenshots or request agent-generated screenshot instructions.
- Confirm final project description for resume/LinkedIn/GitHub.

## Exit Criteria

- App is demoable end-to-end.
- README clearly explains technical value.
- UI is clean enough for portfolio use.
- Main flow works on desktop and mobile widths.

---

# Phase 16 - Post-MVP Features

Do not begin these until the MVP is stable.

## Social/Profile Features

Possible future features:

```text
public profiles
private/public trip visibility
shareable trip links
posting trips to profile
follow users
search users
view other users' trips based on privacy settings
```

## Photo Features

Possible future features:

```text
upload trip photos
attach photos to itinerary destinations
profile photo galleries
image optimization
storage quotas
```

## Advanced Planning Features

Possible future features:

```text
advanced budget tracker
popularity-based recommendations
weather-aware itinerary adjustments
calendar export
collaborative trip editing
advanced route optimization
reservation/event integration
```

## Agent Rule

The agent must not implement Phase 16 features unless explicitly instructed after MVP completion.

---

# Recommended Implementation Order Summary

```text
1. Repository foundation
2. Database and Prisma setup
3. Authentication
4. Trip CRUD
5. Preference questionnaire
6. Mock recommendation engine
7. Suggestion selection and feedback
8. Basic itinerary builder
9. Conflict detection
9A. Pre-Places logistics and time grid foundation
10. Google Places integration
11. Google Routes integration
12. Gemini integration
13. Map UI
14. Export/download
15. UI polish and portfolio readiness
16. Post-MVP social/photo/advanced features
```

---

# Agent Checklist Before Each Phase

Before starting any phase, the agent should answer internally:

```text
1. What files already exist?
2. What stack/version is the repo actually using?
3. What is the smallest useful change for this phase?
4. Does this require user secrets or account setup?
5. Can this be tested without external APIs?
6. What commands should be run after implementation?
7. What should not be touched in this phase?
```

---

# Agent Completion Report Format

At the end of each phase, the agent should report:

```md
## Completed

- ...

## Files Changed

- ...

## Validation

- [ ] npm run lint
- [ ] npm run typecheck
- [ ] npm run test
- [ ] npm run build
- [ ] npm run dev

## User Action Needed

- ...

## Known Issues / Deferred Work

- ...

## Next Recommended Phase

- ...
```

---

# Key Architecture Principle

The app should not be a thin wrapper around Gemini.

Correct ownership model:

```text
Database = source of truth
Backend = permissions, scoring, validation, itinerary logic, conflict detection
Google APIs = external place and travel-time data
Gemini = language parsing, explanation, and summarization support
Frontend = guided planning workflow and visualization
```

This separation makes the project more reliable, easier to debug, and more credible as a software engineering portfolio project.

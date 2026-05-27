# TravleBuddy Agent-Friendly Development Plan

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
```

If a command does not exist yet, the agent should either add it or clearly document why it is skipped.

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

Collect structured user preferences for each trip.

## Agent Tasks

- Add `TripPreference` CRUD operations.
- Build route/page:

```text
/trips/[tripId]/preferences
```

- Add structured fields:

```text
pace
budgetLevel
interests
transportationMode
hotelPriority
walkingTolerance
dietaryRestrictions
accessibilityNeeds
mustAvoid
customNotes
```

- Use multi-select fields for interests.
- Add an `Other` option where appropriate.
- Store preferences in normalized columns or JSON fields, depending on schema.
- Add preference summary component.

## User Tasks

- Confirm exact questionnaire questions.
- Confirm default options for interests and travel styles.
- Confirm whether accessibility/dietary questions should be included in MVP.

## Exit Criteria

- User can save preferences for a trip.
- User can edit preferences.
- Preferences reload from the database.
- Preferences are available to the recommendation engine.

---

# Phase 6 - Mock Recommendation Engine

## Goal

Build deterministic recommendation logic before connecting external APIs.

## Agent Tasks

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

- Add route/action:

```text
POST /api/trips/[tripId]/recommendations/generate
```

- Return 5 suggestions.
- Store suggestions in `PlaceSuggestion`.
- Add explanation text for each suggestion.
- Add Vitest tests for scoring.

## User Tasks

- Review scoring weights.
- Confirm whether recommendations should be category-specific or general at first.
- Confirm whether refresh should exclude previously rejected places.

## Exit Criteria

- App generates 5 mock recommendations.
- Recommendations are stored in the database.
- Each recommendation has a score and explanation.
- Scoring tests pass.
- No Google or Gemini API call is required yet.

---

# Phase 7 - Suggestion Selection and Feedback

## Goal

Allow users to select, reject, refresh, and refine suggestions.

## Agent Tasks

- Build page:

```text
/trips/[tripId]/suggestions
```

- Build components:

```text
SuggestionCard
SuggestionList
SelectedPlacesPanel
RefreshSuggestionsButton
FeedbackInput
```

- Add actions/routes:

```text
POST /api/trips/[tripId]/recommendations/[suggestionId]/select
POST /api/trips/[tripId]/recommendations/[suggestionId]/reject
POST /api/trips/[tripId]/recommendations/refresh
```

- Store feedback in `PlanningFeedback`.
- Ensure selected places are clearly visible.

## User Tasks

- Confirm desired user feedback options:
  - Not interested
  - Too expensive
  - Too far
  - Wrong vibe
  - Already been there
  - Other

## Exit Criteria

- User can select a suggestion.
- User can reject a suggestion.
- User can refresh recommendations.
- Feedback is stored.
- Engine explanations, readiness warnings, and user feedback are stored in the planning timeline.
- Selected places persist after page reload.

---

# Phase 8 - Basic Itinerary Builder

## Goal

Convert selected places into a day-by-day itinerary.

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

- Create itinerary days based on trip dates.
- Assign selected places to days.
- Respect pace rules:

```text
relaxed  = 2-3 activities/day
balanced = 3-4 activities/day
packed   = 5-6 activities/day
```

- Add basic ordering using approximate distance or category grouping.
- Add itinerary page:

```text
/trips/[tripId]/itinerary
```

- Allow manual reorder if simple to implement.
- Add tests for grouping logic.

## User Tasks

- Confirm whether users should choose hotel/base first or activities first.
- Confirm whether itinerary times should be automatically assigned in MVP.
- Confirm default start/end day schedule, such as 9 AM to 8 PM.

## Exit Criteria

- Selected places can be converted into itinerary days.
- Itinerary persists in the database.
- User can view itinerary after reload.
- Pace rules are respected.
- Tests cover basic itinerary grouping.

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

- Add conflict checks for:

```text
budget conflict
pace conflict
time overlap conflict
missing duration conflict
long-distance conflict
closed/unavailable placeholder conflict
```

- Add route/action:

```text
POST  /api/trips/[tripId]/conflicts/check
PATCH /api/trips/[tripId]/conflicts/[conflictId]/resolve
```

- Display conflicts on itinerary page.
- Add severity levels:

```text
low
medium
high
```

- Add tests for conflict detection.

## User Tasks

- Confirm thresholds:
  - Maximum travel time between places before warning
  - Maximum estimated daily spend before warning
  - Maximum number of activities per pace level

## Exit Criteria

- App detects and displays conflicts.
- Conflicts are stored.
- User can mark conflicts as resolved or ignored.
- Tests cover budget, pace, and overlap conflicts.

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

# TravleBuddy
## AI-Powered Travel Planning Platform

Version: 0.1 (Pre-MVP Requirements & System Design)
Status: Planning Phase

---

# 1. Executive Summary

TravleBuddy is an AI-assisted travel planning platform that helps users create optimized travel itineraries through guided preference collection, intelligent destination recommendations, map visualization, and itinerary conflict detection.

Instead of forcing users to manually research destinations, compare locations, calculate travel times, and organize schedules, TravleBuddy guides users through a dynamic questionnaire and progressively builds an itinerary tailored to their preferences.

The platform combines:

- Structured user preferences
- AI reasoning
- Location intelligence
- Travel-time optimization
- Budget awareness
- Itinerary conflict detection

The primary goal is to reduce trip planning complexity while producing realistic, personalized travel itineraries.

---

# 2. Problem Statement

Travel planning is fragmented across multiple platforms.

Users often:

- Search destinations on Google
- Search hotels separately
- Build itineraries manually
- Compare travel distances themselves
- Estimate budgets manually
- Organize schedules in spreadsheets or notes

This process is time-consuming and often results in:

- Inefficient itineraries
- Budget overruns
- Excessive travel time
- Missed attractions
- Poor hotel placement

TravleBuddy aims to centralize and automate the planning process.

---

# 3. Goals

## Primary Goal

Enable users to create personalized, optimized travel itineraries with minimal manual effort.

## Secondary Goals

- Reduce planning time
- Improve itinerary quality
- Improve destination discovery
- Visualize trip plans geographically
- Explain recommendations transparently
- Allow trip persistence and exporting

---

# 4. Target Users

## Primary Users

Travelers planning trips to unfamiliar locations.

Examples:

- Vacation travelers
- Weekend travelers
- Solo travelers
- Families
- Couples
- International travelers

## Secondary Users

Users who:

- Enjoy itinerary planning
- Want travel inspiration
- Compare destinations
- Share travel experiences

---

# 5. MVP Scope

The MVP focuses exclusively on:

### Included

- User authentication
- User profiles
- Trip creation
- Preference questionnaire
- Dynamic question flow
- Destination recommendations
- Hotel recommendations
- Activity recommendations
- Interactive maps
- Itinerary generation
- Conflict detection
- Trip persistence
- Trip export/download

### Trip Modes

The MVP supports two trip modes:

- Draft trips
- Planning trips

Draft trips are used for early discovery only. Users may explore possible destinations, cities, attractions, and general ideas before committing to travel dates or budget.

Draft trips must not build itineraries, map routes, run itinerary conflict checks, or generate full trip exports because date-sensitive and budget-sensitive planning may be inaccurate before the user commits to a real trip window.

Planning trips unlock the full planning workflow only after the trip has:

- At least one ordered destination city or travel destination
- Start date
- End date
- Trip-level maximum budget amount
- Budget currency

This prevents the backend from spending effort on itinerary, route, map, and conflict calculations before the trip is specific enough to produce useful results.

### Excluded

- Social feed
- User following
- Trip posting
- Public profiles
- Photo sharing
- Group trip collaboration
- Real-time collaboration
- Booking integration
- Flight purchasing
- Hotel purchasing

---

# 6. Core User Flow

## Step 1

User creates account.

## Step 2

User creates a new trip.

Inputs:

- Title, required for trip creation
- Departure city and country, optional for drafts and useful for future jet lag and time-zone-aware planning
- Destination search text or one or more selected destination cities, optional for drafts and required for full planning
- Travel dates, optional for drafts and required for full planning
- Travelers, deferred from Phase 4
- Trip-level maximum budget, optional for drafts and required for full planning
- Budget currency, stored as entered by the user

## Step 3

System begins preference discovery.

Questions adapt based on responses.

Example:

"What matters most?"

Options:

- Best attractions
- Best food
- Best hotels
- Budget
- Nightlife
- Adventure
- Relaxation

## Step 4

Preference profile is generated.

## Step 5

Recommendation engine generates:

- 5 destinations
- 5 hotels
- 5 attractions
- 5 restaurants

depending on current planning stage.

## Step 6

User selects preferred options.

## Step 7

System updates itinerary.

## Step 8

Conflict detection runs.

## Step 9

System suggests adjustments if needed.

## Continuous Feedback Loop

Throughout planning, the system should maintain a feedback loop with the user.

The reasoning engine should:

- Explain why suggestions were made
- Surface missing information before full planning is unlocked
- Show budget impact as places and activities are selected
- Ask for refinement when user feedback changes recommendation direction
- Preserve feedback as planning context for future recommendations and itinerary changes

The MVP feedback loop is structured and persisted, not a full chat system. It stores user feedback, engine explanations, readiness warnings, budget warnings, itinerary proposals, and conflict summaries so future AI or chat features can build on reliable historical context.

## Step 10

User saves or exports itinerary.

---

# 7. Dynamic Questionnaire System

## Purpose

Collect structured travel preferences.

## Requirements

Questions should adapt based on previous responses.

Question order should not be fixed.

### Example

If user values hotels:

Ask:

- Hotel budget
- Hotel location
- Amenities
- Walking distance preferences

If user values activities:

Ask:

- Attraction types
- Daily pace
- Indoor/outdoor preferences

---

# 8. User Preference Categories

## Budget

Options:

- Budget
- Moderate
- Luxury

## Travel Style

Options:

- Relaxed
- Balanced
- Packed

## Interests

Options:

- Food
- History
- Museums
- Nature
- Adventure
- Nightlife
- Shopping
- Photography
- Beaches

## Transportation

Options:

- Walking
- Public Transit
- Ride Share
- Rental Car

## Accommodation

Options:

- Hostel
- Hotel
- Resort
- Airbnb

## Accessibility

Options:

- Mobility concerns
- Family friendly
- Child friendly

---

# 9. Recommendation Engine

## Purpose

Generate personalized travel recommendations.

## Inputs

- User preferences
- Trip details
- Existing itinerary
- Budget
- Selected locations

## Outputs

- Ranked recommendations

---

## Recommendation Sources

### MVP

- Google Places API
- Gemini API

### Future

- Yelp
- TripAdvisor
- Event APIs
- Weather APIs

---

## Recommendation Categories

### Hotels

### Restaurants

### Attractions

### Activities

### Landmarks

### Entertainment

---

## Recommendation Explanation

Every recommendation should provide reasoning.

Example:

> Recommended because it matches your interest in food, is within your budget, and is located near your selected hotel.

Recommendation explanations and user responses should be persisted as part of the planning feedback loop.

User feedback may include:

- Accept
- Reject
- Refresh
- Refine
- Request alternative
- Too expensive
- Too far
- Wrong vibe
- Already been there
- Other

---

# 10. Recommendation Scoring System

Potential scoring factors:

```text
Preference Match
+ Budget Match
+ Popularity
+ Rating
+ Proximity
- Travel Time
- Conflict Penalties
```

Future versions may include ML-based ranking.

---

# 11. Itinerary Builder

## Purpose

Automatically organize selected destinations.

---

## Full Planning Requirement

Itinerary generation requires a planning-ready trip.

A trip is planning-ready only when it has:

- Planning status
- At least one destination city or travel destination
- Start date
- End date
- Trip-level maximum budget amount
- Budget currency

Draft trips may collect suggestions, but they must not generate itinerary days or itinerary items.

## Inputs

- Selected destinations
- Hotels
- User preferences
- Trip dates

---

## Outputs

Daily itinerary.

Example:

Day 1
- Hotel Check-In
- Museum
- Lunch
- Walking Tour

Day 2
- Beach
- Restaurant
- Night Market

---

# 12. Conflict Detection Engine

## Purpose

Detect impractical itineraries.

---

## MVP Conflict Types

### Time Conflict

Example:

Location closes before arrival.

---

### Distance Conflict

Example:

Two activities require excessive travel.

---

### Budget Conflict

Example:

Planned spending exceeds budget.

---

### Schedule Density Conflict

Example:

Too many activities in one day.

---

### Hotel Location Conflict

Example:

Selected hotel is far from majority of activities.

---

# 13. Map System

## Requirements

Map route visualization requires a planning-ready trip.

Draft trips may later show lightweight discovery results if needed, but MVP route maps and day-by-day map filtering are only available after the trip has destination, date, and budget requirements filled.

## Display

Display:

- Hotel
- Attractions
- Restaurants
- Activities

on a unified map.

---

## Features

- Marker visualization
- Route visualization
- Estimated travel times
- Day-by-day filtering

---

# 14. User Accounts

## Features

### Registration

### Login

### Logout

### Password Recovery

### Session Management

---

# 15. User Profiles

## MVP

Store:

- Name
- Email
- Saved Trips

---

## Future

- Bio
- Travel stats
- Public profiles
- Shared itineraries
- Uploaded photos

---

# 16. Trip Management

Users can:

- Create trips
- Edit trips
- Delete trips
- Duplicate trips
- Save drafts

### Phase 4 Trip CRUD

Phase 4 implements authenticated trip CRUD with a full-detail trip creation form.

Trip creation requires:

- Title

Trip records use generated `Trip.id` values as database and route keys. Trip titles are user-facing labels and are not unique.

The new trip screen should expose the full core creation fields:

- Departure city
- Departure country
- Destination city
- Destination country
- Start date
- End date
- Budget amount
- Budget currency
- Travel style

The new trip screen has two actions:

- `Save as draft`, available whenever title is filled.
- `Continue trip creation`, available only after the required planning fields are complete.

When users try to continue with missing planning fields, the UI must explain why the action is unavailable and focus the first missing field.

Long trips across multiple cities or countries are modeled as one `Trip` with multiple ordered `TripDestination` rows. The app must not create separate linked trip records for this Stage 4 flow.

Destination and departure fields use a curated static city/country/time-zone dropdown catalog during Phase 4. External autocomplete is deferred to the Google Places phase.

Trip settings support:

- Destination city
- Destination country
- Start date
- End date
- Budget amount
- Budget currency
- Travel style

Draft trips may omit destination, dates, budget, and travel style. If a user saves a named trip as draft, the system persists it as `DRAFT`. Continuing into the planning workflow remains locked until the trip has:

- At least one destination
- Valid date range
- Positive trip-level budget amount
- Budget currency
- Travel style

Phase 4 supports `USD` and `EUR` only. The database stores the original user-entered budget amount and currency. Currency conversion and USD-normalized comparison values are deferred to a later budget/conflict feature and should include exchange-rate snapshots if implemented.

Every trip read, update, and delete must verify that the authenticated user owns the trip.

The Phase 4 API uses true partial updates for `PATCH /api/trips/[tripId]`. Empty PATCH payloads are rejected. Destination, date, and budget pair requirements are checked after the incoming patch is merged with the existing trip state.

Trip date inputs must be strict `YYYY-MM-DD` calendar dates. Invalid normalized dates, such as `2026-02-31`, must be rejected instead of silently converted.

Archived trips are immutable in Phase 4. They cannot be edited or deleted until a future explicit archive/restore workflow is designed.

---

# 17. Trip Export

## Supported Formats

### PDF

### JSON

---

## Export Content

- Itinerary
- Locations
- Maps
- Recommendations
- Notes

---

# 18. Data Models

---

## User

```typescript
User {
  id
  name
  email
  emailVerified
  image
  createdAt
}
```

---

## Trip

```typescript
Trip {
  id
  userId
  title
  status
  destinationSearchText
  departureCity
  departureCountry
  departureTimeZone
  startDate
  endDate
  budgetAmount
  budgetCurrency
  createdAt
  updatedAt
}
```

---

## TripDestination

```typescript
TripDestination {
  id
  tripId
  city
  country
  region
  timeZone
  latitude
  longitude
  sortOrder
}
```

---

## PreferenceProfile

```typescript
PreferenceProfile {
  id
  tripId
  budgetLevel
  pace
  interests[]
  transportationModes[]
  accommodationTypes[]
  hotelPriority
  walkingTolerance
  dietaryRestrictions
  accessibilityNeeds
  mustAvoid
  customNotes
  metadata
}
```

---

## PlaceSuggestion

```typescript
PlaceSuggestion {
  id
  tripId
  destinationId
  provider
  providerPlaceId
  name
  category
  status
  score
  explanation
  estimatedCostAmount
  estimatedCostCurrency
  rating
  address
  latitude
  longitude
}
```

---

## ItineraryDay

```typescript
ItineraryDay {
  id
  tripId
  dayNumber
}
```

---

## ItineraryItem

```typescript
ItineraryItem {
  id
  tripId
  dayId
  placeSuggestionId
  startTime
  endTime
  estimatedCostAmount
  estimatedCostCurrency
}
```

---

## Conflict

```typescript
Conflict {
  id
  tripId
  itineraryItemId
  type
  severity
  status
  message
  recommendation
}
```

---

## PlanningFeedback

```typescript
PlanningFeedback {
  id
  tripId
  targetType
  targetId
  source
  action
  reason
  userNote
  tripPreferenceId
  placeSuggestionId
  itineraryDayId
  itineraryItemId
  conflictId
  metadata
  createdAt
}
```

`targetId` must match the typed target field for the selected `targetType`. Trip-level feedback uses the parent `tripId` as `targetId`. Child-target feedback must reference a child record owned by the same trip.

---

## PlanningEvent

```typescript
PlanningEvent {
  id
  tripId
  actor
  type
  title
  message
  metadata
  createdAt
}
```

---

# 19. Technology Stack

## Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui

---

## Backend

- Next.js Server Actions
- Next.js API Routes

---

## Database

- PostgreSQL

---

## ORM

- Prisma

---

## Authentication

The project will use Auth.js / NextAuth with the v5-style `next-auth@beta` API.

MVP authentication will use Google OAuth.

Google OAuth is the only MVP login method. Email/password auth, magic links, Clerk, and dev-only auth bypasses are out of scope for Phase 3.

Email/password authentication is deferred because it requires additional security work, including password hashing, email verification, password reset, and abuse protection.

All user-specific resources must be protected by both session checks and ownership checks. Users may only access trips where `trip.userId === session.user.id`.

The implementation must use:

- `next-auth@beta`
- `@auth/prisma-adapter`
- Auth.js-compatible Prisma models from Phase 2
- `src/proxy.ts` for Next.js 16 protected-route redirects
- Server-side authorization helpers for protected data access

Route protection is not enough by itself. Server Actions, Route Handlers, and query helpers must verify the authenticated user owns the parent trip before reading or mutating user-owned data.

---

## AI

- Gemini API

---

## Maps

- Google Places API
- Google Routes API
- Google Maps API

---

## Hosting

- Vercel

---

## Database Hosting

- Neon PostgreSQL

Alternative:

- Supabase PostgreSQL

---

# 20. System Architecture

```text
User
 │
 ▼
Next.js Frontend
 │
 ▼
Server Actions / API Routes
 │
 ├───────────────┐
 ▼               ▼
PostgreSQL     Gemini API
 │
 ▼
Prisma ORM
 │
 ▼
Recommendation Engine
 │
 ▼
Conflict Engine
 │
 ▼
Itinerary Builder
 │
 ▼
Google Places API
Google Routes API
```

---

# 21. Folder Structure

```text
src/
  app/
    (auth)/
    (dashboard)/
      dashboard/
      trips/
      profile/
    api/
      recommendations/
      itinerary/
      export/

  components/
    ui/
    layout/
    questionnaire/
    recommendations/
    itinerary/
    map/
    profile/

  features/
    trips/
      actions.ts
      queries.ts
      schemas.ts
      types.ts

    preferences/
      actions.ts
      schemas.ts
      types.ts

    recommendations/
      service.ts
      scoring.ts
      schemas.ts
      types.ts

    itinerary/
      builder.ts
      conflict-engine.ts
      schemas.ts
      types.ts

  lib/
    db.ts
    auth.ts

    google/
      places.ts
      routes.ts
      maps.ts

    ai/
      gemini.ts
      prompts.ts

    export/
      pdf.ts
      json.ts

  prisma/
    schema.prisma
    migrations/

  types/
    index.ts
```

---

# 22. Security Requirements

## Authentication

Protected routes required.

## Authorization

Users may only access their own trips.

## API Security

Rate limiting required.

## Input Validation

All user inputs validated.

## Environment Variables

No API keys exposed to frontend.

---

# 23. Scalability Requirements

System should support:

- Multiple concurrent users
- Thousands of trips
- API request caching
- Future social features

---

# 24. Future Roadmap

## Phase 2

### Public Profiles

Users can:

- Share trips
- Display travel history

---

### Photo Uploads

Users can upload:

- Destination photos
- Trip memories

---

### Social Features

Users can:

- Follow others
- Like trips
- Save shared itineraries

---

### Discovery

Users can browse:

- Trending destinations
- Popular itineraries
- Top-rated activities

---

### Advanced AI

AI can:

- Continuously optimize itineraries
- Suggest alternatives automatically
- Learn user preferences over time

---

# 25. Success Metrics

## Product Metrics

- Completed itineraries
- Saved trips
- Exported trips
- User retention

## Technical Metrics

- API response time
- Recommendation latency
- Conflict detection accuracy
- Map rendering performance

---

# 26. MVP Completion Criteria

The MVP is considered complete when a user can:

1. Register and authenticate.
2. Create a trip.
3. Complete preference onboarding.
4. Receive personalized recommendations.
5. Select destinations.
6. Provide feedback that influences later planning suggestions.
7. See system explanations, budget impact, missing information, and suggested next actions during planning.
8. Automatically generate an itinerary after the trip has destinations, dates, and budget.
9. View itinerary on a map after the trip has destinations, dates, and budget.
10. Receive conflict warnings.
11. Save trip progress.
12. Export itinerary.

---

# 27. CI/CD Requirements

## Source Control

- GitHub should be the source of truth for the repository.
- `main` should represent production-ready code.
- Feature work should be merged through pull requests.

---

## Continuous Integration

CI should run on every pull request and every push to `main`.

Required checks:

- Install dependencies with `npm ci`
- Validate Prisma schema
- Generate Prisma client
- Run ESLint
- Run TypeScript type checks
- Run production build with `next build`

Recommended future checks:

- Unit tests for recommendation scoring, itinerary building, and conflict detection
- Integration tests for trip creation and persistence
- End-to-end tests for registration, trip creation, questionnaire completion, itinerary generation, map display, and export

---

## Continuous Deployment

Preferred deployment path:

- Vercel for the Next.js application
- Neon PostgreSQL for the production database
- GitHub integration enabled in Vercel

Deployment behavior:

- Pull requests should create Vercel preview deployments.
- Merges to `main` should deploy to production after CI passes.
- Production deployments should use Vercel environment variables, not committed `.env` files.
- Database migrations should be applied through `prisma migrate deploy` before or during production deployment once migrations exist.

---

## Required CI/CD Secrets

The following secrets should be configured in GitHub Actions and Vercel as the project adopts each service:

```text
DATABASE_URL
DIRECT_URL
AUTH_SECRET
AUTH_URL
AUTH_GOOGLE_ID
AUTH_GOOGLE_SECRET
GEMINI_API_KEY
GOOGLE_MAPS_API_KEY
GOOGLE_PLACES_API_KEY
GOOGLE_ROUTES_API_KEY
```

Legacy `NEXTAUTH_*` and `GOOGLE_CLIENT_*` aliases may exist only as local migration aids. Phase 3 uses the `AUTH_*` names above as the canonical variables.

---

## Environment Rules

- `.env` and `.env.local` files must not be committed.
- Browser-exposed variables must use the `NEXT_PUBLIC_` prefix only when the value is safe for users to see.
- Server-only API keys must be accessed only from Server Actions, Route Handlers, or server-side libraries.
- CI should use test or staging credentials where possible.
- Production should use separate production credentials.

---

## Release Environments

### Preview

Used for pull requests.

Purpose:

- Validate UI changes
- Test user flows before merge
- Share work for review

### Production

Used for `main`.

Purpose:

- Serve real users
- Use production database and production API credentials
- Track deployment health and failures

---

## Deployment Gates

A deployment should be blocked if:

- Linting fails
- Type checking fails
- Prisma schema validation fails
- The production build fails
- Required environment variables are missing
- Future automated tests fail

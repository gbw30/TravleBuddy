# Phase 5 Documentation

This document records Phase 5 Preference Questionnaire implementation decisions, technical details, security considerations, validation results, and future scope.

It must not include secrets, API keys, database URLs, OAuth credentials, `.env` values, or sensitive terminal output.

---

## Phase Goal

Implement trip-local and user-level preference profiles that can be completed, edited, reloaded from the database, reused for new trips, and passed to the Phase 6 recommendation engine.

Phase 5 records preferences at two levels:

- `TripPreference` remains the trip-local source used by recommendations.
- `UserTravelPreference` stores reusable profile defaults extracted from saved trip preferences.

---

## Product Decisions

Phase 5 uses these locked decisions:

- Trip-local preferences are stored on the existing `TripPreference` model.
- User-level saved defaults are stored on the new `UserTravelPreference` model.
- The questionnaire is available only after the trip is planning-ready.
- Planning readiness still requires title, destination, valid date range, budget amount, budget currency, and travel style.
- `TripPreference.pace` remains the source of truth for the Phase 4 travel style.
- The page stays on `/trips/[tripId]/preferences` after save and shows a saved confirmation.
- Reset/delete preference actions are deferred.
- User-level preference storage is deterministic latest-save extraction, not an ML learning system.
- Phase 6 should consume the Phase 5 preference DTO instead of reading raw database rows directly.

Post-implementation product correction:

- The current `/trips/[tripId]/preferences` form is a data and API foundation, not the final MVP preference-editing UX.
- Users can now discover and modify preferences from trip settings through a separate Preferences tab.
- The final MVP and product should save preferences through a guided feedback loop, not a traditional all-fields-at-once form.
- The guided loop should ask one preference question at a time and allow the user to select predefined options or enter a custom answer.
- The settings Preferences tab supports manual review and edits of the current trip-local profile.
- The Profile tab supports editing the user's display name and viewing saved travel defaults.
- New-trip creation offers an option to apply saved profile preferences.

---

## Questionnaire Fields

Required complete-profile fields:

- `pace`
- `budgetLevel`
- `interests`
- `transportationModes`

Optional fields:

- `accommodationTypes`
- `hotelPriority`
- `walkingToleranceKm`
- `dietaryRestrictions`
- `accessibilityNeeds`
- `mustAvoid`
- `customNotes`
- `customPreferences`

Expanded interest options:

- Food
- History
- Museums
- Nature
- Adventure
- Nightlife
- Shopping
- Photography
- Beaches
- Art
- Architecture
- Music
- Wellness
- Local culture
- Hidden gems

Enum-backed option groups:

- Budget: Budget, Moderate, Luxury
- Pace: Relaxed, Balanced, Packed
- Transportation: Walking, Public Transit, Ride Share, Rental Car, Mixed
- Accommodation: Hostel, Hotel, Resort, Airbnb, Other

Slider rules:

- `hotelPriority`: integer from 1 to 10
- `walkingToleranceKm`: 0.5 to 25 km in 0.5 km steps

Text-list parsing rules:

- Dietary restrictions, accessibility needs, and must-avoid entries split on commas and newlines.
- Blank entries are dropped.
- Remaining entries are trimmed.
- `customNotes` is trimmed and stored as `null` when blank.
- Custom preferences are trimmed, deduped case-insensitively, and stored in `TripPreference.metadata.customPreferences`.

---

## User Profile Preferences

Phase 5 adds persistent user-level travel preference defaults with option 2 from the approved design: a separate `UserTravelPreference` model.

Extraction behavior:

- Successful trip preference create/update upserts `UserTravelPreference` for the same authenticated user.
- Scalar defaults come from the latest saved trip preference: `budgetLevel`, `pace`, `hotelPriority`, and `walkingToleranceKm`.
- Array defaults are copied from the latest saved trip preference: `interests`, `transportationModes`, `accommodationTypes`, `dietaryRestrictions`, `accessibilityNeeds`, `mustAvoid`, and `customPreferences`.
- Metadata records `sourceTripId` and `source: "trip_preference"`.

Profile behavior:

- `/profile` lets the signed-in user edit their name.
- `/profile` displays saved travel preference defaults when they exist.
- If no saved travel preferences exist, the profile page tells users to save trip preferences first.

New-trip behavior:

- `/trips/new` loads the signed-in user's saved travel preferences.
- If saved preferences exist, the form shows a `Use my saved travel preferences` option.
- Selecting that option applies the saved pace to the visible travel-style field and carries saved profile defaults into the created trip's `TripPreference`.
- New trip autofill stores custom profile preferences in the new trip preference metadata with `source: "user_travel_preference"`.

---

## Preference UX Completion Patch

The Phase 5 completion patch adds a separate preferences tab inside trip settings.

Settings behavior:

- `/trips/[tripId]/settings` exposes a Preferences tab alongside trip-detail editing.
- The Preferences tab loads the current trip-local preference DTO.
- Core preference fields remain clear and required where needed for recommendation readiness.
- Non-core custom preferences are represented as removable boxes/chips.
- Each custom preference box includes a clickable `x` control to remove that preference.
- Adding a new custom preference immediately adds a new box.
- Manual preference entry uses a search bar.
- When the search query matches known preference options, the menu presents those matching options.
- When no known match exists, the menu allows creating a custom preference from the query.
- Custom preferences are stored as structured trip-local preference values in metadata and exposed through the DTO.

Required guided feedback-loop behavior:

- Final MVP preference capture should not rely on a single static form as the primary save path.
- The primary flow should ask the user focused questions during planning.
- Each question should offer predefined answer options and a custom-answer input.
- Answers should update the same trip-local preference profile used by the settings tab.
- The loop should be able to add, remove, or refine non-core preferences over time.
- Preference changes created by the loop should continue to write durable planning context.

Implementation sequencing:

- Keep the current Phase 5 API, schemas, ownership checks, and DTO as the backend foundation.
- Treat the settings tab and chip/search editing as part of Phase 5 completion before Phase 6 starts.
- Evolve the single-page questionnaire into a guided feedback-loop UI after the recommendation loop begins to use preference data.

---

## Implementation Log

Created preference domain files:

- `src/features/preferences/queries.ts`
- `src/features/preferences/schemas.test.ts`
- `src/features/preferences/actions.test.ts`
- `src/features/preferences/queries.test.ts`
- `src/features/profile/actions.ts`
- `src/features/profile/actions.test.ts`
- `src/features/profile/preferences.ts`
- `src/features/profile/preferences.test.ts`
- `src/features/profile/queries.ts`
- `src/features/profile/queries.test.ts`
- `src/features/profile/schemas.ts`
- `src/features/profile/schemas.test.ts`
- `src/features/profile/types.ts`

Changed preference domain files:

- `src/features/preferences/schemas.ts`
- `src/features/preferences/actions.ts`
- `src/features/preferences/types.ts`

Created API files:

- `src/app/api/trips/[tripId]/preferences/route.ts`
- `src/app/api/trips/[tripId]/preferences/route.test.ts`

Created UI files:

- `src/components/preferences/preference-form.tsx`
- `src/components/preferences/preference-summary.tsx`

Changed UI files:

- `src/app/(dashboard)/profile/page.tsx`
- `src/app/(dashboard)/trips/new/page.tsx`
- `src/app/(dashboard)/trips/[tripId]/preferences/page.tsx`
- `src/app/(dashboard)/trips/[tripId]/settings/page.tsx`
- `src/app/(dashboard)/trips/[tripId]/settings/page.test.tsx`
- `src/components/trips/new-trip-form.tsx`

Created database files:

- `prisma/migrations/20260529013000_stage5_user_travel_preferences/migration.sql`

Changed database files:

- `prisma/schema.prisma`

Decision logic:

- The page remains a Server Component and delegates form sliders and client-side form state to `PreferenceForm`.
- The preference summary panel renders from the same DTO exposed to the future recommendation engine.
- API route params use the Next.js 16 async `params` shape.
- `GET /api/trips/[tripId]/preferences` returns `{ preference }` for an owned planning-ready trip.
- `PUT /api/trips/[tripId]/preferences` validates the complete profile and returns `{ preference }`.
- Invalid API payloads return `400` with flattened field issues.
- Unauthenticated API requests return `401`.
- Missing or non-owned trips return `404`.
- Incomplete trips and archived trips return `409`.
- Server Action saves redirect back to the preference page with a saved confirmation.
- Server Action saves from the settings Preferences tab redirect back to `/trips/[tripId]/settings?tab=preferences`.
- Successful creates and updates append a visible `SYSTEM_NOTE` planning event.
- Custom preference counts are included in planning-event metadata.
- Successful trip preference saves also upsert the user's saved travel preference defaults.
- New-trip creation can create a trip-local preference from saved profile defaults.

Security notes:

- UI access uses `requireUser`.
- API access uses `assertAuthenticatedApiUser`.
- Reads and writes scope by both `userId` and `tripId`.
- Archived trips cannot update preferences.
- Phase 5 does not expose reset/delete operations.

---

## Future Learning Notes

Advanced user-level learned preferences should be implemented after the MVP trip-local loop is stable.

Future design questions:

- Whether learned preferences should later be derived from historical trip preferences and feedback rather than latest explicit saves.
- How users can review, edit, or reset learned preferences.
- How recommendation scoring weighs current-trip explicit answers against long-term inferred preferences.
- How to make cross-trip learning transparent enough for users to trust.

Reset/delete preference actions are also future scope. They should include clear product rules for whether deleting a trip preference also affects downstream recommendations, selected suggestions, itinerary items, or saved user defaults.

---

## Validation Results

Commands run during implementation:

```text
npm.cmd run test -- src/features/profile/schemas.test.ts src/features/profile/queries.test.ts src/features/profile/actions.test.ts src/features/profile/preferences.test.ts src/features/preferences/actions.test.ts src/features/trips/schemas.test.ts src/features/trips/actions.test.ts
npm.cmd run test -- src/app/(dashboard)/trips/[tripId]/settings/page.test.tsx src/features/preferences/schemas.test.ts src/features/preferences/actions.test.ts src/features/preferences/queries.test.ts src/app/api/trips/[tripId]/preferences/route.test.ts
npm.cmd run test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run prisma:validate
npm.cmd run build
npm.cmd run dev -- --port 3000
```

Results:

- Phase 5 profile/autofill focused tests pass: 7 test files and 39 tests.
- Phase 5 preference/settings focused tests pass: 5 test files and 20 tests.
- Full Vitest suite passes: 21 test files and 105 tests.
- TypeScript typecheck passes.
- ESLint passes.
- Prisma schema validation passes.
- The first production build attempt generated Prisma Client successfully but failed because the sandbox could not fetch Google Fonts for `next/font`.
- The production build passed after rerunning with network permission for the font fetch.
- The successful build loaded `.env.local` and `.env` and generated the Phase 5 routes for `/api/trips/[tripId]/preferences` and `/trips/[tripId]/preferences`.
- Local smoke check passed: unauthenticated `/trips/example/preferences` redirects to `/login`, and unauthenticated `/api/trips/example/preferences` returns `401`.

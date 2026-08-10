# Stage 2B - Real Place Recommendations

Status: stage-plan
Authority: Primary recommendation-provider integration intent
Related: [Canonical target](../requirements.md), [current implementation](../status/current-implementation.md), [active roadmap](../roadmap.md), [preceding stage](04-live-itinerary-scheduling.md)
Last reviewed: 2026-08-09

## Goal

Reuse and extend the implemented Google/mock `PlaceProvider` boundary from adaptive replacement into the primary conversational recommendation flow while preserving deterministic scoring, persistence, feedback, and mock fallback behavior.

## Architecture Decision

### Extend the existing adapter rather than duplicate it

Options:

- Call Google directly from primary recommendation logic: fewer calls across modules, but duplicates the existing boundary and spreads provider failures into domain code.
- Replace mocks entirely with Google: a simple live path, but brittle tests and outage behavior.
- Reuse the implemented provider interface and extend its query/normalization needs for the primary flow. Required.

The recommendation service owns preference-aware scoring. Providers own external search and normalization.

## Provider Contract

```ts
type PlaceSearchInput = {
  destination: { id: string; city: string; country: string };
  topic: PlanningTopic;
  queryTerms: string[];
  limit: number;
};

type NormalizedPlace = {
  provider: "GOOGLE_PLACES" | "MOCK";
  providerPlaceId: string;
  name: string;
  category: SuggestionCategory;
  description: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  priceLevel: number | null;
  estimatedCostAmount: number | null;
  estimatedCostCurrency: string | null;
  rawProviderData: unknown;
};

interface PlaceProvider {
  search(input: PlaceSearchInput): Promise<NormalizedPlace[]>;
  getDetails(providerPlaceId: string): Promise<NormalizedPlace | null>;
}
```

## Step-by-Step Implementation

### Step 1: Add provider selection

Purpose: allow deterministic tests and graceful failure.

1. Add lazy `getPlaceProvider()` configuration.
2. Use Google when its server key and provider mode are configured.
3. Use mock provider in unit tests and explicit local fallback mode.
4. Never initialize the Google client at module scope.
5. Never send the server Places key to the browser.

### Step 2: Implement Google search and validation

Purpose: prevent malformed or excessive provider data from entering persistence.

1. Map planning topic and preferences into bounded search terms.
2. Search only the active destination/city context.
3. Request only fields required by the normalized type.
4. Apply an eight-second timeout.
5. Validate response values with Zod.
6. Drop results without a stable provider ID or name.
7. Bound raw provider data before storage.
8. Map Google categories to the existing `SuggestionCategory` enum.

### Step 3: Integrate deterministic scoring

Purpose: retain explainable product logic.

1. Convert normalized results into the current scoring input.
2. Score interest match, budget fit, rating, pace fit, practicality, and feedback penalties.
3. Exclude rejected and selected provider IDs from rerolls unless the user explicitly restores them.
4. Rank a bounded candidate pool and present the top three stable results.
5. Upsert by `(tripId, provider, providerPlaceId)`.
6. Persist score breakdown and planning context in metadata.

### Step 4: Add provider fallback behavior

Purpose: keep the conversation usable during API outages or quota exhaustion.

- timeout or transient error: use cached results when available, otherwise mock fallback in development/QA
- invalid provider response: discard invalid entries and continue with valid results
- authentication/quota failure: show a recoverable provider-unavailable response and do not loop retries
- no results: ask one refinement question or offer a broader reroll

Production must label mock fallback data if it is ever shown. Do not silently present it as live Google data.

### Step 5: Add initial provider caching boundary

Create cache keys from provider, normalized city, topic, and query hash. Use a no-op cache by default in this stage; Stage 3B may enable Redis. The provider interface must remain unaware of user identity and must not cache trip-specific selection state.

## Test Requirements

- Mock and Google adapters satisfy the same contract.
- Google responses normalize correctly.
- Missing IDs and invalid coordinates are rejected.
- Provider calls remain server-only.
- Stable upserts do not duplicate suggestions.
- Rejected/selected places are excluded appropriately.
- Timeout, quota, malformed response, and empty result paths are recoverable.
- Provider failures do not alter the existing selected itinerary.
- Route and service tests use mocked provider responses, not live Google calls.

## Developer Actions

- Enable Google Places in the intended Google Cloud project.
- Configure billing and quota alerts.
- Restrict `GOOGLE_PLACES_API_KEY` to the server API and required services.
- Use different preview and production keys where practical.
- Confirm which optional fields are worth their provider cost.

## Exit Criteria

- Conversational recommendations use real places when configured.
- Exactly three normalized and scored cards appear in each user-facing batch; the persisted ranking pool may be larger.
- Mock tests remain deterministic.
- Provider outages do not crash or corrupt planning state.
- Full verification passes.

## Out of Scope

- Browser map rendering.
- Routes duration.
- Opening-hours-aware scheduling.
- Redis activation.

## Fresh-Chat Handoff Prompt

```text
Implement Stage 2B from docs/conversational-planning/05-real-place-recommendations.md only after the Stage 1B mock loop passes. Reuse the existing provider interface, Google Places adapter, schema validation, stable upserts, deterministic scoring, and explicit fallback behavior in the primary recommendation pipeline. Do not modify scheduler rules or implement Routes, maps, or cache activation in this stage.
```

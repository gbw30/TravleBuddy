# Stage 3B - Cache and Production Hardening

Status: not started  
Depends on: Stage 3A measurements  
Estimated effort: 2-4 working days

## Goal

Make the prototype resilient in preview and production. Add optional cache-aside behavior only where measurements justify it, then add rate limits, timeouts, failure recovery, observability, and end-to-end release gates.

## Architecture Decisions

### Cache technology

Options:

- No distributed cache: simplest and correct, but repeated provider calls remain costly.
- Next.js caching for personalized mutable state: convenient, but invalidation and user scoping are easy to misuse.
- Optional Upstash Redis cache-aside: explicit TTL and invalidation with an external dependency. Recommended for measured provider/derived-data reuse.

### Cache activation

Options:

- Make Redis required: consistent deployment behavior, but cache outage becomes application outage.
- Enable when credentials exist and use a no-op fallback. Recommended.

PostgreSQL must remain authoritative. Cache failure is a performance event, not a correctness failure.

## Cache Contract

```ts
interface PlanningCache {
  get<T>(key: string): Promise<T | null>;
  set<T>(
    key: string,
    value: T,
    options: { ttlSeconds: number; tags: string[] },
  ): Promise<void>;
  invalidateTrip(tripId: string): Promise<void>;
}
```

Implement:

- `NoopPlanningCache`
- `RedisPlanningCache`

Recommended keys and TTLs:

```text
planning-context:v1:{tripId}:{revision}              5 minutes
place-search:v1:{provider}:{city}:{queryHash}        6 hours
place-details:v1:{provider}:{providerPlaceId}        24 hours
ai-extraction:v1:{model}:{normalizedMessageHash}     1 hour
route-matrix:v1:{mode}:{coordinateHash}              12 hours, future
```

## Step-by-Step Implementation

### Step 1: Decide which caches pass the measurement gate

Enable only entries that meet at least one condition:

- repeated provider calls are visible for identical normalized searches
- database planning snapshot p95 misses the Stage 3A target
- AI extraction repeats for retries or identical normalized messages
- preview load testing shows a meaningful latency or provider-cost reduction

Record rejected cache candidates and why they remain uncached.

### Step 2: Add optional Redis configuration

1. Add lazy Redis initialization.
2. Validate `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` only when cache mode is enabled.
3. Default to no-op cache when configuration is absent.
4. Apply operation timeouts.
5. Log hit, miss, bypass, invalidation, and failure without logging cached values.

### Step 3: Add cache invalidation

Invalidate trip-derived context after:

- preference changes
- recommendation selection/rejection/deselection
- itinerary rebuild
- logistics or ticket changes
- trip settings affecting planning
- schedule-policy changes

Provider search/detail caches are independent of user mutation. Ownership is still checked before reading trip-scoped cache entries.

Never cache as authoritative:

- chat messages
- mutation results without an idempotency record
- open conflict state
- ownership decisions
- secrets or raw provider credentials

### Step 4: Add rate limits and budgets

Initial limits:

- user message length: 4,000 characters
- interpreted intents per turn: 3
- model/tool steps: 5
- chat turns: 10 per user per minute
- recommendation generations: 5 per trip per minute
- concurrent active turn: 1 per conversation

Rate-limit responses must preserve the typed user message locally and state when retry is available.

### Step 5: Add timeouts and retry policy

- Google Places timeout: 8 seconds
- AI turn timeout: 20 seconds
- Redis timeout: short enough to bypass rather than delay the request
- retry external transient reads once
- do not automatically retry mutations with a new idempotency key
- use the same key to safely resume/retry a failed turn

Failure behavior:

- AI failure: deterministic fallback
- Places failure: cached result, then explicit fallback/unavailable state
- Redis failure: direct database/provider path
- scheduler failure: retain prior persisted itinerary
- stream disconnect: persist assistant error state and allow retry
- stale revision: return latest snapshot

### Step 6: Add production observability

Record:

- request, conversation, message, and trip IDs
- operation/provider/model
- total and first-response latency
- database and external-call duration
- token usage and finish reason
- cache status
- recommendation, selected-place, and itinerary counts
- stable error code

Do not record raw secrets, complete production prompts, hidden reasoning, OAuth tokens, or database URLs.

### Step 7: Run production-style QA

QA environments must use isolated databases and credentials. Test:

1. Full new-trip conversation.
2. Existing trip conversation resume.
3. Flexible and ticketed multi-city scheduling.
4. Two-tab stale revision.
5. AI disabled and timed out.
6. Places disabled, quota failure, and timeout.
7. Redis disabled and unavailable.
8. Dense/over-budget/restaurant-missing itinerary.
9. Refresh during pending and completed turns.
10. Mobile and desktop layouts.
11. Unauthorized trip access.
12. Migration deployment and rollback procedure.

## Test Requirements

- Cache hits and misses return equivalent DTOs.
- Cache failure falls back without user-visible corruption.
- Invalidation removes stale trip snapshots.
- Keys cannot collide across trips/providers/models.
- Rate limits apply per documented scope.
- Same-conversation concurrent turns are rejected or serialized.
- Timeout paths persist recoverable states.
- Logs contain identifiers and timings but no sensitive values.
- Full deterministic fallback works with AI, Google, and Redis disabled.

## Developer Actions

- Provision Upstash Redis only after Stage 3A measurement review.
- Configure separate preview and production Redis instances or namespaces.
- Set Vercel environment variables for every enabled provider.
- Configure provider quotas, billing alerts, and production monitoring.
- Confirm migrations run with `prisma migrate deploy`.
- Execute preview QA before production promotion.

## Exit Criteria

- Optional cache improves a measured target or remains disabled.
- External dependency failures are recoverable.
- Rate limits and idempotency prevent duplicate or abusive work.
- Production logs support latency and failure diagnosis.
- Full end-to-end QA and verification pass.
- Documentation lists remaining limitations: time zones, Routes, opening hours, maps, export, and visual polish.

## Fresh-Chat Handoff Prompt

```text
Implement Stage 3B from docs/conversational-planning/07-cache-production-hardening.md only after Stage 3A measurements exist. Add optional cache-aside behavior for approved candidates, then rate limits, timeouts, failure recovery, and observability. PostgreSQL must remain authoritative, Redis must be optional, and the application must pass the documented failure-mode QA with AI, Google, or Redis disabled.
```


# Stage 3A - Interaction Performance

Status: stage-plan
Authority: Measurement-first interaction performance intent
Related: [Canonical target](../requirements.md), [current implementation](../status/current-implementation.md), [active roadmap](../roadmap.md), [preceding stage](05-real-place-recommendations.md), [polling ADR](../architecture/adr-004-resilient-polling.md)
Last reviewed: 2026-08-09

## Goal

Remove unnecessary database work, route refreshes, and payload size from the planning interaction path. Reuse compact snapshot and resilient-polling foundations already present. Improvements must be demonstrated against measured complete planning turns rather than assumed; caching and streaming are not promised before evidence.

## Architecture Decisions

### Full snapshots or client patches

Options:

- Full page refresh: simplest server state, unacceptable interaction delay.
- Fine-grained patches immediately: smallest payload, highest reconciliation complexity.
- Compact full planning snapshot after mutation. Recommended until payload measurements justify patches.

### Conflict refresh on read or mutation

Options:

- Refresh on every itinerary read: always fresh, but adds writes and transaction contention to page loading.
- Refresh after itinerary-affecting mutations and explicit checks. Recommended.

## Step-by-Step Implementation

### Step 1: Re-measure the complete prototype

Measure initial page load, chat turn, AI extraction, provider search, selection, itinerary rebuild, conflict refresh, snapshot serialization, and client reconciliation. Capture query counts and payload sizes for short, medium, and long trips.

### Step 2: Split critical and deferred reads

Critical initial data:

- active conversation metadata
- newest 30 messages
- active context and readiness
- visible recommendation batch
- compact live itinerary and open conflict summary

Deferred data:

- older messages
- full action history
- resolved/ignored conflict history
- raw diagnostics

Load deferred panels through separate Suspense boundaries or explicit user actions.

### Step 3: Remove conflict writes from normal reads

1. Make persisted itinerary reads read-only.
2. Refresh conflicts after itinerary, preference, budget, logistics, or schedule-policy mutations.
3. Keep an explicit conflict-check operation for QA and later expensive providers.
4. Ensure the UI receives the latest conflict summary in the mutation result.

### Step 4: Remove broad invalidation from chat

1. Stop redirecting after primary conversational mutations.
2. Stop calling broad planning and itinerary `revalidatePath` operations after each chat action.
3. Return the updated snapshot through the chat response.
4. Revalidate the standalone itinerary route only when persisted itinerary state changes and only if that route relies on cached output.
5. Preserve fallback Server Action behavior until final QA passes.

### Step 5: Optimize database queries

- use explicit `select` projections
- avoid nested data not required by the current panel
- bound message and event history
- avoid overlapping trip ownership queries within one turn
- load selected places and visible recommendations once per turn
- rebuild and conflict-check in one transaction where existing consistency requires it
- do not hold database transactions open during AI or Google network calls

External calls must happen before or after database transactions with validated intermediate data. Re-check revision before committing delayed external results.

### Step 6: Optimize client behavior

- use optimistic status for reversible actions
- throttle streamed rendering where needed
- preserve component state between mobile panels
- avoid remounting the full planning workspace
- keep itinerary dimensions stable while content changes
- paginate history instead of rendering an unbounded feed

## Performance Acceptance Targets

- optimistic message/card state: under 100 ms
- database-local selection and itinerary update: p95 under 500 ms
- snapshot payload: target under 250 KB for representative QA trips
- initial planning content: p95 under 1.5 seconds excluding cold-start anomalies
- no duplicate itinerary rebuild within one turn
- no database write caused by a normal read-only planning load

Provider and model latency must be displayed through immediate pending/streaming UI and measured separately.

## Test Requirements

- Read-only planning load performs no conflict writes.
- Chat actions do not invoke broad route revalidation.
- Snapshot contains all state required to reconcile the UI.
- Deferred panels load independently.
- Message pagination preserves ordering.
- External provider calls do not run inside database transactions.
- Stale revision is rechecked before external results are committed.
- Existing authorization behavior remains unchanged.

## Developer Actions

- Run comparable development and preview measurements.
- Test representative 3-day, 10-day, and multi-city trips.
- Save before/after results in this stage document.

## Exit Criteria

- Performance targets pass or misses are documented with evidence.
- Primary chat interactions do not navigate or refresh the full route.
- Read paths are free of hidden conflict writes.
- No correctness regression appears in full QA.

## Fresh-Chat Handoff Prompt

```text
Implement Stage 3A from docs/conversational-planning/06-interaction-performance.md. Use the Stage 0 measurements and inspect actual query/route behavior before changing it. Remove read-time conflict writes and broad chat revalidation, split critical/deferred reads, and optimize measured bottlenecks only. Preserve correctness and record before/after latency, query count, and payload results.
```

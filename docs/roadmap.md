# Accelerated Adaptive-Planning Roadmap

Status: active roadmap  
Updated: 2026-07-26

This roadmap replaces the conversation-first sequence as the active delivery
order. Status describes repository implementation, not deployment
certification. External credentials, cloud resources, database migrations, and
production releases remain operator-owned.

## Current delivery status

| Stage                     | Repository outcome                                                                                         | Status                                              | Exit gate                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 0. Baseline and migration | Additive Prisma migration and backfill for versioned state and jobs                                        | Implemented; isolated-database execution pending    | Protected preflight, deploy, postflight, and existing-trip verification pass on a non-production database         |
| 1. Versioned domain       | Append-only preference/itinerary versions, active pointers, immutable feedback context                     | Implemented                                         | Existing and new trips load through active pointers; former versions remain readable                              |
| 2. Adaptive item loop     | Source precedence, `TOO_EXPENSIVE` policy, deterministic ranking, copy-on-write replacement/no-replacement | Implemented                                         | Replay creates at most one preference/itinerary effect; unrelated content remains unchanged                       |
| 3. Durable processing     | PostgreSQL claims, attempts, leases, heartbeats, retries, recovery, worker runtime, Render blueprint       | Implemented; deployed worker pending                | Browser/API termination does not lose work; forced worker loss recovers without duplication                       |
| 4. Concurrency protection | Captured version tuple, atomic final compare-and-swap, supersession, source-event/job uniqueness           | Implemented; disposable-PostgreSQL evidence pending | Older work cannot overwrite newer trip, preference, or itinerary state                                            |
| 5. Place retrieval        | Mock and Google Places adapters, validation, normalization, bounded metadata, timeout/retry, stable upsert | Implemented; live Google configuration pending      | Mock journey passes; configured live provider returns persisted source-backed candidates without exposing its key |
| 6. Explainability and UI  | Progress API, adaptive controls, preference/replacement result, version history, resilient polling         | Implemented                                         | Reload resumes active status; terminal, failure, retry, no-replacement, and superseded states are understandable  |
| 7. Release evidence       | Integrated gates, failure demonstrations, metrics, screenshots, video, audited preview                     | Pending                                             | Exact preview commit passes release QA and all published claims point to saved evidence                           |

## Fastest path to a portfolio release

### Gate 1: Repository integrity

Run the complete local gate against the final source state:

- Prisma validation and client generation.
- ESLint and TypeScript.
- Full Vitest suite.
- Production build.
- Migration safety/static checks.
- Focused route, ownership, adaptation, worker, and provider tests.

Do not advance while tracked generated artifacts or migrations disagree with the
schema.

### Gate 2: Isolated database proof

Use a disposable or explicitly approved QA PostgreSQL database:

- Record the database fingerprint and prove it differs from production.
- Apply all migrations through the protected workflow.
- Verify backfilled preference and itinerary version `1` records.
- Exercise real `FOR UPDATE SKIP LOCKED` claims with two workers.
- Verify lease expiry, retry scheduling, dead-lettering, replay, and source
  uniqueness against PostgreSQL rather than mocks.
- Save preflight/postflight receipts and sanitized evidence.

Core authentication, ownership isolation, payload validation, secret handling,
idempotency, and stale-write protection remain mandatory. Faster delivery comes
from running heavy QA at milestone and release gates, not from removing these
controls.

### Gate 3: Deterministic end-to-end journey

Run the web app and worker from the same commit with
`PLACE_PROVIDER_MODE=mock`:

1. Build or open a persisted itinerary.
2. Mark one activity `TOO_EXPENSIVE`.
3. Observe `202`, durable progress, preference version advancement, targeted
   replacement, and itinerary history.
4. Repeat the operation ID to prove replay.
5. Exercise no-replacement, retry, worker recovery, and stale supersession.
6. Confirm an unrelated user receives the non-disclosing not-found response.

### Gate 4: Optional live-provider proof

After the operator configures restricted Google credentials:

- Run the same journey in `google` mode.
- Capture provider provenance and bounded persisted metadata.
- Verify timeout, malformed response, quota, and authentication failures leave
  the active itinerary safe.
- Confirm mock fallback is visibly labelled and is not enabled in production.

The project remains functionally demonstrable in mock mode; live Google evidence
strengthens the portfolio but does not replace deterministic tests.

### Gate 5: Preview and portfolio evidence

- Deploy web and worker from one exact commit.
- Run the repository's release QA routing and obtain a `PASS`.
- Record the normal, worker-recovery, and stale-supersession scenarios from
  [the demo script](./demo/adaptive-planning-demo.md).
- Complete [the evidence template](./demo/evidence-template.md).
- Publish only measured queue, execution, and recovery values.
- Capture accessible desktop/mobile screenshots and a 60-90 second demo video.

## Post-portfolio roadmap

Prioritize only after the adaptive release passes:

1. Route-aware day scheduling, live opening hours, and travel buffers.
2. Additional explicit, testable inferred-preference policies.
3. Manual retry/cancellation and operational job administration.
4. Performance work driven by measured bottlenecks.
5. Optional richer synchronization if polling measurements justify it.
6. Conversational planning through the same domain services.

Deferred unless a later product decision promotes them: Gemini, Redis, chat
persistence, WebSockets/SSE, maps, booking, export, collaborative trips, and
cross-trip learning.

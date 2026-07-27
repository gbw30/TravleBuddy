# TravleBuddy Product Vision

Status: canonical product direction  
Updated: 2026-07-26

## Purpose

TravleBuddy is an adaptive travel-planning application that learns from
structured user feedback and improves a persisted itinerary without treating
every interaction as a reason to rewrite the entire trip.

The product loop is:

```text
Trip constraints
  -> preference profile
  -> candidates
  -> scored recommendations
  -> structured itinerary
  -> durable user feedback
  -> new preference and itinerary versions
```

The central engineering problem is reliable adaptation: feedback must survive
disconnects, retries, worker failure, and concurrent edits while preserving the
latest valid user state.

## Product promise

A traveler can react to an itinerary item and see TravleBuddy explain and apply
the smallest safe update. The current itinerary stays usable until a validated
successor is ready. A failed or stale calculation never replaces newer state.

This makes three qualities visible to both travelers and portfolio reviewers:

- Personalization: feedback affects later ranking and replacement.
- Predictability: explicit preferences and accepted decisions are preserved.
- Reliability: durable jobs, immutable history, and version checks make
  asynchronous processing recoverable and explainable.

## Product principles

1. **Feedback improves future results.** Meaningful reactions are durable domain
   events, not disposable interface metadata.
2. **Explicit outranks inferred.** `EXPLICIT` signals win over `INFERRED`
   signals, which win over `DEFAULT` values. Recency and confidence break ties
   only within the same source.
3. **Hard constraints are deterministic.** Authorization, ownership, dates,
   budget limits, destination compatibility, and schedule validation are owned
   by typed application services.
4. **Preserve accepted state.** A targeted change retains unrelated days and
   items and leaves the active itinerary untouched on failure.
5. **Recompute the smallest safe scope.** Classify changes as item, day-set, or
   trip impact before doing work.
6. **Make state explainable.** Persist preference deltas, replacement reasons,
   progress, attempts, errors, and version lineage.
7. **Keep itineraries structured.** Itinerary versions, days, items, windows,
   and conflicts remain queryable domain records.
8. **Use providers and AI behind boundaries.** External systems may supply
   facts or language assistance; they do not own correctness or commit state.

## Implemented portfolio slice

The repository implements one narrow end-to-end adaptation:

```text
Reject or request an alternative for an itinerary item
  -> atomically record durable feedback and a pending job
  -> acknowledge with HTTP 202
  -> claim the job in an independent PostgreSQL-backed worker
  -> apply the supported preference policy
  -> reuse or retrieve compatible candidates
  -> rank candidates deterministically
  -> copy the current itinerary into a draft version
  -> replace the target item and validate conflicts
  -> atomically activate current preference/itinerary pointers
  -> expose persisted progress and version history to the browser
```

The first supported inferred-preference policy is intentionally small:

- `TOO_EXPENSIVE` increases inferred price-sensitivity weight and confidence by
  `0.10`, each capped at `1.0`.
- An explicit price-sensitivity signal is never overwritten.
- Category interests remain unchanged.
- Other feedback reasons are recorded and exclude the rejected place, but do
  not yet infer broader preference changes.
- If no compatible candidate exists, the preference version can advance while
  the current itinerary remains active with a `NO_REPLACEMENT` result.

Feedback event identity, target, action, reason, and captured version context
are immutable inputs. Processing status and completion time are lifecycle
fields that the queue updates.

Replacement candidates must match destination and category and must not already
be selected or rejected. Ranking is deterministic: score descending, rating
descending, provider place ID ascending, then name ascending.

## System direction

PostgreSQL is authoritative for trips, preferences, feedback, candidates,
itinerary versions, jobs, attempts, and progress events. The web process accepts
and displays work; an independent worker performs adaptation.

`planningRevision` protects browser/API mutations. `tripVersion` invalidates
outdated background work. Jobs additionally capture the active preference
profile and parent itinerary version. The worker checks this version tuple
before work and again during the activation transaction.

Provider access uses a validated `mock | google | auto` boundary. Automated
tests use deterministic mock results. Google Places code is present, but live
Google credentials, billing, quota, and deployments are not configured by the
repository.

The browser uses resilient polling over persistent job records. It can recover
active progress after a reload and stops polling terminal jobs. WebSockets are
not required for correctness.

## Success criteria

The redesigned portfolio release is successful when saved evidence shows:

- Feedback and its job are committed together and replay safely.
- A `TOO_EXPENSIVE` reaction produces the expected bounded preference delta.
- Only the affected item changes; unrelated itinerary content remains equal.
- The former itinerary version remains readable.
- No-replacement and provider-failure paths preserve the active itinerary.
- An interrupted worker is recovered without duplicate preference or itinerary
  effects.
- A stale job reaches `SUPERSEDED` and cannot overwrite the winning versions.
- Cross-user reads and mutations remain non-disclosing.
- Reported latency and recovery numbers come from recorded measurements.

## Deliberately deferred

The portfolio slice does not include:

- Google Routes, route-aware scheduling, or live opening-hours optimization.
- Gemini or another LLM planning loop.
- Redis, distributed cache, or a second queue system.
- Chat or conversation persistence.
- WebSockets or Server-Sent Events.
- Map presentation, drag-and-drop scheduling, export, or booking.
- Cancellation and manual dead-letter replay.
- Advanced inferred policies for vibe, distance, pace, or repeated-category
  feedback.
- Cross-trip learning, collaborative planning, or production penetration
  testing.

These are later extensions, not prerequisites for demonstrating the adaptive
planning and concurrency architecture.

# ADR-003: Reject stale background results with captured versions

Status: accepted  
Date: 2026-07-26

## Context

Provider calls and itinerary calculations happen outside a database
transaction. During that time, a traveler can submit newer feedback or change
trip, preference, or itinerary state. A worker that commits from an old parent
would otherwise overwrite the newer decision.

Retries and lease recovery also mean a handler can execute more than once.

## Decision

Every feedback job captures a planning version tuple:

- `tripVersion`
- active `preferenceProfileVersionId`
- parent `itineraryVersionId`
- feedback ID and mutation operation ID

Apply stale-result protection at three boundaries:

1. The item-feedback API uses `expectedRevision` and a UUID operation ID.
   `PlanningMutation` replays an identical request and rejects a conflicting
   reuse.
2. The worker compares the captured tuple with the trip, feedback, and active
   pointers before provider or ranking work.
3. The activation transaction performs a conditional trip update matching all
   captured values. Only that transaction may increment the versions and switch
   active pointers.

External provider calls remain outside the activation transaction. The worker
must recheck after those calls instead of holding database locks while waiting
on a network.

Unique `PreferenceProfileVersion.sourceFeedbackId` and
`ItineraryVersion.sourceJobId` prevent duplicate effects. Lease-owned writes
also require the current worker ID and attempt. A mismatch becomes terminal
`SUPERSEDED`; it is not a retryable error and cannot activate state.

## Consequences

Benefits:

- Older work cannot overwrite a newer browser mutation or worker result.
- Retried delivery can reuse the prior durable result.
- The winning preference and itinerary lineage is explicit.
- Workers do not hold long transactions across provider calls.

Costs and constraints:

- Rapid feedback intentionally supersedes some queued work, so the UI must
  explain that outcome.
- Every planning mutation must update version counters consistently.
- Tests must cover old-worker completion, duplicate delivery, simultaneous
  claims, changes during provider calls, and failure around the final commit.
- Superseded work is retained for audit rather than silently discarded.

## Alternatives considered

- **Last writer wins:** rejected because completion order is not user-intent
  order.
- **One long serializable transaction:** rejected because provider latency
  would hold locks and make failure recovery worse.
- **A distributed lock only:** rejected because a lock does not prove the
  inputs are still current at commit time.

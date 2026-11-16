# ADR-006: Split immediate removal from durable replacement

Status: accepted
Date: 2026-08-09

## Context

Itinerary feedback originally sent both **Remove** and **Dislike & replace**
through `PROCESS_FEEDBACK_EVENT`. Plain removal therefore waited for a local
worker and paid the latency and failure cost of provider lookup, ranking, and
replacement validation even though none of that work was requested.

The queue remains valuable for replacement because that operation can involve
provider latency, retries, process interruption, and stale results. Removing a
known item is bounded PostgreSQL work and can safely complete in the request.

## Decision

Use a hybrid command boundary:

- `REJECT` records immutable processed feedback and atomically activates a
  copy-on-write itinerary without the target item. It does not create a job.
- Supported deterministic preference policy still runs synchronously. In
  particular, `TOO_EXPENSIVE` increases an inferred signal by `0.10`; explicit
  signals remain protected. No-op feedback does not create a preference
  version.
- `REQUEST_ALTERNATIVE` atomically records feedback plus a durable PostgreSQL
  job and remains subject to leases, heartbeats, retries, progress polling,
  replay protection, and stale-result protection.
- Both paths use the same batched copy-on-write materializer and retain
  database-generated identifiers.
- Neither path supersedes the active itinerary until its successor can commit.

## Consequences

Benefits:

- Remove works without an active worker and provides immediate feedback.
- Provider and worker failures cannot prevent plain removal.
- Replacement retains durable execution and recovery guarantees.
- Version history, immutable feedback, planning revisions, and replay safety
  remain consistent across both paths.

Costs and constraints:

- The feedback endpoint has two success contracts: synchronous HTTP `200` and
  queued HTTP `202`.
- The browser maintains separate optimistic-removal and persisted-job states.
- A local worker is still required to complete replacement jobs in the active
  free-first QA topology.

## Alternatives considered

- **Queue every feedback action:** rejected because bounded removal should not
  depend on provider or worker availability.
- **Process replacement inside the request:** rejected because it would lose
  durable retry, recovery, and stale-result isolation.
- **Remove without versioning or feedback:** rejected because it would weaken
  auditability, replay protection, and copy-on-write safety.

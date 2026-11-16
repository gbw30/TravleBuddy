# ADR-002: Use PostgreSQL as the initial durable job queue

Status: accepted  
Date: 2026-07-26

## Context

Feedback processing must survive browser closure, API restarts, provider
latency, and worker failure. An in-memory task or request-bound promise cannot
provide that guarantee. Introducing Redis solely for the first queue would add
an external dependency and split correctness across systems.

## Decision

Store work in PostgreSQL and process it in an independent Node worker:

- The feedback event, `GenerationJob`, initial `JobEvent`, mutation result, and
  revision update are committed in one database transaction.
- Workers atomically claim available `PENDING` or `RETRYING` jobs with
  `FOR UPDATE SKIP LOCKED`.
- Processing is at-least-once. Unique feedback/job source keys and replay checks
  make domain effects idempotent.
- Each claim creates a `JobAttempt`, identifies its worker, and owns a 30-second
  lease.
- The worker heartbeats every 5 seconds. Expired claims are recovered every 30
  seconds with `SKIP LOCKED`.
- Retryable failures wait 5 seconds after attempt one and 20 seconds after
  attempt two. The policy also defines a 60-second upper delay; with the current
  three-attempt limit, the third failure is dead-lettered rather than retried.
- Job payloads, results, progress messages, metadata, error codes, and error
  messages have explicit size limits.
- Terminal states are `SUCCEEDED`, `FAILED`, `DEAD_LETTERED`, and
  `SUPERSEDED`.
- `SIGTERM`/`SIGINT` stop new claims and allow the current claim to finish.
  Abrupt process loss is handled by lease expiry and recovery.
- The executable is deployment-portable. The active free-first QA/demo topology
  runs it locally against the existing Neon QA database; `render.yaml` remains
  an optional future paid-hosting template. Worker startup never applies
  migrations.

## Consequences

Benefits:

- No queue-specific external service is required.
- Feedback durability and job creation share one transaction.
- Claims scale safely to multiple worker instances.
- Attempts and progress are directly queryable for debugging and evidence.
- Local and QA environments can exercise the production queue semantics.
- The Vercel web process and local worker remain independently deployable and
  communicate only through persisted PostgreSQL state.

Costs and constraints:

- Queue traffic consumes PostgreSQL connections and write capacity.
- Jobs remain pending while no worker process is running; an always-on worker
  host is an explicit later operational decision.
- Claim, lease, and recovery behavior requires real PostgreSQL integration and
  concurrency tests; mocked unit tests are not sufficient release evidence.
- Long-running or high-volume workloads may eventually justify a dedicated
  queue, but migration must preserve the same idempotent handler contract.
- Dead-letter replay, cancellation, and an operator dashboard are deferred.

## Alternatives considered

- **Request-bound processing:** rejected because it loses work on disconnect or
  process failure.
- **In-memory queue:** rejected because it is neither durable nor horizontally
  safe.
- **Redis queue immediately:** deferred until measured throughput or latency
  shows PostgreSQL is insufficient.

# ADR-004: Synchronize job progress with resilient polling

Status: accepted  
Date: 2026-07-26

## Context

The browser should show adaptation progress and recover after reload or a
temporary connection failure. Correctness cannot depend on a live in-memory
connection. WebSockets or Server-Sent Events would add deployment and
reconnection complexity before the product has measured traffic requiring
them.

## Decision

Use persisted progress plus bounded owner-authorized polling:

- `GenerationJob` stores current status, progress, message, attempts, result,
  and stable failure code.
- `JobEvent` stores the durable phase history.
- The planning snapshot includes at most 10 active jobs and a bounded itinerary
  version summary.
- `GET /api/trips/:tripId/jobs/:jobId` verifies trip ownership, returns at most
  50 recent events in chronological order, disables caching, and never exposes
  the job payload or internal error message.
- After a job is observed, the client polls every second for 15 seconds, then
  every 3 seconds.
- Polling stops for terminal states. On terminal completion, the client
  refreshes server state once to load the winning itinerary/version pointers.
- Failed polls preserve the durable server-side work and display a reconnecting
  state. Reloading the planning page recovers active jobs from PostgreSQL.

## Consequences

Benefits:

- No correctness-critical in-memory subscription exists.
- Reload, disconnect, and horizontal web scaling are straightforward.
- Progress, retries, recovery, failures, and supersession are auditable.
- The transport can later change without changing job semantics.

Costs and constraints:

- Polling creates repeated reads while jobs are active.
- Terminal jobs are not loaded indefinitely in the planning snapshot; detailed
  audit/history views may need a paginated endpoint later.
- Metrics must determine whether backoff, batch status reads, SSE, or WebSockets
  are worth adding.
- Browser polling tests must use controlled timers and verify terminal cleanup
  and reconnect behavior.

## Alternatives considered

- **WebSockets:** deferred until bidirectional real-time behavior is justified.
- **Server-Sent Events:** deferred until measurements show polling is
  insufficient.
- **In-memory progress only:** rejected because reloads and process restarts
  would lose state.

# Conversational Planning Implementation Pack

Status: stage-plan
Authority: Active post-adaptive implementation stages and cross-stage invariants
Related: [Canonical target](../requirements.md), [current implementation](../status/current-implementation.md), [active roadmap](../roadmap.md), [architecture](../architecture/README.md)
Last reviewed: 2026-08-09

This pack becomes active after the adaptive-planning evidence milestone is complete. It describes implementation sequence, not a competing product specification. If a stage assumption conflicts with the canonical target, the target wins; if it describes a capability absent from code, the current-state document must continue to mark it planned.

## Product outcome

A traveler plans within one durable workspace where conversation, structured answers, recommendations, conflicts, and a highly visible live itinerary remain synchronized. The system asks focused questions, presents exactly three recommendation cards per user-facing batch, preserves accepted choices, and applies deterministic backend rules to authoritative state.

## Existing foundation

The repository already provides authentication and ownership, trip/preferences/logistics, deterministic recommendations, itinerary/conflict services, planning revisions, replay protection, compact snapshots, adaptive preference/itinerary versions, PostgreSQL jobs, resilient polling, and Google/mock provider adapters for adaptive replacement.

It does not yet provide durable conversation/message records, a conversational controller, general AI intent extraction, exact activity scheduling, primary-flow Google recommendations, general cross-trip learning, or production-grade timezone behavior. See [current implementation status](../status/current-implementation.md).

## Global architecture decisions

- PostgreSQL and backend domain services remain authoritative.
- AI extracts or explains; schema validation and deterministic services decide what commits.
- Each turn carries an operation ID and expected planning revision and performs at most one authoritative rebuild.
- Exactly three recommendation cards are visible per batch; candidate pools may be larger.
- Explicit trip preferences override reusable defaults and learned tendencies.
- Selected-but-unscheduled items remain visible.
- The itinerary is prominent in the same responsive workspace, conceptually above conversation by default; component layout is not fixed.
- Existing forms remain transitional fallback paths until conversational QA passes.
- PostgreSQL jobs are available for work that genuinely benefits from asynchronous execution; ordinary turns need not become jobs.
- Optional caching or new infrastructure is measurement-gated and requires an explicit topology decision.

## Ordered stages

| Stage | Document                                                             | Outcome                                                                                                         |
| ----- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 0     | [Foundation and contracts](01-foundation-and-contracts.md)           | Implemented planning revision, replay, snapshot, and measurement foundations; final evidence tracked separately |
| 1A    | [Conversation persistence and UI](02-conversation-persistence-ui.md) | Durable messages and one responsive planning workspace                                                          |
| 1B    | [Conversational intelligence](03-conversational-intelligence.md)     | Validated intent, focused questions, and three-card interactions                                                |
| 2A    | [Live itinerary scheduling](04-live-itinerary-scheduling.md)         | Deterministic placement, logistics, and conflict recovery                                                       |
| 2B    | [Real place recommendations](05-real-place-recommendations.md)       | Existing provider boundary extended into the primary flow                                                       |
| 3A    | [Interaction performance](06-interaction-performance.md)             | Measurement-led query, payload, and rendering improvements                                                      |
| 3B    | [Cache and production hardening](07-cache-production-hardening.md)   | Optional evidence-gated cache, limits, resilience, and production QA                                            |

Complete stages in order unless the active roadmap explicitly changes sequencing. General preference learning and final timezone correctness are later roadmap milestones because their full algorithms and boundary suites are not selected here.

## Cross-stage invariants

- Owner scoping and archived-trip rules apply to every read and mutation.
- DTOs are bounded; raw model/provider payloads never reach the browser.
- Replays create no duplicate message, version, selection, or itinerary mutation.
- Stale work cannot overwrite a newer trip revision or parent version.
- A valid active itinerary remains available until a valid successor commits.
- Deterministic mock behavior remains available for automated tests.
- Provider, AI, cache, and worker failures produce explicit recoverable states.
- Accessible semantic controls and responsive behavior survive later visual replacement.

## Context workflow

For a stage task, read only:

1. [Canonical requirements](../requirements.md).
2. [Current implementation status](../status/current-implementation.md).
3. [Architecture](../architecture/README.md) and relevant ADRs.
4. This README and the current stage.
5. Relevant code, tests, QA feature states, and scenarios.

Do not use historical phase documents to define current implementation order.

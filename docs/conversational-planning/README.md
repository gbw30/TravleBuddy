# Conversational Planning Development Pack

Status: historical/deferred planning pack
Purpose: standalone context for implementing the conversational planning prototype  
Primary route: `/trips/[tripId]/planning`

> Conversational planning is no longer the active delivery baseline. Use
> [the canonical product vision](../product-vision.md) and
> [active roadmap](../roadmap.md). These documents remain as future design
> context only; chat persistence, AI Gateway/Gemini, Redis, and conversational
> controller work are deferred.

## Product Outcome

TravleBuddy should guide planning primarily through a persisted conversation. The application asks focused questions, converts answers into validated trip preferences, recommends places when enough context exists, accepts selections or rerolls, and rebuilds a visible itinerary while the conversation continues.

The prototype is complete when a user can:

1. Start or resume a trip conversation.
2. Answer through natural language or suggested answer controls.
3. See the trip preference profile change.
4. Receive five relevant place recommendations.
5. Select, reject, remove, or reroll recommendations.
6. See selected activities and restaurants placed into a persisted itinerary.
7. See budget, schedule, location, and restaurant-coverage conflicts without a page reload.
8. Reload the page and continue without losing messages or itinerary state.

## Existing Foundation

The repository already contains:

- Authenticated App Router pages, Server Actions, and route handlers.
- Neon PostgreSQL through Prisma.
- Trip-local structured preferences.
- Deterministic natural-language keyword extraction.
- Persisted planning feedback and planning events.
- Mock recommendation scoring and selection feedback.
- A persisted itinerary builder and conflict engine.
- Ticketed/flexible logistics, city windows, and 48 half-hour slots per day.

The new work must reuse these services instead of creating parallel recommendation, itinerary, or conflict systems.

Stage 0 now also provides a trip-owned planning revision, a replay-safe mutation ledger, compact planning snapshots, pure itinerary reads, and structured operation timings. The migration is implemented but must be applied only after the target database is confirmed as development or QA and distinct from production.

## Global Architecture Decisions

### Ownership

- PostgreSQL is the source of truth.
- Backend services own authorization, validation, preference merging, recommendation scoring, itinerary generation, and conflicts.
- AI extracts intent and writes explanations; it never writes arbitrary database state.
- Google supplies place and later route data through provider adapters.
- Redis is optional cache-aside infrastructure and is never required for correctness.

### AI Strategy

Use AI SDK with an environment-selected Gemini model through Vercel AI Gateway. Hide model construction behind a lazy `getPlanningModel()` function. Keep deterministic extraction and response templates as the fallback when AI is unavailable.

Use a hybrid controller:

1. Parse the user message into a validated planning intent.
2. Resolve references against authorized server state.
3. Execute deterministic services.
4. Generate or stream an explanation of the result.

Do not begin with an unrestricted autonomous agent loop.

### Interaction Strategy

- Server Components load the initial planning snapshot.
- A focused Client Component owns the chat stream and optimistic state.
- One streaming route handles conversational turns.
- Chat tools call feature services directly, not the application's own HTTP routes.
- Mutations return a compact updated planning snapshot.
- The primary path must not call `router.refresh()` or broadly revalidate the page after each turn.

### UI Strategy

Chat is primary. Existing structured controls remain in a collapsed `Edit details` fallback until conversational QA passes. Behavior containers and typed presentational components must remain separate so later visual redesign does not replace planning logic.

## Ordered Stages

| Stage | Document                                                               | Outcome                                                   | Estimate |
| ----- | ---------------------------------------------------------------------- | --------------------------------------------------------- | -------- |
| 0     | [Foundation and contracts](./01-foundation-and-contracts.md)           | Stable baseline, measurements, DTO and revision contracts | 1-2 days |
| 1A    | [Conversation persistence and UI](./02-conversation-persistence-ui.md) | Persisted deterministic chat shell with live itinerary    | 2-3 days |
| 1B    | [Conversational intelligence](./03-conversational-intelligence.md)     | Natural-language preference and mock recommendation loop  | 3-4 days |
| 2A    | [Live itinerary scheduling](./04-live-itinerary-scheduling.md)         | Activities and restaurants placed in 30-minute slots      | 3-5 days |
| 2B    | [Real place recommendations](./05-real-place-recommendations.md)       | Google Places behind a tested provider boundary           | 2-4 days |
| 3A    | [Interaction performance](./06-interaction-performance.md)             | Smaller reads, no broad refreshes, measured latency       | 2-3 days |
| 3B    | [Cache and production hardening](./07-cache-production-hardening.md)   | Optional Redis, limits, resilience, production QA         | 2-4 days |

Stages 0, 1A, and 1B must be implemented in order. After Stage 1B passes, Stages 2A and 2B may be developed in parallel, but the deterministic scheduler should merge first so the complete product loop remains testable without Google. Stage 3 begins only after both Stage 2 stages pass.

## Cross-Stage Invariants

- Every route and tool verifies authentication and trip ownership.
- Every external or model response is schema-validated.
- Every mutation is idempotent or protected by a client revision.
- One conversational turn rebuilds the itinerary at most once.
- Conflict checks run after itinerary-affecting mutations, not after every token or UI interaction.
- Resolved and ignored conflict history is preserved.
- Selected places are never silently dropped when scheduling fails.
- Provider, AI, cache, and scheduler failures produce recoverable user states.
- Secrets and raw prompts are not exposed to the browser or production logs.

## Context Management Workflow

For a fresh implementation chat:

1. Attach or paste this README.
2. Attach only the document for the next incomplete stage.
3. Ask the agent to inspect the repository before changing files.
4. Require the stage exit criteria and full verification before moving on.
5. Update that stage document's status and completion record after implementation.

Do not provide all stage documents to an implementation chat unless cross-stage architecture is being revised. Each stage file is intentionally self-contained.

## Completion Tracking

- [ ] Stage 0 - Foundation and contracts (implementation complete; migration, manual QA, and latency baseline pending)
- [ ] Stage 1A - Conversation persistence and UI shell
- [ ] Stage 1B - Conversational intelligence
- [ ] Stage 2A - Live itinerary scheduling
- [ ] Stage 2B - Real place recommendations
- [ ] Stage 3A - Interaction performance
- [ ] Stage 3B - Cache and production hardening

Stage 0 automated evidence as of 2026-07-17: ESLint, TypeScript, Prisma validation, and 213 tests pass. Migration `20260717090000_stage0_planning_revision` is pending on the configured Neon datasource. The production build remains environment-blocked by configured Google font downloads, and no font configuration was changed.

## Final Prototype Boundary

Deferred until after this pack is complete:

- Final visual design and branding.
- Drag-and-drop itinerary editing.
- Complete IANA time-zone handling.
- Google Routes and opening-hours optimization beyond documented fallbacks.
- Map presentation and export polish.
- Ticket document parsing, reservations, and booking.
- Background queues unless measurements show synchronous limits are exceeded.

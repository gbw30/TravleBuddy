# TravleBuddy Active Roadmap

Status: active-roadmap
Authority: Ordered delivery milestones from current implementation to target product
Related: [Target requirements](requirements.md), [current implementation](status/current-implementation.md), [conversational stages](conversational-planning/README.md)
Last reviewed: 2026-08-09

This roadmap is one delivery path, not a choice between an adaptive product and a conversational product. The adaptive system is the proven engineering foundation; the conversational workspace is the intended product direction.

## Working constraints

- Use only the existing `qa` and `main` branches, Neon QA/production databases, and Vercel targets.
- Use the local worker for the adaptive demonstration; do not require Render or another paid background-worker service.
- Keep deterministic mock providers available throughout development and QA.
- Do not begin the next milestone until the preceding exit evidence is recorded.
- Preserve authentication, ownership, validation, idempotency, stale-write protection, and migration isolation at every stage.

## Milestone 0 — Documentation knowledge base

Establish the target/current/plan split, archive historical records, repair retrieval routes, and verify documentation consistency without changing application behavior.

Exit evidence:

- One canonical target specification.
- Evidence-backed current-state matrix.
- Architecture and history indexes.
- Passing link, formatting, QA-context, and documentation-scope checks.

## Milestone 1 — Complete adaptive portfolio evidence

Finish the already-implemented adaptive milestone before building conversation features.

1. Confirm the existing Vercel QA target runs the certified commit and points only to the existing Neon QA database.
2. Run the worker locally against QA with deterministic mock Places configuration.
3. Demonstrate `TOO_EXPENSIVE` targeted replacement, persisted job progress, preference and itinerary version creation, and unchanged unrelated days.
4. Replay the same operation ID and confirm no duplicate versions.
5. Run real-PostgreSQL lease recovery and two-claimer integration tests.
6. Demonstrate stale-job supersession without adding infrastructure.
7. Complete the evidence template and capture a 60–90 second portfolio recording.

Exit evidence: [adaptive demo acceptance criteria](demo/adaptive-planning-demo.md) and a completed evidence record. The protected QA migration certification for commit `e6e74c65fe3c2d5377eeeee1a67c90675d21ad60` is already complete; a later code commit requires exact-commit recertification only when schema/migration policy requires it.

## Milestone 2 — Conversation persistence and workspace UI

Implement [Stage 1A](conversational-planning/02-conversation-persistence-ui.md): durable conversations/messages, turn and replay contracts, bounded history, and a single responsive workspace. Keep existing forms as fallback paths. Make the live itinerary prominent in the same workspace, conceptually above the conversation by default.

Exit evidence: reload-safe messages, owner isolation, accessible structured answers, revision/replay tests, and critical browser coverage.

## Milestone 3 — Conversational intelligence and three-card batches

Implement [Stage 1B](conversational-planning/03-conversational-intelligence.md): validated structured intent, focused question selection, bounded dispatch, deterministic fallback, one rebuild per turn, and exactly three visible recommendation cards. This stage updates trip preferences only; it does not claim learned cross-trip tendencies.

Exit evidence: schema-invalid AI output cannot mutate state; fallback works without AI; cards support select/reject/refine; messages and planning changes commit coherently.

## Milestone 4 — Live scheduling

Implement [Stage 2A](conversational-planning/04-live-itinerary-scheduling.md): deterministic activity assignment, selected-but-unscheduled preservation, ticketed/flexible logistics, multi-city windows, travel blocks, and conflict recovery. Retain the prototype's documented UTC limitation until final timezone work.

Exit evidence: deterministic scheduling tests, preserved fixed commitments, multi-city boundary coverage, and responsive live-itinerary updates.

## Milestone 5 — Primary place-provider integration

Implement [Stage 2B](conversational-planning/05-real-place-recommendations.md): reuse and extend the existing Google/mock adapter into the main recommendation pipeline. Fetch and rank a bounded candidate pool, then show exactly three cards. Keep mock mode authoritative for automated QA and provide explicit provider-unavailable states.

Exit evidence: normalization, timeout/retry, stable upsert/ranking, raw metadata privacy, persisted-candidate reuse, fallback, and quota-safe tests.

## Milestone 6 — Measured interaction performance and hardening

Complete [Stage 3A](conversational-planning/06-interaction-performance.md) before [Stage 3B](conversational-planning/07-cache-production-hardening.md). Measure complete planning turns, reduce snapshot/query cost, bound history, and add observability. Introduce optional caching, streaming, or rate-limit infrastructure only when evidence justifies it and the developer explicitly approves any topology change.

Exit evidence: recorded baselines and targets, no broad invalidation in normal turns, bounded failure behavior, and production-style QA on the existing topology.

## Milestone 7 — Long-term preference learning and timezone completion

Add general user-level learned tendencies with inspectable confidence and reversible evidence. Explicit trip preferences must always win. Select the learning algorithm only after requirements and privacy behavior are reviewed.

Complete production-grade IANA timezone behavior across origin/destination display, storage, scheduling, daylight-saving transitions, overnight travel, and multi-timezone boundaries.

Exit evidence: cross-trip isolation and precedence tests, confidence provenance, user correction/reset behavior, and timezone boundary suites.

## Later product expansion

Maps, booking/cancellation, rich export, group collaboration, and other expansions require separate product decisions. They do not block the conversational-planning target defined above.

# TravleBuddy Target Product Requirements

Status: canonical-target
Authority: Sole canonical specification of intended product behavior
Supersedes: [Pre-MVP requirements](history/pre-mvp-requirements.md) and the [adaptive portfolio vision](history/adaptive-portfolio-vision-2026-08.md)
Related: [Current implementation](status/current-implementation.md), [architecture](architecture/README.md), [roadmap](roadmap.md)
Last reviewed: 2026-08-09

## 1. Authority and interpretation

This document defines the target product, regardless of whether a capability is implemented today. It does not certify implementation, choose deployment credentials, or prescribe an unproven learning algorithm. Repository reality is recorded in [current-implementation.md](status/current-implementation.md); delivery order is recorded in [roadmap.md](roadmap.md).

## 2. Product vision and users

TravleBuddy is a persistent conversational travel-planning workspace. It helps a traveler turn incomplete ideas into an explainable, editable itinerary while preserving explicit instructions, selected activities, logistics, and history. It is aimed first at individual leisure travelers and small groups who need guided discovery without surrendering control to an opaque automated planner.

The product should feel like working with a careful travel planner: it asks only useful questions, presents a small number of relevant choices, explains why they fit, and continuously keeps a visible itinerary consistent.

## 3. Persistent planning workspace

Each trip has one durable planning workspace containing the conversation, structured answers, recommendations, live itinerary, conflicts, progress, and version history. The live itinerary must be highly visible in the same workspace; its default conceptual position is above the conversation, but the responsive layout may place it differently without changing behavior.

The workspace must survive reloads and allow a traveler to resume from the last committed planning state. Existing structured forms may remain as accessible fallback or precision-entry paths.

## 4. Live itinerary

The itinerary is a continuously updated plan, not a final report generated only at the end. It must distinguish selected-but-unscheduled items from scheduled items, preserve accepted choices, expose conflicts, and explain material changes. A planning action must not silently discard unrelated days or accepted activities.

## 5. Conversation and progressive discovery

Conversation is the target primary planning interaction. The system must persist user and assistant messages, structured answers, linked recommendations, and the planning revision associated with each turn. It should progressively discover missing information and ask focused questions rather than repeat a complete questionnaire.

Structured controls remain appropriate for dates, exact ticket times, city order, accessibility requirements, and other values where precision matters. Natural-language understanding must produce validated structured intent before it can mutate authoritative planning state.

## 6. Planning state and precedence

The product distinguishes:

- **Trip facts:** destinations, dates, travelers, city sequence, and booked logistics.
- **Trip preferences:** explicit instructions that apply to the current trip.
- **User preferences:** reusable long-term tendencies learned gradually across trips.
- **Conversation context:** recent messages and structured answers needed to interpret the current turn.

Explicit current-trip instructions always override user-level tendencies. Learned tendencies carry both a value and confidence, must remain inspectable, and must never overwrite explicit values. The final algorithm for general cross-trip learning is intentionally not fixed by this specification.

## 7. Readiness and recommendation transition

Readiness is topic-specific. The system can recommend restaurants when dining context is sufficient even if lodging preferences are incomplete. It should proactively transition from questions to recommendations when enough relevant information exists and explain what remains unknown when it cannot proceed.

## 8. Recommendation experience

Each user-facing recommendation batch contains exactly three cards. A provider or ranking pool may contain more candidates, but the visible decision set is three. Each card must identify the place or activity, category, relevant location, rating or other available evidence, price context when known, and an explanation tied to current trip preferences.

Travelers can select, reject, refine, or request another batch. Rejected items cannot immediately reappear without a meaningful change in constraints or an explicit reset. Selection and rejection history must persist and inform later ranking. Ranking must be deterministic after normalized candidates and planning inputs are fixed, with documented tie-breakers.

## 9. Scheduling and logistics

Scheduling is deterministic and server-authoritative. The scheduler must respect trip dates, city windows, opening or ticketed windows, travel blocks, meal policies, item duration, and explicit fixed commitments. Flexible logistics may be moved within allowed windows; ticketed logistics and explicit appointments may not.

Multi-city days must represent location transitions and prevent an activity from being placed in the wrong city window. A selected activity that cannot be scheduled remains selected and visibly unscheduled with a reason; it is never silently dropped.

## 10. Timezone correctness

The target system uses IANA timezone identifiers and evaluates each event in the local timezone of its origin or destination as appropriate. Storage, comparison, display, daylight-saving transitions, overnight travel, and cross-timezone boundaries must be correct. UTC may be used internally, but it cannot be the only user-facing scheduling interpretation.

## 11. Conflicts and recovery

The system detects and explains time overlap, impossible location transitions, city-window violations, budget pressure, schedule density, and other supported planning conflicts. Conflict results are derived from authoritative state and refresh after relevant mutations. Recovery suggestions must be actionable and must not activate an invalid successor itinerary.

## 12. Planning-turn transaction and concurrency

A planning turn has one operation identifier and expected planning revision. The backend validates ownership and input, interprets intent, computes at most one authoritative rebuild for the turn, persists messages and structured changes, and returns the resulting snapshot. Replayed operations return the original result. Stale revisions fail safely or become superseded; late asynchronous work cannot overwrite newer state.

Long-running work may use durable jobs with leases, retries, and progress events. The user can reload and recover progress. State activation is atomic: the current valid itinerary remains active until a validated successor commits.

## 13. System responsibilities

PostgreSQL is the durable authority for users, trips, preferences, conversations, recommendations, itinerary versions, feedback, jobs, and replay records. Backend services own authorization, validation, deterministic ranking and scheduling, conflict derivation, and state transitions.

AI may extract structured intent, draft conversational language, and help explain decisions. AI output is untrusted until schema-validated and cannot directly write authoritative state. Place providers supply normalized candidates behind an adapter; provider metadata is bounded and private. The product must support deterministic mock data for tests and graceful degradation when AI or external providers are unavailable.

## 14. Traceable target functional requirements

The following checklist is the target acceptance catalogue. IDs remain stable as implementation evolves.

1. **TB-FR-01 — Account access:** A traveler can authenticate, sign out, and access only owned trips.
2. **TB-FR-02 — Trip lifecycle:** A traveler can create, view, edit, archive, and resume a trip.
3. **TB-FR-03 — Trip facts:** The system persists dates, travelers, destinations, and ordered city stays.
4. **TB-FR-04 — Persistent workspace:** Each trip opens into one resumable planning workspace.
5. **TB-FR-05 — Durable conversation:** User and assistant messages persist in order with planning context.
6. **TB-FR-06 — Structured answers:** Precise answers can be captured with accessible structured controls.
7. **TB-FR-07 — Progressive discovery:** The planner asks focused questions only for relevant missing information.
8. **TB-FR-08 — Validated intent:** Natural-language input becomes schema-validated structured intent before mutation.
9. **TB-FR-09 — Topic readiness:** Recommendation readiness is evaluated independently by topic.
10. **TB-FR-10 — Proactive transition:** The planner offers recommendations as soon as the relevant topic is ready.
11. **TB-FR-11 — Trip preferences:** Explicit current-trip preferences are durable and editable.
12. **TB-FR-12 — User tendencies:** Long-term preferences can be learned gradually with inspectable confidence.
13. **TB-FR-13 — Preference precedence:** Explicit trip instructions always override learned tendencies.
14. **TB-FR-14 — Three-card batches:** Exactly three recommendation cards are presented per user-facing batch.
15. **TB-FR-15 — Recommendation evidence:** Cards show useful normalized details and preference-linked explanations.
16. **TB-FR-16 — Deterministic ranking:** Fixed inputs produce stable ranking and tie-breaking.
17. **TB-FR-17 — Selection:** A traveler can select a recommendation without losing prior accepted choices.
18. **TB-FR-18 — Rejection:** A traveler can reject a recommendation and record a reason.
19. **TB-FR-19 — Refinement:** A traveler can request alternatives or refine constraints conversationally.
20. **TB-FR-20 — Recommendation history:** Selected, rejected, and presented candidates remain auditable.
21. **TB-FR-21 — Live itinerary:** The visible itinerary updates after committed planning changes.
22. **TB-FR-22 — Version history:** Preference and itinerary changes are versioned and explainable.
23. **TB-FR-23 — Selected-item preservation:** Unplaceable selected items remain visible as unscheduled.
24. **TB-FR-24 — Deterministic scheduling:** Server-owned policies assign eligible items reproducibly.
25. **TB-FR-25 — Ticketed commitments:** Fixed-time bookings are preserved unless explicitly changed.
26. **TB-FR-26 — Flexible logistics:** Flexible travel and lodging constraints can be placed within valid windows.
27. **TB-FR-27 — Multi-city windows:** Activities and travel blocks respect ordered city presence.
28. **TB-FR-28 — Timezone correctness:** Scheduling and display use correct IANA local-time semantics.
29. **TB-FR-29 — Conflict detection:** Supported conflicts are derived, persisted or returned consistently, and explained.
30. **TB-FR-30 — Safe recovery:** Invalid successor plans never replace the last valid active itinerary.
31. **TB-FR-31 — Atomic planning turn:** One turn produces at most one committed authoritative planning revision.
32. **TB-FR-32 — Replay safety:** Repeating an operation ID returns its prior result without duplicate mutations.
33. **TB-FR-33 — Concurrency safety:** Stale or late work cannot overwrite newer planning state.
34. **TB-FR-34 — Provider boundary:** External places are normalized behind a mockable, failure-aware adapter.
35. **TB-FR-35 — Graceful degradation:** Core planning remains understandable when AI or providers are unavailable.

## 15. Implementation status

This specification intentionally makes no claim that every requirement exists. Consult [current implementation status](status/current-implementation.md), executable repository evidence, and [QA feature states](../qa/feature-states.json) before describing a capability as delivered.

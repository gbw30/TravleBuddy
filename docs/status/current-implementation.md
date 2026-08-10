# Current Implementation Status

Status: current-state
Authority: Human-readable summary of evidence-backed repository and deployment reality
Related: [Target requirements](../requirements.md), [architecture](../architecture/README.md), [roadmap](../roadmap.md), [QA feature states](../../qa/feature-states.json)
Last reviewed: 2026-08-09

Executable code, Prisma schema, migrations, and tests override this summary if they diverge. QA classification remains controlled by `qa/feature-states.json`.

## Capability matrix

| Area                           | State                      | Current evidence and boundary                                                                                                                                            |
| ------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Authentication and ownership   | Implemented / QA-required  | Auth routes, protected trip APIs, and owner-scoped service tests.                                                                                                        |
| Trip CRUD and preferences      | Implemented / QA-required  | Trip pages and APIs, `TripPreference`, destinations, travel segments, and preference forms.                                                                              |
| Reusable user defaults         | Implemented / QA-required  | `UserTravelPreference` stores latest-save defaults; it is not learned cross-trip behavior.                                                                               |
| Normal recommendations         | Implemented / QA-required  | Deterministic catalogue pipeline and feedback; the current workspace displays five recommendations.                                                                      |
| Itinerary drafts and conflicts | Implemented / QA-required  | Itinerary days/items, draft building, conflict derivation, logistics, and planning revisions.                                                                            |
| Adaptive commands              | Implemented / QA-candidate | Immediate versioned removal plus durable replacement, immutable feedback, narrow `TOO_EXPENSIVE` inference, targeted copy-on-write changes, and no-replacement handling. |
| Durable job processing         | Implemented / QA-candidate | PostgreSQL jobs, attempts/events, leases, heartbeats, retries, dead-lettering, stale-result protection, worker runtime, and persistent polling APIs.                     |
| Place provider boundary        | Implemented / QA-candidate | Mock and Google adapters serve adaptive replacement. The primary recommendation path still uses the deterministic catalogue.                                             |
| Conversation persistence       | Planned                    | No durable `Conversation` or `Message` model or conversational controller exists; `conversationId` remains null in current planning contracts.                           |
| Natural-language understanding | Limited current behavior   | The existing text box uses deterministic keyword extraction, not Gemini or another LLM.                                                                                  |
| Live activity scheduling       | Planned                    | City windows and a 30-minute grid foundation exist; exact activity scheduling does not.                                                                                  |
| Timezone handling              | Partial                    | Known locations store IANA identifiers, but scheduling and display remain UTC-anchored rather than production-grade local-time behavior.                                 |
| Long-term preference learning  | Planned                    | Only narrow adaptive price-sensitivity confidence exists; no general cross-trip learning system is implemented.                                                          |
| Performance hardening/cache    | Planned                    | Measurement and polling foundations exist; optional cache and broader production hardening remain evidence-gated.                                                        |
| Maps, booking, export          | Deferred                   | Not part of the current implemented portfolio slice.                                                                                                                     |

## Adaptive planning guarantees currently implemented

- Plain removal records processed feedback and atomically activates a successor without requiring a worker.
- Replacement feedback, job creation, initial event, planning revision, and replay result are transactional.
- Preference and itinerary snapshots are versioned; current projections remain available for ordinary reads.
- Both adaptive paths share batched copy-on-write persistence with database-generated identifiers.
- A replacement copies the active itinerary, changes only the affected day, validates it, and activates atomically.
- Explicit preference values are not replaced by inferred changes.
- Job claims use PostgreSQL locking and leases; retries and stale-state supersession are durable.
- Reloads can recover bounded job progress and version metadata.
- Provider mock mode supports deterministic tests and the QA demonstration.

## External and deployment state

- Protected QA migration certification succeeded for commit `e6e74c65fe3c2d5377eeeee1a67c90675d21ad60`.
- The standing topology is the existing `qa` and `main` branches, existing Neon QA/production databases, existing Vercel QA/production targets, and a local worker for the adaptive demonstration.
- Google Places implementation exists but live provider credentials and configuration are not required for the deterministic QA milestone.
- Final adaptive browser evidence and portfolio recording remain to be completed before conversational implementation begins.

## Evidence map

- Domain and persistence: `prisma/schema.prisma`, `prisma/migrations/`
- Adaptive policy: `src/features/adaptation/`
- Job queue and worker: `src/features/jobs/`, `src/worker/`
- Provider adapters: `src/lib/providers/places/`
- Planning APIs/UI: `src/app/api/trips/`, `src/components/recommendations/`
- Machine QA state: `qa/feature-states.json`
- Adaptive demonstration: `docs/demo/adaptive-planning-demo.md`
- Accepted decisions: `docs/architecture/adr-001` through `adr-005`

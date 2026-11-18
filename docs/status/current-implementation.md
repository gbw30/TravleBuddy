# Current Implementation Status

Status: current-state
Authority: Human-readable summary of evidence-backed repository and deployment reality
Related: [Target requirements](../requirements.md), [architecture](../architecture/README.md), [roadmap](../roadmap.md), [QA feature states](../../qa/feature-states.json)
Last reviewed: 2026-11-18

Executable code, Prisma schema, migrations, and tests override this summary if they diverge. QA classification remains controlled by `qa/feature-states.json`.

## Capability matrix

| Area                                                     | State                             | Current evidence and boundary                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Service borders                                          | Enforced for new code             | `service-map.json`, lint rules and an ownership test (ADR-010). 188 exceptions remain in older code, recorded in `eslint-suppressions.json`.                                                                                                                                                                        |
| New shell, Home and Create                               | Built, not yet through QA         | Keepsake design on real accounts: `/home`, `/trips/new`, `/trips/{id}`. Rename, archive, restore, delete, finish and reopen. Verified locally in a browser on wide and phone widths; not yet deployed or run through the QA gate.                                                                                   |
| Trip facts, tickets and fixed commitments                | Built, not yet through QA         | `src/features/trips` (`index.ts`), routes under `/api/v1` ([reference](../api/v1.md)), replay-safe and revision-checked. Tickets set dates and cities; clashes are reported, not resolved.                                                                                                                          |
| City lookup                                              | Built, live service not exercised | `src/features/places`: OpenStreetMap Nominatim with saved results, sample cities in mock mode. The adapter is tested against replies recorded from the live service; the app has not yet called the live service itself.                                                                                            |
| Authentication and ownership                             | Implemented / QA-required         | Auth routes, protected trip APIs, owner-scoped service tests. Another traveller's trip answers 404 on every `/api/v1` route (checked against the development database).                                                                                                                                             |
| Earlier planner: preferences, recommendations, itinerary | Implemented / QA-required         | The pages under `/trips/{id}/preferences`, `/planning` and `/itinerary`, the `/api/trips` routes, `TripPreference`, and travel segments. Still reachable from the trip page; replaced in Milestones 4 to 6. The old dashboard, trip list, new-trip form, settings and logistics screens were removed on 2026-11-18. |
| Reusable user defaults                                   | Implemented / QA-required         | `UserTravelPreference` stores latest-save defaults; it is not learned cross-trip behavior.                                                                                                                                                                                                                          |
| Normal recommendations                                   | Implemented / QA-required         | Deterministic catalogue pipeline and feedback; the current workspace displays five recommendations.                                                                                                                                                                                                                 |
| Itinerary drafts and conflicts                           | Implemented / QA-required         | Itinerary days/items, draft building, conflict derivation, logistics, and planning revisions.                                                                                                                                                                                                                       |
| Adaptive commands                                        | Implemented / QA-candidate        | Immediate versioned removal plus durable replacement, immutable feedback, narrow `TOO_EXPENSIVE` inference, targeted copy-on-write changes, and no-replacement handling.                                                                                                                                            |
| Durable job processing                                   | Implemented / QA-candidate        | PostgreSQL jobs, attempts/events, leases, heartbeats, retries, dead-lettering, stale-result protection, worker runtime, and persistent polling APIs.                                                                                                                                                                |
| Place provider boundary                                  | Implemented / QA-candidate        | Mock and Google adapters serve adaptive replacement. The primary recommendation path still uses the deterministic catalogue.                                                                                                                                                                                        |
| Conversation persistence                                 | Planned                           | No durable `Conversation` or `Message` model or conversational controller exists; `conversationId` remains null in current planning contracts.                                                                                                                                                                      |
| Natural-language understanding                           | Limited current behavior          | The existing text box uses deterministic keyword extraction, not Gemini or another LLM.                                                                                                                                                                                                                             |
| Live activity scheduling                                 | Planned                           | City windows and a 30-minute grid foundation exist; exact activity scheduling does not.                                                                                                                                                                                                                             |
| Timezone handling                                        | Partial                           | Known locations store IANA identifiers, but scheduling and display remain UTC-anchored rather than production-grade local-time behavior.                                                                                                                                                                            |
| Long-term preference learning                            | Planned                           | Only narrow adaptive price-sensitivity confidence exists; no general cross-trip learning system is implemented.                                                                                                                                                                                                     |
| Performance hardening/cache                              | Planned                           | Measurement and polling foundations exist; optional cache and broader production hardening remain evidence-gated.                                                                                                                                                                                                   |
| Maps, booking, export                                    | Deferred                          | Not part of the current implemented portfolio slice.                                                                                                                                                                                                                                                                |

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
- Primary and adaptive mock recommendations share stable place identities; a
  semantic fingerprint also excludes historical same-place aliases.
- `TOO_EXPENSIVE` replacement requires a strictly lower comparable cost or
  price tier. A missing cheaper candidate completes as an explicit successful
  no-change result and preserves the current itinerary.
- Recent terminal job outcomes and bounded candidate diagnostics reload with
  the planning snapshot instead of existing only in browser polling state.

## External and deployment state

- Protected QA migration certification succeeded for commit `e6e74c65fe3c2d5377eeeee1a67c90675d21ad60`.
- The standing topology is the existing `qa` and `main` branches, existing Neon QA/production databases, existing Vercel QA/production targets, and a local worker for the adaptive demonstration.
- Google Places implementation exists but live provider credentials and configuration are not required for the deterministic QA milestone.
- Final adaptive browser evidence and the portfolio recording were not completed. The [roadmap](../roadmap.md) of 2026-11-12 no longer gates on them.
- Milestones 2 and 3 of the [roadmap](../roadmap.md) were built on 2026-11-18. The migration `20261118090000_trip_facts_and_commitments` is applied to the development database only; QA and production do not have it yet.
- Local development uses one `.env` with the development database as the default ([Neon setup](../neon-env-setup.md)).
- The target product was redefined on 2026-11-12 ([PRD](../prd.md)). The capability matrix above still describes what is built; its "Planned" rows refer to the earlier target.

## Evidence map

- Domain and persistence: `prisma/schema.prisma`, `prisma/migrations/`
- Adaptive policy: `src/features/adaptation/`
- Job queue and worker: `src/features/jobs/`, `src/worker/`
- Provider adapters: `src/lib/providers/places/`
- Planning APIs/UI: `src/app/api/trips/`, `src/components/recommendations/`
- Machine QA state: `qa/feature-states.json`
- Adaptive demonstration: `docs/demo/adaptive-planning-demo.md`
- New-design screens: `src/app/(app)/`, `src/components/keepsake/`
- Trips service and its routes: `src/features/trips/index.ts`, `src/app/api/v1/`, `src/use-cases/`
- Service borders: `service-map.json`, `eslint.borders.mjs`, `prisma/service-ownership.test.ts`
- Accepted decisions: `docs/architecture/adr-001` through `adr-010`

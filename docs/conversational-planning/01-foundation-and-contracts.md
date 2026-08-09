# Stage 0 — Foundation and Contracts

Status: stage-plan
Authority: Implemented planning-contract foundation and remaining evidence boundary
Related: [Canonical target](../requirements.md), [current implementation](../status/current-implementation.md), [active roadmap](../roadmap.md), [architecture](../architecture/README.md)
Last reviewed: 2026-08-09

## Outcome

The repository has the required server-authoritative foundation for conversational planning:

- trip-owned planning revisions;
- UUID operation IDs and durable `PlanningMutation` replay records;
- stale-revision rejection and owner/archive gates;
- bounded planning snapshots instead of raw Prisma records;
- read-only snapshot/conflict reads separated from mutations;
- structured operation timings and sensitive-data-safe logging;
- versioned preferences and itineraries;
- durable adaptive jobs, stale-result protection, and resilient progress polling.

The protected QA migration workflow certified commit `e6e74c65fe3c2d5377eeeee1a67c90675d21ad60` against the existing isolated QA database. Migration application is no longer a pending Stage 0 implementation claim.

## Contracts that later stages must preserve

Every planning mutation must include authentication, owner scoping, an expected revision, and an operation ID. Validation occurs before state mutation. A successful operation advances the revision once and stores a bounded replay result; repeating the operation returns that result without duplicate effects.

Planning snapshots expose only UI-required fields, bounded active job summaries, and version metadata. Providers, AI, and Prisma record shapes do not become public DTO contracts.

## Remaining evidence

Stage 0 performance instrumentation exists, but conversational baseline and post-change measurements must be captured when a durable conversation turn exists. Do not copy obsolete test counts or treat a locally unreachable external service as missing application code.

The immediate gate is the adaptive portfolio evidence in the [active roadmap](../roadmap.md): complete the deterministic web-to-local-worker demonstration, replay proof, lease recovery test, stale-job supersession, and evidence recording before Stage 1A implementation begins.

## Verification expectations

- Revision success, stale failure, and replay collision tests.
- Owner, cross-user, and archived-trip route tests.
- Bounded DTO and log-redaction tests.
- Pure read checks and migration/schema invariants.
- Adaptive duplicate-delivery and stale-parent tests.
- Existing QA validation and exact-environment migration procedure.

## Exit criteria

This foundation remains complete while its contracts pass and the certified QA schema matches the deployment commit. The separate adaptive-evidence milestone must finish before conversational application work starts.

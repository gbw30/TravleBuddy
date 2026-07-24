# Stage 0 - Foundation and Contracts

Status: implementation complete; migration application, manual QA, and latency capture pending  
Depends on: completed Phase 9/9A migration and QA  
Estimated effort: 1-2 working days

## Goal

Create a verified baseline and stable planning contracts before chat persistence, AI, or provider code is introduced. This stage prevents performance regressions from being attributed to the wrong subsystem and prevents later stages from passing Prisma records directly into UI code.

## Architecture Decision

### Change the existing code immediately or establish contracts first

Options:

- Start building chat directly in the existing workspace. Fastest first commit, but it couples the new stream to redirect-based Server Actions and broad revalidation.
- Refactor the whole recommendation feature first. Cleaner in theory, but expands scope before product behavior is proven.
- Define narrow DTOs and measurements, then refactor only code touched by chat. Recommended.

Recommendation: preserve working services, introduce contracts around them, and defer internal refactors until a measured or testable need appears.

## Step-by-Step Implementation

### Step 1: Verify the Phase 9/9A baseline

Purpose: ensure current itinerary and logistics behavior is trustworthy before adding another stateful system.

1. Confirm the latest Prisma migration is applied to the development database.
2. Create or verify QA trips for flexible planning, ticketed planning, same-day transfer, budget overflow, and missing restaurant coverage.
3. Verify selections rebuild the itinerary and conflicts automatically.
4. Verify trip date choices remain based on settings, not ticket count.
5. Run lint, typecheck, tests, Prisma validation, and build.
6. Record unresolved defects in this document before Stage 1A begins.

### Step 2: Add planning performance measurements

Purpose: distinguish database, provider, AI, render, and invalidation latency.

Instrument these operations with a request or operation ID:

- initial planning snapshot query
- planning message persistence
- recommendation generation
- place select/reject/deselect
- itinerary rebuild
- conflict refresh

Record operation name, duration, trip ID, status, selected-place count, itinerary-day count, and error code. Do not log secrets, complete user messages, or raw preference profiles.

Initial performance targets:

- optimistic client interaction: under 100 ms
- database-local selection plus rebuild: p95 under 500 ms
- initial planning response: p95 under 1.5 seconds
- first conversational response data: p95 under 2 seconds where provider latency permits

### Step 3: Add revision semantics

Purpose: prevent conflicting writes from two tabs or delayed streamed actions.

Use `Trip.planningRevision` as the canonical revision for all planning state. Increment it exactly once after every successful top-level planning mutation. Every conversational request sends its last known revision and a stable operation ID.

Behavior:

- matching revision: execute mutation and return the next revision
- stale revision: return `409` with the latest compact snapshot
- retry with the same message ID: return the prior result without duplicate mutations

### Step 4: Define the shared DTOs

Purpose: keep UI and chat code independent from Prisma and provider records.

```ts
type PlanningContext = {
  topic: PlanningTopic;
  destinationId: string | null;
  planningDayNumber: number | null;
};

type PlanningReadiness = {
  activeTopic: PlanningTopic;
  isReady: boolean;
  missingQuestionKeys: string[];
};

type PlanningSnapshot = {
  revision: number;
  conversationId: string | null;
  context: PlanningContext;
  preference: RecommendationPreferenceSnapshot;
  readiness: PlanningReadiness;
  recommendations: RecommendationDto[];
  selectedPlaces: SelectedPlanningPlace[];
  itinerary: ItineraryDto;
};

type PlanningTurnResult<TMessage, TWarning> = {
  revision: number;
  messages: TMessage[];
  snapshot: PlanningSnapshot;
  warnings: TWarning[];
};
```

DTO rules:

- no raw provider data
- no internal feedback metadata
- ISO strings at route/UI boundaries
- decimal values serialized as numbers
- bounded recommendations and message history

### Step 5: Separate reads from mutations

Purpose: prepare for a fast streaming route without changing behavior yet.

1. Keep `getPlanningWorkspace` as the initial read entry point.
2. Extract a compact snapshot mapper reusable by the page and future chat route.
3. Keep existing feature services as mutation owners.
4. Do not make services call internal API routes.
5. Preserve broad `revalidatePath` and redirect behavior for legacy forms until Stage 3A.
6. Make itinerary, page, and snapshot reads side-effect free now; explicit rebuilds and conflict checks own conflict refresh persistence.

## Test Requirements

- Revision increments exactly once for each successful mutation.
- Failed and read-only operations do not increment the revision.
- Stale revision detection performs no writes.
- Snapshot mapping excludes raw and internal metadata.
- Existing recommendation and itinerary tests remain unchanged or receive only DTO-compatible updates.
- Baseline timing logs contain no sensitive values.

## Developer Actions

- Confirm development and QA databases are separate from production.
- Confirm Phase 9/9A migration state in both environments.
- Preserve before-change latency measurements for Stage 3 comparison.

## Exit Criteria

- Full verification passes.
- Current planning QA passes.
- Planning DTOs and revision behavior are tested.
- Baseline latency is recorded.
- No AI, Redis, or Google provider is required.

## Out of Scope

- Conversation tables and UI.
- AI intent extraction.
- Google Places.
- Automatic slot scheduling.
- Redis.

## Implementation Record - 2026-07-17

### Delivered

- Added migration `20260717090000_stage0_planning_revision` with `Trip.planningRevision` defaulting to `0` and the trip-scoped `PlanningMutation` replay ledger.
- Added optional `PlanningMutationControl`, compact planning snapshot/readiness/context contracts, nullable Stage 0 `conversationId`, and generic `PlanningTurnResult<TMessage, TWarning>`.
- Added one transaction finalizer for revision compare-and-swap, bounded 64 KiB versioned replay results, sequential replay, concurrent unique-key collision recovery, and stale snapshots.
- Wired one finalization through trip settings, preferences, logistics mode and segments, planning-note persistence, recommendation generation/add/select/reject/deselect/refresh, itinerary rebuild, conflict check, and conflict status updates.
- Kept nested rebuild and conflict refresh work transaction-local and correlated nested timing logs with one operation ID.
- Split persisted conflict loading from explicit conflict refresh so itinerary and planning workspace reads perform no conflict writes.
- Added structured JSON timing for the required operations without messages, preferences, provider payloads, secrets, or replay payloads.
- Repaired date-sensitive suites with a fixed 2026 clock without weakening production date validation.

### Automated QA Evidence

| Check                    | Result              | Evidence                                                                                                                            |
| ------------------------ | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| ESLint                   | Pass                | `npm.cmd run lint`, zero warnings                                                                                                   |
| TypeScript               | Pass                | `npm.cmd run typecheck`                                                                                                             |
| Tests                    | Pass                | 50 files, 213 tests                                                                                                                 |
| Prisma schema            | Pass                | `npm.cmd run prisma:validate`                                                                                                       |
| Prisma client generation | Pass                | Prisma Client 7.8.0 generated during build attempt                                                                                  |
| Production build         | Environment-blocked | Turbopack compilation cannot fetch 11 configured Geist/Geist Mono files from `fonts.gstatic.com`; no font configuration was changed |

Automated coverage includes revision success/failure behavior, sequential and collision replay, owner-gated replay, archived status checks, stale snapshots, bounded ledger payloads, schema/migration invariants, pure conflict reads, snapshot normalization and field exclusion, shared timing IDs, and sensitive-log exclusions.

### Migration Status

- The configured Neon datasource was reachable on 2026-07-17 and reported six migrations.
- `20260717090000_stage0_planning_revision` is pending on that datasource.
- The migration was not applied because the configured datasource was not independently identified as development or QA and was not confirmed distinct from production.
- QA database status remains unconfirmed.

### Manual QA and Baseline Latency

Manual QA for flexible planning, ticketed planning, same-day transfer, budget overflow, missing restaurant coverage, and select/reject/deselect rebuild behavior remains pending on migrated representative QA trips.

| Operation                 | Warm samples |     p50 |     p95 |     max |
| ------------------------- | -----------: | ------: | ------: | ------: |
| Initial planning snapshot |            0 | pending | pending | pending |
| Planning-note persistence |            0 | pending | pending | pending |
| Recommendation generation |            0 | pending | pending | pending |
| Select/reject/deselect    |            0 | pending | pending | pending |
| Itinerary rebuild         |            0 | pending | pending | pending |
| Conflict refresh          |            0 | pending | pending | pending |

At least 20 warm samples per operation, excluding the first cold run, are still required before the Stage 0 exit criteria can be marked complete.

## QA Remediation Record - 2026-07-23

### Delivered

- Bound public planning mutation retries to the mutation kind and a canonical SHA-256 fingerprint of validated input.
- Required `expectedRevision` and a UUID `operationId` on all public planning mutation routes. Invalid controls return `422`; stale revisions and conflicting operation-ID reuse return `409`.
- Added owner-gated replay/stale preflight while retaining the final compare-and-swap revision guard.
- Made travel pace/style part of planning readiness and normalized all free-text preference lists with trim plus case-insensitive deduplication.
- Added complete proposed-chain validation for travel-segment add, update, and delete operations.
- Made identical custom-place decisions and already-selected recommendations semantic no-ops without feedback, event, rebuild, or revision writes.
- Preserved pace-overflow selections as explicit unscheduled DTO items and added aggregate unscheduled and mixed-currency conflicts.
- Added explicit cost-completeness fields so mixed-currency totals cannot appear complete.
- Added protected QA migration automation, exact database/commit/migration identity checks, stricter QA report/evidence validation, Stage 0 evidence contracts, and explicit server-startup environment validation.

### Local Automated Evidence

| Check | Result |
| --- | --- |
| Vitest | Pass: 59 files, 288 tests |
| TypeScript | Pass |
| ESLint | Pass |
| Prisma schema | Pass |
| QA harness validation | Pass: 6 agents, 6 workflows, 28 scenarios |
| V8 coverage | Pass: 71% statements, 61.2% branches, 79.23% functions, 72.27% lines |
| Production build | Pass |
| QA environment doctor | Pass for the protected preview origin and configured QA database fingerprint |

The Neon `travlebuddy_qa` database was confirmed empty with no Prisma migration ledger before first deployment. Applying migrations, redeploying the exact QA commit, authenticated/manual QA, two-user ownership isolation, browser evidence, and the required warm latency samples remain pending. Stage 0 is not complete until those protected-environment checks pass.

## Fresh-Chat Handoff Prompt

```text
Implement Stage 0 from docs/conversational-planning/01-foundation-and-contracts.md. Read the master README and inspect the current recommendation, itinerary, conflict, and Prisma implementations first. Preserve existing behavior, add only the planning contracts, revision semantics, and non-sensitive performance measurements defined in the stage. Run every listed test and update the stage completion record.
```

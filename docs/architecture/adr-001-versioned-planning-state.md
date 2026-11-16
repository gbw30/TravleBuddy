# ADR-001: Version preference and itinerary state

Status: accepted  
Date: 2026-07-26

## Context

The original itinerary builder treated generated days and items as mutable
current state. Rebuilding by deletion made historical feedback difficult to
retain, prevented comparison between plans, and offered no safe activation point
for asynchronous work.

TravleBuddy also needs current, query-friendly preference fields while retaining
the exact profile used by each calculation.

## Decision

Use append-only planning versions with explicit active pointers:

- `PreferenceProfileVersion` stores a validated snapshot, delta, parent, and
  optional source feedback. `(tripId, version)` and `sourceFeedbackId` are
  unique.
- `ItineraryVersion` stores its parent, source preference version, source job,
  change scope, summary, status, and activation time. `(tripId, version)` and
  `sourceJobId` are unique.
- `Trip.activePreferenceProfileVersionId` and
  `Trip.activeItineraryVersionId` identify current state.
- `TripPreference` remains the query-friendly projection for existing
  workflows.
- Itinerary days belong to one itinerary version and are unique by
  `(itineraryVersionId, dayNumber)`. Conflicts may also be scoped to a version.
- A targeted update copies the current itinerary into a draft successor,
  changes only the target item, validates conflicts, then activates the
  successor. Only after that does the former active version become
  `SUPERSEDED`.
- Historical itinerary versions remain owner-readable through the versioned
  itinerary query.
- The migration backfills current preferences and existing itineraries as
  version `1` without deleting user-visible content or retargeting feedback.

`planningRevision` remains the client/API concurrency revision. `tripVersion`
represents planning-domain changes that invalidate background work.

## Consequences

Benefits:

- Failed drafts cannot remove the current itinerary.
- Feedback can retain its original historical item and version references.
- Preference and itinerary lineage is auditable and demonstrable.
- Source-event and source-job uniqueness support idempotent effects.
- Existing preference reads can migrate incrementally through the projection.

Costs and constraints:

- Copying a version increases row storage and write volume.
- Reads must intentionally select the active pointer or a requested historical
  version.
- Conflict generation must receive the intended itinerary version.
- Draft/failed-version retention and long-term compaction need a future policy.
- The migration must run only after isolated-database verification because it
  changes uniqueness and adds required version ownership to itinerary days.

## Alternatives considered

- **Update rows in place:** rejected because it loses history and makes safe
  asynchronous activation difficult.
- **Event sourcing every planning object:** deferred as unnecessary complexity
  for the portfolio slice.
- **Rename all existing preference/candidate models:** rejected to avoid a
  high-risk migration with little product value.

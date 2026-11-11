# ADR-007: Require distinct and demonstrably cheaper adaptive replacements

Status: accepted
Date: 2026-08-09

## Context

The deterministic recommendation catalogue and adaptive mock provider once
assigned different provider IDs to some places with the same visible name. An
ID-only exclusion could therefore activate a successor that looked identical
to the rejected activity. `TOO_EXPENSIVE` also increased price sensitivity but
did not make lower cost an eligibility requirement, so rating could still
select an equally expensive candidate.

A worker completing successfully means its durable processing contract
succeeded. It does not necessarily mean a replacement was available, so the
business outcome must remain separate from the technical job status.

## Decision

- The primary and adaptive mock paths use one canonical place catalogue and
  stable provider identity.
- Candidate exclusion uses stable IDs plus a normalized country, city,
  category, and name fingerprint. Historical duplicate rows remain immutable
  but cannot be selected as the same visible place.
- `TOO_EXPENSIVE` admits only a strictly lower same-currency estimated cost.
  When exact comparable costs are unavailable, a strictly lower price level is
  accepted. Unknown affordability is not treated as cheaper.
- Rating and deterministic tie-breakers order only eligible cheaper candidates.
- If persisted candidates exist but none are eligible, the provider boundary
  is queried before concluding that no replacement exists.
- No cheaper candidate is a successful `NO_REPLACEMENT` business outcome with
  reason `NO_CHEAPER_REPLACEMENT`; the current itinerary stays active and the
  supported preference update remains auditable.

## Consequences

Replacement results now carry bounded target, replacement, price-comparison,
candidate-count, outcome-reason, and activation data. The UI and structured
worker logs distinguish `REPLACED` from successful no-change outcomes. No
Prisma migration or historical-data cleanup is required.

The semantic fingerprint is deliberately conservative. A same-named place in
the same city and category is treated as the same candidate even if a provider
assigned another ID. Live-provider refinement can later add coordinates or
branch identity without weakening the current safeguard.

## Alternatives considered

- **Keep ID-only exclusion:** rejected because mock and provider records can
  contain aliases or legacy IDs.
- **Let rating compensate for cost:** rejected because it contradicts the
  meaning of `TOO_EXPENSIVE`.
- **Fail the job when no cheaper option exists:** rejected because the worker
  and validation completed correctly and preserved safe state.
- **Remove the activity automatically:** rejected because it changes the
  meaning of **Dislike & replace**.

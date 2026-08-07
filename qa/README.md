# TravleBuddy QA Operator Guide

TravleBuddy uses deterministic checks for reproducible failures and scoped Codex agents for evidence-backed exploration. Verification is report-only: defects are documented, not repaired.

## Sources of truth

- `feature-states.json` contains the active `required`, `candidate`, `planned`, and `deferred` states. `contracts/features.ts` adds feature metadata and enforces transitions.
- `scenarios/catalog.ts` owns scenario priority, environment, fixture, agent, tags, and invariants.
- `contracts/schemas.ts` owns context, worker report, finding, evidence, gate, and summary interfaces.
- `context/shared-policy.md` is the normative policy used by every QA agent.

Only required and candidate scenarios block a gate. Promote a candidate to required only with a passing report from the same commit.

## Prerequisites

Writable local/preview QA requires `QA_TARGET`, `QA_BASE_URL`, `QA_RUN_ID`, `QA_DATABASE_FINGERPRINT`, and `QA_ALLOW_WRITES=true`. Reuse the existing authorized QA database and prove that it is isolated from production; do not create a database for an individual run. Production uses `QA_TARGET=production-readonly` and `QA_ALLOW_WRITES=false`.

Set `QA_RUN_TYPE` to `pr`, `nightly`, `release`, or `production`. PR routing uses `QA_BASE_SHA`; if it is absent or cannot be diffed, the full team is selected. `QA_FORCE_AGENTS` can add diagnostic PR reviewers but cannot remove automatically selected roles or weaken full/release/production policy.

## Run lifecycle

1. Install dependencies and Playwright browsers for the intended matrix.
2. Run `npm run qa:gate`. It owns doctor, manifest validation, lint, typecheck, Vitest, coverage, Prisma validation, build, migration status, and critical Chromium E2E.
3. Run `npm run qa:context` to create bounded, role-specific bundles.
4. Run the selected agents in the waves documented in `docs/agent-system.md`.
5. Run `npm run qa:reports:validate` after workers finish.
6. Give the compact summary and indexed primary evidence to `qa_auditor`.
7. Clean successful run-owned data with `npm run qa:cleanup`. Failed fixtures remain available for up to 24 hours and expired fixtures can be cleaned with `npm run qa:cleanup -- --expired`.

Additional commands:

- `npm run qa:doctor`: validate target and write safety.
- `npm run qa:seed`: create exact run-owned fixtures.
- `npm run qa:e2e:critical`: Chromium P0 suite.
- `npm run qa:e2e:nightly`: desktop/mobile browser matrix.
- `npm run qa:e2e:production`: mutation-blocked production smoke.
- `npm run qa:stage -- <feature> <state> [--report path] [--apply]`: validate or apply a feature-state transition.

## Protected QA migrations

QA verification never applies migrations. Use only the manual `QA - Protected Migrations` workflow, protected by the `qa-migrations` GitHub environment. Configure environment secrets `QA_DATABASE_URL` and `QA_DIRECT_URL` for the existing authorized Neon QA database, plus `PRODUCTION_DATABASE_FINGERPRINT` as a deny-list guard. Do not create an additional database for a QA run.

Automatic development checks are limited to `CI` and the focused `QA - Pull
Request` workflow. `QA - Extended Manual`, `QA - Release`, `QA - Production
Read-only Smoke`, protected migrations, and every Codex audit are manual or
explicitly opt-in.

The authorized origin is `https://travle-buddy-git-qa-gbw30s-projects.vercel.app` and the credential-free QA fingerprint is `e6d10d0c10e8212e11f6c88d6e4747fd281edf273a592283bad6ae6a8f380586`. Dispatch with the full commit, its exact remote branch head, the current migration head `20260806070000_database_generated_uuid_defaults`, and this exact typed form:

```text
MIGRATE QA <database_fingerprint> TO <migration_head>
```

Preflight normalizes pooled/direct Neon hosts, proves both URLs name the same database, rejects configured production fingerprints, and permits a first deploy only for a database with no application tables and no Prisma ledger. The sole mutation is `prisma migrate deploy`. Postflight requires clean status, an empty database-to-schema diff, and a clean ledger receipt at the expected head. Sanitized artifacts are retained; failure stops without automatic rollback.

## Artifacts

All generated content is gitignored under `qa-results/<QA_RUN_ID>/`:

```text
context/run.json
context/agents/<agent>.json
deterministic/report.json
deterministic/*.log
agents/<agent>/report.json
agents/<agent>/report.md
summary/run-summary.json
summary/evidence-index.json
final/report.json
final/report.md
```

Full logs and browser media remain artifacts. Agent handoffs contain compact summaries and relative evidence paths. Token counters are nullable and must never be estimated when the runner does not expose authoritative usage.

`sourcePaths` cite reviewed repository or supplied-input files. `evidencePaths` contain only produced artifacts beneath the reporting worker's own output directory. Validation rejects timestamp inversion, run/agent/commit mismatch, incomplete assigned-scenario results, changed tracked-state fingerprints, source/evidence conflation, and evidence outside its owner.

Stage 0 evidence records exact commit/migration/fixture identity, operation and mutation fingerprints, request ordering, revisions, and durable ledger/state deltas. A performance budget is validated only with cold runs excluded, at least 20 warm samples, a named percentile method, p50/p95/max, query-count p95, payload-bytes p95, and provider latency separated.

## Verdicts and safety

`FAIL` means evidence proves a gate-failing defect or deterministic failure. `BLOCKED` means required verification could not run because of credentials, infrastructure, deployment, provider availability, or environment safety. `PASS` requires all applicable evidence and no failure condition.

Production automation never seeds, cleans, repairs, applies migrations, creates accounts/trips, triggers provider spend, or permits browser `POST`, `PUT`, `PATCH`, or `DELETE`. Missing prerequisites never weaken deterministic checks or become a pass.

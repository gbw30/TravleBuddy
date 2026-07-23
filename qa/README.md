# TravleBuddy QA Operator Guide

TravleBuddy uses deterministic checks for reproducible failures and scoped Codex agents for evidence-backed exploration. Verification is report-only: defects are documented, not repaired.

## Sources of truth

- `feature-states.json` contains the active `required`, `candidate`, `planned`, and `deferred` states. `contracts/features.ts` adds feature metadata and enforces transitions.
- `scenarios/catalog.ts` owns scenario priority, environment, fixture, agent, tags, and invariants.
- `contracts/schemas.ts` owns context, worker report, finding, evidence, gate, and summary interfaces.
- `context/shared-policy.md` is the normative policy used by every QA agent.

Only required and candidate scenarios block a gate. Promote a candidate to required only with a passing report from the same commit.

## Prerequisites

Writable local/preview QA requires `QA_TARGET`, `QA_BASE_URL`, `QA_RUN_ID`, `QA_DATABASE_FINGERPRINT`, and `QA_ALLOW_WRITES=true`. The database must be disposable and isolated from production. Production uses `QA_TARGET=production-readonly` and `QA_ALLOW_WRITES=false`.

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

## Verdicts and safety

`FAIL` means evidence proves a gate-failing defect or deterministic failure. `BLOCKED` means required verification could not run because of credentials, infrastructure, deployment, provider availability, or environment safety. `PASS` requires all applicable evidence and no failure condition.

Production automation never seeds, cleans, repairs, applies migrations, creates accounts/trips, triggers provider spend, or permits browser `POST`, `PUT`, `PATCH`, or `DELETE`. Missing prerequisites never weaken deterministic checks or become a pass.

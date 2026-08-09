# TravleBuddy CI/CD Guide

Status: operational
Authority: Existing GitHub/Vercel integration flow and workflow responsibilities
Related: [Operating constraints](operating-constraints.md), [QA guide](../qa/README.md), [developer finish guide](developer-finish-guide.md), [knowledge map](README.md)
Last reviewed: 2026-08-09

TravleBuddy uses one integration branch and one release branch:

```text
qa  ->  pull request to main  ->  main
```

Develop and integrate directly on the existing `qa` branch unless the developer explicitly requests another branch. Vercel reuses the existing QA preview target for `qa` and the existing production target for `main`. Do not create feature branches, parallel previews, extra Vercel projects, or deployment lanes as routine steps.

## Workflow map

| Workflow                  | Trigger                                        | Purpose                                                                                                                           |
| ------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`                  | Pull request to `main`, push to `main`         | Blocking Prisma validation/generation, lint, types, unit tests, and production build using non-secret placeholders.               |
| `qa-pr.yml`               | `qa` pull request to `main` or manual dispatch | Temporary PostgreSQL integration checks and critical Chromium journey; heavy agentic review remains opt-in by label/manual input. |
| `qa-migrations.yml`       | Manual dispatch                                | Protected exact-commit migration against the existing QA database after explicit authorization.                                   |
| `qa-nightly.yml`          | Manual dispatch                                | Extended QA when intentionally requested; not part of every edit loop.                                                            |
| `qa-release.yml`          | Manual dispatch                                | Release gate for an exact candidate.                                                                                              |
| `qa-production-smoke.yml` | Manual dispatch                                | Read-only production smoke verification.                                                                                          |

This split keeps ordinary development fast: local focused tests during edits, deterministic CI at promotion, database/browser checks where they add real coverage, and expensive agentic/release work only when requested.

## Normal development flow

1. Confirm `git branch --show-current` is `qa` and the worktree contains no unrelated changes.
2. Make the scoped change and run focused tests.
3. Run lint, type checking, Prisma validation when relevant, and the full tests/build in proportion to risk.
4. Commit and push `qa`; the existing Vercel QA target may redeploy that commit.
5. Verify the QA deployment Git SHA and runtime behavior.
6. Open or update the existing `qa` → `main` pull request when the milestone is ready.
7. Require the appropriate CI and PR QA checks before merging.
8. Run protected migration/release workflows only when the change or release procedure requires them.

## Secrets

Ordinary CI uses safe placeholders and must not need live cloud credentials. Store secrets only where execution needs them:

- local `.env` files for developer-only use (never committed);
- existing Vercel QA/production scopes for runtime values;
- existing protected GitHub environments for migrations, release QA, or read-only production checks.

Never bulk-copy production environment values into QA. Do not expose secrets with `NEXT_PUBLIC_`, logs, workflow output, screenshots, or artifacts. If a credential is committed, treat it as compromised and rotate it.

## Success signals

A workflow “ran successfully” only when the intended full SHA was checked, every required job is green, no job was silently skipped contrary to its trigger, artifacts/evidence belong to that SHA, and—in migration workflows—the fingerprint, migration head, failed-migration count, and schema diff satisfy the protected policy.

For report-only full/release QA, follow [the QA operator guide](../qa/README.md); a green deterministic workflow does not substitute for a required auditor verdict.

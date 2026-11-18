# TravleBuddy Operating Constraints

Status: standing developer decision  
Effective: 2026-08-04

TravleBuddy intentionally uses a small, fixed development and deployment
topology. Development speed should come from focused changes and proportionate
verification, not from creating more branches, databases, or preview
environments.

## Fixed topology

### Git and GitHub

- `main` is the stable and release branch.
- `qa` is the branch behind the QA preview and the protected QA workflows.
- Since 2026-11-18, by the developer's instruction, each roadmap milestone is
  built on a branch `milestone/<number>-<name>`, and each piece of it on a
  feature branch `feature/m<number>-<piece>` cut from the milestone branch.
  A finished feature branch is merged into its milestone branch without asking
  once lint, type check, tests and build pass.
- Feature branches exist for traceability: each is merged by a pull request
  with a merge commit, the pull request names the requirement IDs it covers,
  and its number is recorded in the milestone's plan. The existing `Verify`
  workflow runs on pull requests into `milestone/**` as well as `main`.
- A milestone branch is merged into `main` by pull request, together with the
  developer, when the milestone is done. `qa` is updated from a milestone
  branch only when the developer asks for the QA preview or the QA gate.
- Feature and milestone branches are not deployed: `vercel.json` turns
  automatic Vercel deployments off for them.
- Do not create any other branch (release, QA, or `codex/*`) or a worktree
  unless the developer explicitly requests one.
- Existing historical branches may remain. This policy does not authorize
  deleting them.
- Reuse the repository's existing workflows and GitHub environments. Do not
  create parallel CI/CD lanes by default.
- Keep automatic development checks lean: ordinary CI and focused PR database
  and browser verification may run automatically. Extended, release,
  production, migration, and Codex audits are manual or explicitly opt-in.

### Databases

- Reuse the currently configured QA database for writable QA, migrations, and
  integration evidence.
- Reuse the currently configured production database for production only.
- Never point writable QA at production.
- Do not create another Neon branch, database clone, disposable cloud
  database, or additional persistent database without explicit approval.
- The temporary PostgreSQL service already declared in `.github/workflows/qa-pr.yml`
  is part of the existing topology and may continue to run. Do not add another
  database service or environment.
- If the current QA database is unavailable or cannot be proven separate from
  production, stop and report the blocker. Do not create a replacement.

### Vercel

- Reuse the existing Vercel project.
- Reuse the existing QA preview target and production target.
- Updates may redeploy those existing targets from the current `qa` or `main`
  branch.
- Do not create another Vercel project, branch preview, preview environment,
  parallel domain, or temporary preview deployment topology without explicit
  approval.

### Adaptive-planning worker

- The active portfolio/QA topology is free-first: Vercel hosts the web/API,
  Neon PostgreSQL stores the durable queue, and the standalone worker runs on
  the developer machine only while a demonstration or controlled QA exercise
  is active.
- Existing GitHub Actions and their disposable PostgreSQL service provide
  recorded concurrency and lease-recovery evidence; do not add a scheduled or
  continuously running workflow for queue consumption.
- Do not provision Render, disguise the worker as a free HTTP service, or add a
  different cloud worker platform by default. `render.yaml` is a dormant,
  optional paid-hosting template.
- An always-on hosted worker is deferred until the developer explicitly accepts
  its operational cost. The deployed preview may therefore leave jobs pending
  whenever the local worker is offline; this is an intentional milestone
  limitation, not a production-readiness claim.

## Decision rule for Codex

Codex must treat this document and the matching rule in `AGENTS.md` as a
standing instruction in future chats. A normal request to implement, verify,
deploy, or accelerate work does not authorize additional infrastructure or
branches.

When a proposed step conflicts with this topology:

1. Prefer an approach that reuses the current branch, database, workflow, and
   deployment target.
2. If no safe reuse path exists, pause that step and explain the blocker.
3. Ask for explicit approval before creating any additional resource.

## Practical development flow

1. Make and verify changes on a feature branch, and merge it into the
   milestone branch.
2. When the milestone is done, open a pull request from the milestone branch
   into `main`; merge `qa` up to date first if the QA preview or gate is
   wanted.
3. Let the existing PR workflow use its already-configured temporary
   PostgreSQL service.
4. Run extended QA only when requested; it is not scheduled nightly.
5. Use the existing protected migration workflow with the existing authorized
   QA database.
6. Redeploy the existing QA Vercel target when environment-backed validation is
   needed.
7. Run `npm run worker:start` locally against the verified QA database for the
   adaptive-planning demonstration, then remove its session-only credentials.
8. Run release and production smoke workflows manually against exact commits.
9. Promote the verified code to `main` and the existing production target.

This policy can be changed only by a later explicit developer instruction.

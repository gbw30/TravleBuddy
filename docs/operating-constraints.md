# TravleBuddy Operating Constraints

Status: standing developer decision  
Effective: 2026-08-04

TravleBuddy intentionally uses a small, fixed development and deployment
topology. Development speed should come from focused changes and proportionate
verification, not from creating more branches, databases, or preview
environments.

## Fixed topology

### Git and GitHub

- `qa` is the active integration branch.
- `main` is the stable and release branch.
- Normal promotion is a pull request from `qa` to `main`.
- Do not create additional feature, release, QA, or `codex/*` branches or
  worktrees unless the developer explicitly requests one.
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

1. Make and verify active development changes on `qa`.
2. Push `qa` and use the existing PR path into `main`.
3. Let the existing PR workflow use its already-configured temporary
   PostgreSQL service.
4. Run extended QA only when requested; it is not scheduled nightly.
5. Use the existing protected migration workflow with the existing authorized
   QA database.
6. Redeploy the existing QA Vercel target when environment-backed validation is
   needed.
7. Run release and production smoke workflows manually against exact commits.
8. Promote the verified code to `main` and the existing production target.

This policy can be changed only by a later explicit developer instruction.

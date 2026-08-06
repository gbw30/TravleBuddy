# Developer Finish Guide

This guide contains the credentialed and environment-backed work that Codex did
not perform. Complete the sections in order. Do not deploy different commits to
the web and worker, and do not run a migration until the database fingerprint
has been proven isolated from production.

Current migration head:

```text
20260727090000_adaptive_planning_foundation
```

## Fixed topology for this guide

Follow [the standing operating constraints](./operating-constraints.md).
Specifically:

- Use the existing `qa` branch and promote it to the existing `main` branch.
- Use the existing authorized QA and production databases; do not create a new
  Neon branch, database, or clone.
- Use the existing Vercel project, QA preview target, and production target; do
  not create another preview or project.
- Existing CI's temporary PostgreSQL service may continue to run as currently
  configured.

If an existing resource is unavailable or unsafe, stop and request direction.
Do not create a replacement as an implicit workaround.

## 0. Freeze one release candidate

From the repository root:

```powershell
git status --short
git add --all
git commit -m "feat: add durable adaptive itinerary planning"
$ReleaseBranch = git branch --show-current
$ReleaseCommit = git rev-parse HEAD
$RemoteCommit = git ls-remote origin "refs/heads/$ReleaseBranch" |
  ForEach-Object { ($_ -split "`t")[0] }
$MigrationHead = (Get-ChildItem prisma/migrations -Directory |
  Sort-Object Name |
  Select-Object -Last 1).Name
$ReleaseCommit
$RemoteCommit
$MigrationHead
```

Push the branch if `$RemoteCommit` does not equal `$ReleaseCommit`, then repeat
the checks:

```powershell
git push origin $ReleaseBranch
```

Stop unless:

- The working tree is clean.
- `$ReleaseCommit` is a full 40-character SHA.
- `$RemoteCommit` equals `$ReleaseCommit`.
- `$MigrationHead` equals
  `20260727090000_adaptive_planning_foundation`.

Record these values in the release evidence template under `docs/demo/`.

## 1. Prepare and migrate the isolated QA database

1. Select the existing authorized PostgreSQL/Neon QA database. Confirm that it
   is not production and contains no production data. If it is unavailable or
   cannot be proven isolated, stop; do not create another database.
2. Obtain its pooled and direct URLs. Keep them in the protected local names
   `QA_DATABASE_URL` and `QA_DIRECT_URL`. For a local Prisma command, map those
   values into the runtime names `DATABASE_URL` and `DIRECT_URL`; the GitHub
   workflows perform the same mapping from environment secrets.
3. Set the QA safety variables locally without committing them:

   ```powershell
   $env:QA_TARGET = "preview"
   $env:QA_ALLOW_WRITES = "true"
   $env:QA_BASE_URL = "https://YOUR-QA-PREVIEW.example"
   $env:QA_RUN_ID = "migration-preflight-$ReleaseCommit"
   $env:DATABASE_URL = $env:QA_DATABASE_URL
   $env:DIRECT_URL = $env:QA_DIRECT_URL
   ```

4. Generate the credential-free fingerprint:

   ```powershell
   $QaFingerprint = npm run --silent qa:fingerprint
   $QaFingerprint
   ```

5. Compare `$QaFingerprint` with the separately recorded production
   fingerprint. Stop if they match or if the production fingerprint is
   unknown. Set:

   ```powershell
   $env:QA_DATABASE_FINGERPRINT = $QaFingerprint
   $env:QA_PRODUCTION_DATABASE_FINGERPRINT = "KNOWN_PRODUCTION_FINGERPRINT"
   ```

6. In GitHub, protect the `qa-migrations` environment with an approval rule.
   Add environment secrets `QA_DATABASE_URL`, `QA_DIRECT_URL`, and
   `PRODUCTION_DATABASE_FINGERPRINT`. The first two must identify the same QA
   database.
7. Open **Actions → QA - Protected Migrations → Run workflow**. Choose
   `$ReleaseBranch` for **Use workflow from** and enter:

   ```text
   commit_sha:          <ReleaseCommit>
   branch:              <ReleaseBranch>
   qa_origin:           <exact protected QA origin>
   database_fingerprint:<QaFingerprint>
   migration_head:      20260727090000_adaptive_planning_foundation
   confirmation:        MIGRATE QA <QaFingerprint> TO 20260727090000_adaptive_planning_foundation
   ```

   Equivalent GitHub CLI invocation:

   ```powershell
   gh workflow run qa-migrations.yml --ref $ReleaseBranch `
     -f commit_sha=$ReleaseCommit `
     -f branch=$ReleaseBranch `
     -f qa_origin=$env:QA_BASE_URL `
     -f database_fingerprint=$QaFingerprint `
     -f migration_head=20260727090000_adaptive_planning_foundation `
     -f "confirmation=MIGRATE QA $QaFingerprint TO 20260727090000_adaptive_planning_foundation"
   ```

8. Approve the protected environment only after reviewing all inputs.
9. Download the `qa-migration-*` artifact. Preserve:
   - Preflight JSON receipt.
   - Sanitized pre-deploy status.
   - Sanitized deploy log.
   - Postflight JSON receipt.
   - Clean post-deploy status.
   - Empty database-to-schema diff.

10. Stop on any failed step. Do not manually mark a migration applied and do not
    automatically roll back a partially applied migration.

The workflow is the sole authorized migration writer. QA agents and the worker
must never run migrations.

## 2. Configure Google Cloud Places

1. Open the Google Cloud project intended for TravleBuddy.
2. Confirm a billing account is attached, then enable **Places API (New)**.
   Google requires billing and authentication for Places requests. See
   [Google's Places setup guide](https://developers.google.com/maps/documentation/places/web-service/get-api-key).
3. Create a dedicated server API key; do not reuse a browser Maps key.
4. Under API restrictions, restrict the key to **Places API (New)**. Apply an
   application/IP restriction only if the chosen Vercel and Render plans provide
   known static egress IPs; do not use an HTTP-referrer restriction for this
   server-side key.
5. Configure a conservative quota and Cloud Billing budget alerts before the
   first live smoke. Places is usage-billed, and field masks affect billable
   operations; see [Places usage and
   billing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing).
6. Store the key in a password manager. Never paste it into source, logs,
   screenshots, job payloads, or committed environment files.
7. Add the key separately to Vercel and Render as
   `GOOGLE_PLACES_API_KEY`. Set `PLACE_PROVIDER_MODE=google` only in an
   environment where live calls and billing are intended.
8. Keep `PLACE_PROVIDER_MODE=mock` and `QA_PROVIDER_MODE=mock` for automated
   tests and normal QA. Run a live-provider smoke only as an explicitly
   authorized, quota-bounded release step.

## 3. Create the Render background worker

1. In Render, choose **New → Blueprint** and connect the repository/branch
   containing `$ReleaseCommit`.
2. Select the root `render.yaml`. Confirm it creates one service of type
   `worker`, with no public endpoint:

   ```text
   build: npm ci && npm run prisma:generate
   start: npm run worker:start
   instances: 1
   ```

3. Supply every `sync: false` secret during initial Blueprint creation:

   ```text
   DATABASE_URL=<pooled URL for the same database used by the web deployment>
   GOOGLE_PLACES_API_KEY=<server-only key, when google mode is enabled>
   ```

   Render intentionally prompts for `sync: false` values only during initial
   Blueprint creation; later secret additions must be made in the service
   Environment page. See the [Blueprint
   reference](https://render.com/docs/blueprint-spec) and [environment-variable
   guide](https://render.com/docs/configure-environment-variables).

4. Confirm:

   ```text
   NODE_ENV=production
   PLACE_PROVIDER_MODE=mock   # first QA deployment
   QA_PROVIDER_MODE=mock      # explicit visible QA authorization for mock data
   PLANNING_WORKER_ID=<optional stable label>
   ```

5. Do not add `npm run db:deploy`, `prisma migrate deploy`, seeding, or any
   pre-deploy migration command to worker startup.
6. Deploy and verify the Render service reports the exact `$ReleaseCommit`.
   Compare it with the Vercel deployment SHA before testing.
7. Inspect sanitized structured logs for `STARTED`, claim/recovery activity,
   `JOB_FINISHED`, and `STOPPED`. Never enable query logging with full payloads
   or database URLs.
8. Submit a mock feedback job and confirm:
   - A claim appears.
   - Heartbeats keep the 30-second lease current.
   - Progress events advance.
   - The job completes and the web UI reloads the new version.

9. For the concurrency demonstration only, temporarily scale the worker to two
   instances. Submit multiple isolated QA jobs, record claim distribution, and
   confirm no job is processed by both workers concurrently.
10. Scale back to one instance immediately after capturing evidence.

## 4. Configure and deploy Vercel

1. In the existing Vercel project, update the existing QA Preview and
   Production variable sets. Do not create another project, preview branch, or
   preview environment. At minimum, configure:

   ```text
   DATABASE_URL
   DIRECT_URL
   AUTH_SECRET
   AUTH_GOOGLE_ID
   AUTH_GOOGLE_SECRET
   PLACE_PROVIDER_MODE
   QA_PROVIDER_MODE         # mock only in Preview/QA, omit in Production
   GOOGLE_PLACES_API_KEY   # only when live Places is authorized
   ```

2. Preview must use the isolated migrated QA database. Production must use its
   production database. Never share Preview write credentials with Production.
   Vercel scopes variables by environment; see [Vercel environment
   variables](https://vercel.com/docs/environment-variables).
3. Leave `AUTH_URL` unset when Auth.js can infer the deployment host, or set it
   to the exact environment origin. If using
   `AUTH_REDIRECT_PROXY_URL`, configure the documented stable production auth
   route.
4. In Google OAuth, verify the exact authorized origins and callback URIs:

   ```text
   https://<preview-or-proxy-origin>/api/auth/callback/google
   https://<production-origin>/api/auth/callback/google
   ```

5. Redeploy the existing QA preview target from the full `$ReleaseCommit`; do
   not create a parallel preview target. Pin and record the exact Git SHA; see
   [deploying Git repositories](https://vercel.com/docs/git#creating-a-deployment-from-a-git-reference).
6. Confirm the deployment details show `$ReleaseCommit`, then run an OAuth smoke
   and an ownership-negative API smoke.
7. Confirm the Vercel and Render deployments use the same commit and database
   environment before submitting feedback.
8. Keep the preview deployed for release QA. Do not promote it to production
   yet.

## 5. Apply Figma styling without changing behavior

Figma work remains external. Apply designs only after the adaptive flow passes
in the unstyled semantic UI.

1. Restrict styling changes to presentational components. Keep the behavior
   container and polling logic in
   `src/components/recommendations/adaptive-itinerary-panel.tsx` stable, or
   extract presentation beneath it without changing its public props.
2. Preserve:
   - Native buttons, labels, select controls, and keyboard operation.
   - Visible focus states.
   - `aria-live` progress announcements.
   - Pending, retrying, failed, dead-lettered, superseded,
     no-replacement, and completed states.
   - Mobile and desktop layout.
   - Existing feedback/job/itinerary DTO contracts.
   - Existing fallback forms and server-rendered itinerary.

3. Do not move provider secrets or job execution into client components.
4. After styling, run:

   ```powershell
   npm run typecheck
   npm run lint
   npm run test
   npm run build
   npm run qa:e2e:critical
   ```

5. Capture an accessibility scan and keyboard-only walkthrough before accepting
   the design.

## 6. Run release QA on the exact preview commit

1. Export the safe QA environment:

   ```powershell
   $env:QA_TARGET = "preview"
   $env:QA_BASE_URL = "https://EXACT-PREVIEW-URL"
   $env:QA_RUN_ID = "release-$ReleaseCommit"
   $env:QA_ALLOW_WRITES = "true"
   $env:QA_DATABASE_FINGERPRINT = $QaFingerprint
   $env:QA_PROVIDER_MODE = "mock"
   $env:QA_RUN_TYPE = "release"
   $env:QA_ACTIVE_STAGE = "current"
   ```

2. Run deterministic verification and context generation:

   ```powershell
   $env:ADAPTATION_TEST_DATABASE_URL = $env:DIRECT_URL
   npm ci
   npm audit --omit=dev
   npx playwright install chromium firefox webkit
   npm run test -- src/features/jobs/postgres-store.integration.test.ts prisma/adaptive-planning-migration.integration.test.ts
   npm run qa:gate
   npm run qa:e2e:nightly
   npm run qa:context
   ```

   The manual release workflow reuses the existing `qa-preview` GitHub
   environment; do not create a separate `qa-release` environment.

   On 2026-08-06, the developer temporarily accepted and chose to track two
   upstream audit chains in the installed dependency graph: Prisma via
   `fast-uri`, and Next.js via optional `sharp`. `npm audit --omit=dev` reports
   no available fix for either chain. TravleBuddy does not use `next/image` or
   the Image Optimization API. Before production promotion, check for official
   patched Prisma and Next.js releases, update only through supported versions,
   rerun this entire section, and retain the audit output. Do not force
   unsupported transitive overrides.

3. From `qa-results/$env:QA_RUN_ID/context/agents/`, give each direct QA agent
   only its generated context bundle and `qa/context/shared-policy.md`.
4. Run the required direct-agent waves; agents are report-only and may not fix
   tracked code:

   ```text
   Wave 1: qa_baseline, qa_journeys, qa_constraints
   Wave 2: qa_security_concurrency, qa_resilience_production
   ```

5. Validate their reports:

   ```powershell
   npm run qa:reports:validate
   ```

6. Give the compact summary and indexed primary evidence to `qa_auditor`.
   Accept only `PASS`; `FAIL` requires a separate fix task and a new exact
   commit, migration/deployment review, and QA run. `BLOCKED` requires resolving
   the missing environment evidence, never weakening a gate.
7. Optionally dispatch **QA - Release** with:

   ```text
   commit_sha=<ReleaseCommit>
   preview_url=<exact preview URL>
   active_stage=current
   google_oauth_evidence=<durable evidence reference>
   run_codex_audit=false
   ```

8. Promote only the exact preview commit that received a passing auditor
   verdict. If any source, environment contract, or migration changes, begin
   again from section 0.

## 7. Package the portfolio evidence

Use `docs/demo/adaptive-planning-demo.md` and
`docs/demo/evidence-template.md`.

1. Capture desktop and mobile screenshots of:
   - Feedback reason selection.
   - Persisted job phases.
   - Preference delta and explanation.
   - Targeted day replacement.
   - Itinerary version history.
   - Retry/dead-letter/superseded states where demonstrated.

2. Record a 60-90 second video:
   - Submit `TOO_EXPENSIVE` feedback.
   - Show the worker processing it.
   - Show the targeted replacement and reload persistence.
   - Stop a worker and show lease recovery.
   - Mutate the trip during an older job and show supersession.

3. Record measured values only:

   ```text
   queue wait:       p50 / p95 / max
   execution time:   p50 / p95 / max
   recovery time:    observed lease expiry to new claim
   sample count:     at least 20 warm samples for percentile claims
   worker count:     1 and 2
   provider mode:    mock or explicitly authorized live
   exact commit:     <ReleaseCommit>
   ```

4. Do not infer throughput or reliability from one demo. Do not put a metric on
   a resume until its raw evidence, sample method, and exact commit are saved.
5. Resume bullets may accurately state the implemented mechanisms without
   metrics. Add measured improvements only after the evidence above exists.

## Completion checklist

The external handoff is complete only when:

- QA and production database identities are proven distinct.
- The protected migration receipt is clean at the exact migration head.
- Vercel and Render deploy the same passing commit.
- OAuth and Places configuration are restricted and secret.
- One-worker, two-worker, recovery, and stale-result demonstrations pass.
- Figma changes preserve behavior and accessibility.
- The release auditor returns `PASS`.
- Portfolio evidence names the exact commit and contains no invented metrics.

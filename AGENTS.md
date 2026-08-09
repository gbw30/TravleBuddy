<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

## Standing environment and branch constraint

The developer has chosen a fixed, minimal project topology. This is a standing
instruction for every Codex session working in this repository:

- Use the existing `qa` branch for active integration work and the existing
  `main` branch for stable/release work. Do not create another Git branch or
  worktree, including a `codex/*` branch, unless the developer explicitly asks
  for that specific branch.
- Reuse the currently configured QA and production databases. Do not create a
  Neon branch, database clone, disposable cloud database, or additional
  persistent database. The PostgreSQL service already defined inside the
  existing PR workflow is allowed; do not add another database topology.
- Reuse the existing Vercel project, its current QA preview target, and its
  current production target. Do not create another Vercel project, preview
  branch, preview environment, or parallel deployment topology. Redeploying the
  existing targets is allowed.
- Reuse existing GitHub environments and workflows. Prefer changing code and
  verification within the current topology over adding deployment lanes.
- Use the free-first adaptive-planning topology: the existing Vercel QA preview
  writes durable jobs to the existing Neon QA database, and the standalone
  worker runs locally for demonstrations. Do not provision Render or another
  always-on worker host unless the developer explicitly reverses this decision.
  Keep `render.yaml` only as an optional future paid-hosting template.
- Do not delete or consolidate existing branches, databases, or deployments
  without an explicit developer request. The constraint prevents additions; it
  does not authorize cleanup.
- If a requested task genuinely cannot proceed without increasing any of these
  resources, stop and request explicit approval. Do not infer approval from a
  request to develop, test, deploy, or accelerate the project.

The canonical explanation is `docs/operating-constraints.md`.

## TravleBuddy QA routing

“Stage-gate QA”, “full QA”, and “release QA” invoke the report-only QA system. Read `qa/context/shared-policy.md` and the generated bundle under `qa-results/<QA_RUN_ID>/context/agents/` before delegating. The operator guide is `qa/README.md`; architecture and context decisions are under `qa/docs/`.

The coordinator must run `npm run qa:gate` before agentic review, then `npm run qa:context`. Never start state-changing checks unless the environment doctor verifies an isolated local or preview database. Production is always read-only. QA agents may create only gitignored evidence and run-owned QA fixtures; they must not edit tracked files or repair defects.

Use direct children only. `.codex/config.toml` permits the root plus three workers and prevents child delegation.

- PR: run `qa_baseline`, the specialists selected by the context manifest, then `qa_auditor`.
- Stage, full, nightly, or release: wave 1 is `qa_baseline`, `qa_journeys`, and `qa_constraints`; wave 2 is `qa_security_concurrency` and `qa_resilience_production`; wave 3 is `qa_auditor`.
- Production: run read-only `qa_security_concurrency` and `qa_resilience_production`, then `qa_auditor`.

Give each worker only its generated context bundle. Continue independent work when one role is blocked. Before the auditor, run `npm run qa:reports:validate`; the auditor reads the compact summary first and opens only the primary evidence identified by policy. Return `PASS`, `FAIL`, or `BLOCKED` with report paths. Fixes require a separate explicit task.

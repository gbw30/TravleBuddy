<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## TravleBuddy QA routing

“Stage-gate QA”, “full QA”, and “release QA” invoke the report-only QA system. Read `qa/context/shared-policy.md` and the generated bundle under `qa-results/<QA_RUN_ID>/context/agents/` before delegating. The operator guide is `qa/README.md`; architecture and context decisions are under `qa/docs/`.

The coordinator must run `npm run qa:gate` before agentic review, then `npm run qa:context`. Never start state-changing checks unless the environment doctor verifies an isolated local or preview database. Production is always read-only. QA agents may create only gitignored evidence and run-owned QA fixtures; they must not edit tracked files or repair defects.

Use direct children only. `.codex/config.toml` permits the root plus three workers and prevents child delegation.

- PR: run `qa_baseline`, the specialists selected by the context manifest, then `qa_auditor`.
- Stage, full, nightly, or release: wave 1 is `qa_baseline`, `qa_journeys`, and `qa_constraints`; wave 2 is `qa_security_concurrency` and `qa_resilience_production`; wave 3 is `qa_auditor`.
- Production: run read-only `qa_security_concurrency` and `qa_resilience_production`, then `qa_auditor`.

Give each worker only its generated context bundle. Continue independent work when one role is blocked. Before the auditor, run `npm run qa:reports:validate`; the auditor reads the compact summary first and opens only the primary evidence identified by policy. Return `PASS`, `FAIL`, or `BLOCKED` with report paths. Fixes require a separate explicit task.

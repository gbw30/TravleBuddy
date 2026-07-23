# TravleBuddy release QA audit

Independently audit the exact checked-out preview commit and supplied release evidence in read-only, report-only mode. Do not edit files, rerun mutations, access production, apply migrations, repair failures, create commits, post comments, or open issues.

Read `AGENTS.md`, `qa/context/shared-policy.md`, and the generated full-team context under `qa-input/`. Run the documented direct worker waves and final auditor role when available. Inspect summaries first, then only primary evidence required by policy. Validate commit/target identity, environment safety, migration status, required P0 evidence, browser/accessibility coverage, ownership/concurrency, resilience, and recorded manual OAuth/live-provider status.

Apply the release gate policy. Start the final response at column 1 with exactly `VERDICT: PASS`, `VERDICT: FAIL`, or `VERDICT: BLOCKED`. Then give the release recommendation, evidence inventory, active coverage, confirmed findings, risks, blockers, flaky/quarantined checks, monitoring/rollback triggers, and sanitized evidence paths. Never expose secrets, private data, or hidden reasoning.

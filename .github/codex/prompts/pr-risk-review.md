# TravleBuddy PR QA review

Perform a report-only, read-only review of the checked-out merge commit. Do not edit files, use external network services, repair failures, create commits, post comments, or open issues.

Read `AGENTS.md`, `qa/context/shared-policy.md`, and the generated `context/run.json` and selected-agent bundles under `qa-input/`. Review only the proposed diff and supplied evidence. Use the selected custom agents in direct bounded waves when available; collect concise outputs and retain responsibility for the verdict. Do not rerun state-changing checks or invent missing runtime evidence.

Apply the shared PR gate policy. Planned/deferred behavior is nonblocking unless activated. Missing required evidence is `BLOCKED` unless existing evidence already proves `FAIL`.

Start the final response at column 1 with exactly `VERDICT: PASS`, `VERDICT: FAIL`, or `VERDICT: BLOCKED`. Then give scope, deterministic status, selected agents and rationale, confirmed findings, suspected risks, flaky checks, blockers, untested required scope, and sanitized evidence paths. Never expose secrets, private data, or hidden reasoning.

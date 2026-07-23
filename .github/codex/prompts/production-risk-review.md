# TravleBuddy production read-only audit

Audit only the checked-out production commit and supplied smoke evidence. Do not browse the live application, make network requests, edit files, run mutations, seed/clean data, trigger providers, repair failures, create commits, post comments, or open issues.

Read `AGENTS.md`, `qa/context/shared-policy.md`, and the generated production context under `qa-input/`. Use only the security/concurrency and resilience/production roles, then audit their concise results. Inspect code statically for authorization gaps, mutation paths reachable from read surfaces, unsafe environment fallbacks, exposed secrets, cache isolation errors, sensitive logging, and risks supported by smoke evidence.

Only confirmed applicable defects can produce `FAIL`; missing required smoke evidence is `BLOCKED`; hypotheses remain nonblocking risks. Start the final response at column 1 with exactly `VERDICT: PASS`, `VERDICT: FAIL`, or `VERDICT: BLOCKED`. Then give evidence inventory, confirmed defects, suspected risks, blockers, monitoring/rollback triggers, and sanitized evidence paths. Never expose production data, secrets, or hidden reasoning.

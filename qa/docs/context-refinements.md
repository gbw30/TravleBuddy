# QA Context and Harness Refinements

This document records the applied context, token, and harness changes so future maintenance preserves their intent.

## Implemented refinements

| Before | After | Reason |
|---|---|---|
| Repeated safety/report text in every agent | One shared policy plus short role prompts | Reduces duplicated context and policy drift. |
| Full agent team on every PR | Deterministic checks plus conservative path routing | Saves agent tokens while unknown/high-risk changes safely expand to all roles. |
| Baseline agent reran deterministic suites | `qa:gate` runs once; baseline audits its report | Avoids duplicate compute, output, and contradictory runs. |
| Full command output printed and handed off | Sanitized logs on disk with concise status and bounded failure tails | Preserves evidence without consuming agent context. |
| Auditor opened broad evidence | Summary-first evidence escalation | Focuses high reasoning on failures, security/production risks, and P0 samples. |
| Journey agent used high reasoning | Journey agent uses medium; adversarial/audit roles remain high | Matches reasoning cost to task complexity. |
| Agent files pinned workspace-write | Model and sandbox inherit from the coordinator | Local and read-only CI use the same definitions safely. |
| Async QA CLIs used CommonJS-incompatible top-level `await` | Explicit async `main()` entrypoints | Keeps the existing Next.js module configuration and makes scripts executable. |
| Feature-state documentation named the wrong source | `feature-states.json` is documented as state authority | Aligns operator guidance with code. |

The harness also enforces an 8 KiB root `AGENTS.md`, 2.5 KiB role-instruction limit, 32 KiB per-agent context limit, and 4 KiB console failure excerpt. Limits fail visibly instead of truncating requirements or findings.

## Context contract

Bundles contain metadata, selected-agent rationale, assigned scenario snapshots, relevant feature states, source/document/test paths, evidence inputs, exclusions, and effective output mode. They do not embed source files, complete planning packs, logs, screenshots, traces, or videos.

Worker summaries preserve finding and scenario IDs without imposing an arbitrary finding cap. Full reports remain available by path. Token usage is recorded only when authoritative runner counters exist; wall time, artifact bytes, scenarios, duplicates, and unique confirmed findings provide stable operational metrics otherwise.

## Concepts deliberately not added

- Repository-controlled prompt caching: Codex/API caching is platform-managed and this repository has no reliable cache-control interface.
- Vector search, RAG, or a custom MCP context graph: the current repository is small enough for deterministic path routing and targeted file search; extra retrieval infrastructure would add maintenance without demonstrated quality gain.
- Recursive agents: QA domains are parallel but bounded, while recursive fan-out increases cost and makes evidence ownership less predictable.
- Model pinning: agents inherit the active parent model for compatibility; only reasoning effort is role-specific.
- Hard token budgets based on estimates: unavailable counters are left null rather than fabricated.
- Finding truncation: reports deduplicate by root cause but retain every confirmed issue and affected scenario.
- Hidden interruption suppression: interruption messages remain enabled so task steering and cancellations stay visible.

Reconsider an excluded concept only after representative TravleBuddy QA runs show a measurable retrieval, cost, latency, or reliability problem that the existing harness cannot address.

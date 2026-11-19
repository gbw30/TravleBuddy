# TravleBuddy Knowledge Base

Status: operational
Authority: Documentation navigation, precedence, and retrieval rules
Related: [Product vision](product-vision.md), [PRD](prd.md), [target requirements](requirements.md), [current implementation](status/current-implementation.md), [active roadmap](roadmap.md)
Last reviewed: 2026-11-12

TravleBuddy documentation separates three kinds of truth that must not be mixed:

1. **Target product** — [product-vision.md](product-vision.md) says why, [prd.md](prd.md) describes the behaviour in detail, and [requirements.md](requirements.md) lists the numbered requirements. Where they disagree, requirements win, then the PRD, then the vision.
2. **Current implementation** — code, schema, migrations, and tests are executable truth; [current-implementation.md](status/current-implementation.md) summarizes that evidence.
3. **Delivery plan** — [roadmap.md](roadmap.md) orders the work from the current implementation toward the target.

## Precedence

When documents disagree, use this order:

1. `AGENTS.md` for agent operation and safety.
2. This knowledge map for documentation routing.
3. [Canonical product requirements](requirements.md), then the [PRD](prd.md), then the [product vision](product-vision.md), for target behavior.
4. [Architecture overview](architecture/README.md) and accepted ADRs for system boundaries and decisions; [service borders](architecture/service-borders.md) for the working rules; [HTTP API version 1](api/v1.md) for the routes.
5. Code, Prisma schema, migrations, and tests for implemented behavior.
6. [Current implementation status](status/current-implementation.md) as the maintained human summary.
7. [Active roadmap](roadmap.md) for milestone order.
8. [Conversational planning stages](conversational-planning/README.md) as engineering reference only; the roadmap of 2026-11-12 replaced their delivery order.
9. [QA documentation](../qa/README.md) for verification behavior.
10. [History](history/README.md) only for implementation rationale and evidence from earlier periods.

Operational constraints in `AGENTS.md` and [operating-constraints.md](operating-constraints.md) remain binding even when a product or stage document describes infrastructure that is not authorized.

## Status vocabulary

| Status             | Meaning                                                              |
| ------------------ | -------------------------------------------------------------------- |
| `canonical-target` | Controls intended final product behavior, not implementation claims. |
| `architecture`     | Controls system boundaries or records an accepted decision.          |
| `current-state`    | Summarizes evidence-backed repository and deployment reality.        |
| `active-roadmap`   | Controls milestone order.                                            |
| `stage-plan`       | Defines scoped implementation intent and exit criteria.              |
| `operational`      | Controls setup, deployment, QA, or agent procedure.                  |
| `historical`       | Preserved context that cannot override active sources.               |

## Retrieval recipes

| Task                      | Read in this order                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| Product feature           | Vision → PRD → target requirements → current status → relevant code/tests                       |
| Architecture change       | Target requirements → architecture index → relevant ADR → current code                          |
| Conversational planning   | Target requirements → current status → conversational README → active stage                     |
| Recommendations/providers | Target recommendation requirements → Stages 1B/2B → provider and recommendation code → QA state |
| Scheduling/timezones      | Target logistics/time requirements → current limitations → Stage 2A → itinerary/logistics code  |
| Adaptive planning/jobs    | Current status → ADRs 001–004 → demo guide → jobs/adaptation code                               |
| Full or release QA        | `qa/README.md` → generated run context → shared policy                                          |
| Infrastructure/deployment | Operating constraints → developer finish/setup guide                                            |

Never infer implementation from a target requirement, permanent scope from a staged limitation, or current authority from a historical document. Inspect executable evidence before asserting current behavior.

## Main indexes

- [Product vision](product-vision.md), [PRD](prd.md) and [visual direction mockup](design/planning-screen-mockup.html)
- [Prototype review guide](design/prototype-review.md)
- [Architecture and ADRs](architecture/README.md)
- [Conversational implementation pack](conversational-planning/README.md)
- [Adaptive demonstration](demo/adaptive-planning-demo.md)
- [Requirements and their evidence](quality/requirements-evidence.md): each requirement of sections 2 to 13, met or partly met, with what it rests on
- [The four sample travellers](quality/sample-travellers.md): the itineraries and checks of PRD 18, written by `npm run quality:samples`
- [Design checks on the real screens](quality/design-checks.md): keyboard, phone width, contrast, motion and screen-reader text in each browser, written by `npm run quality:design`
- [Developer finish guide](developer-finish-guide.md)
- [Repository structure](folder-structure.md)
- [Historical archive](history/README.md)

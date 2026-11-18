# Places, Cards and the Live Itinerary (Milestone 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A traveller can build a trip slot by slot from three ranked cards of real places, see it in a live itinerary that obeys the scheduling rules, and move, swap, shelve, remove and undo, without the agent conversation.

**Architecture:** Places gains an OpenStreetMap source behind a common adapter and saves what it fetches. Itinerary gains slots, the scheduling rules and plan versions stored as validated documents. Recommendations gains eligibility, ranking and reasons from fixed rules. The approved workspace screen is fed by the server through `/api/v1`, one replay-safe action at a time.

**Tech Stack:** Next.js 16.2 App Router, React 19, Prisma 7 on PostgreSQL (Neon), Zod 4, Vitest, Playwright, Tailwind CSS 4.

**Spec:** [PRD](../../prd.md) sections 6, 7.5, 8, 9, 10, 13, 14; [requirements](../../requirements.md) TB-CRD, TB-ITN (except the agent's offer in TB-ITN-14), TB-FIX-03, TB-FIX-04, TB-TRU-01, 02, 04 to 06, TB-SYS-08, 09, 12, 14 and the place-data half of TB-SYS-11; [roadmap](../../roadmap.md) Milestone 4; [ADR-001](../../architecture/adr-001-versioned-planning-state.md), [ADR-008](../../architecture/adr-008-modular-services-in-one-deployment.md), [ADR-009](../../architecture/adr-009-place-data-provider.md), [ADR-010](../../architecture/adr-010-service-borders-by-shrinking-exceptions.md).

## How this milestone is traced

The branch is `milestone/4-places-cards-itinerary`. Each piece below is built on its own feature branch and merged by a pull request into the milestone branch. The pull request names the requirement IDs it covers and gives its check results. When it merges, its number is written into the table below, so a requirement can be followed to its piece, its pull request and its commits.

| Piece                                   | Branch                              | Requirements                                                                                        | Pull request |
| --------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------- | ------------ |
| 0. Plan and branch workflow             | `feature/m4-plan`                   | none (process)                                                                                      | #12          |
| 1. Place rules                          | `feature/m4-place-rules`            | TB-ITN-05, TB-ITN-06, TB-ITN-20, TB-TRU-05                                                          | #13          |
| 2. Place source and saved places        | `feature/m4-place-source`           | TB-SYS-09, TB-SYS-11 (place data), TB-SYS-12, TB-TRU-01, TB-TRU-02, TB-TRU-06, TB-CRD-10, TB-CRD-11 | #14          |
| 3. Slots and scheduling rules           | `feature/m4-scheduling`             | TB-ITN-04 to 08, TB-ITN-16 to 20, TB-FIX-03, TB-FIX-04                                              | #15          |
| 4. Plan versions and actions            | `feature/m4-plan-actions`           | TB-ITN-09 to 15, TB-CRD-05, TB-CRD-06, TB-SYS-08, TB-SYS-14                                         | #16          |
| 5. Cards: eligibility, ranking, reasons | `feature/m4-cards`                  | TB-CRD-01, TB-CRD-07 to 09, TB-CRD-12, TB-TRU-04                                                    |              |
| 6. The workspace screen                 | `feature/m4-workspace`              | TB-CRD-02 to 04, TB-ITN-01 to 03, TB-ITN-09                                                         |              |
| 7. Retire the earlier planner           | `feature/m4-retire-earlier-planner` | none (removal); border exceptions fall                                                              |              |
| 8. Evidence                             | `feature/m4-evidence`               | all of the above, re-checked                                                                        |              |

## Global Constraints

- Service borders: import a service only through `index.ts` or `contracts.ts`; query only tables the service owns; never add to `eslint-suppressions.json` ([service-borders.md](../../architecture/service-borders.md)).
- Every change to a plan goes through a route under `/api/v1` with `operationId` and `expectedRevision`, through `src/use-cases/trip-action.ts` ([API reference](../../api/v1.md)). It commits completely or not at all.
- No traveller-facing action depends on the worker. Long work is split into steps that each finish within one request, are saved, and can be resumed (TB-SYS-08).
- Place facts come only from data. A missing fact is shown as unknown; an estimate is labelled as one (TB-TRU-02, TB-TRU-05).
- Eligibility, ranking and scheduling are fixed rules. The same trip state and request give the same result: no randomness, no clock inside a rule, ties broken by place id (TB-TRU-04, TB-ITN-17).
- OpenStreetMap services: identify the application; never two requests at once; wait 30 seconds after HTTP 429 or 406; save every result; credit OpenStreetMap contributors on every screen that shows place data (ADR-009).
- Dates and times are wall-clock values at the place (`YYYY-MM-DD`, `HH:MM`).
- Migrations are written with `prisma migrate diff` and applied with `prisma migrate deploy`. An applied migration is never edited.
- Tests and QA run with `PLACE_PROVIDER_MODE=mock`.

## Decisions made by the builder

Not stated in the PRD. Each is open to change.

1. **A plan version is one validated document.** `plan_versions` holds the whole plan (entries, shelf, flags) as JSON checked by a Zod schema on every read and write, with a parent pointer and `trips.active_plan_version_id`. Undo activates the parent. This keeps ADR-001's append-only versions and active pointer, and replaces its row-by-row copying, which is what made the earlier code large. A short ADR records it when piece 4 lands.
2. **Slots come from pace.** A day has morning, lunch, afternoon and dinner slots; packed adds a second morning and afternoon sight, balanced a second afternoon sight. Start times are worked out from the previous item, the travel time and the pace buffer, inside the default day of PRD 9.4.
3. **Kinds of place** are a short list of our own (sight, museum, shrine or temple, park, viewpoint, market, restaurant, cafe, bar, activity), mapped from OpenStreetMap tags. Each has a standard visit length.
4. **Opening hours** are read by a small parser for the common forms (`Mo-Fr 09:00-17:00; Sa 10:00-14:00`, `24/7`, `off`). Anything it cannot read is unknown and flagged, never guessed. No dependency is added: the full grammar is large and its library is LGPL.
5. **Travel time** is the straight-line distance times a detour factor, at a speed per means of travel, labelled as an estimate (ADR-009).
6. **Ranking without ratings** uses distance from the previous stop, fit of kind to slot, known opening hours, and variety against what is already in the plan. Preferences join in Milestone 6.
7. **Gathering a city's places** is one request per group of kinds, shown as progress and resumable, because one query can take several seconds.
8. **Pictures** are the postcard back until the Wikimedia Commons lookup exists. It is not in this milestone unless time allows.
9. **The place-data cap** counts requests to OpenStreetMap services per day. At the cap, proposals use saved and sample places and say so.
10. **The earlier planner goes last** (piece 7): its pages, the `/api/trips` routes, the old recommendation, itinerary and ticket-timing code and their tables, with the QA catalogue updated in the same piece. Dropping tables needs the developer's approval before production.

## Review Focus

1. A place with unknown opening hours is offered with a flag, and one known to be closed for the slot is never offered.
2. A traveller's move that breaks a rule is saved with a flag; a move onto a booked item is refused; nothing else in the plan changes.
3. The same plan and the same request give the same three cards, on every run.
4. The provider failing or the cap being reached leaves the plan untouched and says so; nothing made-up is shown.
5. Undo after any action returns exactly the previous plan, including the shelf.

## Pieces

Each piece gets its own task list in its pull request. What is fixed here is what each one produces.

### Piece 1: Place rules (pure)

**Produces, in `src/features/places/`:** `PLACE_KINDS` and `kindFromOsmTags(tags)`; `visitMinutes(kind)`; `parseOpeningHours(text)` and `isOpenFor(hours, date, start, minutes)` returning `"open" | "closed" | "unknown"`; `travelEstimate(from, to, means)` returning minutes and the word "estimate".

- [x] Tests first, including: hours past midnight, a day marked `off`, text the parser cannot read, a place with no hours.
- [x] Implement; export through `contracts.ts` what the browser needs.

### Piece 2: Place source and saved places

**Produced (pull request 14):** tables `places`, `place_fetches` and `provider_calls` (Places); `PlaceSource` with OpenStreetMap and sample implementations chosen by configuration; `gatherSights(city)` and `gatherFoodNear(city, point)`, one provider request each; `listSights`, `listFoodNear`, `getPlaces`; `findPlacesByName(city, text)`; `addOwnPlace(userId, city, input)`; the daily request count and cap.

Not done: Google is not behind this adapter. Its terms forbid saving the names and addresses a plan needs (ADR-009), so TB-SYS-09 is met for two of its three providers. The same migration also creates `plans`, `plan_versions` and `card_events` for pieces 4 and 5.

### Piece 3: Slots and scheduling rules (pure)

**Produced (pull request 15), in `src/features/itinerary/`:** `contracts.ts` with `PlanState` (the traveller's choices) and `PlanView` (the laid-out plan); `buildPlanView(state, context)`, which lays out days, slots by pace, fixed commitments, assumed transfers, time to wander, start times and travel, and flags each broken rule of PRD 9.3; `provisionalStart(facts, today)`; `kindSuitsSlot(kind, slot)`.

How the rules are met: a plan stores only choices and is laid out afresh each time, so it is repeatable. Start times are worked out from the previous item, the estimated travel and the pace buffer, so items cannot overlap each other; a visit that runs into something fixed is flagged. Commitments are placed first and nothing moves them. A commitment with no time takes its slot without looking at the traveller's picks, so it always lands in the same place; a pick it displaces goes to the shelf with the reason.

### Piece 4: Plan versions and actions

**Produced (pull request 16):** `plan-store.ts` (versions in `plan_versions`, the pointer in `plans`, undo, `copyPlan`); `plan-actions.ts` (`applyPlanAction` for pick, save, unshelve, move, remove, visit length, pace and transfer time, and `settle`); `src/use-cases/plan.ts` (`loadPlan`, `runPlanAction` through the replay ledger); `GET` and `POST /api/v1/trips/{tripId}/plan`. A refused action answers 409 with its reason.

The active pointer lives in the Itinerary service's own `plans` table, not on `trips`, so no table of another service was changed.

### Piece 5: Cards

**Produces, in `src/features/recommendations/`:** table `card_events`; `proposeCards(plan, slot)` returning up to three places with the factors that ranked them and a reason built from those factors; "show me others" with reasons; discarded places kept out for the trip.

### Piece 6: The workspace screen

**Produces:** the approved workspace on the trip page, fed by the server: cards with flip and closer look, the live itinerary, the shelf, move by drag and by keyboard menu, swap, remove, undo, and progress while a city's places are gathered. The sample prototype keeps working from the same components.

### Piece 7: Retire the earlier planner

**Produces:** removal of the earlier pages, routes, code and tables named in decision 10; `eslint-suppressions.json` pruned; `qa/` catalogue and feature states updated.

### Piece 8: Evidence

- [ ] `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` pass.
- [ ] Browser walk on wide and phone widths; no serious accessibility findings; every action by keyboard.
- [ ] Each requirement in the table above checked and recorded in the roadmap's Milestone 4 entry.
- [ ] `docs/status/current-implementation.md` and `docs/api/v1.md` updated.

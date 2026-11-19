# Quality and release: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan piece by piece. Each piece is one feature branch and one pull request into the milestone branch.

**Goal:** Retire the earlier planner, bring the Profile page to the approved prototype, and show that the first version is good enough to call complete.

**Architecture:** No new service. The removal deletes code that nothing in the new screens uses; the Profile work adds to Memory, Itinerary and their use cases behind the existing borders; the quality pieces add checks and evidence, and fix what they find.

**Tech stack:** Next.js 16, React 19, Prisma 7 on Neon Postgres, Vitest, Playwright with axe.

**Spec:** [roadmap](../../roadmap.md) Milestone 8; [PRD](../../prd.md) sections 12.5, 15 and 18; [requirements](../../requirements.md) TB-SYS-15, TB-DSN-01 to 07, TB-ITN-16, TB-SYS-11. The developer's decisions of 2026-11-18: the Profile page is to match the prototype fully, old code may be overwritten, and the earlier planner may be removed.

## How this milestone is traced

Milestone branch `milestone/8-quality-release`, cut from `milestone/7-quick-plan`. Each piece is a feature branch merged by pull request with a merge commit.

| Piece                                             | Feature branch              | Requirements                    | Pull request |
| ------------------------------------------------- | --------------------------- | ------------------------------- | ------------ |
| 0. Plan                                           | `feature/m8-plan`           | none (process)                  | #55          |
| 1. Cut the two links to the earlier planner       | `feature/m8-cut-links`      | none (removal)                  | #56          |
| 2. Remove its code, routes, worker and QA entries | `feature/m8-remove-planner` | none (removal)                  |              |
| 3. Drop its tables                                | waits for the developer     | none (removal)                  |              |
| 4. The day starts when the traveller likes        | `feature/m8-day-start`      | TB-MEM-03, TB-ITN-16            |              |
| 5. Profile: habits as slider cards                | `feature/m8-profile-habits` | TB-MEM-03, TB-MEM-11, TB-DSN-01 |              |
| 6. Profile: daily budget with currency            | `feature/m8-profile-budget` | TB-MEM-03, TB-QPL-03            |              |
| 7. Profile: how it shaped the latest trip         | `feature/m8-profile-shaped` | TB-MEM-06, TB-MEM-11            |              |
| 8. Defects found on the way                       | `feature/m8-defects`        | TB-DSN-05, TB-DSN-07            |              |
| 9. The four sample travellers                     | `feature/m8-samples`        | TB-SYS-15                       |              |
| 10. Design checks on the real screens             | `feature/m8-design-checks`  | TB-DSN-01 to 07                 |              |
| 11. Time zones                                    | `feature/m8-time-zones`     | TB-ITN-16                       |              |
| 12. QA catalogue for the new product              | `feature/m8-qa-catalogue`   | none (process)                  |              |
| 13. Evidence                                      | `feature/m8-evidence`       | all of the above, re-checked    |              |

## Global Constraints

- Service borders: import a service only through `index.ts` or `contracts.ts`; query only tables the service owns; never add to `eslint-suppressions.json`. The removal must shrink that list.
- A removal changes no behaviour of the new screens. After each removal piece, `npm run lint`, `npm run typecheck`, `npm run test` and `npm run build` pass, and the browser walks of Milestones 4 to 7 still pass.
- **No table is dropped and no column removed without the developer's word on that step.** Piece 3 waits for it.
- Migrations are written with `prisma migrate diff` and applied with `prisma migrate deploy` to the development database only.
- Everything works with the AI model off. Tests run with `AI_MODE=off` and `PLACE_PROVIDER_MODE=mock`.
- The Profile page follows the approved prototype (`src/components/keepsake/profile-list.tsx`) in layout, type and motion. Where the prototype shows sample text, the real page shows the same thing worked out from real data, and nothing it cannot back.
- A setting on the Profile page changes what the site does. A slider that changes nothing is not built.

## The earlier planner, as found

An inventory of 2026-11-18 (read-only, by import graph):

- **Routes:** 16 handlers under `/api/trips` (1,557 lines) with 15 test files.
- **Code only it uses:** 60 files, 15,614 lines, in `src/features/adaptation`, `jobs`, `preferences`, `profile`, parts of `recommendations`, `trips`, `itinerary` and `planning`, `src/worker` and nine stub files in `src/lib`. A further 8 files (1,791 lines) are the older place adapter.
- **Tests only for it:** 60 files, 11,819 lines.
- **Two links still tie the new code to it.** `planning/mutation.ts` loads the old recommendations service to build a snapshot nobody reads; and `places` takes `resolvePlaceProviderMode` from the older place adapter. Cutting both first makes the rest deletable without touching new code.
- **Tables only it uses:** 15, the 14 the Milestone 4 plan named and `user_travel_preferences`. `trips` has two columns that point at them.
- **Nothing in the new screens imports `src/features/profile` or `src/features/preferences`.**
- **Border exceptions:** 153 of the 162 go with the old code; 5 remain in 2 files.
- **Rows on production (read-only count, 2026-11-18):** 1 user and 2 trips. The old tables hold 21 place suggestions, 7 feedback rows, 6 planning events, 2 preference versions, 2 trip preferences and 1 set of user travel preferences; the other nine are empty. The two trips themselves are in `trips` and stay.

## Decisions made by the builder

Not stated in the PRD or by the developer. Each is open to change.

1. **The removal is three pieces.** Cut the links with no change in behaviour; remove code, routes, the worker and QA entries; drop the tables. The first two can be undone from git. The third cannot, so it waits.
2. **QA features of the earlier planner are removed from the registry**, not marked. The registry has no "retired" state, and a required feature with no code would block the gate for ever. Scenarios that describe behaviour the new product still has (trip readiness, revisions, the place boundary, persistence) are rewritten in piece 12, not deleted.
3. **The older Google place adapter goes with the earlier planner.** Google is not behind the new place source (ADR-009: its terms forbid saving what a plan needs). `render.yaml` goes too: it holds only the old worker.
4. **Start of day is the existing "shape of the day" answer, given times.** Early starts begin at 8:00, neither at 9:00, late nights at 10:00. The slider has those three stops. The prototype shows six hourly stops; three keeps one answer for the conversation, the brief and the profile.
5. **Daily budget is one of three levels kept in yen**, as in the prototype, shown in the traveller's currency at the day's rate. It fills in the brief's budget as a daily amount, labelled as remembered. Nothing ranks by it: place data has no prices.
6. **"How this shaped" shows the traveller's most recent trip with a plan**, and only effects the plan can prove: the pace of its days, when its days start, how many of its meals are at places that confirm a dietary rule, and which places answer a remembered interest. With no such trip the section is not shown.
7. **The four sample travellers are scripts**, run against sample places in both ways of planning. They check what a machine can: no invented place, no broken rule, no broken hard limit, days that match the pace, and reasons that name something true. "The developer reads the itinerary and would follow it" stays the developer's.
8. **The QA gate itself is run by the developer.** Piece 12 brings the catalogue up to the new product so the gate has something true to check.

## Review Focus

1. After the removal, a trip made before it still opens, and its facts, commitments, plan and conversation are intact.
2. No route of the earlier planner answers anything but 404, and no page links to one.
3. A slider moved on the Profile page changes the next trip's plan (pace, start of day), and a trip that said otherwise keeps its own answer.
4. A day that starts at 8:00 or 10:00 still obeys every rule of PRD 9.3: commitments keep their times, and meals stay in their windows.
5. "How this shaped" never claims an effect the trip's plan does not show.

## Pieces

Each piece gets its own task list in its pull request. What is fixed here is what each one produces.

### Piece 1: Cut the two links to the earlier planner

**Produced (pull request 56):**

- `usesSamplePlaces()` in `src/features/places/provider-mode.ts`, with its test. `city-lookup.ts` and `place-source.ts` use it in place of `resolvePlaceProviderMode` from the older place adapter.
- `planning/mutation.ts` no longer loads the earlier planner's workspace when a request names an older revision. It raises the stale-revision error, which `runTripAction` already answers as "stale". The new screens see no change: a stale save still answers 409.
- After it, nothing the new screens run loads the earlier planner.

**Left for piece 2:** the snapshot types in `planning/types.ts`, and the stale result type of the ledger. The earlier planner's own files still import them, so they go with those files.

### Piece 2: Remove its code, routes, worker and QA entries

**Produces:** the routes under `/api/trips`, the code and tests listed above, `src/worker`, `render.yaml` and the worker scripts gone; the matchers in `src/proxy.ts` and `src/lib/auth-routes.ts`, `e2e/auth.spec.ts`, the test paths in `qa-pr.yml` and the QA registry's source roots updated; the eight QA features and thirteen scenarios of the earlier planner removed from the four files that must change together; `eslint-suppressions.json` pruned; `service-map.json` code globs, `docs/status/current-implementation.md`, the README and the other documents that describe it as current brought up to date. The tables, their models and `CitiesInUseError` stay.

### Piece 3: Drop its tables (waits for the developer)

**Would produce:** one migration that drops the two `trips` columns that point at the old tables, the 15 tables and their 24 enums; `service-map.json` tables and foreign keys, the ownership test, `qa/runtime/fixtures.ts`, `CitiesInUseError` and its error message updated in the same change. It destroys the rows counted above on every database it is applied to.

### Piece 4: The day starts when the traveller likes

**Produces:** the itinerary laid out from a day start taken from the "shape of the day" in use (8:00, 9:00 or 10:00), in place of the fixed 9:00; the conversation's and the brief's words for that answer saying the time; the report of a build listing it when it was assumed.

### Piece 5: Profile: habits as slider cards

**Produces:** the prototype's "How you like your days" section on the real page: slider cards for pace and start of day, each with its sureness, source, confirm and remove, saved through the existing profile routes. The list of values to pick from goes where a slider now holds the topic.

### Piece 6: Profile: daily budget with currency

**Produces:** the third slider card: three levels kept in yen, shown in a chosen currency at the day's rate from `src/lib/currency.ts`, with the prototype's note when rates are unavailable; the brief's budget filled in from it as a daily amount, labelled with its source.

### Piece 7: Profile: how it shaped the latest trip

**Produces:** a pure function from a trip's plan and the profile to "memory, so in this trip" pairs, each provable from the plan; the prototype's dark section on the real page with the trip's name and a link to it.

### Piece 8: Defects found on the way

**Produces:** fixes, each with a test, for what Milestones 4 to 7 recorded and did not fix: reading a plan while its trip is deleted answers 404, not 500; buttons whose spoken name gains a stray space or colon from a hidden suffix; and whatever pieces 1 to 7 turn up.

### Piece 9: The four sample travellers

**Produces:** a script per traveller of PRD 18 that plans the trip by Guided planning and by Quick plan against sample places, and the checks of decision 7 as tests; the eight itineraries written out for the developer to read; what the checks found, fixed or recorded.

### Piece 10: Design checks on the real screens

**Produces:** one walk of every real screen (Home, Create, trip page, brief, Profile) that checks: every action by keyboard alone; phone width without sideways scrolling; contrast and "not by colour alone" through axe and the contrast helper; motion off under reduced motion; text equivalents of cards, stamps and ticket stubs. Run in Chromium, Firefox and WebKit. Fixes for what it finds.

### Piece 11: Time zones

**Produces:** tests that a trip in a city far from the server's zone, and one across a clock change, shows and stores its days and times in the place's local time; fixes for what they find.

### Piece 12: QA catalogue for the new product

**Produces:** QA features and scenarios for trip start, fixed commitments, cards and the itinerary, the conversation, memory and Quick plan, in the registry's own form, with the scenarios of decision 2 rewritten; `npm run qa:validate` passing. The gate is not run here.

### Piece 13: Evidence

**Produces:** lint, type check, tests and build; the walks of Milestones 4 to 7 repeated; each requirement of sections 2 to 13 of the catalogue marked with its evidence or what is missing; the roadmap, the status document and this plan updated; the pull request into `main`.

## Waiting for the developer

- The word on piece 3, dropping the earlier planner's tables.
- Running the QA gate, and recording the portfolio demonstration.
- Reading the eight sample itineraries of piece 9.
- The Anthropic API key in Vercel for production and QA, then one real reply looked at together.
- Whether the AI model should word the agent's messages (PRD 17).

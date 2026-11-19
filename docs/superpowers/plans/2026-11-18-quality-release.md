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
| 2. Remove its code, routes, worker and QA entries | `feature/m8-remove-planner` | none (removal)                  | #57          |
| 3. Drop its tables                                | waits for the developer     | none (removal)                  |              |
| 4. The day starts when the traveller likes        | `feature/m8-day-start`      | TB-ITN-08, TB-MEM-03            | #58          |
| 5. Profile: habits as slider cards                | `feature/m8-profile-habits` | TB-MEM-03, TB-MEM-11, TB-DSN-01 | #59          |
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
4. **Start of day is the existing "shape of the day" answer.** Early starts move the whole day an hour earlier, late nights an hour later. The slider has those three stops. The prototype shows six hourly stops; three keeps one answer for the conversation, the brief and the profile. (Piece 4 found the first slot depends on the pace, so the stops are named by the answer, not by a clock time.)
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

**Produced (pull request 57):** 149 files and about 30,800 lines removed.

- **Routes:** everything under `/api/trips`, and the empty `/api/export`, `/api/itinerary` and `/api/recommendations` folders. They answer 404. The route matchers in `src/proxy.ts` and `src/lib/auth-routes.ts` name `/api/v1` only.
- **Code and its tests:** `src/features/adaptation`, `jobs`, `preferences` and `profile`; the earlier planner's files in `recommendations`, `trips`, `itinerary` and `planning`; `src/worker`; `src/lib/ai`, `export`, `google` and `providers`. The replay ledger's types hold only what it needs, and its list of action kinds only the kinds that exist.
- **Worker:** its scripts in `package.json`, its environment check, its line in `.env.example`, and the dependency `@googlemaps/js-api-loader`.
- **QA:** the eight features and thirteen scenarios of the earlier planner removed from `qa/feature-states.json`, `qa/contracts/features.ts`, `qa/contracts/schemas.ts` and `qa/scenarios/catalog.ts` (12 features and 19 scenarios remain; `npm run qa:validate` passes); dead source roots and routing prefixes removed from `qa/agent-system/registry.ts`; the removed test dropped from `qa-pr.yml`; `e2e/auth.spec.ts` asks a route that exists.
- **Borders:** `eslint-suppressions.json` went from 162 exceptions in 34 files to 5 in 2 (the replay ledger and the authorization helper). `service-map.json` names only folders that exist; a service with tables and no code left is skipped by the lint rules.
- **Documents:** the README rewritten for the product as it is; the status document, the API reference, the folder structure, the service borders and the roadmap brought up to date.

**Checked:** lint, type check, 717 tests and the build pass. Signed in, the old routes answer 404 and the new ones answer. The browser walks of guided planning with memory, the brief, the build with its report and the two switches were repeated with no failed request.

**Left as they are, for the developer:**

- `render.yaml`. `AGENTS.md` says to keep it as a hosting template, but it starts a worker that no longer exists.
- `AGENTS.md` and `docs/operating-constraints.md`, which still describe the adaptive-planning topology with a local worker. They are the developer's standing rules.
- `docs/developer-finish-guide.md` and `docs/neon-env-setup.md` keep their worker sections, now marked as removed.
- Four dependencies nothing imports any more, not part of the earlier planner: `@next/env`, `clsx`, `lucide-react`, `tailwind-merge`.
- The tables, their models, `qa/runtime/fixtures.ts`, `CitiesInUseError`, and the two schema tests of the earlier planner: piece 3.

### Piece 3: Drop its tables (waits for the developer)

**Would produce:** one migration that drops the two `trips` columns that point at the old tables, the 15 tables and their 24 enums; `service-map.json` tables and foreign keys, the ownership test, `qa/runtime/fixtures.ts`, `CitiesInUseError` and its error message updated in the same change. It destroys the rows counted above on every database it is applied to.

### Piece 4: The day starts when the traveller likes

**Produced (pull request 58):**

- The itinerary takes `dayShift` in its context and moves the whole day by it: the day's bounds and every slot's usual time. Early starts move the day an hour earlier, late nights an hour later (PRD 9.4: "Day shape preferences shift these"). Lunch stays between 11:30 and 14:00 and dinner between 18:00 and 21:00 at every pace. Nothing already decided moves.
- `contextFor` in `src/use-cases/plan.ts` works the shift out from the "shape of the day" in use: this trip's own answer, else the personal profile. Every reader and every change of a plan lays it out from the same shifted day.
- The question says what the answer does: "Early starts, or late nights? I move the whole day an hour earlier or later." The brief shows the same words.
- A build's report lists the shape of the day among its assumptions when it was a memory or a default.

**Changed from decision 4:** the day does not begin at a fixed 8:00, 9:00 or 10:00. A day's first slot depends on the pace (9:00 packed, 9:30 balanced, 10:00 relaxed), so the answer moves that by an hour either way. An early riser on a packed day starts at 8:00; on a relaxed day at 9:00. The Profile slider of piece 5 names the three answers, not three clock times.

**Seen in the walk:** a balanced day began at 9:30; with early starts remembered, at 8:30 with dinner at 18:00 before a reservation at 20:00; with "late" said for the trip, at 10:30; with that answer taken away, at 8:30 again. A built trip broke no rule.

**Known limit:** a place chosen before the answer changes keeps its slot and moves with it. If it is then closed at the new time, the plan flags it, as for any other broken rule.

### Piece 5: Profile: habits as slider cards

**Produced (pull request 59):**

- The prototype's section "How you like your days" on the real Profile page, between the rules and the tastes: a slider card for **pace** (relaxed, balanced, packed) and one for **the shape of the day** (early starts, neither, late nights).
- Each card says the habit in words, says what it does to a plan ("Up to two main sights a day, with two hours to wander", "The whole day runs an hour earlier, dinner included"), and shows its sureness and source with a way to remove it. A guess from a trip names the trip and asks "Is this right?".
- A card is shown before anything is known, standing where the site stands by default and marked "Not set yet". Moving the slider saves it as something the traveller told the site.
- A slider saves when it is let go, by pointer or keyboard, through the existing profile routes. No route or table is new.
- Pace and the shape of the day are no longer in the list of tastes or in the list of values to pick from.

**Seen in the walk:** one key press moved pace to "Full days" and saved it; a drag moved it to "A relaxed pace"; the page's sentence became "You travel slowly, and start early"; a new trip was laid out relaxed and an hour earlier, and its report listed both as assumptions from memory; removing a habit returned its card to "Not set yet".

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

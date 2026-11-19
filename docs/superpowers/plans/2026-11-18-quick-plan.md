# Quick Plan (Milestone 7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A traveller writes a short trip brief in five steps, the agent builds the whole itinerary one day at a time, and the traveller refines it in the same workspace, with a report of what was built, assumed, shelved and uncertain.

**Architecture:** The brief is another screen over the data Guided planning already uses: the trip's facts and fixed commitments in the Trips service, and the trip's taste in the Memory service. Nothing is stored twice. The build is a use case that fills one day per request with the top-ranked place for each slot, through the same ranking, the same scheduling rules and the same replay ledger as a traveller's own picks. The page drives it, so no background worker is involved.

**Tech Stack:** Next.js 16.2 App Router, React 19, Prisma 7 on PostgreSQL (Neon), Zod 4, Vitest, Playwright. No new dependency.

**Spec:** [PRD](../../prd.md) section 11; [requirements](../../requirements.md) TB-QPL-01 to 13 and TB-STA-04; [roadmap](../../roadmap.md) Milestone 7; [ADR-008](../../architecture/adr-008-modular-services-in-one-deployment.md). Builds on [Milestone 5](2026-11-19-guided-planning.md) and [Milestone 6](2026-11-18-memory.md).

## How this milestone is traced

The branch is `milestone/7-quick-plan`, cut from the finished Milestone 6 branch. Each piece is a feature branch merged by pull request into it; the pull request names the requirement IDs it covers and its check results, and its number is written here.

| Piece                                         | Branch                    | Requirements                 | Pull request |
| --------------------------------------------- | ------------------------- | ---------------------------- | ------------ |
| 0. Plan                                       | `feature/m7-plan`         | none (process)               | #45          |
| 1. The brief as a view, and its checks (pure) | `feature/m7-brief-rules`  | TB-QPL-02, 03, 05, 07        | #46          |
| 2. Saving the brief                           | `feature/m7-brief-save`   | TB-QPL-04, 06, TB-STA-04     | #48          |
| 3. The brief on screen                        | `feature/m7-brief-screen` | TB-QPL-01 to 05, 07          | #49          |
| 4. Building one day at a time                 | `feature/m7-build`        | TB-QPL-08, 09                | #50          |
| 5. The build on screen and the report         | `feature/m7-report`       | TB-QPL-08, 10, 11            | #51          |
| 6. Moving between the two ways                | `feature/m7-switch`       | TB-QPL-12, 13                | #52          |
| 7. Evidence                                   | `feature/m7-evidence`     | all of the above, re-checked | #53          |

## Global Constraints

- Service borders: import a service only through `index.ts` or `contracts.ts`; query only tables the service owns; never add to `eslint-suppressions.json`.
- Every change to a trip goes through a route under `/api/v1` with `operationId` and `expectedRevision`, through the replay ledger.
- **Nothing depends on a separately running background worker** (PRD 11.3, ADR-008). The build runs one day per request while the page is open.
- **The build obeys the same rules as a traveller's own pick** (TB-QPL-09): it uses the ranking of Milestones 4 to 6 (a place known to be closed is never chosen, hard limits hold) and the plan actions that flag every broken scheduling rule. A place is taken only from saved place data.
- **Only step 1 is required** (TB-QPL-02). A skipped answer falls back to the personal profile, then to a default, and the report lists it as an assumption.
- **A brief answer changes only this trip** (TB-QPL-03), never the personal profile.
- Everything works with the AI model off. Tests and QA run with `AI_MODE=off` and `PLACE_PROVIDER_MODE=mock`.
- Migrations are written with `prisma migrate diff` and applied with `prisma migrate deploy` to the development database only. No table is dropped.

## Decisions made by the builder

Not stated in the PRD. Each is open to change.

1. **The brief stores nothing of its own.** Its answers are the trip's facts, its fixed commitments and its taste answers. That is what makes "Talk it through instead" keep everything (TB-QPL-12): the conversation reads the same data.
2. **The step a traveller is on is in the page address** (`?step=3`), not in the database. Returning opens the review when step 1 is complete, and step 1 otherwise. Every answer is already saved.
3. **A step is saved when the traveller leaves it** (Next, Back, or a step marker), in one action through the ledger.
4. **"Anything else"** is read by the same rule as the profile page with the model off: a part that plainly is a value of a topic becomes a preference for this trip, shown for confirmation first; the rest is kept as said and marked as not used. With the model on, the model reads it into the same shapes. What was typed is saved in the trip's conversation, so the other way of planning sees it.
5. **Build order** is the Guided order: fixed commitments are already placed; then each day's sights and activities, then its meals. For each open slot the build takes the top-ranked card. A slot with no card stays open and is reported.
6. **Build progress** is one small JSON value on the plan: the next day to build, and the slots where the choice was close. A build in progress resumes when the trip page is opened.
7. **"Close"** means the second-ranked place scored within 0.5 of the first. Those slots are listed in the report as "want to pick?".
8. **The report** is worked out from the trip as it stands, plus the close slots recorded during the build: what was built, every answer that was a memory or a default with chips to change it, what is on the shelf and why, and where the choice was close.
9. **Places are gathered before the build starts**: one provider request per city and, for meals, per area, as in Guided planning. If the provider cannot be reached, the build uses saved places and the report says so.

## Review Focus

1. A build interrupted by closing the page resumes at the right day and never builds a day twice.
2. The build never picks a place known to be closed at the slot's time or one that conflicts with a hard limit, and never moves or removes a fixed commitment.
3. A second press of "Build my trip", or a repeated request, does not double-fill or overwrite the traveller's own picks.
4. An answer changed in the brief changes this trip only; the personal profile is untouched.
5. Step 1 with an end date before the start date, or a city with no nights among several, is explained beside the field and cannot be built.

## Pieces

Each piece gets its task list in its pull request. What is fixed here is what each one produces.

### Piece 1: The brief as a view, and its checks (pure)

**Produced (pull request 46):**

- `src/use-cases/brief-view.ts`, safe for the browser: the shapes of the brief (`BriefView`, `BriefAnswer`, `BriefProblem`), the five step names, and `step1Problems(facts)`, the checks said beside the fields: no city, nights missing where there are several cities, no dates and no length with a time of year, an end before the start, an open-ended one-city trip, nobody travelling. They are the same things the itinerary needs before it can lay out the days.
- `src/use-cases/brief.ts`: `briefOf(trip, tasteInUse, personal)`. Each of the eight style answers carries the value in use and where it comes from: said for this trip, filled in from the profile with its source ("from your trip “Lisbon, April 2027”", "you told me"), a default, or not answered, with what the agent will assume. The review is the whole brief in plain sentences, one part per step. Allergies from the profile are carried as hard limits.

Nothing uses these yet; pieces 2 and 3 do.

### Piece 2: Saving the brief

**Produced (pull request 48):**

- `GET` and `PUT /api/v1/trips/{tripId}/brief`. A save carries any of `facts`, `style` and `said`, in one action through the ledger (`brief_save`). A style answer is saved as said for this trip; an empty list takes the trip's own answer away, so the profile or a default applies again. The plan follows the pace the trip then goes by. Nothing writes to the personal profile.
- The trip action `mode` (`trip_mode_set`), which changes a trip between Guided planning and Quick plan (TB-STA-04).
- "Anything else": the words are kept as typed in a new column, `trip_profiles.said` (migration `20261119130000_trip_brief_said`, development database only). `readSaid` reads them by the profile page's rule. A sentence is understood only when all of it plainly names answers; such a part is shown with `inUse: false` until the traveller confirms it, which saves it as a style answer. The rest is kept as said and affects nothing. An allergy named here is listed apart, because it is a limit for every trip and belongs on the profile page.

**Changed from the decisions above:**

- Decision 4 said the typed words are saved in the trip's conversation. They are saved on the trip profile instead, so the box shows them again when the traveller returns (TB-QPL-04). Piece 6 decides how the conversation shows them.
- Decision 4 said the model reads the box when it is on. It does not yet: the model's reply holds one answer per message, and the box can hold several. The rule reads it in both modes.

**Known limit:** a single common word can match a choice's short name. "We love food" is read as the budget priority "Save on stays, spend on food". The traveller sees it with its full label and must confirm it before it is used.

### Piece 3: The brief on screen

**Produced (pull request 49):**

- The page `/trips/{tripId}/brief` and `src/components/keepsake/brief-steps.tsx`: five steps with a progress marker, in the site's own type, fields and chips.
  1. **Where and when:** cities with nights, dates or a length and month, travellers. A problem is said beside its field as soon as the traveller has touched that field, and all of them when Next is pressed.
  2. **Already decided:** the trip page's own commitments panel.
  3. **This trip:** purpose as chips, budget, and how firm the budget and dates are.
  4. **Your style:** the eight questions as chips, worded as the agent asks them. Each says where its answer comes from: "What I remember (from your trip …)", "For this trip", or what will be assumed if it is left.
  5. **Review:** the brief in sentences with an Edit link per part, and the "anything else" box. "Show me how you understood it" saves the words and lists what was understood, each with "Use this" until it is in use, what was kept as said, and any allergy with a link to the profile.
- A step is saved when the traveller leaves it (Next, Back, an Edit link, or "Open the trip"). A save names only what changed.
- A new Quick plan trip opens on its brief. The trip page of a Quick plan trip links to it.
- The fields for a trip's facts moved to `facts-fields.tsx`, shared by the trip page's facts form and the brief.

**Changed from the decisions above:** the address names only the step to open at (`?step=3`); moving between steps does not change it. On a page that reads its address, changing the query rebuilt the form from a cached copy and lost what was typed. Without a step in the address, the brief opens at the review once step 1 is complete.

**Left for later pieces:** the last step ends with "Open the trip"; piece 5 makes it "Build my trip". "Talk it through instead" comes with piece 6.

### Piece 4: Building one day at a time

**Produced (pull request 50):**

- `POST /api/v1/trips/{tripId}/build` and `buildNextDay` in `src/use-cases/build.ts`. One request builds one day, as one action through the ledger (`plan_build`) and one plan version ("Built day 2"), so undo takes a built day back in one step. `start` begins at day 1; without it the next day is built. The answer says the day, the number of days, how many slots were filled and whether the build is done.
- For each open slot, sights first and then meals, the build takes the best-ranked card that leaves no rule broken. It uses the same card ranking as Guided planning and applies the same `pick` action. After each pick the plan is laid out again; a pick that adds a flag other than "opening hours unknown" is not kept and the next card is tried. A slot nothing fits stays open.
- Build progress is the new column `plans.build` (migration `20261119140000_plan_build_progress`, development database only): the next day, what the build put where, the slots where the choice was close, the slots it left open, and whether places could not be gathered.
- A build starts from the pace the brief shows, a remembered one included.

**How the review-focus points are met:**

1. Progress is saved in the same transaction as the day. A new page continues at `nextDay`; a repeated request gets its first answer from the ledger.
2. The ranking never offers a place known to be closed or one whose listing conflicts with a dietary rule, and a pick that would break a rule against a commitment is dropped. Commitments are never part of a build's changes.
3. Only slots that are open when the day is saved are filled. A second build fills nothing that is taken, and a slot the traveller fills while a day is being worked out is left alone.

**Added decisions:**

- **Places a build chose teach the profile nothing.** A finished trip's "kinds of place chosen" leaves out the places the build put in and the traveller left there; they are the agent's choices (PRD 12.4 speaks of the traveller's choices).
- **A name already in the plan ranks lower** (minus 1.5), in Guided planning too. Sample places repeat the same restaurant names in every area, and a built trip ate at one name three times. The penalty is smaller than the bonus for a listing that confirms a dietary rule, so a traveller with a rule still returns to a confirmed place before a new one that says nothing.
- **A card set says when its first two places are close** (`close`, within 0.5 in score), which is what decision 7 needs.

**Seen in the walk:** a three-day sample trip to Lisbon built in three requests of about 1.2 seconds each: 11 places, none twice, no rule broken, dinner on day 1 left open before a reservation at 20:00.

### Piece 5: The build on screen and the report

**Produced (pull request 51):**

- The brief's last button is **Build my trip**. It saves the step, builds day 1 and opens the trip page.
- On the trip page, the workspace shows a panel while a build runs: each day as built, being worked on, or to come. It asks for one day after another and reads the plan again after each, so the day appears in the itinerary. A build left part-way continues when the trip page is opened again (TB-QPL-08).
- When the build is done the panel is the agent's report (TB-QPL-10), in the prototype's four parts:
  - **What I built:** the days, the cities, what was already decided, and how many places it chose.
  - **What I assumed:** assumed dates, and each style answer the build goes by that was a memory or a default. Each has a **Change** link to its step of the brief (TB-QPL-11).
  - **What I could not fit:** what is on the shelf and why, and the slots it found nothing for.
  - **Where I was unsure:** close choices, meals whose listing does not confirm a dietary rule, places with unknown opening hours, and whether new places could not be looked up.
  - **Let me choose** turns the workspace to that slot and its cards.
- The report is part of the plan answer (`build`), written by the pure `buildReportOf` from the plan as it stands and the build's notes. A place the traveller has swapped since no longer counts as built.

**Changed from the decisions above:**

- Decision 7: a choice is "close" within 0.1 in score, not 0.5. At 0.5, 14 of 15 choices of a sample trip were close; at 0.1, 5 were. Three are spelled out and the rest counted.
- Decision 8: an assumption is changed through a link to the brief's step, as in the approved prototype, not by chips inside the report. After a change the traveller presses "Build my trip" again; only open slots are filled.
- Only the answers a build goes by are listed as assumptions: pace, interests, atmosphere, food and getting around.

**Known limit:** changing an assumption does not replace places already built. The traveller swaps a slot from its three alternatives, or removes places and builds again.

### Piece 6: Moving between the two ways

**Produced (pull request 52):**

- **Talk it through instead**, on every step of the brief (TB-QPL-12). It saves the step, changes the trip to Guided planning and opens the trip page. The conversation reads the same facts, commitments and taste, so it asks only for what is still missing. The words of the "anything else" box are the one thing only the brief shows: `changePlanningMode` puts them into the thread as "In your brief you also wrote: …", once.
- **Build the rest for me**, in the workspace of any trip with open slots (TB-QPL-13). It starts a build from day 1, which fills only open slots, shows the same progress and ends with the same report.
- The trip page links to the brief for both ways of planning, so a traveller who turned to the conversation can go back.

**Decided here:** "Build the rest for me" does not change the trip's way of planning; the conversation stays. It is a button, not something typed: the model's reply has no shape for it yet.

### Piece 7: Evidence

**Produced (pull request 53):**

- [x] `npm run lint`, `npm run typecheck`, `npm run test` (1071 tests) and `npm run build` pass.
- [x] Three browser walks repeated on the final code, in Chromium at 1440 px and 390 px, against the development database with sample places and the model off: the brief from the Create page through its five steps and back; "Build my trip", progress, the report, "Let me choose", a "Change" link, and a build left part-way that the trip page finished; "Talk it through instead" and "Build the rest for me". No serious accessibility findings, no sideways overflow on the phone size, no failed requests.
- [x] Each requirement checked and recorded in the [roadmap](../../roadmap.md)'s Milestone 7 entry, with what is only partly met.
- [x] `docs/status/current-implementation.md` updated; `docs/api/v1.md` and `docs/architecture/service-borders.md` were updated with each piece.

## Waiting for the developer

- Review and merge the milestone into `main`.
- Apply the two migrations to the QA and production databases through the protected workflows. Each adds one column.
- Judge the four decisions listed in the roadmap entry: what a build teaches the profile, the lower rank of a repeated name, what counts as a close choice, and changing an assumption through a link.
- Decide whether the AI model should read the brief's "anything else" box. It needs a reply shape that holds several answers.
- One build against the real OpenStreetMap services.

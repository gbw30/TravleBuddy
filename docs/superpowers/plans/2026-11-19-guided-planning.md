# Guided Planning (Milestone 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The agent leads the traveller through the facts and their taste for this trip in a saved conversation, answered by tapping or typing, proposes for each slot as soon as it knows enough, and keeps working when the AI model is switched off.

**Architecture:** A fixed script decides what to ask next and when a topic is ready; it is pure and needs no model. The Conversation service saves every message in order. The AI model sits behind one boundary with one job, reading typed text into structured data that is checked against a schema before anything changes. Answers about taste are saved as the trip profile in the Memory service and join the ranking of cards.

**Tech Stack:** Next.js 16.2 App Router, React 19, Prisma 7 on PostgreSQL (Neon), Zod 4, Vitest, Playwright, `@anthropic-ai/sdk` with Claude Haiku 5.5 (`claude-haiku-5-5`, named by PRD 17).

**Spec:** [PRD](../../prd.md) sections 7, 9.5, 12.1, 13, 14 and 17; [requirements](../../requirements.md) TB-AGT except TB-AGT-06 and TB-AGT-12, TB-RSN, TB-FIX-05, TB-TRU-03, the agent's offer in TB-ITN-14, TB-SYS-10 and the AI half of TB-SYS-11; [roadmap](../../roadmap.md) Milestone 5; [ADR-008](../../architecture/adr-008-modular-services-in-one-deployment.md), [ADR-010](../../architecture/adr-010-service-borders-by-shrinking-exceptions.md).

## How this milestone is traced

The branch is `milestone/5-guided-planning`, cut from the finished Milestone 4 branch. Each piece is a feature branch merged by pull request into it; the pull request names the requirement IDs it covers and its check results, and its number is written here.

| Piece                                                        | Branch                           | Requirements                                                                                                   | Pull request |
| ------------------------------------------------------------ | -------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------ |
| 0. Plan                                                      | `feature/m5-plan`                | none (process)                                                                                                 | #22          |
| 1. The script: questions, readiness, reading answers by rule | `feature/m5-script`              | TB-AGT-01 to 05, TB-AGT-07, TB-AGT-08, TB-AGT-15                                                               | #23          |
| 2. The AI model boundary                                     | `feature/m5-ai-boundary`         | TB-AGT-14, TB-TRU-03, TB-SYS-10, TB-SYS-11 (AI)                                                                | #24          |
| 3. Saved conversation and trip profile                       | `feature/m5-conversation-store`  | TB-AGT-13                                                                                                      | #25          |
| 4a. Taking a turn                                            | `feature/m5-turns`               | TB-AGT-08, TB-AGT-11 (typed), TB-AGT-13, TB-AGT-14, TB-AGT-15, TB-FIX-05, TB-TRU-03, TB-SYS-10, TB-SYS-11 (AI) | #26          |
| 4b. Proposals in conversation                                | `feature/m5-proposals`           | TB-AGT-07, TB-AGT-09, TB-AGT-10, TB-ITN-14 (the offer)                                                         | #27          |
| 5. Taste in the ranking and the reasons                      | `feature/m5-taste-ranking`       | TB-RSN-01 to 04, TB-CRD-08                                                                                     |              |
| 6. The conversation on screen                                | `feature/m5-conversation-screen` | TB-AGT-01, TB-AGT-02, TB-AGT-13, TB-AGT-15                                                                     |              |
| 7. Evidence                                                  | `feature/m5-evidence`            | all of the above, re-checked                                                                                   |              |

## Global Constraints

- Service borders: import a service only through `index.ts` or `contracts.ts`; query only tables the service owns; never add to `eslint-suppressions.json`.
- Every change goes through a route under `/api/v1` with `operationId` and `expectedRevision`, through the replay ledger. It commits completely or not at all.
- **The AI model never writes.** Its output is parsed against a Zod schema, and the result is applied by the same service functions the forms use, with the same validation (TB-TRU-03, TB-AGT-14). A reply that does not fit the schema is discarded and the rule-based reader is used.
- **The AI model never supplies a fact about a place** (TB-TRU-02). It is given no place data and asked for none.
- **The conversation works with the model off** (TB-AGT-15, TB-SYS-10). Every question has tap choices; typed answers are read by simple rules; the agent says it is in a limited mode. The model is off when `ANTHROPIC_API_KEY` is absent, when `AI_MODE=off`, when the monthly cap is reached, and after a failed call.
- The model is `claude-haiku-5-5`, called through the official `@anthropic-ai/sdk`. No real request is made in tests or during this build: the client is replaced by a stand-in.
- Tests and QA run with `AI_MODE=off` and `PLACE_PROVIDER_MODE=mock`.
- Migrations are written with `prisma migrate diff` and applied with `prisma migrate deploy`. An applied migration is never edited.

## Decisions made by the builder

Not stated in the PRD. Each is open to change.

1. **One job for the model: reading typed text.** PRD 17 also lists wording the agent's messages and wording reasons. Those stay as templates in this milestone. A reworded sentence cannot be checked for added grounds, and TB-RSN-03 says the model "may" word a reason, not that it must. This keeps every sentence the traveller reads traceable to data.
2. **The script is data.** Each question has an id, a topic, a form (pick one, pick several, this or that, a scale, open text), its tap choices, a default used when it is skipped, and the sentence that says so.
3. **Facts are asked only when missing** from the trip, its tickets and its commitments. Taste topics are asked in the order of PRD 7.3.
4. **Readiness is per topic.** Sights can be proposed once the days can be laid out. Meals can be proposed once the food question is answered or skipped. The agent says when it switches, and says what it still needs when it cannot propose.
5. **The trip profile** is one row per trip in a new Memory table, `trip_profiles`: topic to the values chosen and whether they were told or a default. The taste topics themselves belong to the Memory service (`memory/contracts.ts`); the conversation asks about them. The fact questions a traveller skipped are the conversation's own state and live in `conversations`. The personal profile and confirming remembered answers are Milestone 6.
6. **The AI cap** is a monthly amount in US dollars, `AI_MONTHLY_CAP_USD`, default 10. Spend is worked out from the token counts each reply reports, at the published price of the model, and kept per month. At the cap the model is off until the month ends.
7. **Where to stay** is asked as a topic, and the agent says how many nights have no booked stay. Proposing hotels as cards is not in this milestone.
8. **A typed message that is not an answer** can do three things: set a fact, add a fixed commitment (TB-FIX-05), or point the agent at a day or slot (TB-AGT-11). Anything else gets a plain reply that the agent did not understand, with what it can do.
9. **The waiting question is worked out, not saved,** from the trip each time the conversation is read. It joins the saved thread the first time the traveller responds to it. Reading the conversation therefore never writes, and a fact changed in a form changes the question.
10. **The conversation sets a trip's cities only when it has none.** Saving cities replaces the whole list, and a typed "also Kyoto" must not do that. Each typed city is looked up and the best match is saved; the reply names it in full so a wrong match is seen.
11. **A turn makes at most one change.** A message that states several kinds of thing (a fact and a booking) is read as one of them.

## Review Focus

1. With no key, the whole conversation runs: every question can be answered by tapping, skipped, or typed in a simple form.
2. A model reply that does not fit the schema, or names a date or city that fails validation, changes nothing.
3. Reaching the cap or a failed call switches to limited mode within the same turn, with nothing lost and the agent saying so.
4. A typed commitment ("teamLab on Thursday at 3") is saved through the same checks as the form, including the clash notice.
5. Reloading the page shows the same conversation, in the same order, with the same question waiting.

## Pieces

Each piece gets its task list in its pull request. What is fixed here is what each one produces.

### Piece 1: The script (pure)

**Produced (pull request 23), in `src/features/conversation/`:** `contracts.ts` (topics, questions, the trip profile, the `Intent` a typed message is read into with its schema, and saved messages); `script.ts` (`QUESTIONS` for the 7 fact topics and 8 taste topics, `nextQuestion(state)`, `readiness(state)`, `allowedValues(topic)`, `TASTE_DEFAULTS`); `read-answer.ts` (`readAnswerByRule(question, text)`: cities, dates in common forms, a length with a month, who is travelling, a budget with its currency, the question's choices, and a skip in plain words).

### Piece 2: The AI model boundary

**Produced (pull request 24), in `src/features/conversation/model/`:**

- `mode.ts`: `aiMode()` is off without `ANTHROPIC_API_KEY` or with `AI_MODE=off`. `modelCall()` returns the one way to call the model, or null when it is off. The client gives up after ten seconds and one retry.
- `read-typed.ts`: `readTypedInput(input, call)` sends the typed text, the waiting question, today's date and the trip's dates to `claude-haiku-5-5`, asks for a reply in the `Intent` schema, and answers `read` (with the checked intent), `discarded` (the reply does not fit, was refused or was cut short) or `failed` (the call itself failed). It never throws and never writes.
- `budget.ts`: `costUsd(usage)` from token counts at the model's published price, `monthlyCapUsd()`, `underCap(spentThisMonth)`, `usageMonth(date)`. Where the month's spend is kept is piece 3.
- `index.ts`: the service's server interface.

The earlier Gemini files in `src/lib/ai` belong to the earlier planner and go with piece 7b of Milestone 4.

**Not verified:** no request has been sent to the real model. The request's shape comes from the SDK's types and the published documentation.

### Piece 3: Saved conversation and trip profile

**Produced (pull request 25):**

- Migration `20261119090000_conversation_and_trip_profile`, additive: tables `conversations`, `conversation_messages`, `trip_profiles` and `ai_usage`, and the enum `MessageAuthor`. **Applied to the development database only.** The QA and production databases wait for Gabriel, together with Milestone 4's migration.
- Conversation service: `conversation-store.ts` with `appendMessages`, `readConversation`, `readSkippedFacts`, `skipFact`; `model/usage-store.ts` with `readUsage`, `addUsage`. A message's order is its id, because rows written in one transaction share a timestamp.
- Memory service, new folder `src/features/memory`: `contracts.ts` (the taste topics, `TripAnswer`, `TripTaste`), `trip-profile-store.ts` with `readTripTaste`, `saveTripAnswer`.
- Checked once against the development database inside a transaction that was rolled back: order, skipped questions, taste and spend all read back as written, and nothing was left behind.

### Piece 4a: Taking a turn

**Produced (pull request 26):**

- `conversation/turn.ts` (pure): `intentOfTap`, `decide` (the one change a turn leads to and what the agent says back), `nightsWithoutStay`, `stateAfter`, `readinessNote`.
- `src/use-cases/conversation.ts`: `loadConversation` and `takeTurn`. A typed message is read by the model when it is on and under its cap, otherwise by the rules; a reply that cannot be used, or a failed call, falls back to the rules in the same turn. The change goes through `saveTripFacts`, `addCommitment`, `saveTripAnswer` or `skipFact` inside the replay ledger, with the messages, in one transaction.
- `GET` and `POST /api/v1/trips/{tripId}/conversation`, documented in `docs/api/v1.md`.
- A fix found on the way: the trip's date check accepted a day the month does not have ("2027-02-30"), because parsing rolls it into March. It now refuses it, for the forms as well.
- Walked through the real routes on the development server with the model off and sample places: the whole script from "where" to the last taste question, by tapping, typing and skipping; a repeated request returned its first answer and added nothing; a different request under the same operation id, a stale revision and an answer to the wrong question were each refused.

**Not verified:** any turn read by the real model.

### Piece 4b: Proposals in conversation

**Produced (pull request 27):**

- `loadPlan` holds back a meal proposal in guided planning until the food question is answered or skipped. The plan answer then carries `holding: "food"` and no proposal, and the workspace says what the agent is waiting for (TB-AGT-07, TB-AGT-08).
- A proposal joins the saved conversation the first time its cards are shown, naming the slot with its day and time: "For day 1, lunch at 12:30, I suggest one of these." (TB-AGT-09, TB-AGT-13). `recordPresented` now answers which cards were new, so a proposal is saved once.
- The plan answer carries `shelfOffer`: a shelved place that fits the open slot in focus, in the same city (TB-ITN-14). The screen that shows the offer is piece 6.
- The pace answer sets the plan's pace in the same transaction (`setPlanPace`), and the agent says so.
- The slot words ("Late morning") had two copies; there is now one, `SLOT_WORDS` in the Itinerary contracts.
- `src/use-cases/plan.test.ts`: the plan loader's first unit tests.
- Walked through the real routes on the development server, model off, sample places: the first proposal was saved once; lunch was held back before the food answer and proposed after it; a relaxed pace took a slot off each day; a saved place was offered for the open morning and placed there.

**TB-AGT-10** (the order of filling) is met by what Milestone 4 built plus this piece: fixed commitments are laid out first, sights are proposed before meals, and gaps become time to wander. Stays are covered by the agent saying how many nights have no booked stay (decision 7), not by proposing hotels.

**Not built:** the day-shape answer (early starts or late nights) does not move the day's start time yet.

### Piece 5: Taste in the ranking and the reasons

**Produces:** the trip profile as an input to `proposeCards` (interests, atmosphere, food); reasons that name what the traveller said and what about the slot (TB-RSN-02).

### Piece 6: The conversation on screen

**Produces:** the thread in the workspace: the agent's messages, the traveller's answers, the question waiting with its tap choices and a box to type in, skip, and the limited-mode notice.

### Piece 7: Evidence

- [ ] `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` pass.
- [ ] Browser walk with the model off, wide and phone widths; no serious accessibility findings.
- [ ] Each requirement checked and recorded in the roadmap's Milestone 5 entry, with what is only partly met.
- [ ] `docs/status/current-implementation.md` and `docs/api/v1.md` updated.

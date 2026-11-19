# Requirements and their evidence

Status: evidence
Authority: What each requirement of sections 2 to 13 of the [catalogue](../requirements.md) rests on, as of the end of Milestone 8. Code, tests and the two reports named here override this page if they disagree.
Related: [roadmap](../roadmap.md), [current implementation](../status/current-implementation.md), [sample travellers](sample-travellers.md), [design checks](design-checks.md)
Last reviewed: 2026-11-19

**116 of 130 are met and 14 are partly met. None is unbuilt.** Each partly met line says what is missing.

## What "met" means here

Built, and checked by unit tests or by a walk of the real site on the development database, with sample places and the AI model switched off. It does not mean any of these, which nobody has done yet:

- **The QA gate.** No requirement has passed it. Every feature built since the last gate is a `candidate` in `qa/feature-states.json`.
- **The real AI model.** No request has been made with a real key.
- **The real place services.** No request has been made to OpenStreetMap from the app.
- **WebKit, a real phone, a screen reader.** The design checks ran in Chromium and Firefox.
- **Production, signed in.** Only the signed-out pages of the live site were looked at.

## What was run for this page (2026-11-19)

- `npm run lint`, `npm run typecheck`, `npm test` (796 tests) and `npm run build`: all pass.
- `npm run quality:samples`: eight plans, 0 failed checks, identical to the report in the repository.
- `npm run quality:design`: 56 of 56 checks in Chromium and in Firefox; WebKit could not start on this machine.
- The 25 walks kept from Milestones 4 to 8 were run again. 24 ran to the end without an error. The Milestone 6 walk of the Profile page stops at a pace chip that Milestone 8 replaced with a slider; the three Milestone 8 walks of that page pass.

## 2. Accounts and Home

| Requirement | State | Evidence, and what is missing                                                                                                                                   |
| ----------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TB-ACC-01   | Met   | Route and authorization tests: no session answers 401, another traveller's trip answers 404. Memory isolation between two travellers was walked in Milestone 6. |
| TB-ACC-02   | Met   | The [design checks](design-checks.md) open Home, Create and Profile; the navigation is a list of links.                                                         |
| TB-HOM-01   | Met   | Home walk. The picture is drawn: there are no photos yet.                                                                                                       |
| TB-HOM-02   | Met   | A trip opens on its waiting question, its first open slot or its brief step; a build left part-way goes on (walks of Milestones 5 and 7).                       |
| TB-HOM-03   | Met   | Route tests and the Milestone 4 walk: rename, archive, restore, delete after a confirmation.                                                                    |
| TB-HOM-04   | Met   | Checked in the Milestone 3 walk; not walked again with an empty account.                                                                                        |
| TB-HOM-05   | Met   | `trip-rules.test.ts`: planning, upcoming, past, by the clock of the trip's last city.                                                                           |

## 3. Starting a trip and trip facts

| Requirement | State          | Evidence, and what is missing                                                                                                                                   |
| ----------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TB-STA-01   | Met            | The Create page in the Milestone 4 walk and in the design checks; `routes.test.ts` for starting a trip.                                                         |
| TB-STA-02   | Met            | `trip-rules.test.ts`: the ticket schema.                                                                                                                        |
| TB-STA-03   | Met            | `trip-rules.test.ts` (`factsFromTickets`); the Okafors in the [sample travellers](sample-travellers.md): two flights kept as decided, dates and city from them. |
| TB-STA-04   | Met            | `routes.test.ts`; the [sample travellers](sample-travellers.md) start each trip both ways.                                                                      |
| TB-FAC-01   | Met            | Trip schema tests in `trip-rules.test.ts`; `brief.test.ts`; route tests.                                                                                        |
| TB-FAC-02   | Met            | `brief.test.ts`; brief walk (dates fixed or can move, budget fixed or can stretch).                                                                             |
| TB-FAC-03   | Met            | Brief tests and walk (purpose).                                                                                                                                 |
| TB-FAC-04   | Met            | `day-plan.test.ts`, `time-zones.test.ts`; Dan and Priya in the [sample travellers](sample-travellers.md): Rome, Florence, Venice with the travel between.       |
| TB-FAC-05   | **Partly met** | City lookup reads OpenStreetMap and is tested against recorded replies. **Missing:** it has never been tried against the live service.                          |

## 4. Fixed commitments

| Requirement | State          | Evidence, and what is missing                                                                                                                                                                              |
| ----------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TB-FIX-01   | Met            | Commitment schema tests in `trip-rules.test.ts`, route tests in `routes.test.ts`; Milestone 3 walk.                                                                                                        |
| TB-FIX-02   | Met            | Commitment schema tests in `trip-rules.test.ts`.                                                                                                                                                           |
| TB-FIX-03   | Met            | `day-plan.test.ts`; "Nothing already decided was moved" in all eight plans of the [sample travellers](sample-travellers.md).                                                                               |
| TB-FIX-04   | Met            | `day-plan.test.ts`: a must-see holds a slot, and one that fits nowhere is listed as still to fit in.                                                                                                       |
| TB-FIX-05   | **Partly met** | A commitment told in conversation goes through the form's own checks. **Missing:** only the AI model can read one, so with the model off the agent points to "Already decided"; the real model is untried. |
| TB-FIX-06   | Met            | `trip-rules.test.ts` (`findClashes`); the brief names clashes.                                                                                                                                             |

## 5. Guided planning

| Requirement | State          | Evidence, and what is missing                                                                                                                                          |
| ----------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TB-AGT-01   | Met            | Conversation tests; Milestone 5 walks (tap, type, skip).                                                                                                               |
| TB-AGT-02   | Met            | Script tests; the [sample travellers](sample-travellers.md) skip every question a traveller has no answer for.                                                         |
| TB-AGT-03   | Met            | Script tests; the Milestone 6 walk of a trip that starts from the profile.                                                                                             |
| TB-AGT-04   | **Partly met** | The agent asks what is decided. **Missing:** recording the answer needs the AI model (see TB-FIX-05).                                                                  |
| TB-AGT-05   | Met            | Script tests: the eight topics.                                                                                                                                        |
| TB-AGT-06   | Met            | Script tests; Milestone 6 walk (a remembered answer is confirmed, not asked).                                                                                          |
| TB-AGT-07   | Met            | Readiness tests; proposal walk of Milestone 5.                                                                                                                         |
| TB-AGT-08   | Met            | Readiness tests.                                                                                                                                                       |
| TB-AGT-09   | Met            | Proposal tests and walk: each names its slot, day and time.                                                                                                            |
| TB-AGT-10   | **Partly met** | Commitments first, sights before meals, gaps as time to wander. **Missing:** stays are not proposed; the agent says how many nights have none booked.                  |
| TB-AGT-11   | **Partly met** | Tapping any slot works. **Missing:** "let's do day 4" in words needs the AI model.                                                                                     |
| TB-AGT-12   | Met            | Script tests; Dan and Priya in the [sample travellers](sample-travellers.md) are asked why this trip differs.                                                          |
| TB-AGT-13   | Met            | Conversation store tests; turn walk of Milestone 5 (same order after reload).                                                                                          |
| TB-AGT-14   | Met            | Typed answers are read by rules and checked before anything changes; the model's reply is checked against a schema, tested with a stand-in. The real model is untried. |
| TB-AGT-15   | Met            | Every check here ran with the model off; the agent says it is in a limited mode.                                                                                       |

## 6. Recommendation cards

| Requirement | State          | Evidence, and what is missing                                                                                                               |
| ----------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| TB-CRD-01   | Met            | `propose.test.ts`, `plan.test.ts`: three cards, fewer when fewer fit.                                                                       |
| TB-CRD-02   | **Partly met** | Name, kind and distance are shown. **Missing:** photos (the picture is drawn) and a price level (OpenStreetMap has none; shown as unknown). |
| TB-CRD-03   | Met            | Postcard tests; the [design checks](design-checks.md) flip a card by click and by keyboard.                                                 |
| TB-CRD-04   | **Partly met** | The closer look shows address and hours. **Missing:** more pictures, price and rating (shown as unknown) and the position in the day.       |
| TB-CRD-05   | Met            | Plan tests; the [design checks](design-checks.md) pick a card and find it in the plan.                                                      |
| TB-CRD-06   | Met            | Plan action tests (save for later); Milestone 4 walk.                                                                                       |
| TB-CRD-07   | Met            | Plan action tests (others, with reasons); Milestone 4 walk.                                                                                 |
| TB-CRD-08   | Met            | `plan.test.ts`, `propose.test.ts`: what was turned down shapes the next set.                                                                |
| TB-CRD-09   | Met            | `propose.test.ts`: a discarded place is not offered again.                                                                                  |
| TB-CRD-10   | Met            | Place route and store tests; Milestone 4 walk.                                                                                              |
| TB-CRD-11   | Met            | Place store tests; Milestone 4 walk (a place added by hand is marked so).                                                                   |
| TB-CRD-12   | Met            | `card-store.test.ts`.                                                                                                                       |

## 7. Live itinerary and scheduling

| Requirement | State          | Evidence, and what is missing                                                                                                                                                                                                                |
| ----------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TB-ITN-01   | Met            | Walks of Milestone 4; the [design checks](design-checks.md) see a pick land.                                                                                                                                                                 |
| TB-ITN-02   | Met            | `day-plan.test.ts`; each itinerary of the [sample travellers](sample-travellers.md) shows times, lengths, the way there and open slots.                                                                                                      |
| TB-ITN-03   | Met            | `day-plan.test.ts`: time to wander, ending where the next decided thing begins.                                                                                                                                                              |
| TB-ITN-04   | Met            | `day-plan.test.ts`; "No rule is broken" in the [sample travellers](sample-travellers.md).                                                                                                                                                    |
| TB-ITN-05   | Met            | `day-plan.test.ts`, `plan.test.ts`: a card is judged at the time the traveller would arrive; unknown hours are said.                                                                                                                         |
| TB-ITN-06   | Met            | `day-plan.test.ts`: the way there plus the pace buffer.                                                                                                                                                                                      |
| TB-ITN-07   | Met            | `day-plan.test.ts`: a place in another city is flagged; nothing is offered while the traveller is on the way.                                                                                                                                |
| TB-ITN-08   | Met            | `day-plan.test.ts`; "The days match the pace" in the [sample travellers](sample-travellers.md); the shape of the day moves the day's start.                                                                                                  |
| TB-ITN-09   | **Partly met** | Moving by the keyboard menu is tested and walked. **Missing:** moving by drag is built but was not checked.                                                                                                                                  |
| TB-ITN-10   | Met            | Plan action tests: a move is kept and flagged with a fix; a move onto something decided is refused.                                                                                                                                          |
| TB-ITN-11   | Met            | Plan action tests; Milestone 4 walk.                                                                                                                                                                                                         |
| TB-ITN-12   | Met            | Plan store tests: versions and undo.                                                                                                                                                                                                         |
| TB-ITN-13   | Met            | `day-plan.test.ts`: a pick whose slot is gone waits on the shelf.                                                                                                                                                                            |
| TB-ITN-14   | Met            | Shelf tests; the agent's offer in `plan.test.ts`.                                                                                                                                                                                            |
| TB-ITN-15   | Met            | `plan.test.ts`: other days are unchanged.                                                                                                                                                                                                    |
| TB-ITN-16   | Met            | `time-zones.test.ts`, `local-time.test.ts`; the [sample travellers](sample-travellers.md) are identical with the server at UTC+14 and UTC-11. Known limit: a trip across the International Date Line eastwards shows the repeated date once. |
| TB-ITN-17   | Met            | Ranking breaks ties by place id (`propose.ts`); the [sample travellers](sample-travellers.md) came out identical in four runs, two of them with the server's clock moved.                                                                    |
| TB-ITN-18   | Met            | `day-plan.test.ts`, `time-zones.test.ts`: provisional dates.                                                                                                                                                                                 |
| TB-ITN-19   | Met            | `day-plan.test.ts`, `time-zones.test.ts`: assumed, not booked, re-timed, replaced by a ticket.                                                                                                                                               |
| TB-ITN-20   | Met            | `day-plan.test.ts`, plan action tests: an estimated length the traveller can set.                                                                                                                                                            |

## 8. Quick plan

| Requirement | State          | Evidence, and what is missing                                                                                                                                      |
| ----------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TB-QPL-01   | Met            | `brief.test.ts`, `brief-steps.test.tsx`; brief walk of Milestone 7.                                                                                                |
| TB-QPL-02   | Met            | Sam in the [sample travellers](sample-travellers.md) builds with only the first step.                                                                              |
| TB-QPL-03   | Met            | `brief.test.ts`: remembered answers with their source, and the daily budget from the Profile page.                                                                 |
| TB-QPL-04   | Met            | `save-brief` tests; brief walk (back, leave, return).                                                                                                              |
| TB-QPL-05   | Met            | `brief-steps.test.tsx`; brief walk.                                                                                                                                |
| TB-QPL-06   | **Partly met** | The box is read by a fixed rule and shown for a yes before use. **Missing:** the AI model does not read it, so most sentences are kept as said and affect nothing. |
| TB-QPL-07   | Met            | `brief.test.ts` (review lines); brief walk.                                                                                                                        |
| TB-QPL-08   | Met            | `build.test.ts`; build walks of Milestone 7 (left part-way and finished on return).                                                                                |
| TB-QPL-09   | Met            | The four Quick plans of the [sample travellers](sample-travellers.md): 0 failed checks.                                                                            |
| TB-QPL-10   | Met            | `build-report.test.ts`; report walk of Milestone 7.                                                                                                                |
| TB-QPL-11   | Met            | Each assumption links to the brief step that changes it. Changing it does not replace places already built.                                                        |
| TB-QPL-12   | Met            | Planning-mode tests; switch walk of Milestone 7.                                                                                                                   |
| TB-QPL-13   | Met            | `build.test.ts` ("Build the rest for me"); build walk.                                                                                                             |

## 9. Memory

| Requirement | State          | Evidence, and what is missing                                                                                                                                                                    |
| ----------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TB-MEM-01   | Met            | Memory store tests; Milestone 6 walks.                                                                                                                                                           |
| TB-MEM-02   | Met            | `tasteInUse` tests; Milestone 6 walk.                                                                                                                                                            |
| TB-MEM-03   | **Partly met** | Pace, day shape, interests, atmosphere, dietary rules, daily budget and getting around are held and used. **Missing:** a food like cannot be stored, because place data says nothing of cuisine. |
| TB-MEM-04   | Met            | Memory contract and store tests.                                                                                                                                                                 |
| TB-MEM-05   | Met            | Limits tests and walk; "No hard limit is broken" in the [sample travellers](sample-travellers.md).                                                                                               |
| TB-MEM-06   | Met            | Reason tests; the [sample travellers](sample-travellers.md) check that a named trip is one of the traveller's.                                                                                   |
| TB-MEM-07   | **Partly met** | A dietary rule told in a trip is offered for every trip, and anything can be told on the Profile page. **Missing:** another general statement typed in conversation needs the AI model.          |
| TB-MEM-08   | Met            | Learning tests; learning walk of Milestone 6.                                                                                                                                                    |
| TB-MEM-09   | Met            | Learning tests.                                                                                                                                                                                  |
| TB-MEM-10   | Met            | Profile rule and store tests.                                                                                                                                                                    |
| TB-MEM-11   | Met            | Profile tests; Profile walks of Milestone 8; the [design checks](design-checks.md) on Profile.                                                                                                   |
| TB-MEM-12   | Met            | Forgotten-evidence tests; profile walk.                                                                                                                                                          |
| TB-MEM-13   | **Partly met** | Every change to either profile is kept in order with its revision. **Missing:** a screen to read the history or go back.                                                                         |
| TB-MEM-14   | Met            | Profile rule tests (notes).                                                                                                                                                                      |

## 10. Reasons

| Requirement | State | Evidence, and what is missing                                                                                   |
| ----------- | ----- | --------------------------------------------------------------------------------------------------------------- |
| TB-RSN-01   | Met   | Reason tests; the build's report; every reason shown in the [sample travellers](sample-travellers.md) was read. |
| TB-RSN-02   | Met   | "Every reason is true of the traveller and the trip" in the [sample travellers](sample-travellers.md).          |
| TB-RSN-03   | Met   | Reasons are templates over the ranking factors. The model words nothing.                                        |
| TB-RSN-04   | Met   | `propose.test.ts`: one to three sentences.                                                                      |

## 11. Trust

| Requirement | State | Evidence, and what is missing                                                                                        |
| ----------- | ----- | -------------------------------------------------------------------------------------------------------------------- |
| TB-TRU-01   | Met   | "No place is invented" in the [sample travellers](sample-travellers.md); the origin is shown.                        |
| TB-TRU-02   | Met   | The model only reads typed input; place facts come from the place source.                                            |
| TB-TRU-03   | Met   | Model boundary tests with a stand-in. The real model is untried.                                                     |
| TB-TRU-04   | Met   | Ranking and layout are pure functions with tests; the [sample travellers](sample-travellers.md) are repeatable.      |
| TB-TRU-05   | Met   | Card and closer-look tests: unknown is shown as unknown, lengths as estimates.                                       |
| TB-TRU-06   | Met   | Place store tests: an unavailable provider is said and saved places stay usable. A real provider failure is untried. |

## 12. Design and accessibility

| Requirement | State | Evidence, and what is missing                                                                                                            |
| ----------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| TB-DSN-01   | Met   | Paper and serif type are checked by the [design checks](design-checks.md). Whether it looks like a keepsake is the developer's to judge. |
| TB-DSN-02   | Met   | [design checks](design-checks.md): Chromium and Firefox. WebKit not run.                                                                 |
| TB-DSN-03   | Met   | [design checks](design-checks.md): Chromium and Firefox. WebKit not run.                                                                 |
| TB-DSN-04   | Met   | [design checks](design-checks.md) at 390 and 320 px in Chromium and Firefox. No real phone was used.                                     |
| TB-DSN-05   | Met   | [design checks](design-checks.md): Chromium and Firefox. WebKit not run.                                                                 |
| TB-DSN-06   | Met   | [design checks](design-checks.md): Chromium and Firefox. WebKit and the dark colour scheme not run.                                      |
| TB-DSN-07   | Met   | [design checks](design-checks.md): Chromium and Firefox. No screen reader was used.                                                      |
| TB-DSN-08   | Met   | The product owner approved the prototype in Milestone 1.                                                                                 |
| TB-DSN-09   | Met   | Every place in every walk lacks a photo, a price level and a rating, and is shown with a drawn picture and "unknown".                    |

## 13. System

| Requirement | State          | Evidence, and what is missing                                                                                                                                                   |
| ----------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TB-SYS-01   | Met            | ADR-008; each service is imported only through its `index.ts` or `contracts.ts`.                                                                                                |
| TB-SYS-02   | Met            | `prisma/service-ownership.test.ts` and `service-map.json`. The list of exceptions is empty since 2026-11-19.                                                                    |
| TB-SYS-03   | Met            | `eslint.borders.mjs` and the ownership test fail the build on a violation.                                                                                                      |
| TB-SYS-04   | Met            | [API reference](../api/v1.md); route tests; the earlier `/api/trips` routes answer 404.                                                                                         |
| TB-SYS-05   | Met            | Ledger tests in `src/features/planning`; replay walk of Milestone 5.                                                                                                            |
| TB-SYS-06   | Met            | Ledger and trip-action tests; a build picks only what breaks no rule.                                                                                                           |
| TB-SYS-07   | Met            | Ledger tests: a stale revision is refused and changes nothing.                                                                                                                  |
| TB-SYS-08   | Met            | There is no worker. A build is one day per request and resumes.                                                                                                                 |
| TB-SYS-09   | **Partly met** | OpenStreetMap and sample places sit behind one adapter, chosen by configuration. **Missing:** Google, left out on purpose (ADR-009: its terms forbid saving what a plan needs). |
| TB-SYS-10   | Met            | Model boundary tests; everything here ran with it off.                                                                                                                          |
| TB-SYS-11   | Met            | Tests of the monthly AI cost cap and the daily place-request cap. The cap on the provider's account is the developer's to set; neither real service was used.                   |
| TB-SYS-12   | Met            | ADR-009; the attribution is shown.                                                                                                                                              |
| TB-SYS-13   | **Partly met** | A trip records its owner and a visibility setting. **Missing:** a list of who may view, left to the later stage that needs it.                                                  |
| TB-SYS-14   | Met            | Plan store test: a plan is copied into another trip as its first version.                                                                                                       |
| TB-SYS-15   | Met            | The [sample travellers](sample-travellers.md): eight plans, 0 failed checks. PRD 18's sixth point, the developer's reading, is open.                                            |

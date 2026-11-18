# TravleBuddy Active Roadmap

Status: active-roadmap
Authority: Ordered delivery milestones from the current implementation to the first version
Supersedes: The roadmap of 2026-08-09, whose milestones 1 to 7 are replaced by the order below
Related: [Product vision](product-vision.md), [PRD](prd.md), [requirements](requirements.md), [current implementation](status/current-implementation.md), [ADR-008](architecture/adr-008-modular-services-in-one-deployment.md)
Last reviewed: 2026-11-18

This roadmap orders the work toward the first version defined in the [PRD](prd.md). It builds on the existing codebase: sign-in, versioned plans, replay safety and the place-provider layer are kept. The screens and the planning flow are rebuilt.

Each milestone needs its own implementation plan before work starts. This document sets the order and the exit evidence only.

## Working constraints

- Use only the existing `qa` and `main` branches, Neon QA and production databases, and Vercel targets. See [operating constraints](operating-constraints.md).
- The background worker runs only on the developer's machine. Nothing a traveller does may depend on it (TB-SYS-08).
- Keep sample place data available for tests and offline demos at every stage.
- Do not begin a milestone until the previous one's exit evidence is recorded.
- These hold at every milestone and are rechecked at each exit: ownership and authentication (TB-ACC-01), replay safety (TB-SYS-05), all-or-nothing commits (TB-SYS-06), stale-write protection (TB-SYS-07), and an HTTP route for each new action (TB-SYS-04).
- From Milestone 3 on, the service-border exceptions list (`eslint-suppressions.json`) never grows, and shrinks wherever a milestone replaces code ([ADR-010](architecture/adr-010-service-borders-by-shrinking-exceptions.md)). Its count is part of each exit.
- Existing trips and data in the QA and production databases are test data and may be discarded. Old screens and tables are replaced outright, not migrated. The QA migration safety process still applies.

## What happens to earlier plans

- **The adaptive demonstration recording** (the former Milestone 1) is no longer a gate. The adaptive replacement logic is reused for "show me others" on a scheduled item, run inside the request instead of on the worker.
- **The [conversational planning pack](conversational-planning/README.md)** no longer sets the delivery order. Its engineering contracts for operation identifiers, revisions and replay remain a useful reference for Milestones 5 and 7.

## Milestone 0: Provider and cost check

Read Google's official price list and terms for places, photos, opening hours and routes, and the usage limits of the free OpenStreetMap services for places and routing. Decide which provider the first version runs on: Google if it fits the spending cap, otherwise OpenStreetMap with Google kept ready ([PRD 17](prd.md#17-ai-model-place-data-and-running-cost)). Confirm what place data may be saved under the chosen terms. The product owner sets spending caps on the provider accounts.

Exit evidence: a recorded decision with the figures and sources it rests on, and the caps in place.

## Milestone 1: Clickable prototype

Build the main screens in the agreed look with sample data and no back end, so the product owner can judge the look and the experience before the full build.

Screens: Home, starting a trip, the planning workspace (conversation, three cards with flip and closer look, live itinerary, shelf, fixed commitments), the Quick plan brief and its result report, and the profile page. Wide-screen and phone layouts. Cards are shown both with photos and with illustrations only.

Decisions to settle here: the closer look as enlarged card or overlay; how the itinerary is reached on a phone; the navigation layout.

Exit evidence: the product owner approves the prototype (TB-DSN-08, TB-DSN-09). Agreed colours, type and components are recorded for reuse.

## Milestone 2: Service borders

Apply [ADR-008](architecture/adr-008-modular-services-in-one-deployment.md) without changing behaviour: a table-ownership map that lists foreign keys crossing a border, and automated border checks. The database schema is not changed here.

By [ADR-010](architecture/adr-010-service-borders-by-shrinking-exceptions.md) the existing code is not reworked first. Its violations are recorded as exceptions that may only shrink, new code must be clean, and each later milestone clears the exceptions in the code it replaces. Each service's public interface is written when the service is first rebuilt.

Exit evidence: the ownership map and the checks are in force and fail the build on a new violation; existing tests pass unchanged. TB-SYS-01 to TB-SYS-03 are fully met when the exceptions list is empty, by Milestone 8.

**Done 2026-11-18.** 22 tables mapped to 8 services, 33 cross-border foreign keys listed, 207 exceptions recorded across 55 files; 556 tests pass. Working rules: [service-borders.md](architecture/service-borders.md).

## Milestone 3: New shell, trip start and fixed commitments

Rebuild Home, the navigation and the start-a-trip flow in the new look. Add tickets, trip facts with firmness and purpose, any-city destinations, and the fixed commitments section. Remove the screens these replace.

Exit evidence: TB-ACC, TB-HOM, TB-FAC, TB-STA-01 to TB-STA-03, TB-FIX-01, TB-FIX-02, TB-FIX-06 and TB-SYS-13 pass, on wide and phone screens.

**Built 2026-11-18; exit evidence not yet complete.** [Plan](superpowers/plans/2026-11-18-shell-trip-start-commitments.md), [API reference](api/v1.md).

- Done and checked locally against the development database: the requirements above in a browser on wide and phone widths, no serious accessibility findings, replay, stale-write and ownership rules on every new route; 612 unit tests pass. Border exceptions fell from 207 to 188.
- Still needed for the exit: apply the migration to the QA database through the protected workflow, deploy to the QA preview, run the QA gate, add QA scenarios for the new trip start and fixed commitments, and try city lookup against the live service.
- Partly met: TB-FAC-04 stores several cities, but showing the travel between them belongs to the itinerary in Milestone 4. TB-SYS-13 records the owner and a visibility setting; a list of other viewers is left to the later stage that needs it.
- Left in place on purpose: the earlier preferences, places and itinerary pages, the `/api/trips` routes and the ticket-timing code they use, until Milestones 4 to 6 replace them.

## Milestone 4: Places, cards and the live itinerary

1. Build the chosen provider into the main recommendation path behind the common adapter, with pictures or illustrations, opening hours, travel times and saved place data. The existing Google adapter covers text search only, so most of this is new.
2. Build slot-based scheduling with the rules of PRD 9.3, pace, provisional dates, assumed transfers and estimated visit lengths.
3. Build the postcard cards, the live itinerary, the shelf, moving, swapping and undo.

At the end of this milestone a traveller can build a trip slot by slot from ranked cards, with templated reasons and without the conversation.

**Built 2026-11-18 on branch `milestone/4-places-cards-itinerary`; exit evidence not yet complete.** [Plan](superpowers/plans/2026-11-18-places-cards-itinerary.md), which lists each piece, its feature branch, the requirements it covers and its pull request (12 to 20).

- Done and checked locally: a traveller builds a trip slot by slot from three ranked cards, with reasons, in a live itinerary that obeys the scheduling rules, and can swap, move, shelve, remove, set a visit length and undo. 707 unit tests, lint, type check and build pass; a browser walk on wide and phone widths against the development database found no serious accessibility problems. Border exceptions fell from 188 to 164.
- Checked on sample places only. The OpenStreetMap reader is tested against the documented reply shapes; no request to the real services has been made from the app.
- Partly met: TB-CRD-02 and TB-CRD-04 (no photos yet, so the card shows the postcard back; price level and rating are unknown in OpenStreetMap and shown as unknown; the closer look does not show the position in the day). TB-SYS-09 (Google is not behind the new adapter: its terms forbid saving what a plan needs). TB-ITN-16 (times are local wall-clock values, but a ticket's length across time zones is not worked out). TB-ITN-09 (moving by drag is built as in the prototype but was checked only through the keyboard menu).
- Still needed for the exit: apply migration `20261118120000_places_plans_and_cards` to the QA database, deploy the QA preview, run the QA gate with scenarios for cards and the itinerary, try the real OpenStreetMap services once, and check Firefox and WebKit.
- Waiting for the developer: piece 7b, the removal of the earlier planner's routes, services and tables and the matching QA catalogue entries.

Exit evidence: TB-CRD, TB-ITN except the agent's offer in TB-ITN-14, TB-FIX-03, TB-FIX-04, TB-TRU-01, TB-TRU-02, TB-TRU-04 to TB-TRU-06, TB-SYS-08, TB-SYS-09, TB-SYS-12, TB-SYS-14 and the place-data half of TB-SYS-11 pass.

## Milestone 5: Guided planning

Add the saved conversation, the AI model boundary with Claude Haiku 5.5, the facts stage, the getting-to-know-you stage, per-topic readiness, slot-first proposals in conversation, worded reasons, and the limited mode.

Exit evidence: TB-AGT except TB-AGT-06 and TB-AGT-12, TB-RSN, TB-FIX-05, TB-TRU-03, the agent's offer in TB-ITN-14, TB-SYS-10 and the AI half of TB-SYS-11 pass. The conversation works with the AI model switched off.

**Built 2026-11-18 on branch `milestone/5-guided-planning`; exit evidence not yet complete.** [Plan](superpowers/plans/2026-11-19-guided-planning.md), which lists each piece, its feature branch, the requirements it covers and its pull request (22 to 30).

- Done and checked locally, with the AI model switched off: the agent asks for the facts it does not have and then for the traveller's taste, one question at a time, answered by tapping, typing or skipping. The conversation is saved in order and is the same after a reload. Sights are proposed as soon as the days can be laid out and meals once the food question is answered. Each proposal names its slot, day and time and joins the thread. The cards follow the interests, atmosphere and way of getting around the traveller told, and every reason names something about the traveller and the slot. A saved place that fits the open slot is offered. 833 unit tests, lint, type check and build pass; a browser walk at wide and phone widths against the development database found no serious accessibility problems.
- The AI model has one job, reading a typed message into structured data that is checked before anything changes. It is behind a switch, off without a key, and capped per month. **No request has been made to the real model:** everything that needs it was tested with a stand-in.
- Met: TB-AGT-01 to 03, 05, 07 to 09, 13 to 15, TB-RSN-01 to 04, TB-TRU-03, the agent's offer in TB-ITN-14, TB-SYS-10, and the AI half of TB-SYS-11 (the cap in the app; the cap on the account is the developer's to set).
- Partly met: TB-AGT-04 and TB-FIX-05 (a commitment told in conversation is added through the form's own checks, but only the model can read one, so with the model off the agent points to "Already decided"). TB-AGT-11 (tapping any slot works always; "let's do day 4" needs the model). TB-AGT-10 (commitments first, sights before meals, gaps as time to wander; for stays the agent says how many nights have none booked and does not propose hotels). TB-AGT-02 and TB-AGT-03 use a default where the requirement also names the personal profile, which is Milestone 6.
- Differs from the PRD on purpose: section 17 has the model also word the agent's messages and the reasons. Both are templates here, so every sentence can be traced to data. To be revisited with the developer.
- Known limits: a food rule is named on every meal card but not enforced, because saved place data has no dietary tags (proposed for Milestone 8). The day-shape answer does not move the day's start. A proposal made by the workspace joins the thread at the next reload or answer.
- Still needed for the exit: apply migration `20261119090000_conversation_and_trip_profile` to the QA database after Milestone 4's, deploy the QA preview, run the QA gate with scenarios for the conversation, make the first real call to the model with a key and a spending limit on the account, and check Firefox, WebKit and a real phone.

## Milestone 6: Memory

Add the personal profile with sources and sureness, hard limits, the question about why a trip differs, learning across trips, and the profile page.

Exit evidence: TB-MEM, TB-AGT-06 and TB-AGT-12 pass, including isolation between travellers and the rule that stated preferences win.

**Built 2026-11-18 on branch `milestone/6-memory`; exit evidence not yet complete.** [Plan](superpowers/plans/2026-11-18-memory.md), which lists each piece, its feature branch, the requirements it covers and its pull request (33 to 43).

- Done and checked locally, with the AI model switched off: each traveller has a personal profile of entries on a fixed set of topics, each with its sureness and its source, and a profile page to see, change, remove, add to and forget it. A new trip starts from the profile: the agent confirms a remembered answer instead of asking, names the trip a memory comes from, and asks once why a trip is different when an answer goes against it. A dietary rule given in a trip is offered for every trip and saved on a yes. A place to eat whose listing conflicts with a dietary rule is never proposed; one that cannot confirm a limit is marked; no card says a place is safe for an allergy. A taste is learned once it shows in two finished, ordinary trips. 972 unit tests, lint, type check and build pass; browser walks of the profile page and of a trip that uses the profile found no serious accessibility problems at wide and phone widths. Border exceptions fell from 164 to 162.
- Met: TB-MEM-01, 02, 04 to 14, TB-AGT-06, TB-AGT-12. Isolation between travellers is tested through the store, the use case and the routes, and was checked on the development database with two travellers. The rule that a stated preference is never overwritten holds in both the rules and the store.
- Partly met: TB-MEM-03 (the profile has the `food` topic but nothing can be put in it: saved place data has nothing about cuisine, so a food like could not affect a suggestion; `budget` holds free words and is not used). TB-MEM-07 (a dietary rule given in a trip is offered for every trip with the model off; any other general statement typed in conversation needs the model; everything can be told on the profile page). TB-MEM-13 (every change to either profile is kept in order with its revision; there is no screen to read the history or go back).
- Differs from the approved prototype: the profile page leaves out the slider cards (pace, start of day, daily budget with currency) and the "How this shaped Tokyo" section, and adds a list of values to pick from. The earlier page's change of account name is gone. For the developer to judge.
- Known limits: places saved before the dietary tags existed count as unknown and are not fetched again; most real listings say nothing about diets, so most meal cards will be marked "not confirmed"; a place the traveller searches for or has already picked is not checked against the limits; a remembered pace does not set the plan's pace until it is confirmed; the trip page does not show that a trip is marked as different.
- Still needed for the exit: apply migrations `20261119100000_personal_profile`, `20261119110000_trip_difference` and `20261119120000_place_dietary_tags` to the QA database after Milestone 5's, deploy the QA preview, run the QA gate with scenarios for memory, read one general statement with the real model, and check Firefox, WebKit and a real phone.
- Left in place on purpose: the earlier preference tables and the code in `src/features/profile` and `src/features/preferences`, until the developer approves their removal.

## Milestone 7: Quick plan

Add the five-step brief, the day-at-a-time build, the result report, and switching between the two ways of planning.

Exit evidence: TB-QPL and TB-STA-04 pass; a build interrupted by closing the page resumes on return.

## Milestone 8: Quality and release

Judge both ways of planning against the four sample travellers of PRD 18. Complete accessibility, phone layouts, time zones, performance and cost-cap checks. Record a portfolio demonstration.

Exit evidence: TB-SYS-15 and TB-DSN-01 to TB-DSN-07 pass; every requirement in sections 2 to 13 of the catalogue has passing evidence; full QA on the existing topology; the demonstration is recorded.

## Later stages

Discover and collections, templates and starting from another itinerary, publishing, observations on Home, planning together, and a phone app follow the first version. Each needs its own product decisions and is listed under TB-LTR in the [requirements](requirements.md#14-later-stages).

# TravleBuddy Active Roadmap

Status: active-roadmap
Authority: Ordered delivery milestones from the current implementation to the first version
Supersedes: The roadmap of 2026-08-09, whose milestones 1 to 7 are replaced by the order below
Related: [Product vision](product-vision.md), [PRD](prd.md), [requirements](requirements.md), [current implementation](status/current-implementation.md), [ADR-008](architecture/adr-008-modular-services-in-one-deployment.md)
Last reviewed: 2026-11-12

This roadmap orders the work toward the first version defined in the [PRD](prd.md). It builds on the existing codebase: sign-in, versioned plans, replay safety and the place-provider layer are kept. The screens and the planning flow are rebuilt.

Each milestone needs its own implementation plan before work starts. This document sets the order and the exit evidence only.

## Working constraints

- Use only the existing `qa` and `main` branches, Neon QA and production databases, and Vercel targets. See [operating constraints](operating-constraints.md).
- The background worker runs only on the developer's machine. Nothing a traveller does may depend on it (TB-SYS-08).
- Keep sample place data available for tests and offline demos at every stage.
- Do not begin a milestone until the previous one's exit evidence is recorded.
- These hold at every milestone and are rechecked at each exit: ownership and authentication (TB-ACC-01), replay safety (TB-SYS-05), all-or-nothing commits (TB-SYS-06), stale-write protection (TB-SYS-07), and an HTTP route for each new action (TB-SYS-04).
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

Apply [ADR-008](architecture/adr-008-modular-services-in-one-deployment.md) to the existing code without changing behaviour: one public interface per service, a table-ownership map that lists foreign keys crossing a border, and an automated border check. Code access is restricted; the database schema is not changed here.

Exit evidence: TB-SYS-01 to TB-SYS-03 hold; existing tests pass unchanged.

## Milestone 3: New shell, trip start and fixed commitments

Rebuild Home, the navigation and the start-a-trip flow in the new look. Add tickets, trip facts with firmness and purpose, any-city destinations, and the fixed commitments section. Remove the screens these replace.

Exit evidence: TB-ACC, TB-HOM, TB-FAC, TB-STA-01 to TB-STA-03, TB-FIX-01, TB-FIX-02, TB-FIX-06 and TB-SYS-13 pass, on wide and phone screens.

## Milestone 4: Places, cards and the live itinerary

1. Build the chosen provider into the main recommendation path behind the common adapter, with pictures or illustrations, opening hours, travel times and saved place data. The existing Google adapter covers text search only, so most of this is new.
2. Build slot-based scheduling with the rules of PRD 9.3, pace, provisional dates, assumed transfers and estimated visit lengths.
3. Build the postcard cards, the live itinerary, the shelf, moving, swapping and undo.

At the end of this milestone a traveller can build a trip slot by slot from ranked cards, with templated reasons and without the conversation.

Exit evidence: TB-CRD, TB-ITN except the agent's offer in TB-ITN-14, TB-FIX-03, TB-FIX-04, TB-TRU-01, TB-TRU-02, TB-TRU-04 to TB-TRU-06, TB-SYS-08, TB-SYS-09, TB-SYS-12, TB-SYS-14 and the place-data half of TB-SYS-11 pass.

## Milestone 5: Guided planning

Add the saved conversation, the AI model boundary with Claude Haiku 5.5, the facts stage, the getting-to-know-you stage, per-topic readiness, slot-first proposals in conversation, worded reasons, and the limited mode.

Exit evidence: TB-AGT except TB-AGT-06 and TB-AGT-12, TB-RSN, TB-FIX-05, TB-TRU-03, the agent's offer in TB-ITN-14, TB-SYS-10 and the AI half of TB-SYS-11 pass. The conversation works with the AI model switched off.

## Milestone 6: Memory

Add the personal profile with sources and sureness, hard limits, the question about why a trip differs, learning across trips, and the profile page.

Exit evidence: TB-MEM, TB-AGT-06 and TB-AGT-12 pass, including isolation between travellers and the rule that stated preferences win.

## Milestone 7: Quick plan

Add the five-step brief, the day-at-a-time build, the result report, and switching between the two ways of planning.

Exit evidence: TB-QPL and TB-STA-04 pass; a build interrupted by closing the page resumes on return.

## Milestone 8: Quality and release

Judge both ways of planning against the four sample travellers of PRD 18. Complete accessibility, phone layouts, time zones, performance and cost-cap checks. Record a portfolio demonstration.

Exit evidence: TB-SYS-15 and TB-DSN-01 to TB-DSN-07 pass; every requirement in sections 2 to 13 of the catalogue has passing evidence; full QA on the existing topology; the demonstration is recorded.

## Later stages

Discover and collections, templates and starting from another itinerary, publishing, observations on Home, planning together, and a phone app follow the first version. Each needs its own product decisions and is listed under TB-LTR in the [requirements](requirements.md#14-later-stages).

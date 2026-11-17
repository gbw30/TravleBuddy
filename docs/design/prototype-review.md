# Prototype Review Guide

Status: operational
Authority: How to review the clickable prototype, and the record of its approval (roadmap Milestone 1, TB-DSN-08 and TB-DSN-09)
Related: [PRD section 15](../prd.md#15-visual-and-interaction-design), [roadmap](../roadmap.md), [visual direction mockup](planning-screen-mockup.html), [provider decision](../architecture/adr-009-place-data-provider.md)
Last reviewed: 2026-11-16

The prototype shows the main screens in the keepsake look with sample data. It has no sign-in, no database and no AI model. Nothing in it is saved beyond the browser tab. Its purpose is to let the product owner judge the look and the experience before the full build.

## How to open it

- **Locally:** run `npm run dev`, then open `/prototype` on the address it prints, for example `http://localhost:3000/prototype`.
- **QA preview:** once the `qa` branch is pushed, open `/prototype` on the existing QA preview address.
- **Production:** `https://travle-buddy.vercel.app/prototype`, live since 2026-11-17 so the approved design can be shown while the working site is rebuilt to match it.

To see the phone layout, narrow the browser window or open it on a phone.

## What to look at

| Screen     | Address                 | What to judge                                                                                                                               |
| ---------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Home       | `/prototype`            | The opening headline and collage, trip cards with photos, the stamp on a finished trip, what the site remembers                             |
| New trip   | `/prototype/new`        | The two ways to plan as picture cards, the main button that follows your choice, adding a ticket on the boarding-pass form                  |
| Planning   | `/prototype/trip`       | The agent's voice, three postcards, the flip, the closer look, picking a card and watching it land, show me others, the shelf, moving items |
| Quick plan | `/prototype/quick-plan` | The five steps, answers filled in from memory with their source, the review, the build, the report                                          |
| Profile    | `/prototype/profile`    | The opening sentence, rules against habits, dragging a habit, confirming a guess, what a memory did to the Tokyo trip, adding one in words  |

Things to try on the planning screen:

1. Click a postcard to flip it and read why it suits you.
2. Pick a card and watch it travel to its slot in the itinerary.
3. Ask for others and give a reason.
4. Save a card for later, then place it from the shelf.
5. Pick Senso-ji Temple for the Day 2 morning, then move it to the Day 1 dinner slot: choose the slot in its "Move to…" list and press Move. The move is saved and flagged, because the temple is closed by then. It is not refused.
6. Try to move a booked item. It has no controls.
7. Use Undo, then Build the rest for me.

## Decisions to make

Each has two versions you can compare by adding a switch to the address.

| Decision                 | Version A                                                 | Version B                                          |
| ------------------------ | --------------------------------------------------------- | -------------------------------------------------- |
| The closer look          | `/prototype/trip` (the card picked up and enlarged)       | `/prototype/trip?look=overlay` (a centred panel)   |
| The itinerary on a phone | `/prototype/trip` (a sheet that pulls up from the bottom) | `/prototype/trip?phone=tab` (a second tab)         |
| Cards without photos     | `/prototype/trip` (photos where they exist)               | `/prototype/trip?photos=off` (postcard backs only) |
| Navigation               | Top bar on every screen size                              | Tell us if you want something else                 |

Switches combine, for example `/prototype/trip?look=overlay&phone=tab&photos=off`.

**About photos.** The first version runs on OpenStreetMap data, which has no photos, ratings or price levels ([ADR-009](../architecture/adr-009-place-data-provider.md)). Decided on 2026-11-15: a place shows a freely licensed Wikimedia Commons photo where one exists, and the back of a postcard where none does. Small restaurants will often have none, which is accepted for now. In the prototype, four places and the three Home trips have photos; every other place shows the postcard back. `?photos=off` shows the postcard back everywhere. Some places have sample ratings and prices, to show how the screens look if Google is switched on later.

## What the prototype does not show

- Real conversation. The message box replies with a fixed sentence.
- Real places or scheduling. The trip is one sample trip to Tokyo, and Quick plan always builds that trip whatever you enter.
- Links between screens. Tickets, commitments and profile changes you add are not carried into the trip, and travel times do not change when you pick or move a place.
- Renaming, archiving and deleting trips on Home.
- An empty Home for a new traveller.
- Saving the Quick plan brief across a page reload.

## Design tokens

Defined in `src/app/globals.css` and checked for readable contrast by `src/app/keepsake-tokens.test.ts`.

| Token             | Value     | Used for                                   |
| ----------------- | --------- | ------------------------------------------ |
| `paper`           | `#f4eee3` | Page background, with a faint paper grain  |
| `ink`             | `#1d1a16` | Text, and the one dark button per decision |
| `muted`           | `#6f665b` | Labels and secondary text                  |
| `card`            | `#fffdf8` | Postcards, ticket stubs, the itinerary     |
| `row`             | `#fffdf8` | Kept for older markup; same as `card`      |
| `row-edge`        | `#d8cfbf` | Kept for older markup                      |
| `terracotta`      | `#a4502c` | The one word a heading picks out, accents  |
| `terracotta-deep` | `#7a3319` | Kept for older markup                      |
| `stamp`           | `#8a2420` | Stamps and warnings                        |
| `stamp-paper`     | `#f8f1e2` | The back of a postcard                     |

Type, decided on 2026-11-16: Fraunces (serif) for headlines, place names and the agent's voice; Geist for reading text and controls; Geist Mono for small labels, stamps and times. Headlines are large, regular weight and tightly spaced, and pick out one word in italic terracotta.

Controls: one dark button per decision; every other control is a quiet underlined link. Every control has a hover, pressed, keyboard-focus and unavailable state. The shared class strings are in `src/components/keepsake/styles.ts`.

Motion: about 150 ms for hover and press, 300 ms for a change of state, 600 ms for content arriving, all on the curve `cubic-bezier(0.22, 1, 0.36, 1)`. With reduced motion requested, movement becomes a short fade. The figures come from twelve sites measured on 2026-11-15; the research board, the typeface options, the control states and the motion storyboard are in `docs/design/mockups-2026-11/images/`.

## Components

All in `src/components/keepsake/`. The first six are built for reuse in the real product.

| Component       | What it is                                                                  |
| --------------- | --------------------------------------------------------------------------- |
| `Postcard`      | A recommendation card that flips, with Pick, Save for later and Closer look |
| `PlaceArt`      | A place's photo, or the back of a postcard when there is none               |
| `TicketStub`    | A booked item                                                               |
| `DayStamp`      | The passport-style stamp for a day, and `Stamp` for other labels            |
| `ItineraryRow`  | A scheduled item, an open slot or time to wander                            |
| `AgentMessage`  | The agent's voice                                                           |
| `CloserLook`    | The fuller view of a place, in two styles                                   |
| `LiveItinerary` | The itinerary by day                                                        |
| `KeepsakeNav`   | Home, Create and Profile                                                    |

The prototype's own screens (`PrototypeWorkspace`, `TripBrief`, `StartTrip`, `ProfileList`) and its sample data in `src/features/prototype/` are for review only and are replaced by the real build.

## Automated checks

`e2e/prototype.spec.ts` walks the prototype on a wide and a phone screen. It covers picking, discarding, moving, undo, the closer look by keyboard, reload, reduced motion, browsers without the card animation, Quick plan, sideways scrolling and an accessibility scan.

```bash
npx playwright test e2e/prototype.spec.ts --project=chromium --project=mobile-chrome
```

If port 3000 is in use, start the app on another port and pass it, for example `QA_BASE_URL=http://127.0.0.1:3210`.

## Known gaps from the code review

A review on 2026-11-12 found these smaller problems. They were left as they are and should be revisited before the keepsake components are reused in the real product. The visual rework on 2026-11-15 changed the look, not the behaviour, so most still apply; it did make travel times read as estimates ("about 25 min") and removed the Home illustrations.

**Accessibility**

- The `?phone=tab` version uses tab roles without the full tab pattern.
- Keyboard focus is lost after Pick, after Choose from the phone sheet, and after Edit or Delete on the profile.
- New agent messages are not announced to screen readers.
- The closer look opens scrolled past the photo on short screens.
- The Swap button mixes a pressed state with a changing label.
- Home illustrations repeat the trip title as an image label.
- Quick plan step 1 errors are not tied to their fields.
- The sample pace pills in the conversation look clickable but are not.
- The message box placeholder and the field borders are low contrast.
- Not tested in Firefox, Safari or with a real screen reader.

**Behaviour and copy**

- A slot with no places left offers no next step.
- The shelf's "Place in…" list is empty once no slot is open.
- Travel times read as exact, not as estimates.
- Visit length is in the sample data but never shown.
- Quick plan number fields accept odd values, such as "03", decimals, or more children than travellers.
- Commitments added in Quick plan step 2 disappear on leaving the step.
- A fast double-click on the last Next starts the build.
- On a phone the picked card fades instead of travelling, because the itinerary is behind the sheet.

**Code and tests**

- Saved prototype state is checked only by size, so a changed sample trip in an old tab could crash the page.
- Two text colour classes sit on one element in `itinerary-row.tsx`.
- `priceLabel` hard-codes the yen sign.
- Class strings are duplicated in `start-trip.tsx` and `profile-list.tsx`.
- The serif font preloads on every existing page.
- The sample photos are still served in production.
- The phone browser test runs at 412px wide, not 390px.
- The accessibility scan covers opening states only, and cannot judge contrast on the textured background.
- No unit test covers removing an item, choosing a slot, picking into a filled slot, or a build that leaves a slot open.

**Left out of the prototype on purpose**

Visit lengths on items, an offered fix on a flagged item, a message when a move onto a booked item is refused, position in the day in the closer look, discarding a single card, and searching for a place by name. All are in the [requirements](../requirements.md) for the real build.

## Approval record

To be filled in by the product owner. Milestone 1 is complete only when this is filled in.

| Item                             | Decision |
| -------------------------------- | -------- |
| Date reviewed                    |          |
| Overall look approved            |          |
| Closer look: enlarged or overlay |          |
| Phone itinerary: sheet or tab    |          |
| Cards without photos acceptable  |          |
| Navigation layout                |          |
| Changes requested                |          |

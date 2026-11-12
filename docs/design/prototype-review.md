# Prototype Review Guide

Status: operational
Authority: How to review the clickable prototype, and the record of its approval (roadmap Milestone 1, TB-DSN-08 and TB-DSN-09)
Related: [PRD section 15](../prd.md#15-visual-and-interaction-design), [roadmap](../roadmap.md), [visual direction mockup](planning-screen-mockup.html), [provider decision](../architecture/adr-009-place-data-provider.md)
Last reviewed: 2026-11-12

The prototype shows the main screens in the keepsake look with sample data. It has no sign-in, no database and no AI model. Nothing in it is saved beyond the browser tab. Its purpose is to let the product owner judge the look and the experience before the full build.

## How to open it

- **Locally:** run `npm run dev`, then open `/prototype` on the address it prints, for example `http://localhost:3000/prototype`.
- **QA preview:** once the `qa` branch is pushed, open `/prototype` on the existing QA preview address.
- **Production:** the prototype returns "not found" there by design.

To see the phone layout, narrow the browser window or open it on a phone.

## What to look at

| Screen     | Address                 | What to judge                                                                                                                               |
| ---------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Home       | `/prototype`            | Trip cards, the three trip states, the stamp on a finished trip                                                                             |
| New trip   | `/prototype/new`        | The tickets question, a ticket shown as a stub, the two ways to plan                                                                        |
| Planning   | `/prototype/trip`       | The agent's voice, three postcards, the flip, the closer look, picking a card and watching it land, show me others, the shelf, moving items |
| Quick plan | `/prototype/quick-plan` | The five steps, answers filled in from memory with their source, the review, the build, the report                                          |
| Profile    | `/prototype/profile`    | What the site remembers, hard limits, where each memory came from, editing and deleting                                                     |

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

| Decision                 | Version A                                                 | Version B                                         |
| ------------------------ | --------------------------------------------------------- | ------------------------------------------------- |
| The closer look          | `/prototype/trip` (the card picked up and enlarged)       | `/prototype/trip?look=overlay` (a centred panel)  |
| The itinerary on a phone | `/prototype/trip` (a sheet that pulls up from the bottom) | `/prototype/trip?phone=tab` (a second tab)        |
| Cards without photos     | `/prototype/trip` (photos where they exist)               | `/prototype/trip?photos=off` (illustrations only) |
| Navigation               | Top bar on wide screens, bottom bar on phones             | Tell us if you want something else                |

Switches combine, for example `/prototype/trip?look=overlay&phone=tab&photos=off`.

**About photos.** The first version runs on OpenStreetMap data, which has no photos, ratings or price levels ([ADR-009](../architecture/adr-009-place-data-provider.md)). The `?photos=off` version is therefore the one the first version will look like. In the prototype, three places have photos and some have sample ratings and prices, to show how the screens look if Google is switched on later.

## What the prototype does not show

- Real conversation. The message box replies with a fixed sentence.
- Real places or scheduling. The trip is one sample trip to Tokyo, and Quick plan always builds that trip whatever you enter.
- Links between screens. Tickets, commitments and profile changes you add are not carried into the trip, and travel times do not change when you pick or move a place.
- Renaming, archiving and deleting trips on Home.
- An empty Home for a new traveller.
- Saving the Quick plan brief across a page reload.

## Design tokens

Defined in `src/app/globals.css` and checked for readable contrast by `src/app/keepsake-tokens.test.ts`.

| Token             | Value     | Used for                                    |
| ----------------- | --------- | ------------------------------------------- |
| `paper`           | `#d9c3a0` | Page background, with a faint diagonal line |
| `ink`             | `#2b2622` | Text                                        |
| `card`            | `#ffffff` | Postcards and ticket stubs                  |
| `row`             | `#fffaf0` | Itinerary rows and panels                   |
| `row-edge`        | `#cdbb98` | Row and field borders                       |
| `terracotta`      | `#b4542f` | Accents on white or cream                   |
| `terracotta-deep` | `#7a3319` | Buttons, and accents on the paper           |
| `stamp`           | `#8a2420` | Stamps and warnings                         |
| `stamp-paper`     | `#fdf8ec` | The back of a postcard, the stamp corner    |

Type: Lora (serif) for headings and body, Geist for small labels, Geist Mono for stamps.

## Components

All in `src/components/keepsake/`. The first six are built for reuse in the real product.

| Component       | What it is                                                                  |
| --------------- | --------------------------------------------------------------------------- |
| `Postcard`      | A recommendation card that flips, with Pick, Save for later and Closer look |
| `PlaceArt`      | A place's photo, or a poster-style illustration when there is none          |
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

# TravleBuddy Product Requirements Document

Status: canonical-target
Authority: Detailed target behaviour of the first version, and the outline of later stages
Related: [Product vision](product-vision.md), [requirements catalogue](requirements.md), [roadmap](roadmap.md), [architecture](architecture/README.md), [current implementation](status/current-implementation.md)
Last reviewed: 2026-11-12

## 1. How to read this document

- The [vision](product-vision.md) says why. This document says what the product does, flow by flow. The [requirements catalogue](requirements.md) turns it into numbered, testable statements.
- If the three disagree, the requirements catalogue wins, then this document, then the vision. Fix the disagreement when you find one.
- This document describes the target. It does not claim anything is built.
- Items marked **(builder's call)** are left to the builder. Items marked **(default)** are starting values chosen during specification that may be tuned with evidence.

## 2. Scope

| Area                                                       | First version | Later |
| ---------------------------------------------------------- | ------------- | ----- |
| Accounts, Home with a list of trips                        | Yes           |       |
| Starting a trip, with or without tickets                   | Yes           |       |
| Guided planning (the agent conversation)                   | Yes           |       |
| Postcard recommendation cards                              | Yes           |       |
| Live itinerary, save-for-later shelf, moving items         | Yes           |       |
| Fixed commitments                                          | Yes           |       |
| Trips across several cities                                | Yes           |       |
| Memory: personal profile, trip profile, profile page       | Yes           |       |
| Quick plan (trip brief, full itinerary generated)          | Yes           |       |
| The keepsake visual design, usable on a phone browser      | Yes           |       |
| Discover, public itineraries, collections, photo uploads   |               | Yes   |
| Prebuilt templates, starting from someone else's itinerary |               | Yes   |
| Publishing your own trip                                   |               | Yes   |
| Observations on Home beyond a list of trips                |               | Yes   |
| Planning together with other people                        |               | Yes   |
| A phone app                                                |               | Yes   |

Booking or paying for anything is outside the product at every stage listed here.

## 3. App structure

The app has four areas, in the manner of a social app:

- **Home:** your trips.
- **Discover:** other people's trips. Later stage. The first version does not show this tab.
- **Create:** start a new trip.
- **Profile:** your account and what the site remembers about you.

On a wide screen these sit in a top or side bar. On a phone they sit in a bottom bar. **(builder's call)**

## 4. Home

- Lists the traveller's trips as cards: destination, dates, a picture, and a state of **planning**, **upcoming** or **past**.
- A trip is **planning** until the traveller marks the plan as finished. It is then **upcoming** until its last day, and **past** after that. A finished plan can be reopened.
- A trip that is still being planned shows how far along it is and opens where the traveller left off.
- A clear **New trip** button.
- With no trips yet, Home shows a welcome and the New trip button, not an empty table.
- A traveller can rename, archive and delete a trip. Delete asks for confirmation.

## 5. Starting a trip

Starting a trip is two short steps.

**Step 1: Do you already have tickets?**

- **Yes:** enter each flight or train: type, from, to, departure date and time, arrival date and time, and an optional booking reference. Each becomes a fixed commitment ([section 10](#10-fixed-commitments)), and together they set the trip's dates and cities.
- **Not yet:** go straight on.

**Step 2: How do you want to plan?**

- **Guided planning:** talk it through with the agent ([section 7](#7-guided-planning)).
- **Quick plan:** fill in a short trip brief and have the whole trip built ([section 11](#11-quick-plan)).

Later stages add two more choices to this step: start from a template, and start from someone else's itinerary. The screen must have room for them.

The choice is not a commitment. The traveller can switch between the two at any time ([section 11.5](#115-moving-between-the-two-ways-of-planning)).

## 6. The planning workspace

Each trip has one workspace. Both ways of planning use it.

- **The conversation** with the agent, including the cards it proposes.
- **The live itinerary**, visible at the same time on a wide screen. On a phone it is one tap or swipe away and shows a count of changes since last viewed. **(builder's call on the exact pattern)**
- **The shelf** of places saved for later.
- **Fixed commitments.**

Everything in the workspace is saved as it happens. Reloading or returning days later shows the same state.

## 7. Guided planning

The agent behaves like a travel agent getting to know a client. It works in two stages, then starts proposing.

### 7.1 How the traveller answers

- Every question can be answered by **tapping a choice** or by **typing**. Tap choices never prevent typing.
- Question forms: pick one, pick several, this-or-that, a scale, and open text.
- Any question can be skipped. The agent then uses what it remembers, or a sensible default, and says which.
- The traveller can type anything at any time, including things the agent did not ask: "I've booked teamLab for Thursday at 3."

### 7.2 Stage one: the facts

The agent starts from whatever it already has (tickets, the profile, anything typed) and asks only for what is missing:

- **Where:** one or more cities, in order, with nights in each. A destination can be any city the place provider knows; there is no fixed list.
- **When:** dates, or a length and a rough time of year.
- **Who:** number of travellers, and whether any are children.
- **Budget:** an amount for the trip or per day, and the currency.
- **How firm each of these is.** For example, the dates are fixed but the budget can stretch.
- **Anything already decided:** hotels, reservations, must-see sights. The agent asks directly, because people forget. Answers become fixed commitments.
- **The purpose of the trip,** such as a holiday, a honeymoon or a family visit.

### 7.3 Stage two: getting to know you

The agent asks about taste for this trip, one topic at a time:

- **Pace:** how packed the days should be, and how much time to leave for wandering.
- **Day shape:** early starts or late nights.
- **Interests:** for example museums and exhibitions, nature and activities, shopping, nightlife.
- **Atmosphere:** lively or quiet.
- **Food:** likes, dislikes, dietary rules and allergies.
- **Getting around:** walking, public transport, taxis, a hire car.
- **Where to stay:** type of place, and any hotel loyalty programme.
- **Breakfast:** where they stay, suggested places, or none.
- **How the budget should be spent:** for example saving on hotels to spend on food.

When the agent already remembers something, it confirms instead of asking from scratch: "Last time you liked slow days. Same for this trip?"

### 7.4 When it starts proposing

- Readiness is judged **per topic**. When the agent knows enough about food, it proposes meals, even if questions about hotels remain.
- The agent says when it is switching: "I think I know enough to suggest some lunch places."
- If it cannot propose yet, it says what it still needs.

### 7.5 Slot-first proposals

The agent proposes for a **specific slot** in the itinerary, with the day and time already set: "For lunch on Day 2 at 12:30, I suggest one of these."

It fills the trip in this order:

1. Fixed commitments, which are placed before anything else.
2. Where to stay, for any night without a booked stay.
3. The main sights or activities for each day.
4. Meals.
5. The gaps: smaller stops nearby, or time to wander with a suggested area.

The traveller can redirect at any time: tap any empty or filled slot to get proposals for it, or say "let's do Day 4 first."

### 7.6 When this trip differs from the profile

- When an answer conflicts with the personal profile, the agent asks why this trip is different, usually by asking about its purpose.
- The answer is recorded on the trip, and the trip's value is used.
- The traveller can state the purpose and character of a trip easily at any point, not only when asked.

### 7.7 When the AI model is unavailable

Guided planning still works. Questions come from a fixed script with tap choices, typed answers are read by simple rules, and reasons are written from templates. The agent says it is running in a limited mode.

## 8. Recommendation cards

### 8.1 A proposal

- A proposal is **three cards**. If fewer than three real places fit, the agent shows the ones that do and says so. It never pads the set.
- A place the traveller has discarded does not come back in the same trip unless they ask or change what they want.

### 8.2 The card

- **Front:** the place name, a representative picture, and one line of essentials such as type, price level and distance from the previous stop.
- **Back:** clicking the card flips it. The back holds a short summary and the reason it suits this traveller and this slot ([section 13](#13-reasons)).
- **A closer look:** a button under the card opens fuller detail: more pictures, address, opening hours, price, rating, and where it sits relative to the rest of the day. Whether this is an enlarged card or a centred overlay is decided in the prototype ([roadmap](roadmap.md), Milestone 1).

### 8.3 What the traveller can do

- **Pick** a card. It moves into the slot in the itinerary.
- **Save for later.** The card goes to the shelf without being scheduled.
- **Show me others.** The set is replaced. The traveller may say why, by tapping common reasons or typing their own. Reasons can apply to the whole set or to one card.
- **Add my own.** The traveller searches for a place by name and adds it to the slot or the shelf. If the provider does not know the place, the traveller can enter it by hand; it is then marked as added by them.

**Common reasons (default list):** too expensive, too far, not my taste, already been, too touristy, too busy or loud, wrong time of day, something else.

Reasons feed the trip profile immediately, and the next proposal reflects them.

## 9. The live itinerary

### 9.1 What it shows

- One section per day, marked with a stamp naming the city and day.
- **Scheduled items** in time order, each with a start time and a duration.
- **Travel between items**, with the means and the minutes.
- **Time to wander or rest**, shown as its own block, with a suggested area when there is one.
- **Booked items** as ticket stubs. They are locked in place.
- **Open slots**, shown dashed. The one being chosen now is marked.
- **Travel between cities** on the day it happens.

### 9.2 What the traveller can do

- **Move** any item that is not booked to another slot or day, by dragging or by a "move to" menu that works with a keyboard.
- **Swap** an item: ask for three alternatives for that slot.
- **Remove** any item that is not booked. Booked items are changed in fixed commitments.
- **Undo** the last change. Every change creates a saved version of the plan.
- **Tap an item** to see its card again, including the reason.

After a move, the plan is rechecked. The traveller is in control, so a move that breaks a rule is still saved: the item is flagged with the reason and an offered fix, and the move is never silently reversed. The one exception is a move onto a booked item, which is refused with an explanation.

### 9.3 The rules every plan must pass

These are fixed rules applied by the scheduling service. The AI model cannot override them. Anything the agent proposes or builds must pass all of them. A change made by the traveller that breaks one is saved with a flag ([9.2](#92-what-the-traveller-can-do)).

1. Items do not overlap.
2. Each place is open for the whole of its slot, where hours are known. Unknown hours are flagged, not assumed.
3. There is enough travel time between consecutive items, by the traveller's preferred means.
4. Fixed commitments stay exactly where they are.
5. Each item is in the city the traveller is in at that time.
6. The day fits the chosen pace and day shape.
7. Times are in the local time of the place, including across time zones and clock changes.
8. Time allowed for airports and stations is shown as an allowance, not hidden.
9. With a confirmed stay, the day starts and ends there, and the way back counts toward the end of the day.

### 9.4 Pace

Pace is a measured preference that shapes each day.

| Pace (default values) | Main sights or activities per day | Buffer added to each travel leg | Wander or rest time            |
| --------------------- | --------------------------------- | ------------------------------- | ------------------------------ |
| Packed                | Up to 4                           | 10 minutes                      | None required                  |
| Balanced              | Up to 3                           | 20 minutes                      | At least 60 minutes in the day |
| Relaxed               | Up to 2                           | 30 minutes                      | At least 2 hours in the day    |

When the pace leaves room, the agent proposes areas worth walking around, not only venues.

Default day: 09:00 to 21:30, lunch between 11:30 and 14:00, dinner between 18:00 and 21:00. Day shape preferences shift these. Breakfast, when wanted, starts between 07:30 and 10:00 and takes 45 minutes. Around a ticket: a flight allows 120 minutes before and 60 after; a train, bus or ferry 30 before and 20 after.

### 9.5 The shelf

- Holds places saved for later, with their cards.
- The agent offers to fit a shelved place where it suits: "Sometaro from your shelf would work for Day 3 lunch."
- The traveller can drag a shelved place into any slot.

### 9.6 Items that cannot be scheduled

A chosen place that cannot be fitted is never dropped. It goes to the shelf with the reason.

### 9.7 When dates, transfers or durations are not yet known

- **No exact dates yet.** Scheduling needs dates, because opening hours depend on the day of the week. When the traveller has given only a length and a rough time of year, the agent proposes provisional dates and says so: "I'll plan as if you arrive on Monday 12 May. Change this any time." Changing the dates rechecks the whole plan.
- **No tickets between cities yet.** The agent adds an assumed transfer on the day the traveller changes city, with an estimated travel time and a default midday departure. It is marked as assumed and not booked, and can be moved or replaced by a real ticket.
- **How long a visit takes.** No provider supplies this. Each kind of place has a standard visit length **(default table, builder's call)**, shown as an estimate, which the traveller can change on any item.

## 10. Fixed commitments

A separate section of the workspace for things already decided.

- **Kinds:** transport, stay, reservation, must-see, other.
- **Details:** name or place, date, optional start and end time, optional booking reference, optional note.
- **With a time,** a commitment is locked into the itinerary and shown as a ticket stub.
- **Without a time,** it is a must-include. The agent schedules it before anything optional and may not drop it.
- A commitment can be added, edited or removed at any time, from this section or by telling the agent.
- If two commitments clash, the traveller is told at once. The agent does not choose between them.

## 11. Quick plan

Quick plan is the same planning by a different route. The traveller writes a short **trip brief**, the agent builds the whole itinerary, and the traveller refines it in the same workspace. It asks the same things the agent would ask in conversation; it only presents them all at once.

### 11.1 The brief

Five short steps with a visible progress marker. Each step fits on one screen without long scrolling.

| Step               | What it asks                                                                                                          | Required         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 1. Where and when  | Cities in order with nights in each; dates, or a length and rough time of year; number of travellers and any children | Yes              |
| 2. Already decided | Fixed commitments. Tickets from the start step are already listed. Add stays, reservations and must-sees              | No               |
| 3. This trip       | Purpose of the trip; budget and currency; how firm the dates and budget are                                           | No               |
| 4. Your style      | Pace, day shape, interests, atmosphere, food including allergies, getting around, where to stay                       | No               |
| 5. Review          | The whole brief on one page in plain sentences, with a link to edit each part, and a box for anything else to mention | Confirm to build |

### 11.2 What makes it easy

- **It is filled in before you start.** Anything the personal profile knows is already entered and tagged with its source: "from your Tokyo trip." Changing it here affects only this trip.
- **Only step 1 is required.** Skipped answers fall back to the profile, then to a sensible default. The result lists every assumption made.
- **Tapping over typing.** Choices are chips, sliders and pickers. Text boxes are for names and notes.
- **Plain words and immediate checks.** A problem is explained next to the field as soon as it appears, such as an end date before a start date.
- **Nothing is lost.** The brief is saved at every step. The traveller can go back, leave and return.
- **The free-text box is understood.** Whatever is typed under "anything else" is turned into preferences and shown back for confirmation before it is used.

### 11.3 Building the trip

- **Build my trip** builds the itinerary one day at a time while the page is open. Each day is saved as soon as it is built and appears in the live itinerary, with visible progress.
- If the traveller leaves part-way, the days already built are kept and the build resumes when they return.
- Nothing a traveller does, here or elsewhere in the product, depends on a separately running background worker ([ADR-008](architecture/adr-008-modular-services-in-one-deployment.md)).
- The build follows the same order and the same rules as Guided planning ([7.5](#75-slot-first-proposals), [9.3](#93-the-rules-every-plan-must-pass)). For each slot it takes the top-ranked place.

### 11.4 The result

The traveller lands in the normal workspace. The agent opens with a short report:

- **What it built,** in two or three sentences.
- **What it assumed,** each with a way to change it.
- **What it could not fit,** now on the shelf with reasons.
- **Where it was unsure,** offered as a choice: "Two dinner places were close for Day 3. Want to pick?"

Every item carries its reason. Any slot can be swapped for three alternatives. Everything can be moved.

### 11.5 Moving between the two ways of planning

- From the brief: **Talk it through instead** opens the conversation with everything entered so far already known.
- From the conversation: **Build the rest for me** fills every remaining open slot, and reports as in 11.4.
- Both write to the same trip profile and the same itinerary.

## 12. Memory

### 12.1 Two profiles

- **The personal profile** belongs to the traveller and carries across trips. It is a starting hint.
- **The trip profile** belongs to one trip. It is built during planning, starts from the personal profile, and always wins when the two disagree.

### 12.2 What the personal profile holds

Pace; day shape; interests; atmosphere; food likes and dislikes; dietary rules and allergies; usual budget range; getting around; where the traveller likes to stay, including loyalty programmes.

Each entry records:

- **What it is,** in plain words.
- **Its kind:** a **hard limit**, such as an allergy or an access need, or a **taste**.
- **How sure the site is,** in plain words such as "I think", "usually" and "always".
- **Where it came from:** which trip, or "you told me".

Hard limits are never broken by a proposal. Tastes are weighed.

Two limits on what this can promise:

- **Place data is patchy.** A place whose data conflicts with a hard limit is never proposed. A place whose data cannot confirm it either way may be proposed with a clear note, such as "could not confirm vegetarian options". The product never claims a place is safe for an allergy; the card says to check with the venue.
- **The profile is a fixed set of topics the ranking rules understand,** listed above. Something the traveller says that fits a topic becomes an entry. Something that does not fit, such as "I hate queues", is kept as a note on the profile, shown to the traveller as noted and not yet affecting suggestions.

### 12.3 How it is used

- It fills in answers and shapes proposals from the first message of a new trip.
- Whenever a memory from another trip is used, the agent says so: "I remember this from your Tokyo trip."
- On a first trip there is no memory, and the agent says it is starting fresh.

### 12.4 How it learns

- Something the traveller states about themselves in general ("I'm vegetarian") is added at once, after a one-tap confirmation.
- Tastes shown through choices and discards are recorded on the trip profile. When the same pattern shows across two or more ordinary trips, it is added to the personal profile, or its sureness rises.
- A trip counts toward learning once its plan is marked as finished.
- A trip the traveller has marked as different, with a reason such as a honeymoon, teaches the personal profile nothing through behaviour. A general statement made during such a trip ("I'm vegetarian") is still added.
- An explicit statement always beats something learned from behaviour.

### 12.5 The profile page

- Lists everything the site believes, grouped by topic, with source and sureness.
- The traveller can edit or delete any entry, add their own, and reset everything.
- A deleted entry is not learned again from the same past evidence.

## 13. Reasons

Every proposal and every change the agent makes to the plan has a reason the traveller can read.

- A reason names **what about the traveller** it rests on (a preference, a hard limit, a past choice) and **what about the trip** (the slot, the distance from the previous stop, the budget left).
- A reason that uses memory from another trip names the trip.
- A reason is built from the factors that actually ranked the place. The AI model words it; it does not make up the grounds.
- A reason is one to three sentences.

## 14. Trust

1. **Every place is real.** A place shown to the traveller comes from the place-data provider, or was added by the traveller and is marked as such.
2. **The AI model never supplies facts about a place.** Names, addresses, hours, prices, ratings, pictures and travel times come from data.
3. **The AI model never writes to the plan directly.** It reads what the traveller typed and words what the agent says. Fixed rules decide what is eligible, how it is ranked and what is scheduled.
4. **The same inputs give the same proposals.** Ranking and scheduling are repeatable.
5. **Unknowns are shown as unknown, and estimates are labelled.** Missing hours are stated, not guessed. Where the provider gives only a price level, costs are estimated from a standard table and shown as estimates; the same applies to visit lengths. The budget left is always described as approximate.
6. **When a provider is unavailable,** the agent says so and keeps the current plan. It does not fill the gap with made-up results.

## 15. Visual and interaction design

### 15.1 Direction

Clean and premium, with a travel-keepsake character. The reference is [design/planning-screen-mockup.html](design/planning-screen-mockup.html). It is a rough sketch that fixes the direction, not a finished design.

| Element              | Treatment                                                                             |
| -------------------- | ------------------------------------------------------------------------------------- |
| Page background      | Warm paper tone with a faint texture                                                  |
| Type                 | Serif for headings and body; a plain sans-serif for small labels                      |
| Recommendation cards | Postcards: white border, picture, a stamp in the corner; the back is ruled            |
| Agent messages       | Set in italic, in a calm voice                                                        |
| Booked items         | Ticket stubs: white, a dashed tear line, a BOOKED mark                                |
| Day marker           | A passport-style stamp, slightly rotated, for example TOKYO · DAY 2                   |
| Itinerary rows       | Cream rows with a clear edge against the paper; the open slot is dashed               |
| Accent colour        | Terracotta                                                                            |
| Pictures             | Real photos where a freely licensed one exists; the back of a postcard when none does |
| Layout               | Calm and spacious. Keepsakes are the objects handled, not decoration                  |

### 15.2 Motion

- A card flips on click.
- A picked card travels to its slot in the itinerary.
- The closer look feels like picking the card up.
- Motion is brief and can be turned off by the device's reduced-motion setting.

### 15.3 Screens and devices

- Every screen works on a phone browser from the first version.
- On a phone the three cards may become a swipeable row. **(builder's call)**

### 15.4 Accessibility

- Everything can be done with a keyboard, including flipping a card and moving an item.
- Text on the paper background and on cards meets WCAG AA contrast.
- Cards, stamps and ticket stubs have text equivalents for screen readers.
- Nothing is conveyed by colour alone.

### 15.5 Seeing it early

Because the look can only be judged by seeing it, a clickable prototype of the main screens is built and approved before the full build ([roadmap](roadmap.md), Milestone 1).

## 16. Later stages, and the room the first version leaves for them

| Later feature                   | What the first version does to leave room                                         |
| ------------------------------- | --------------------------------------------------------------------------------- |
| Discover and public itineraries | A trip has a visibility setting, private by default and not changeable yet        |
| Starting from a template        | An itinerary can be copied into a new trip as a starting point                    |
| Photo uploads                   | Itinerary items and trips can carry pictures from more than one source            |
| Publishing                      | The navigation and the profile are shaped for a public face                       |
| A phone app                     | Everything the website does goes through a documented interface an app could call |
| Planning together               | A trip records who owns it separately from who may see it                         |

## 17. AI model, place data and running cost

- **AI model:** Anthropic Claude Haiku 5.5 (`claude-haiku-5-5`), chosen for low cost. It is used for reading typed answers, wording the agent's messages and wording reasons.
- **Place data:** the first version runs on **OpenStreetMap data**. Google Places and Routes were preferred but do not fit: under the usage model they cost about 83 US dollars a month against the cap of 20, and Google's terms do not allow saving the place details a saved itinerary needs. Google stays as a second provider behind the same layer, to switch on when there are funds. See [ADR-009](architecture/adr-009-place-data-provider.md).
- **What OpenStreetMap means for the product:** it has no photos, so cards show a freely licensed Wikimedia Commons photo where one exists and the back of a postcard where none does; ratings and price levels are absent and shown as unknown, so ranking cannot use them; opening hours exist only where mappers entered them; travel times are estimated from distance. Every screen showing place data credits OpenStreetMap contributors.
- **What exists today:** the Google adapter covers text search only. Pictures, hours, travel times and the OpenStreetMap adapter all still have to be built.
- **Verified on 2026-11-12.** Official prices and terms are recorded in [ADR-009](architecture/adr-009-place-data-provider.md). Expected running cost at 30 trips a month is under one US dollar, nearly all of it the AI model.
- **Spending cap (default):** 20 US dollars a month in total at the portfolio stage, enforced by a cap on each paid account and by a limit in the app. With OpenStreetMap as the provider, the only paid account is the AI model's.
- **The two caps are separate.** When the AI cap is reached, the agent runs in limited mode ([7.7](#77-when-the-ai-model-is-unavailable)). When the place-data cap is reached, proposals use saved and sample places only, and the agent says new places cannot be looked up until the cap resets. Neither switches off the other.
- **Saved place data:** place details are kept after the first lookup to avoid paying twice, within what the provider's terms allow.
- **Sample data stays** for automated tests and offline demos.

## 18. Judging itinerary quality

"The plan is good" is judged against five sample travellers. Each is planned with both Guided planning and Quick plan.

| Sample                                                                                                                | What it tests                                        |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Maya: alone, six days in Tokyo, mid budget, vegetarian, slow pace, food-led                                           | A hard limit, pace, and a first trip with no memory  |
| The Okafors: two adults and children of 7 and 11, five days in Lisbon, flights booked, early dinners                  | Tickets, a party with children, day shape            |
| Dan and Priya: honeymoon, nine days by train through Rome, Florence and Venice, high budget, unlike Dan's profile     | Several cities, a trip that differs from the profile |
| Sam: returning user, three-day city break, Quick plan with only step 1 filled                                         | Memory, defaults, and the report of assumptions      |
| Lena: alone, four nights in Rome, a same-day flight there and back from London, public transport, breakfast suggested | A ticket that crosses a time zone, and breakfast     |

For each sample:

- No place is invented.
- No rule in [9.3](#93-the-rules-every-plan-must-pass) is broken.
- No hard limit is broken.
- The days match the pace.
- Every reason refers to something true about the traveller or the trip.
- The developer reads the itinerary and would follow it.

## 19. Calls made during specification

These were decided by the specification author, not stated by the product owner, and are open to change:

1. The first version does not show the Discover tab.
2. Fewer than three cards are shown when fewer than three real places fit.
3. A traveller can add a place by hand that the provider does not know, marked as theirs.
4. The values in the pace table, the default day and the meal windows.
5. The default list of discard reasons.
6. The personal profile changes from behaviour only after the same pattern shows in two or more ordinary trips.
7. Ranking and scheduling use fixed rules; the AI model only reads and words.
8. The spending cap of 20 US dollars a month.
9. Travel time is estimated from distance when no routing data is available, and is labelled as an estimate.
10. The five sample travellers.
11. A traveller's own move is saved with a flag when it breaks a rule; only a move onto a booked item is refused.
12. Provisional dates and assumed transfers when the real ones are not yet known.
13. Costs and visit lengths may be estimated from standard tables and are labelled as estimates.
14. Places that cannot be confirmed against a hard limit are shown with a note; the product never claims allergy safety.
15. The profile is a fixed set of topics; statements that do not fit are kept as notes that do not yet affect suggestions.
16. A trip counts toward learning once its plan is marked as finished.

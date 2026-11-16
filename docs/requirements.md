# TravleBuddy Target Requirements

Status: canonical-target
Authority: Numbered, testable requirements for the target product. Wins over the PRD and the vision where they disagree
Supersedes: [Target requirements of August 2026](history/target-requirements-2026-08.md) and its `TB-FR-01` to `TB-FR-35` identifiers, which are retired
Related: [Product vision](product-vision.md), [PRD](prd.md), [roadmap](roadmap.md), [architecture](architecture/README.md), [current implementation](status/current-implementation.md)
Last reviewed: 2026-11-12

## 1. Authority and interpretation

- This catalogue defines what the first version must do, in statements a builder can test. The [PRD](prd.md) explains each area in detail; section references such as "PRD 9.3" point there.
- It describes the target, whether or not a capability exists today. Repository reality is recorded in [current-implementation.md](status/current-implementation.md).
- Identifiers are stable. A removed requirement keeps its number and is marked withdrawn.
- "Traveller" means the signed-in person planning the trip. "Agent" means the product's planning assistant as the traveller experiences it. "AI model" means the language model behind part of the agent.
- Requirements under [section 14](#14-later-stages) are not part of the first version.

## 2. Accounts and Home (PRD 3, 4)

| ID        | Requirement                                                                                                                                   |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| TB-ACC-01 | A traveller can sign in and sign out, and can reach only their own trips and profile.                                                         |
| TB-ACC-02 | The app has Home, Create and Profile areas. A Discover area can be added without restructuring the navigation.                                |
| TB-HOM-01 | Home lists the traveller's trips with destination, dates, a picture and a state of planning, upcoming or past.                                |
| TB-HOM-02 | Opening a trip that is being planned returns the traveller to where they left off.                                                            |
| TB-HOM-03 | A traveller can rename, archive and delete a trip. Delete requires confirmation.                                                              |
| TB-HOM-04 | With no trips, Home shows a welcome and a way to start a trip.                                                                                |
| TB-HOM-05 | A trip is planning until the traveller marks its plan finished, then upcoming until its last day, then past. A finished plan can be reopened. |

## 3. Starting a trip and trip facts (PRD 5, 7.2)

| ID        | Requirement                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| TB-STA-01 | Starting a trip asks whether the traveller already holds flight or train tickets.                                                           |
| TB-STA-02 | Entered tickets record type, origin, destination, departure and arrival date and time, and an optional reference.                           |
| TB-STA-03 | Entered tickets become fixed commitments and set the trip's dates and cities.                                                               |
| TB-STA-04 | The traveller chooses Guided planning or Quick plan. The start screen can take further choices later.                                       |
| TB-FAC-01 | A trip stores ordered cities with nights in each, dates or a length with a rough time of year, travellers including children, and a budget. |
| TB-FAC-02 | A trip stores how firm its dates and its budget are.                                                                                        |
| TB-FAC-03 | A trip stores its purpose.                                                                                                                  |
| TB-FAC-04 | A trip can cover several cities, and the plan shows the travel between them.                                                                |
| TB-FAC-05 | A destination can be any city the place provider knows. There is no fixed list of cities.                                                   |

## 4. Fixed commitments (PRD 10)

| ID        | Requirement                                                                                                     |
| --------- | --------------------------------------------------------------------------------------------------------------- |
| TB-FIX-01 | A traveller can add, edit and remove fixed commitments of kind transport, stay, reservation, must-see or other. |
| TB-FIX-02 | A commitment records a name or place, a date, an optional start and end time, an optional reference and a note. |
| TB-FIX-03 | A commitment with a time is locked into the itinerary and no automatic action moves or removes it.              |
| TB-FIX-04 | A commitment without a time is scheduled before any optional item and is never dropped.                         |
| TB-FIX-05 | A commitment can be created by telling the agent in conversation.                                               |
| TB-FIX-06 | When two commitments clash, the traveller is told immediately and the product does not choose between them.     |

## 5. Guided planning (PRD 7)

| ID        | Requirement                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| TB-AGT-01 | Every agent question can be answered by tapping a choice or by typing.                                                         |
| TB-AGT-02 | Any question can be skipped. The agent then uses the profile or a default and says which.                                      |
| TB-AGT-03 | The agent asks only for facts it does not already have from tickets, the profile or earlier messages.                          |
| TB-AGT-04 | The agent asks whether anything is already decided and records the answers as fixed commitments.                               |
| TB-AGT-05 | The agent covers pace, day shape, interests, atmosphere, food, getting around, where to stay and budget priorities.            |
| TB-AGT-06 | Where the profile already holds an answer, the agent confirms it instead of asking from scratch.                               |
| TB-AGT-07 | Readiness to propose is judged per topic, and the agent proposes for a topic as soon as that topic is ready.                   |
| TB-AGT-08 | When the agent cannot propose yet, it says what it still needs.                                                                |
| TB-AGT-09 | Each proposal is for a named slot with a day and a time.                                                                       |
| TB-AGT-10 | Slots are filled in the order fixed commitments, stays, main sights or activities, meals, then gaps.                           |
| TB-AGT-11 | The traveller can direct the agent to any slot or day at any time.                                                             |
| TB-AGT-12 | When an answer conflicts with the personal profile, the agent asks why this trip is different and records the answer.          |
| TB-AGT-13 | The conversation, including proposals and answers, is saved in order and restored on reload.                                   |
| TB-AGT-14 | Typed input is turned into validated structured data before it changes any trip fact, preference or plan.                      |
| TB-AGT-15 | With the AI model unavailable, Guided planning continues with scripted questions and template reasons, and says it is limited. |

## 6. Recommendation cards (PRD 8)

| ID        | Requirement                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------ |
| TB-CRD-01 | A proposal shows three cards. With fewer than three eligible places it shows those and says so.                          |
| TB-CRD-02 | The front of a card shows the place name, a picture, and essentials including type, price level and distance.            |
| TB-CRD-03 | Clicking a card flips it to a summary and the reason it suits the traveller and the slot.                                |
| TB-CRD-04 | A control under the card opens a closer look with more pictures, address, hours, price, rating and position in the day.  |
| TB-CRD-05 | Picking a card schedules it in the proposed slot.                                                                        |
| TB-CRD-06 | A card can be saved to the shelf without being scheduled.                                                                |
| TB-CRD-07 | The traveller can ask for a different set, optionally giving reasons from a list or in their own words, per set or card. |
| TB-CRD-08 | Discard reasons update the trip profile and affect the next proposal.                                                    |
| TB-CRD-09 | A discarded place is not proposed again in the same trip unless the traveller asks or changes the relevant preference.   |
| TB-CRD-10 | The traveller can search for a place by name and add it to a slot or the shelf.                                          |
| TB-CRD-11 | A place unknown to the provider can be entered by hand and is marked as added by the traveller.                          |
| TB-CRD-12 | Presented, picked, saved and discarded cards remain on record for the trip.                                              |

## 7. Live itinerary and scheduling (PRD 9)

| ID        | Requirement                                                                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TB-ITN-01 | The itinerary is visible during planning and updates as soon as a change is saved.                                                                                        |
| TB-ITN-02 | Each day shows scheduled items with start time and duration, travel between items with means and minutes, and open slots.                                                 |
| TB-ITN-03 | Time to wander or rest is shown as its own block, with a suggested area when one exists.                                                                                  |
| TB-ITN-04 | Items do not overlap.                                                                                                                                                     |
| TB-ITN-05 | An item is scheduled only when the place is open for the whole slot. Unknown hours are flagged.                                                                           |
| TB-ITN-06 | Consecutive items are separated by at least the travel time by the traveller's preferred means, plus the pace buffer.                                                     |
| TB-ITN-07 | An item is scheduled only on a day and time when the traveller is in that city.                                                                                           |
| TB-ITN-08 | Each day respects the trip's pace and day shape.                                                                                                                          |
| TB-ITN-09 | The traveller can move any item that is not locked, by dragging and by a keyboard-operable control.                                                                       |
| TB-ITN-10 | After a traveller's move the plan is rechecked. A broken rule is flagged with a reason and an offered fix and the move stays saved. A move onto a locked item is refused. |
| TB-ITN-11 | The traveller can ask for three alternatives for any slot, and can remove any item that is not locked.                                                                    |
| TB-ITN-12 | Every change creates a saved version, and the traveller can undo the last change.                                                                                         |
| TB-ITN-13 | A chosen place that cannot be scheduled is placed on the shelf with the reason and is never dropped.                                                                      |
| TB-ITN-14 | The shelf lists saved places. The agent offers to schedule them where they fit, and the traveller can place them directly.                                                |
| TB-ITN-15 | A planning action changes only the items it concerns. Unrelated days and items stay as they were.                                                                         |
| TB-ITN-16 | All times are stored and shown in the local time of the place, and are correct across time zones and clock changes.                                                       |
| TB-ITN-17 | Scheduling is repeatable: the same trip state and the same request produce the same plan.                                                                                 |
| TB-ITN-18 | When a trip has no exact dates, the agent proposes provisional dates, says so, and rechecks the plan when they change.                                                    |
| TB-ITN-19 | When no ticket covers a change of city, the plan holds an assumed transfer marked as not booked, which can be moved or replaced.                                          |
| TB-ITN-20 | Each item has a visit length from a standard table by kind of place, shown as an estimate and editable by the traveller.                                                  |

## 8. Quick plan (PRD 11)

| ID        | Requirement                                                                                                                                        |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| TB-QPL-01 | Quick plan collects a trip brief in five steps: where and when, already decided, this trip, your style, review.                                    |
| TB-QPL-02 | Only the first step is required.                                                                                                                   |
| TB-QPL-03 | Answers known from the personal profile are filled in and labelled with their source. Changing them affects only this trip.                        |
| TB-QPL-04 | The brief is saved at every step, and the traveller can go back or return later without losing answers.                                            |
| TB-QPL-05 | Problems with an answer are explained beside the field when they occur.                                                                            |
| TB-QPL-06 | Free text entered in the brief is turned into preferences and shown for confirmation before use.                                                   |
| TB-QPL-07 | The review step shows the whole brief in plain sentences with a way to edit each part.                                                             |
| TB-QPL-08 | Building proceeds one day at a time while the page is open, shows progress, saves each day as it is built, and resumes when the traveller returns. |
| TB-QPL-09 | The built itinerary obeys every scheduling rule in section 7 and every trust rule in section 11.                                                   |
| TB-QPL-10 | The result opens in the normal workspace with a report of what was built, assumed, left on the shelf and uncertain.                                |
| TB-QPL-11 | Every assumption in the report can be changed from the report.                                                                                     |
| TB-QPL-12 | The traveller can switch from the brief to the conversation, keeping everything entered.                                                           |
| TB-QPL-13 | From the conversation, the traveller can ask the agent to fill all remaining open slots.                                                           |

## 9. Memory (PRD 12)

| ID        | Requirement                                                                                                                                                                                                |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TB-MEM-01 | Each traveller has a personal profile that carries across trips, and each trip has its own trip profile.                                                                                                   |
| TB-MEM-02 | A trip profile starts from the personal profile. Where they differ, the trip profile is used.                                                                                                              |
| TB-MEM-03 | The personal profile covers pace, day shape, interests, atmosphere, food, dietary rules, budget, getting around and stays.                                                                                 |
| TB-MEM-04 | Each profile entry records its value, whether it is a hard limit or a taste, how sure the site is, and where it came from.                                                                                 |
| TB-MEM-05 | No proposal or built plan includes a place whose data conflicts with a hard limit. A place whose data cannot confirm a hard limit is marked unconfirmed, and no place is described as safe for an allergy. |
| TB-MEM-06 | When the agent uses a memory from another trip, it names that trip.                                                                                                                                        |
| TB-MEM-07 | A general statement the traveller makes about themselves is added to the personal profile after confirmation.                                                                                              |
| TB-MEM-08 | A taste learned from behaviour reaches the personal profile only after the pattern shows in two or more ordinary trips whose plans were marked finished.                                                   |
| TB-MEM-09 | Behaviour in a trip marked as different does not change the personal profile. General statements made during it still follow TB-MEM-07.                                                                    |
| TB-MEM-10 | A stated preference is never overwritten by a learned one.                                                                                                                                                 |
| TB-MEM-11 | The profile page lists every entry with source and sureness, and lets the traveller edit, delete, add and reset.                                                                                           |
| TB-MEM-12 | A deleted entry is not learned again from the same past evidence.                                                                                                                                          |
| TB-MEM-13 | Changes to either profile are versioned.                                                                                                                                                                   |
| TB-MEM-14 | Profile entries belong to a fixed set of topics that ranking understands. A statement that fits none is kept as a note, shown as not yet affecting suggestions.                                            |

## 10. Reasons (PRD 13)

| ID        | Requirement                                                                                                |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| TB-RSN-01 | Every proposed card and every change the agent makes to the plan has a reason the traveller can read.      |
| TB-RSN-02 | A reason names at least one thing about the traveller and one about the trip or slot.                      |
| TB-RSN-03 | A reason is produced from the factors that ranked the place. The AI model may word it but not add grounds. |
| TB-RSN-04 | A reason is one to three sentences.                                                                        |

## 11. Trust (PRD 14)

| ID        | Requirement                                                                                                            |
| --------- | ---------------------------------------------------------------------------------------------------------------------- |
| TB-TRU-01 | Every place shown comes from a place-data provider or was entered by the traveller and is marked so.                   |
| TB-TRU-02 | Place facts (name, address, hours, price, rating, pictures, travel time) come only from data, never from the AI model. |
| TB-TRU-03 | AI model output is validated against a schema and cannot write trip facts, preferences or the plan directly.           |
| TB-TRU-04 | Eligibility, ranking and scheduling are decided by fixed rules, and the same inputs give the same proposals.           |
| TB-TRU-05 | Unknown place facts are shown as unknown. Estimated costs and visit lengths are labelled as estimates.                 |
| TB-TRU-06 | When a provider is unavailable, the agent says so, keeps the current plan and does not show made-up results.           |

## 12. Design and accessibility (PRD 15)

| ID        | Requirement                                                                                                                   |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| TB-DSN-01 | The interface follows the keepsake direction: paper background, serif type, postcard cards, ticket-stub bookings, day stamps. |
| TB-DSN-02 | A card flips on click, and a picked card visibly moves to its slot.                                                           |
| TB-DSN-03 | Motion respects the device's reduced-motion setting.                                                                          |
| TB-DSN-04 | Every screen is usable on a phone browser.                                                                                    |
| TB-DSN-05 | Every action can be performed with a keyboard.                                                                                |
| TB-DSN-06 | Text meets WCAG AA contrast, and no information is carried by colour alone.                                                   |
| TB-DSN-07 | Cards, stamps and ticket stubs expose text equivalents to screen readers.                                                     |
| TB-DSN-08 | A clickable prototype of the main screens is approved by the product owner before the full interface is built.                |
| TB-DSN-09 | Cards and the closer look are presentable when a place has no photo, price level or rating.                                   |

## 13. System (PRD 16, 17; [ADR-008](architecture/adr-008-modular-services-in-one-deployment.md))

| ID        | Requirement                                                                                                                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TB-SYS-01 | The application is one deployment divided into services with defined interfaces, as set out in ADR-008.                                                                                                  |
| TB-SYS-02 | Each database table is owned by one service, and no other service reads or writes it directly.                                                                                                           |
| TB-SYS-03 | Service borders are enforced by an automated check that fails the build when broken.                                                                                                                     |
| TB-SYS-04 | Every action that changes data, and every read the browser makes after a page loads, goes through a documented HTTP route. Server-rendered pages may call service interfaces directly.                   |
| TB-SYS-05 | A planning action carries an operation identifier and the plan revision it expects. Repeating it returns the original result.                                                                            |
| TB-SYS-06 | A planning action commits completely or not at all. A plan made by the agent replaces the current one only after passing every scheduling rule; a traveller's own change commits with flags (TB-ITN-10). |
| TB-SYS-07 | Stale or late work cannot overwrite a newer plan.                                                                                                                                                        |
| TB-SYS-08 | No traveller-facing action depends on a separately running worker. Long work is split into steps that each finish within one request, are saved, and can be resumed after a reload.                      |
| TB-SYS-09 | Place providers sit behind a common adapter with Google, OpenStreetMap and sample-data implementations, and the active one is chosen by configuration.                                                   |
| TB-SYS-10 | The AI model sits behind a boundary that can be switched off, with the limited mode of TB-AGT-15 as the fallback.                                                                                        |
| TB-SYS-11 | Spending on the AI model and on place data is capped separately. At the AI cap the agent runs in limited mode; at the place-data cap proposals use saved and sample places and the agent says so.        |
| TB-SYS-12 | Saved place data is kept only as the provider's terms allow.                                                                                                                                             |
| TB-SYS-13 | A trip records a visibility setting, private in the first version, and its owner separately from who may view it.                                                                                        |
| TB-SYS-14 | The Itinerary service can copy an itinerary into a new trip. No screen exposes this in the first version.                                                                                                |
| TB-SYS-15 | Itinerary quality is checked against the four sample travellers in PRD 18 before the first version is called complete.                                                                                   |

## 14. Later stages

Not part of the first version. Listed so that nothing built now blocks them. See [PRD 16](prd.md#16-later-stages-and-the-room-the-first-version-leaves-for-them).

| ID        | Requirement                                                                                  |
| --------- | -------------------------------------------------------------------------------------------- |
| TB-LTR-01 | Travellers can search and browse public itineraries, view their photos and details.          |
| TB-LTR-02 | Travellers can save itineraries to collections.                                              |
| TB-LTR-03 | A trip can be started from a prebuilt template or from another traveller's public itinerary. |
| TB-LTR-04 | Travellers can upload photos to their trips.                                                 |
| TB-LTR-05 | Travellers can publish a trip.                                                               |
| TB-LTR-06 | Home shows observations drawn from the traveller's trips.                                    |
| TB-LTR-07 | Several people can plan one trip together.                                                   |
| TB-LTR-08 | A phone app uses the same HTTP interface as the website.                                     |

## 15. Implementation status

This catalogue makes no claim that any requirement is built. Consult [current implementation status](status/current-implementation.md), the code and tests, and [QA feature states](../qa/feature-states.json) before describing a capability as delivered.

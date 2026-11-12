# TravleBuddy Product Vision

Status: canonical-target
Authority: Why TravleBuddy exists, who it is for, and what the experience must feel like
Supersedes: The compatibility pointer formerly at this path and the vision section of the [August 2026 target requirements](history/target-requirements-2026-08.md)
Related: [Product requirements document](prd.md), [requirements catalogue](requirements.md), [roadmap](roadmap.md), [current implementation](status/current-implementation.md)
Last reviewed: 2026-11-12

This document says why the product exists and what it must feel like. The [PRD](prd.md) describes the behaviour in detail. The [requirements catalogue](requirements.md) lists what a builder tests against. None of the three claims that anything is built; see [current implementation](status/current-implementation.md) for that.

## 1. The product in one paragraph

TravleBuddy is a personal travel agent on the web. It gets to know you through a short conversation, proposes real places that suit you, and builds your itinerary in front of you as you choose. It remembers what you like from one trip to the next and tells you when it is using that memory. Later, it becomes a place where travellers publish their trips and build new ones from each other's.

## 2. Why someone would choose it over a general chatbot

A general AI chatbot can write a plausible itinerary in seconds. TravleBuddy has to be better in ways a chatbot cannot match:

1. **It remembers you.** Pace, food, budget, how you get around and where you like to stay carry over between trips. The agent says where each memory came from: "I remember this from your Tokyo trip."
2. **You watch the plan being built.** Every choice drops into a visible, timed itinerary that already accounts for travel time and rest. A chatbot gives you a wall of text to copy somewhere else.
3. **You can trust it.** Every place is real and comes from a place-data provider. Every day has been checked against opening hours and travel times, so it can be followed.
4. **Later: real trips from real people.** A library of published itineraries to explore, save and build on.

If the product does not deliver the first three, there is no reason for it to exist.

## 3. Who it is for

- **First:** a leisure traveller planning their own trip, alone or on behalf of a small party such as a partner, family or friends. One person does the planning.
- **Later:** travellers who want to share finished trips and browse other people's, and parties who want to plan together.

## 4. The experience

1. You sign in and land on **Home**, which shows your trips and a button to start a new one.
2. You **start a trip** by saying whether you already hold flight or train tickets, then choose how to plan.
3. In **Guided planning**, the agent first confirms the facts (where, when, who, budget, what is already booked), then gets to know your taste for this trip.
4. As soon as it knows enough about one topic, it **proposes three places for a specific slot**: "For lunch on Day 2 at 12:30, I suggest these." Each is a postcard. Flip it to read why it suits you.
5. You pick one and it **drops into the itinerary**, timed, with travel time around it. You can also save it for later, or ask for three others and say why.
6. In **Quick plan**, you fill in a short trip brief instead, and the agent builds the whole itinerary for you to refine.
7. Your **profile** shows everything the site believes about you and where it learned it. You can correct any of it.

## 5. Experience principles

These decide the many small choices this document does not list.

1. **It behaves like a travel agent, not a search box.** It asks, listens, goes away to find things, and comes back with a short list and a reason.
2. **The plan is always visible and always current.** The itinerary is on screen during planning and changes the moment you choose.
3. **It always says why.** Every proposal and every change to the plan carries a reason tied to you and to the trip.
4. **It remembers, and says where from.** Memory is never silent. It is shown, attributed and editable.
5. **This trip wins.** What you say about the current trip always beats what the site remembers about you.
6. **The traveller stays in control.** Anything can be moved, swapped, removed or added by hand. The agent never discards a choice you made.
7. **It never invents.** Places, addresses, hours and prices come from data, not from the AI model.
8. **It feels like travel.** The screen should remind you of postcards, tickets and passport stamps, while staying calm and easy to read.

## 6. Look and feel

The agreed direction is **clean and premium with a travel-keepsake character**:

- A warm paper background and serif type.
- Recommendation cards as postcards: picture on the front, the written side on the back.
- Booked items as ticket stubs.
- A passport-style stamp marking each day, and later each finished trip.
- A calm, spacious layout. The keepsakes are the objects you handle, not decoration covering the page.

The reference mockup is [design/planning-screen-mockup.html](design/planning-screen-mockup.html). The PRD's [design section](prd.md#15-visual-and-interaction-design) holds the detail.

## 7. Stages

| Stage                | What it adds                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------- |
| 1. Planner           | Everything in section 4. This is the first version.                                          |
| 2. Discover          | Search other travellers' public trips, view their photos, save trips to collections.         |
| 3. Build from a trip | Start a new trip from a prebuilt template or from someone else's public itinerary.           |
| 4. Publish           | Share your own trip with photos, in a quiet, visual style closer to VSCO than to a busy feed |
| 5. Beyond            | Planning together with other people, richer observations on Home, and a phone app.           |

The app is laid out for these stages from the start: Home, Discover, Create and Profile, in the manner of a social app. Stage 1 ships Home, Create and Profile.

## 8. What success looks like

- **Now:** a portfolio project. A stranger can plan a real five-day trip from start to finish, would follow the result, and can see at a glance that this is not a chatbot wrapper.
- **In a year:** an application people return to as a habit, to the degree people use VSCO.

## 9. What would make it a failure

Even if every feature works, the product has failed if any of these is true:

- **The itinerary is poor.** It ignores what the traveller said or reads as generic.
- **A place does not exist**, or its details are made up.
- **A day cannot be followed** because of closed venues, impossible travel times or overlapping items.
- **The look or the experience is not what was pictured.** It is bland, form-heavy or confusing.

## 10. What it is not

- Not a booking engine. It plans; it does not sell tickets or rooms.
- Not an automatic planner that hides its reasoning or overrides the traveller.
- Not a general chatbot with a travel theme.
- Not a busy social feed. The social side is about trips and pictures.

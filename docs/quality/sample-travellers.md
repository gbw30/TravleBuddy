# The sample travellers

Status: evidence
Authority: What the checks of PRD 18 found. Written by `npm run quality:samples`; do not edit by hand.
Related: [PRD 18](../prd.md#18-judging-itinerary-quality), [requirements](../requirements.md) TB-SYS-15

Each traveller of PRD 18 is planned twice against the sample places: by Guided planning, where the traveller picks every slot from the cards offered, and by Quick plan, where the site builds the trip. The AI model is off.

A machine checks five of PRD 18's six points on each plan, and that no day is left without a meal. The sixth point is the developer's: **read the itinerary; would you follow it?**

Two limits of the sample places show in the itineraries, and are not faults of the plan:

- There are six sample restaurant names, repeated from area to area. A name on several days is a different place each time.
- Every sample city but Tokyo has nine sights. A long or packed trip has more slots than that, so some stay open.

| Traveller | Way | Places | Checks |
| --- | --- | --- | --- |
| Maya | Guided planning | 29 | all pass |
| Maya | Quick plan | 29 | all pass |
| The Okafors | Guided planning | 18 | all pass |
| The Okafors | Quick plan | 18 | all pass |
| Dan and Priya | Guided planning | 31 | all pass |
| Dan and Priya | Quick plan | 31 | all pass |
| Sam | Guided planning | 15 | all pass |
| Sam | Quick plan | 15 | all pass |
| Lena | Guided planning | 21 | all pass |
| Lena | Quick plan | 21 | all pass |

## Maya

Alone, six days in Tokyo, mid budget, vegetarian, slow pace, food-led. *Tests: A hard limit, pace, and a first trip with no memory.*

### Guided planning

| Check | Result | What was found |
| --- | --- | --- |
| No place is invented | pass | 29 places, each one the place source knows, none twice |
| No rule is broken | pass | no place carries a broken-rule flag |
| Nothing already decided was moved | pass | 1 decided, each where it was |
| No hard limit is broken | pass | no meal is at a place that says it does not serve vegetarian food |
| Every day has its meals | pass | no meal asked for is left open |
| Each ticket lasts its real length | pass | no ticket to measure |
| The days match the pace | pass | relaxed: no day has more than 2 sights or activities |
| Every reason is true of the traveller and the trip | pass | 81 reasons read, sentence by sentence |

Pace: relaxed. Shape of the day: I will start the days at about nine. Interests: markets and shopping. Atmosphere: I will mix lively and quiet places. Food: vegetarian.

**Day 1, Mon 10 May, Tokyo**

- 09:00  Breakfast: **Corner Bakery** (45 min)
- 10:40  Morning: **Mori Art Museum** (120 min), 25 min transit to get there
- 13:22  Lunch: **Corner Noodles** (75 min), 12 min walk to get there
- 14:37  Time to wander around Corner Noodles (120 min)
- 17:51  Afternoon: **Yanaka Ginza** (60 min), 44 min transit to get there [opening hours not known]
- 19:39  Dinner: **Market Kitchen** (75 min), 18 min walk to get there

**Day 2, Tue 11 May, Tokyo**

- 09:00  Breakfast: **Sunrise Cafe** (45 min)
- 10:49  Morning: **Shinjuku Gyoen** (60 min), 34 min transit to get there
- 12:30  Lunch: **Harbour Canteen** (75 min), 5 min walk to get there
- 13:45  Time to wander around Harbour Canteen (120 min)
- 16:50  Afternoon: **Nezu Shrine** (45 min), 35 min transit to get there [opening hours not known]
- 19:00  Dinner: **Corner Noodles** (75 min), 15 min walk to get there

**Day 3, Wed 12 May, Tokyo**

- 09:00  Breakfast: **Sunrise Cafe** (45 min)
- 10:45  Morning: **Senso-ji** (45 min), 30 min transit to get there
- 12:30  Lunch: **Market Kitchen** (75 min), 15 min walk to get there
- 13:45  Time to wander around Market Kitchen (75 min)
- 15:00  Already decided: teamLab Planets
- 19:00  Dinner: **Corner Noodles** (75 min)

**Day 4, Thu 13 May, Tokyo**

- 09:00  Breakfast: **Corner Bakery** (45 min)
- 10:48  Morning: **Shibuya Sky** (30 min), 33 min transit to get there
- 12:30  Lunch: **Morning Cafe** (45 min), 6 min walk to get there
- 13:45  Time to wander around Morning Cafe (120 min)
- 17:14  Afternoon: **Tokyo Skytree** (30 min), 59 min transit to get there
- 19:00  Dinner: **Market Kitchen** (75 min), 22 min walk to get there

**Day 5, Fri 14 May, Tokyo**

- 09:00  Breakfast: **Morning Cafe** (45 min)
- 10:43  Morning: **Tokyo National Museum** (120 min), 28 min transit to get there
- 13:29  Lunch: **Market Kitchen** (75 min), 16 min walk to get there
- 14:44  Time to wander around Market Kitchen (120 min)
- 17:56  Afternoon: **Meiji Jingu** (45 min), 42 min transit to get there [opening hours not known]
- 19:26  Dinner: **Garden Table** (75 min), 15 min walk to get there [opening hours not known]

**Day 6, Sat 15 May, Tokyo**

- 09:00  Breakfast: **Morning Cafe** (45 min)
- 10:43  Morning: **Nezu Museum** (120 min), 28 min transit to get there
- 13:33  Lunch: **Corner Noodles** (75 min), 20 min walk to get there
- 14:48  Time to wander around Corner Noodles (120 min)
- 17:57  Afternoon: **Ueno Park** (60 min), 39 min transit to get there
- 19:50  Dinner: **Corner Noodles** (75 min), 23 min walk to get there

### Quick plan

| Check | Result | What was found |
| --- | --- | --- |
| No place is invented | pass | 29 places, each one the place source knows, none twice |
| No rule is broken | pass | no place carries a broken-rule flag |
| Nothing already decided was moved | pass | 1 decided, each where it was |
| No hard limit is broken | pass | no meal is at a place that says it does not serve vegetarian food |
| Every day has its meals | pass | no meal asked for is left open |
| Each ticket lasts its real length | pass | no ticket to measure |
| The days match the pace | pass | relaxed: no day has more than 2 sights or activities |

Pace: relaxed. Shape of the day: I will start the days at about nine. Interests: markets and shopping. Atmosphere: I will mix lively and quiet places. Food: vegetarian.

**Day 1, Mon 10 May, Tokyo**

- 09:00  Breakfast: **Sunrise Cafe** (45 min)
- 10:30  Morning: **Tsukiji Outer Market** (60 min), 15 min transit to get there
- 12:30  Lunch: **Corner Noodles** (75 min), 12 min walk to get there
- 13:45  Time to wander around Corner Noodles (120 min)
- 16:40  Afternoon: **Mori Art Museum** (120 min), 25 min transit to get there
- 19:15  Dinner: **Market Kitchen** (75 min), 5 min walk to get there

**Day 2, Tue 11 May, Tokyo**

- 09:00  Breakfast: **Corner Bakery** (45 min)
- 10:45  Morning: **Yanaka Ginza** (60 min), 30 min transit to get there [opening hours not known]
- 12:30  Lunch: **Corner Noodles** (75 min), 10 min walk to get there
- 13:45  Time to wander around Corner Noodles (120 min)
- 16:36  Afternoon: **Nezu Shrine** (45 min), 21 min walk to get there [opening hours not known]
- 19:00  Dinner: **Corner Noodles** (75 min), 3 min walk to get there

**Day 3, Wed 12 May, Tokyo**

- 09:00  Breakfast: **Morning Cafe** (45 min)
- 10:33  Morning: **Imperial Palace East Gardens** (60 min), 18 min transit to get there
- 12:30  Lunch: **Market Kitchen** (75 min), 9 min walk to get there
- 13:45  Time to wander around Market Kitchen (75 min)
- 15:00  Already decided: teamLab Planets
- 19:00  Dinner: **Corner Noodles** (75 min)

**Day 4, Thu 13 May, Tokyo**

- 09:00  Breakfast: **Corner Bakery** (45 min)
- 10:47  Morning: **Shinjuku Gyoen** (60 min), 32 min transit to get there
- 12:30  Lunch: **Market Kitchen** (75 min), 12 min walk to get there
- 13:45  Time to wander around Market Kitchen (120 min)
- 16:31  Afternoon: **Meiji Jingu** (45 min), 16 min transit to get there [opening hours not known]
- 19:00  Dinner: **Market Kitchen** (75 min), 10 min walk to get there

**Day 5, Fri 14 May, Tokyo**

- 09:00  Breakfast: **Sunrise Cafe** (45 min)
- 10:47  Morning: **Senso-ji** (45 min), 32 min transit to get there
- 12:30  Lunch: **Market Kitchen** (75 min), 7 min walk to get there
- 13:45  Time to wander around Market Kitchen (120 min)
- 16:37  Afternoon: **Tokyo Skytree** (30 min), 22 min walk to get there
- 19:00  Dinner: **Corner Noodles** (75 min), 3 min walk to get there

**Day 6, Sat 15 May, Tokyo**

- 09:00  Breakfast: **Morning Cafe** (45 min)
- 10:47  Morning: **Shibuya Sky** (30 min), 32 min transit to get there
- 12:30  Lunch: **Corner Noodles** (75 min), 7 min walk to get there
- 13:45  Time to wander around Corner Noodles (120 min)
- 17:02  Afternoon: **Ueno Park** (60 min), 47 min transit to get there
- 19:00  Dinner: **Market Kitchen** (75 min), 10 min walk to get there

**The agent's report**

- Built: 6 days in Tokyo, planned around 1 thing already decided. I chose 29 places: 11 to see and 18 to eat at.
- Assumed: Shape of the day: I will start the days at about nine. Atmosphere: I will mix lively and quiet places. Getting around: I will walk short hops and use public transport for the rest.
- Could not fit: nothing was left over.
- Unsure: Two places were close for breakfast on day 1. I chose Sunrise Cafe. Two places were close for lunch on day 1. I chose Corner Noodles. Two places were close for breakfast on day 2. I chose Corner Bakery. 11 more choices were close too. Sunrise Cafe, Corner Bakery and Morning Cafe do not say whether vegetarian food is served. Check before you go. I do not know the opening hours of Yanaka Ginza, Nezu Shrine and Meiji Jingu. Check before you go.

## The Okafors

Two adults and children of 7 and 11, five days in Lisbon, flights booked, early dinners. *Tests: Tickets, a party with children, day shape.*

### Guided planning

| Check | Result | What was found |
| --- | --- | --- |
| No place is invented | pass | 18 places, each one the place source knows, none twice |
| No rule is broken | pass | no place carries a broken-rule flag |
| Nothing already decided was moved | pass | 2 decided, each where it was |
| No hard limit is broken | pass | the traveller has no dietary rule |
| Every day has its meals | pass | no meal asked for is left open |
| Each ticket lasts its real length | pass | 165 and 165 minutes, by the clock of each end |
| The days match the pace | pass | balanced: no day has more than 3 sights or activities |
| Every reason is true of the traveller and the trip | pass | 49 reasons read, sentence by sentence |

Pace: I will keep a balanced pace. Shape of the day: early starts. Interests: parks and nature; activities. Atmosphere: I will mix lively and quiet places. Food: I will assume no restrictions.

**Day 1, Sat 10 Jul, Lisbon**

- 08:20  Already decided: Flight · London → Lisbon
- 11:05  Allowed 60 min from the airport (flight)
- 12:05  Lunch: **Harbour Canteen** (75 min)
- 13:20  Time to wander around Harbour Canteen (60 min)
- 14:56  Afternoon: **Lisbon Botanical Garden** (60 min), 16 min transit to get there
- 16:31  Late afternoon: **Lisbon Cathedral** (45 min), 15 min transit to get there
- 18:00  Dinner: **Market Kitchen** (75 min), 4 min walk to get there

**Day 2, Sun 11 Jul, Lisbon**

- 08:00  Breakfast where you stay (45 min)
- 08:45  Morning: **Lisbon Riverside Park** (60 min) [opening hours not known]
- 11:30  Lunch: **Corner Noodles** (75 min), 6 min walk to get there
- 12:45  Time to wander around Corner Noodles (60 min)
- 14:23  Afternoon: **Lisbon City Museum** (120 min), 18 min walk to get there
- 17:02  Late afternoon: **Lisbon Old Town** (60 min), 19 min walk to get there [opening hours not known]
- 18:33  Dinner: **Lantern Grill** (75 min), 11 min walk to get there

**Day 3, Mon 12 Jul, Lisbon**

- 08:00  Breakfast where you stay (45 min)
- 08:45  Morning: **Lisbon Central Market** (60 min)
- 11:30  Lunch: **Sunrise Cafe** (45 min), 2 min walk to get there
- 12:45  Time to wander around Sunrise Cafe (60 min)
- 14:22  Afternoon: **Lisbon Art Gallery** (120 min), 17 min walk to get there
- 17:03  Late afternoon: **Lisbon Lookout** (30 min), 21 min transit to get there [opening hours not known]
- 18:06  Dinner: **Garden Table** (75 min), 13 min walk to get there [opening hours not known]

**Day 4, Tue 13 Jul, Lisbon**

- 08:00  Breakfast where you stay (45 min)
- 08:45  Morning: *open*
- 11:30  Lunch: **Morning Cafe** (45 min)
- 12:45  Time to wander around Morning Cafe (60 min)
- 14:26  Afternoon: **Lisbon Castle** (60 min), 21 min transit to get there
- 15:26  Late afternoon: *open*
- 18:00  Dinner: **Harbour Canteen** (75 min), 3 min walk to get there

**Day 5, Wed 14 Jul, Lisbon**

- 08:00  Breakfast where you stay (45 min)
- 08:45  Morning: *open*
- 11:30  Lunch: **Corner Noodles** (75 min)
- 12:45  Time to wander around Corner Noodles (60 min)
- 13:45  Afternoon: *open*
- 15:40  Allowed 120 min to the airport (flight)
- 17:40  Already decided: Flight · Lisbon → London

### Quick plan

| Check | Result | What was found |
| --- | --- | --- |
| No place is invented | pass | 18 places, each one the place source knows, none twice |
| No rule is broken | pass | no place carries a broken-rule flag |
| Nothing already decided was moved | pass | 2 decided, each where it was |
| No hard limit is broken | pass | the traveller has no dietary rule |
| Every day has its meals | pass | no meal asked for is left open |
| Each ticket lasts its real length | pass | 165 and 165 minutes, by the clock of each end |
| The days match the pace | pass | balanced: no day has more than 3 sights or activities |

Pace: I will keep a balanced pace. Shape of the day: early starts. Interests: parks and nature; activities. Atmosphere: I will mix lively and quiet places. Food: I will assume no restrictions.

**Day 1, Sat 10 Jul, Lisbon**

- 08:20  Already decided: Flight · London → Lisbon
- 11:05  Allowed 60 min from the airport (flight)
- 12:05  Lunch: **Harbour Canteen** (75 min)
- 13:20  Time to wander around Harbour Canteen (60 min)
- 14:56  Afternoon: **Lisbon Botanical Garden** (60 min), 16 min transit to get there
- 16:31  Late afternoon: **Lisbon Cathedral** (45 min), 15 min transit to get there
- 18:00  Dinner: **Market Kitchen** (75 min), 4 min walk to get there

**Day 2, Sun 11 Jul, Lisbon**

- 08:00  Breakfast where you stay (45 min)
- 08:45  Morning: **Lisbon Riverside Park** (60 min) [opening hours not known]
- 11:30  Lunch: **Corner Noodles** (75 min), 6 min walk to get there
- 12:45  Time to wander around Corner Noodles (60 min)
- 14:23  Afternoon: **Lisbon City Museum** (120 min), 18 min walk to get there
- 17:02  Late afternoon: **Lisbon Old Town** (60 min), 19 min walk to get there [opening hours not known]
- 18:33  Dinner: **Lantern Grill** (75 min), 11 min walk to get there

**Day 3, Mon 12 Jul, Lisbon**

- 08:00  Breakfast where you stay (45 min)
- 08:45  Morning: **Lisbon Central Market** (60 min)
- 11:30  Lunch: **Sunrise Cafe** (45 min), 2 min walk to get there
- 12:45  Time to wander around Sunrise Cafe (60 min)
- 14:22  Afternoon: **Lisbon Art Gallery** (120 min), 17 min walk to get there
- 17:03  Late afternoon: **Lisbon Lookout** (30 min), 21 min transit to get there [opening hours not known]
- 18:06  Dinner: **Garden Table** (75 min), 13 min walk to get there [opening hours not known]

**Day 4, Tue 13 Jul, Lisbon**

- 08:00  Breakfast where you stay (45 min)
- 08:45  Morning: *open*
- 11:30  Lunch: **Morning Cafe** (45 min)
- 12:45  Time to wander around Morning Cafe (60 min)
- 14:26  Afternoon: **Lisbon Castle** (60 min), 21 min transit to get there
- 15:26  Late afternoon: *open*
- 18:00  Dinner: **Harbour Canteen** (75 min), 3 min walk to get there

**Day 5, Wed 14 Jul, Lisbon**

- 08:00  Breakfast where you stay (45 min)
- 08:45  Morning: *open*
- 11:30  Lunch: **Corner Noodles** (75 min)
- 12:45  Time to wander around Corner Noodles (60 min)
- 13:45  Afternoon: *open*
- 15:40  Allowed 120 min to the airport (flight)
- 17:40  Already decided: Flight · Lisbon → London

**The agent's report**

- Built: 5 days in Lisbon, planned around 2 things already decided. I chose 18 places: 9 to see and 9 to eat at.
- Assumed: Pace: I will keep a balanced pace. Atmosphere: I will mix lively and quiet places. Food: I will assume no restrictions. Getting around: I will walk short hops and use public transport for the rest.
- Could not fit: Nothing I know fits the morning on day 4. Nothing I know fits the late afternoon on day 4. Nothing I know fits the morning on day 5. 1 more slot is open for the same reason.
- Unsure: Two places were close for lunch on day 1. I chose Harbour Canteen. Two places were close for the late afternoon on day 1. I chose Lisbon Cathedral. Two places were close for dinner on day 1. I chose Market Kitchen. 4 more choices were close too. I do not know the opening hours of Lisbon Riverside Park, Lisbon Old Town, Lisbon Lookout and Garden Table. Check before you go.

## Dan and Priya

Honeymoon, nine days by train through Rome, Florence and Venice, high budget, unlike Dan's profile. *Tests: Several cities, a trip that differs from the profile.*

### Guided planning

| Check | Result | What was found |
| --- | --- | --- |
| No place is invented | pass | 31 places, each one the place source knows, none twice |
| No rule is broken | pass | no place carries a broken-rule flag |
| Nothing already decided was moved | pass | 1 decided, each where it was |
| No hard limit is broken | pass | the traveller has no dietary rule |
| Every day has its meals | pass | no meal asked for is left open |
| Each ticket lasts its real length | pass | no ticket to measure |
| The days match the pace | pass | relaxed: no day has more than 2 sights or activities |
| Every reason is true of the traveller and the trip | pass | 90 reasons read, sentence by sentence |

Pace: relaxed. Shape of the day: I will start the days at about nine. Interests: views; temples, shrines and history. Atmosphere: quiet. Food: I will assume no restrictions.

**Day 1, Sat 5 Jun, Rome**

- 10:00  Morning: **Rome Cathedral** (45 min)
- 12:30  Lunch: **Morning Cafe** (45 min), 7 min walk to get there
- 13:45  Time to wander around Morning Cafe (120 min)
- 16:31  Afternoon: **Rome Lookout** (30 min), 16 min transit to get there [opening hours not known]
- 19:00  Dinner: **Harbour Canteen** (75 min), 8 min walk to get there

**Day 2, Sun 6 Jun, Rome**

- 10:00  Morning: **Rome Old Town** (60 min) [opening hours not known]
- 12:30  Lunch: **Market Kitchen** (75 min), 7 min walk to get there
- 13:45  Time to wander around Market Kitchen (120 min)
- 16:30  Afternoon: **Rome Art Gallery** (120 min), 15 min walk to get there
- 19:08  Dinner: **Corner Noodles** (75 min), 8 min walk to get there

**Day 3, Mon 7 Jun, Rome**

- 10:00  Morning: **Rome Botanical Garden** (60 min)
- 12:30  Lunch: **Garden Table** (75 min), 11 min walk to get there [opening hours not known]
- 13:45  Time to wander around Garden Table (120 min)
- 16:40  Afternoon: **Rome Riverside Park** (60 min), 25 min transit to get there [opening hours not known]
- 19:00  Dinner: **Harbour Canteen** (75 min), 6 min walk to get there

**Day 4, Tue 8 Jun, Rome**

- 10:00  Morning: **Rome Central Market** (60 min)
- 12:00  Travel from Rome to Florence, assumed (255 min)
- 19:00  Dinner: **Lantern Grill** (75 min)

**Day 5, Wed 9 Jun, Florence**

- 10:00  Already decided: Uffizi Gallery tickets
- 12:30  Lunch: **Garden Table** (75 min) [opening hours not known]
- 13:45  Time to wander around Garden Table (120 min)
- 16:30  Afternoon: **Florence Castle** (60 min), 15 min transit to get there
- 19:00  Dinner: **Harbour Canteen** (75 min), 7 min walk to get there

**Day 6, Thu 10 Jun, Florence**

- 10:00  Morning: **Florence Old Town** (60 min) [opening hours not known]
- 12:30  Lunch: **Sunrise Cafe** (45 min), 13 min walk to get there
- 13:45  Time to wander around Sunrise Cafe (120 min)
- 16:34  Afternoon: **Florence Lookout** (30 min), 19 min walk to get there [opening hours not known]
- 19:00  Dinner: **Harbour Canteen** (75 min), 5 min walk to get there

**Day 7, Fri 11 Jun, Florence**

- 10:00  Morning: **Florence Central Market** (60 min)
- 12:00  Travel from Florence to Venice, assumed (240 min)
- 19:00  Dinner: **Market Kitchen** (75 min)

**Day 8, Sat 12 Jun, Venice**

- 10:00  Morning: **Venice Cathedral** (45 min)
- 12:30  Lunch: **Market Kitchen** (75 min), 7 min walk to get there
- 13:45  Time to wander around Market Kitchen (120 min)
- 16:35  Afternoon: **Venice Lookout** (30 min), 20 min walk to get there [opening hours not known]
- 19:00  Dinner: **Corner Noodles** (75 min), 7 min walk to get there

**Day 9, Sun 13 Jun, Venice**

- 10:00  Morning: **Venice Old Town** (60 min) [opening hours not known]
- 12:30  Lunch: **Market Kitchen** (75 min), 8 min walk to get there
- 13:45  Time to wander around Market Kitchen (120 min)
- 16:38  Afternoon: **Venice Art Gallery** (120 min), 23 min walk to get there
- 19:13  Dinner: **Market Kitchen** (75 min), 5 min walk to get there

### Quick plan

| Check | Result | What was found |
| --- | --- | --- |
| No place is invented | pass | 31 places, each one the place source knows, none twice |
| No rule is broken | pass | no place carries a broken-rule flag |
| Nothing already decided was moved | pass | 1 decided, each where it was |
| No hard limit is broken | pass | the traveller has no dietary rule |
| Every day has its meals | pass | no meal asked for is left open |
| Each ticket lasts its real length | pass | no ticket to measure |
| The days match the pace | pass | relaxed: no day has more than 2 sights or activities |

Pace: relaxed. Shape of the day: I will start the days at about nine. Interests: views; temples, shrines and history. Atmosphere: quiet. Food: I will assume no restrictions.

**Day 1, Sat 5 Jun, Rome**

- 10:00  Morning: **Rome Castle** (60 min)
- 12:30  Lunch: **Corner Noodles** (75 min), 3 min walk to get there
- 13:45  Time to wander around Corner Noodles (120 min)
- 16:32  Afternoon: **Rome Cathedral** (45 min), 17 min transit to get there
- 19:00  Dinner: **Harbour Canteen** (75 min), 2 min walk to get there

**Day 2, Sun 6 Jun, Rome**

- 10:00  Morning: **Rome Old Town** (60 min) [opening hours not known]
- 12:30  Lunch: **Sunrise Cafe** (45 min), 4 min walk to get there
- 13:45  Time to wander around Sunrise Cafe (120 min)
- 16:31  Afternoon: **Rome Lookout** (30 min), 16 min transit to get there [opening hours not known]
- 19:00  Dinner: **Lantern Grill** (75 min), 10 min walk to get there

**Day 3, Mon 7 Jun, Rome**

- 10:00  Morning: **Rome Botanical Garden** (60 min)
- 12:30  Lunch: **Morning Cafe** (45 min), 4 min walk to get there
- 13:45  Time to wander around Morning Cafe (120 min)
- 16:34  Afternoon: **Rome Art Gallery** (120 min), 19 min transit to get there
- 19:07  Dinner: **Market Kitchen** (75 min), 3 min walk to get there

**Day 4, Tue 8 Jun, Rome**

- 10:00  Morning: **Rome Central Market** (60 min)
- 12:00  Travel from Rome to Florence, assumed (255 min)
- 19:00  Dinner: **Garden Table** (75 min) [opening hours not known]

**Day 5, Wed 9 Jun, Florence**

- 10:00  Already decided: Uffizi Gallery tickets
- 12:30  Lunch: **Morning Cafe** (45 min)
- 13:45  Time to wander around Morning Cafe (120 min)
- 16:38  Afternoon: **Florence Cathedral** (45 min), 23 min walk to get there
- 19:00  Dinner: **Corner Noodles** (75 min), 1 min walk to get there

**Day 6, Thu 10 Jun, Florence**

- 10:00  Morning: **Florence Castle** (60 min)
- 12:30  Lunch: **Sunrise Cafe** (45 min), 2 min walk to get there
- 13:45  Time to wander around Sunrise Cafe (120 min)
- 16:30  Afternoon: **Florence Old Town** (60 min), 15 min transit to get there [opening hours not known]
- 19:00  Dinner: **Corner Noodles** (75 min), 4 min walk to get there

**Day 7, Fri 11 Jun, Florence**

- 10:00  Morning: **Florence Lookout** (30 min) [opening hours not known]
- 12:00  Travel from Florence to Venice, assumed (240 min)
- 19:00  Dinner: **Harbour Canteen** (75 min)

**Day 8, Sat 12 Jun, Venice**

- 10:00  Morning: **Venice Castle** (60 min)
- 12:30  Lunch: **Sunrise Cafe** (45 min), 2 min walk to get there
- 13:45  Time to wander around Sunrise Cafe (120 min)
- 16:31  Afternoon: **Venice Cathedral** (45 min), 16 min transit to get there
- 19:00  Dinner: **Corner Noodles** (75 min), 2 min walk to get there

**Day 9, Sun 13 Jun, Venice**

- 10:00  Morning: **Venice Old Town** (60 min) [opening hours not known]
- 12:30  Lunch: **Corner Noodles** (75 min), 6 min walk to get there
- 13:45  Time to wander around Corner Noodles (120 min)
- 16:31  Afternoon: **Venice Lookout** (30 min), 16 min transit to get there [opening hours not known]
- 19:00  Dinner: **Market Kitchen** (75 min), 2 min walk to get there

**The agent's report**

- Built: 9 days in Rome, Florence and Venice, planned around 1 thing already decided. I chose 31 places: 15 to see and 16 to eat at.
- Assumed: Shape of the day: I will start the days at about nine. Food: I will assume no restrictions. Getting around: I will walk short hops and use public transport for the rest.
- Could not fit: nothing was left over.
- Unsure: Two places were close for the morning on day 1. I chose Rome Castle. Two places were close for lunch on day 1. I chose Corner Noodles. Two places were close for the morning on day 2. I chose Rome Old Town. 10 more choices were close too. I do not know the opening hours of Rome Old Town, Rome Lookout, Garden Table, Florence Old Town, Florence Lookout, Venice Old Town and Venice Lookout. Check before you go.

## Sam

Returning user, three-day city break, Quick plan with only step 1 filled. *Tests: Memory, defaults, and the report of assumptions.*

### Guided planning

| Check | Result | What was found |
| --- | --- | --- |
| No place is invented | pass | 15 places, each one the place source knows, none twice |
| No rule is broken | pass | no place carries a broken-rule flag |
| Nothing already decided was moved | pass | nothing was decided beforehand |
| No hard limit is broken | pass | the traveller has no dietary rule |
| Every day has its meals | pass | no meal asked for is left open |
| Each ticket lasts its real length | pass | no ticket to measure |
| The days match the pace | pass | packed: no day has more than 4 sights or activities |
| Every reason is true of the traveller and the trip | pass | 42 reasons read, sentence by sentence |

Pace: packed (you told me). Shape of the day: I will start the days at about nine. Interests: museums and exhibitions (you told me). Atmosphere: I will mix lively and quiet places. Food: I will assume no restrictions.

**Day 1, Fri 10 Sept, Rome**

- 09:00  Morning: **Rome Botanical Garden** (60 min)
- 10:45  Late morning: **Rome City Museum** (120 min), 20 min transit to get there
- 12:58  Lunch: **Sunrise Cafe** (45 min), 3 min walk to get there
- 14:08  Afternoon: **Rome Art Gallery** (120 min), 15 min transit to get there
- 16:35  Late afternoon: **Rome Old Town** (60 min), 17 min walk to get there [opening hours not known]
- 19:00  Dinner: **Harbour Canteen** (75 min), 3 min walk to get there

**Day 2, Sat 11 Sept, Rome**

- 09:00  Morning: **Rome Central Market** (60 min)
- 10:45  Late morning: **Rome Cathedral** (45 min), 19 min walk to get there
- 12:30  Lunch: **Morning Cafe** (45 min), 7 min walk to get there
- 14:00  Afternoon: **Rome Lookout** (30 min), 16 min transit to get there [opening hours not known]
- 16:00  Late afternoon: **Rome Riverside Park** (60 min), 18 min walk to get there [opening hours not known]
- 19:00  Dinner: **Market Kitchen** (75 min), 3 min walk to get there

**Day 3, Sun 12 Sept, Rome**

- 09:00  Morning: *open*
- 10:45  Late morning: **Rome Castle** (60 min)
- 12:30  Lunch: **Corner Noodles** (75 min), 3 min walk to get there
- 14:00  Afternoon: *open*
- 16:00  Late afternoon: *open*
- 19:00  Dinner: **Lantern Grill** (75 min), 9 min walk to get there

### Quick plan

| Check | Result | What was found |
| --- | --- | --- |
| No place is invented | pass | 15 places, each one the place source knows, none twice |
| No rule is broken | pass | no place carries a broken-rule flag |
| Nothing already decided was moved | pass | nothing was decided beforehand |
| No hard limit is broken | pass | the traveller has no dietary rule |
| Every day has its meals | pass | no meal asked for is left open |
| Each ticket lasts its real length | pass | no ticket to measure |
| The days match the pace | pass | packed: no day has more than 4 sights or activities |

Pace: packed (you told me). Shape of the day: I will start the days at about nine. Interests: museums and exhibitions (you told me). Atmosphere: I will mix lively and quiet places. Food: I will assume no restrictions.

**Day 1, Fri 10 Sept, Rome**

- 09:00  Morning: **Rome Botanical Garden** (60 min)
- 10:45  Late morning: **Rome City Museum** (120 min), 20 min transit to get there
- 12:58  Lunch: **Sunrise Cafe** (45 min), 3 min walk to get there
- 14:08  Afternoon: **Rome Art Gallery** (120 min), 15 min transit to get there
- 16:35  Late afternoon: **Rome Old Town** (60 min), 17 min walk to get there [opening hours not known]
- 19:00  Dinner: **Harbour Canteen** (75 min), 3 min walk to get there

**Day 2, Sat 11 Sept, Rome**

- 09:00  Morning: **Rome Central Market** (60 min)
- 10:45  Late morning: **Rome Cathedral** (45 min), 19 min walk to get there
- 12:30  Lunch: **Morning Cafe** (45 min), 7 min walk to get there
- 14:00  Afternoon: **Rome Lookout** (30 min), 16 min transit to get there [opening hours not known]
- 16:00  Late afternoon: **Rome Riverside Park** (60 min), 18 min walk to get there [opening hours not known]
- 19:00  Dinner: **Market Kitchen** (75 min), 3 min walk to get there

**Day 3, Sun 12 Sept, Rome**

- 09:00  Morning: *open*
- 10:45  Late morning: **Rome Castle** (60 min)
- 12:30  Lunch: **Corner Noodles** (75 min), 3 min walk to get there
- 14:00  Afternoon: *open*
- 16:00  Late afternoon: *open*
- 19:00  Dinner: **Lantern Grill** (75 min), 9 min walk to get there

**The agent's report**

- Built: 3 days in Rome. I chose 15 places: 9 to see and 6 to eat at.
- Assumed: Pace: packed (you told me). Shape of the day: I will start the days at about nine. Interests: museums and exhibitions (you told me). Atmosphere: I will mix lively and quiet places. Food: I will assume no restrictions. Getting around: I will walk short hops and use public transport for the rest.
- Could not fit: Nothing I know fits the morning on day 3. Nothing I know fits the afternoon on day 3. Nothing I know fits the late afternoon on day 3.
- Unsure: Two places were close for the morning on day 1. I chose Rome Botanical Garden. Two places were close for the morning on day 2. I chose Rome Central Market. Two places were close for lunch on day 2. I chose Morning Cafe. 1 more choice was close too. I do not know the opening hours of Rome Old Town, Rome Lookout and Rome Riverside Park. Check before you go.

## Lena

Alone, four nights in Rome, a same-day flight there and back from London, public transport, breakfast suggested. *Tests: A ticket that crosses a time zone, and breakfast.*

### Guided planning

| Check | Result | What was found |
| --- | --- | --- |
| No place is invented | pass | 21 places, each one the place source knows, none twice |
| No rule is broken | pass | no place carries a broken-rule flag |
| Nothing already decided was moved | pass | 2 decided, each where it was |
| No hard limit is broken | pass | the traveller has no dietary rule |
| Every day has its meals | pass | no meal asked for is left open |
| Each ticket lasts its real length | pass | 120 and 120 minutes, by the clock of each end |
| The days match the pace | pass | balanced: no day has more than 3 sights or activities |
| Every reason is true of the traveller and the trip | pass | 57 reasons read, sentence by sentence |

Pace: I will keep a balanced pace. Shape of the day: I will start the days at about nine. Interests: I will mix a little of everything. Atmosphere: I will mix lively and quiet places. Food: I will assume no restrictions.

**Day 1, Fri 18 Jun, Rome**

- 10:00  Already decided: Flight · London → Rome
- 13:00  Allowed 60 min from the airport (flight)
- 14:00  Afternoon: **Rome Castle** (60 min)
- 16:00  Late afternoon: **Rome Art Gallery** (120 min), 13 min transit to get there
- 19:00  Dinner: **Market Kitchen** (75 min), 9 min transit to get there

**Day 2, Sat 19 Jun, Rome**

- 09:00  Breakfast: **Sunrise Cafe** (45 min)
- 10:26  Morning: **Rome Botanical Garden** (60 min), 21 min transit to get there
- 12:30  Lunch: **Corner Noodles** (75 min), 10 min transit to get there
- 13:45  Time to wander around Corner Noodles (60 min)
- 15:21  Afternoon: **Rome Cathedral** (45 min), 16 min transit to get there
- 16:37  Late afternoon: **Rome Old Town** (60 min), 11 min transit to get there [opening hours not known]
- 19:00  Dinner: **Harbour Canteen** (75 min), 9 min transit to get there

**Day 3, Sun 20 Jun, Rome**

- 09:00  Breakfast: **Corner Bakery** (45 min)
- 10:20  Morning: **Rome Riverside Park** (60 min), 15 min transit to get there [opening hours not known]
- 12:30  Lunch: **Morning Cafe** (45 min), 8 min transit to get there
- 13:45  Time to wander around Morning Cafe (60 min)
- 15:17  Afternoon: **Rome City Museum** (120 min), 12 min transit to get there
- 17:52  Late afternoon: **Rome Lookout** (30 min), 15 min transit to get there [opening hours not known]
- 19:00  Dinner: **Lantern Grill** (75 min), 11 min transit to get there

**Day 4, Mon 21 Jun, Rome**

- 09:00  Breakfast: **Riverside Cafe** (45 min)
- 10:16  Morning: **Rome Central Market** (60 min), 11 min transit to get there
- 12:30  Lunch: **Garden Table** (75 min), 11 min transit to get there [opening hours not known]
- 13:45  Time to wander around Garden Table (60 min)
- 14:45  Afternoon: *open*
- 16:00  Late afternoon: *open*
- 19:00  Dinner: **Corner Noodles** (75 min), 9 min transit to get there

**Day 5, Tue 22 Jun, Rome**

- 09:00  Breakfast: **Corner Bakery** (45 min)
- 09:45  Morning: *open*
- 12:30  Lunch: **Market Kitchen** (75 min), 9 min transit to get there
- 13:45  Time to wander around Market Kitchen (60 min)
- 14:45  Afternoon: *open*
- 16:00  Allowed 120 min to the airport (flight)
- 18:00  Already decided: Flight · Rome → London

### Quick plan

| Check | Result | What was found |
| --- | --- | --- |
| No place is invented | pass | 21 places, each one the place source knows, none twice |
| No rule is broken | pass | no place carries a broken-rule flag |
| Nothing already decided was moved | pass | 2 decided, each where it was |
| No hard limit is broken | pass | the traveller has no dietary rule |
| Every day has its meals | pass | no meal asked for is left open |
| Each ticket lasts its real length | pass | 120 and 120 minutes, by the clock of each end |
| The days match the pace | pass | balanced: no day has more than 3 sights or activities |

Pace: I will keep a balanced pace. Shape of the day: I will start the days at about nine. Interests: I will mix a little of everything. Atmosphere: I will mix lively and quiet places. Food: I will assume no restrictions.

**Day 1, Fri 18 Jun, Rome**

- 10:00  Already decided: Flight · London → Rome
- 13:00  Allowed 60 min from the airport (flight)
- 14:00  Afternoon: **Rome Castle** (60 min)
- 16:00  Late afternoon: **Rome Art Gallery** (120 min), 13 min transit to get there
- 19:00  Dinner: **Market Kitchen** (75 min), 9 min transit to get there

**Day 2, Sat 19 Jun, Rome**

- 09:00  Breakfast: **Sunrise Cafe** (45 min)
- 10:26  Morning: **Rome Botanical Garden** (60 min), 21 min transit to get there
- 12:30  Lunch: **Corner Noodles** (75 min), 10 min transit to get there
- 13:45  Time to wander around Corner Noodles (60 min)
- 15:21  Afternoon: **Rome Cathedral** (45 min), 16 min transit to get there
- 16:37  Late afternoon: **Rome Old Town** (60 min), 11 min transit to get there [opening hours not known]
- 19:00  Dinner: **Harbour Canteen** (75 min), 9 min transit to get there

**Day 3, Sun 20 Jun, Rome**

- 09:00  Breakfast: **Corner Bakery** (45 min)
- 10:20  Morning: **Rome Riverside Park** (60 min), 15 min transit to get there [opening hours not known]
- 12:30  Lunch: **Morning Cafe** (45 min), 8 min transit to get there
- 13:45  Time to wander around Morning Cafe (60 min)
- 15:17  Afternoon: **Rome City Museum** (120 min), 12 min transit to get there
- 17:52  Late afternoon: **Rome Lookout** (30 min), 15 min transit to get there [opening hours not known]
- 19:00  Dinner: **Lantern Grill** (75 min), 11 min transit to get there

**Day 4, Mon 21 Jun, Rome**

- 09:00  Breakfast: **Riverside Cafe** (45 min)
- 10:16  Morning: **Rome Central Market** (60 min), 11 min transit to get there
- 12:30  Lunch: **Garden Table** (75 min), 11 min transit to get there [opening hours not known]
- 13:45  Time to wander around Garden Table (60 min)
- 14:45  Afternoon: *open*
- 16:00  Late afternoon: *open*
- 19:00  Dinner: **Corner Noodles** (75 min), 9 min transit to get there

**Day 5, Tue 22 Jun, Rome**

- 09:00  Breakfast: **Corner Bakery** (45 min)
- 09:45  Morning: *open*
- 12:30  Lunch: **Market Kitchen** (75 min), 9 min transit to get there
- 13:45  Time to wander around Market Kitchen (60 min)
- 14:45  Afternoon: *open*
- 16:00  Allowed 120 min to the airport (flight)
- 18:00  Already decided: Flight · Rome → London

**The agent's report**

- Built: 5 days in Rome, planned around 2 things already decided. I chose 21 places: 9 to see and 12 to eat at.
- Assumed: Pace: I will keep a balanced pace. Shape of the day: I will start the days at about nine. Interests: I will mix a little of everything. Atmosphere: I will mix lively and quiet places. Food: I will assume no restrictions.
- Could not fit: Nothing I know fits the afternoon on day 4. Nothing I know fits the late afternoon on day 4. Nothing I know fits the morning on day 5. 1 more slot is open for the same reason.
- Unsure: Two places were close for the afternoon on day 1. I chose Rome Castle. Two places were close for breakfast on day 2. I chose Sunrise Cafe. Two places were close for the morning on day 2. I chose Rome Botanical Garden. 6 more choices were close too. I do not know the opening hours of Rome Old Town, Rome Riverside Park, Rome Lookout and Garden Table. Check before you go.


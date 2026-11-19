# Traceable facts, visible doubt, model wording and realistic days

Date: 2026-11-19. Status: approved by the developer on 2026-11-19. Part 4 was added the same day at the developer's request.
Requirements: TB-RSN-01 to 03, TB-TRU-02, TB-TRU-04 to 06, TB-AGT-15, TB-SYS-10, TB-SYS-11, TB-CRD-03, PRD section 17; Part 4 also touches TB-ITN-16 and PRD 9.3 and 9.4.

## Intent

The developer, 2026-11-19: "I want to make accuracy a priority. If we can use C and have the model rephrase verified facts and we can ensure our sources for the facts are traceable and reliable, then we can use this route."

Three things follow from the conversation that settled this design:

1. **Travellers trust us without receipts.** Sources are not listed on screen. We keep a private record behind every sentence so that a complaint can be answered with evidence.
2. **Doubt is shown where a fact is shaky.** The traveller is then given ways to check the fact themselves, so responsibility is shared rather than resting on TravleBuddy alone.
3. **The agent stops sounding robotic.** The AI model rewords the agent's sentences, but never states a fact: the code fills every fact in.

Everything must fit the current keepsake interface. Nothing may look like a warning banner.

## Goals

- G1. Every fact a traveller reads is true of the stored data, and its source is recorded.
- G2. A fact that is unknown, estimated or possibly out of date says so, quietly, where it is shown.
- G3. The closer look offers the traveller ways to check a place: its own website when the listing has one, a Google Maps search, and its OpenStreetMap page.
- G4. Every agent message and card reason has a private record: the template, the facts and their sources, the wording shown, and whether the model's wording was used.
- G5. The model rewords agent messages and card reasons by filling in the gaps. The code checks every version and shows the template whenever a check fails.

## Non-goals

- A per-fact source list shown to travellers.
- Ratings or prices. OpenStreetMap has neither, and these remain "unknown" (TB-TRU-05).
- The model choosing, ranking or scheduling anything (TB-TRU-04).
- Storing any Google data. Only Google's public search links are used.
- Rewording fixed interface text: buttons, labels, refusals, doubt lines, the "check it yourself" row, and answer choices.

## Anti-goals

The work has failed if any of these happen, even if it technically works:

- Any sentence states something the stored data does not hold.
- Doubt lines appear on every card, or look like alarms (red, icons, banners).
- Cards wait noticeably longer to appear because of the model.
- Anything stops working with the model off.

## Constraints

- **Service borders** (`docs/architecture/service-borders.md`, `service-map.json`):
  - The model is reached only through Conversation's `modelCall` (`src/features/conversation/model/mode.ts`), under the AI cap.
  - Recommendations' `reasonFor` stays pure and deterministic.
  - No model call inside a database transaction.
- **Cost:** the AI cap is 15 US dollars a month. At the cap, every text uses its template and the agent says it is limited (TB-AGT-15).
- **OpenStreetMap policies:** Nominatim at most 1 request per second; light use of Overpass; an identifying User-Agent with a contact address. The contact address lives only in the environment, because the repository is public. The footer credit "Place data © OpenStreetMap contributors" stays.
- **Google:** only Maps URLs, which need no key, may be linked. Nothing from Google is fetched or stored.
- **Databases:** no new database. Migrations are written with `prisma migrate diff`, and QA migrations go through the protected workflow.
- **Dependency:** Overpass currently answers 406 to the place request (2026-11-19), so real place facts cannot be checked until that is fixed. Sample mode invents hours, diets and some names, so no sentence in sample mode may claim "its listing says".

## Approaches considered

**Who sees the sources.**

- (a) Only us.
- (b) A full "where this comes from" list in the closer look.
- (c) Only us, plus doubt where a fact is shaky and links to check it.

**Chosen: (c).** It keeps the interface clean and prevents the worst errors, such as arriving at a closed door, instead of only proving them afterwards. Option (b) showed our weakest data to everyone for the benefit of few.

**How the model rewords.**

1. **Fill in the gaps.** The model returns the sentence with named gaps such as `{place}` and `{minutes}`, and the code fills in the values. Deterministic rules reject a version that drops or adds a gap, or adds a number, a name or a claim word.
2. **Free rewrite judged by a second model call.**
3. **Hand-written variants with no model.**

**Chosen: 1.** It is the only one where the facts are guaranteed. Option 2's judge can be wrong, which conflicts with accuracy first. Option 3 gives little variety and leaves the model out.

## Design

The work comes in four parts. Each part is useful on its own. The build order is under Order and dependencies.

### Part 1: true, traceable facts, with doubt and ways to check

**1.1 Correct the sentences that are untrue or unbacked today** (found 2026-11-19):

- "You chose this for day N" (`src/use-cases/plan.ts:432`) is also shown on places the Quick plan build chose. It must say who chose the place.
- "A quieter choice" (`src/features/recommendations/propose.ts:241-244`) only means the place has no `wikidata` or `wikipedia` tag. "One of X's well-known places" means it has one.
  - The sentence must say only what that tag supports, or the claim must be dropped.
  - The rankings keep their current weights.
- "So I looked closer" (`propose.ts:238`) is said whenever the traveller once said "too far". Say it only when distance actually decided this card, or drop it.
- "It is open for the whole visit" (`propose.ts:284`): say it only when the hours are known, parse cleanly and are not stale (1.4). Otherwise use the doubt wording.
- "From {previous place}" (`plan.ts:275-289`) ignores commitments and transfers in between. It must name the actual previous item.
- Travel time:
  - The card front says "about N min".
  - The traveller's stated way of getting around is passed to `travelEstimate`. Today it is never passed (`propose.ts:182`, `src/features/itinerary/day-plan.ts:504`).

**1.2 Store each place's provenance.** Today `Place` keeps `originRef` (for example `node/123`), but not where each fact came from or when.

Add:

- The OpenStreetMap tags each fact was read from, as they arrived. At least: `name`, `name:en`, `opening_hours`, `check_date`, `check_date:opening_hours`, `website`, `contact:website`, `cuisine`, `diet:*`, `wikidata`, `wikipedia`, and the kind tags.
- The element's last-edit time. Overpass gives it with `out meta`.
- The time this row was last fetched.

**1.3 Refresh places.** Rows are never updated today (`createMany` with `skipDuplicates`, and `gather` stops once a fetch is recorded).

- A city's places older than 30 days are fetched again the next time they are needed, and the rows are updated in place.
- A failed refresh keeps the old rows and their old dates, so the doubt rule still applies to them.

**1.4 Doubt rules**, decided by code, each with a fixed sentence:

| Fact          | When it is in doubt                                                                                     | What the traveller sees                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Opening hours | unknown, or unparseable                                                                                 | "Hours not known. Check before you go." (already used)                                      |
| Opening hours | `check_date:opening_hours`, else `check_date`, else the element's last edit, is more than 12 months old | under the hours: "Last updated on the map in {year}. Worth a check."                        |
| Travel time   | always an estimate                                                                                      | "about" on cards; "(estimate)" in the itinerary (exists)                                    |
| Visit length  | always an estimate                                                                                      | "(estimate)" (exists)                                                                       |
| Diet          | inferred, for example vegan read as vegetarian                                                          | the reason names the tag's own word: "its listing says it has vegan options"                |
| Sample place  | always                                                                                                  | the summary says "Sample data, not a real listing" (exists); no link row, no listing claims |

**1.5 How it looks** (`src/components/keepsake/closer-look.tsx`):

```
  Tsukiji Outer Market
  Market · about 19 min by transit

  WHY IT SUITS YOU
  It is about a 19-minute ride from teamLab Planets, so it fits your late morning.

  Address           4 Chome-16-2 Tsukiji, Chuo
  Hours             Mon–Sat 05:00–14:00 · Sun closed
                    Last updated on the map in 2021. Worth a check.
  Price             Price unknown
  Rating            No rating yet
  Check it yourself Website ↗  Google Maps ↗  OpenStreetMap ↗
```

- The doubt line sits under its value, in the same style as the labels: `font-sans text-[13px] leading-6 text-muted`. No colour, no icon.
- "Check it yourself" is one more row in the existing `<dl>`. Its label uses the same `<dt>` style. The links use the existing underlined text-link style of the card's "Save" and "Closer look".
  - Each link opens in a new tab with `rel="noopener noreferrer"`.
  - Each link's accessible name says where it goes ("Tsukiji Outer Market on Google Maps, opens in a new tab").
- Which links appear:
  - **Website:** only when the listing's `website` or `contact:website` is an `http(s)` address.
  - **Google Maps:** a Maps URLs search for the place's name and position.
  - **OpenStreetMap:** `https://www.openstreetmap.org/{type}/{id}`.
  - A place the traveller added has no OpenStreetMap link. A sample place has no row.
- Price and Rating rows stay as they are (TB-TRU-05).
- It must pass the design checks (`npm run quality:design`) in Chromium, Firefox and WebKit at desktop and phone widths, including keyboard focus and touch targets of at least 24 px.

### Part 2: the private record

For every agent message and card reason shown, keep:

- the template and its version;
- each filled-in fact and its source;
- the text shown;
- whether it was the model's wording or the template, and if the template, which check failed;
- the model and the token counts.

A fact's source is one of:

- a place: id, the tag, and the fetch time;
- a computation: its name and its inputs, for example "straight line × 1.3, walking speed, from place A to B";
- the traveller: the profile entry or the conversation message it came from.

How long it is kept: as long as the trip, deleted with the trip and with the account. Travellers' tastes and diets are personal data.

Card reasons are worked out on every read today. They are recorded the first time a card is offered, and that record and its wording are reused while the facts are unchanged.

### Part 3: fill-in-the-gaps wording

- **Which texts:** card reasons, the agent's conversation replies and confirmations, proposal messages, and the Quick plan report's sentences. Questions keep their fixed wording at first.
- **What the model gets:** each template sentence with its gaps and what each gap means. It may also see the values, so it can get grammar such as plurals right. It must answer, through structured output, with one version per sentence that uses the gaps.
- **The check is code, not a model.** A version is rejected when:
  - a gap is missing, repeated or unknown;
  - text outside the gaps holds a digit, a URL, an email, or a capitalised word other than at a sentence start or "I";
  - it holds a word from the claim list (for example: quiet, lively, popular, famous, best, top, hidden, authentic, local, cheap, expensive, romantic, family, busy, crowded, must, guaranteed, always, never);
  - it is more than half as long again as the template;
  - text outside the gaps holds letters outside the Latin alphabet, so English stays English with no new dependency.
    Every value is a gap: names, numbers, dates and day numbers. A capitalised word or a digit outside the gaps is allowed only if the template's own fixed text has it. The developer reviews the claim list.
- **When a check fails, the call fails, the call times out or the cap is reached,** the template is shown and the record says why.
- **Speed:**
  - The three reasons of a proposal are worded in one call.
  - Cards never wait more than 2.5 seconds for wording. After that they show the template, and the next read tries again. Late answers are dropped, not saved after the response, so nothing depends on work that a serverless platform may cut off.
  - Only accepted wording is cached, by template version and fact values.
- **Evaluation:** extend `scripts/model-eval/` with wording cases, including ones built to tempt the model into adding claims. A real run reports the pass rate of the check. The developer reads a sample of accepted versions before the feature is turned on in production.

### Part 4: realistic days

**Why.** On 2026-11-19 the developer read the eight sample trips and asked three questions. Why are there no breakfasts? Why is there no arriving at the hotel, and no travel to and from it? Were time zones and flight times handled?

Checked in the code that day:

- No breakfast. The PRD gives each day only lunch and dinner, and nobody decided to leave breakfast out.
- A booked stay has no position. So the first stop has no travel time from the lodging, and nothing takes the traveller back at night.
- Airport time is held back but not shown: 60 minutes after a first-day landing, 120 before a last-day departure, 60 before and 30 after a mid-trip ticket (`day-plan.ts`).
- A ticket's length is its arrival clock time minus its departure clock time, two different clocks. A same-day ticket that lands at an earlier clock time counts as 60 minutes.
- No sample traveller crosses a time zone.

Accuracy comes first, so a plan must show the parts of the day a traveller will really live through.

**4.1 Breakfast, as the traveller prefers.** The developer: breakfast options, "unless they prefer no breakfast"; ask for the preference and whether breakfast is included.

- A new taste question, "Breakfast?", in the conversation script and in the brief's "Your style" step. It is learned into the personal profile like the other tastes. The choices:
  - **"It comes with where I stay".** Each morning gets a quiet "Breakfast where you stay" row before the first stop, with no cards.
  - **"Suggest somewhere".** Each morning gets a breakfast slot before the first stop, offered as cards of cafés and bakeries like lunch, with a reason and a travel time.
  - **"No breakfast, thanks".** No row and no slot.
- Skipping the question means no breakfast, and the agent says so: "I will leave breakfast out; tell me if you want some."
- Designer's defaults, as constants:
  - The breakfast window is 07:30 to 10:00.
  - The visit takes 45 minutes, the café's standard length.
  - The first stop may move later within the existing late-start allowance to make room.
- The sample meal check ("no lunch or dinner left open") also covers breakfast when the traveller asked for suggestions.

**4.2 The lodging has a place, and the day starts and ends there.**

- When a traveller adds or edits a stay, they can look up its address. The places service looks it up on Nominatim with the same polite fetching and saves the result. The traveller sees the address it found and confirms it.
- The stay keeps the position and its source (the OpenStreetMap reference), as Part 1 does for places.
- For each day with a confirmed stay:
  - a leg from the stay to the first item, and a leg from the last item back;
  - both use the stated way of getting around (Part 1), and the day's end check includes the way back.
- A stay with a check-in time gets a "Check in at {stay}" row with travel to it. A stay without one keeps today's note, so the plan never invents a check-in time.
- With no confirmed stay, the plan does not guess a position. The first and last legs are missing, and the day says so quietly in the doubt style of Part 1, for example "Travel from where you stay is not counted. Add its address."
- **Not part of this:** proposing where to stay. TB-AGT-10 remains partly met.

**4.3 Time for airports and stations is shown, not hidden.**

- The time held back around a ticket becomes rows, for example "From the airport, about 1 h allowed" and "To the airport and check-in, 2 h allowed, from 15:40".
  - "Allowed" says it is an allowance, not a measured trip, so the row carries a doubt line: "Check the transfer time for your airport."
  - Airport positions are unknown, because a ticket stores only text for each end. So the allowance is never presented as a travel time.
- The allowances depend on the kind of ticket, as designer's defaults:
  - a flight: 120 minutes before and 60 after;
  - a train, bus or ferry: 30 before and 20 after.
- Changing an allowance by hand is not part of this.

**4.4 Ticket lengths across time zones.**

- Each end of a ticket gets a time zone:
  - from the trip's city with that name;
  - otherwise from the existing city lookup, which is saved.
- The length is worked out in real time with `offsetAt`. For example, London 10:00 to Rome 13:00 in summer is 2 hours.
- A ticket shows each clock with its place: "Leaves 10:00 London time · arrives 13:00 Rome time".
- When an end's zone cannot be found, the length is shown as unknown and the 60-minute fallback goes. Each time stays in its own place's clock (TB-ITN-16).
- A ninth sample traveller crosses zones by a same-day flight, for example London to Rome. Unit tests also cover a same-day flight that lands at an earlier clock time (Tokyo to Honolulu).

**Designer's calls in Part 4** (the developer may change any of them):

- skipping the breakfast question means no breakfast;
- the breakfast window and length;
- the allowances by kind of ticket;
- the address is confirmed by the traveller before it counts;
- no guessed lodging position;
- the ninth sample traveller.

## Settled after the builder check (designer's calls)

1. **Templates are inline today.** Messages and reasons are template literals with the values slotted in, for example `` `You chose this for day ${day.day}.` ``, spread over `turn.ts`, `conversation.ts`, `plan.ts`, `propose.ts` and `build-report.ts`. Part 3 therefore starts by turning each text it rewords into a named, versioned template with named gaps. Card reasons come first because they are built in one place (`reasonFor`). Replies, proposal messages and report sentences follow, one pull request each.
2. **Card identity and "unchanged".**
   - A card reason's record is keyed by trip, slot, place and a hash of the template version, the fact values and their sources.
   - "Unchanged" means the same hash.
   - A new hash makes a new record. Old records stay with the trip.
3. **Provenance lives on `Place`.** The places service owns that table, so its new columns (the tags as JSON, the last-edit time, the fetch time) cross no border.
   - There is no backfill. A row with no fetch time counts as stale, so the 30-day refresh replaces it on next use.
   - Rows from before the change count as unsure until then: hours from them get the doubt line.
4. **The Overpass 406 is this milestone's first piece.**
   - Part 1 is merged once it passes on sample places and on stored real-tag fixtures.
   - The milestone's exit needs real places working, checked once with the real service.
5. **Who chose a place is not recorded today.** Plan entries need a "chosen by" marker (traveller, Quick plan build, or the agent on request), set where each is placed. That migration comes before the 1.1 wording fix.
6. **Travel times are worked out on read,** so passing the stated way of getting around changes every plan's times, old ones included. That is wanted, because accuracy comes first. A day that no longer fits is flagged by the existing rechecks (TB-ITN-10), not silently changed.
7. **Language** is checked as in Part 3 above, with no language-detection library.
8. **No work after the response.** See Speed in Part 3.
9. **Deletion.** Record rows reference the trip with `onDelete: Cascade`. The account's delete path already removes trips, so the records go with it. The builder confirms both with a test.

## Left to the builder

- Which service owns the private record table, within the borders.
- The schema and the migration.
- The prompt.
- The cache keys.
- The exact replacement wording for 1.1. The developer sees it in the pull request.
- Test design.
- How to split the parts into pull requests.

The 30-day refresh, the 12-month staleness rule and the 2.5-second budget are the designer's defaults. They are constants the developer can change.

## Order and dependencies

1. **Overpass.** On 2026-11-19 six test requests showed that overpass-api.de refuses the developer's home address outright, even its status page. Its mirrors are IPv6-only, and WSL cannot reach them. The first piece finds out whether Overpass answers from Vercel, and fixes the route if not. Until then Part 1 is built and checked on sample places, and its real-place rules on stored fixtures.
2. **Part 1, then Part 4, then Part 2, then Part 3.**
   - Part 4 comes after Part 1 because it uses the stated way of getting around and the doubt style.
   - It comes before Part 2 so the private record covers its new rows.
   - Part 3 needs the API key and a passing evaluation.
3. **Roadmap:** this becomes Milestone 9, "Trustworthy facts, wording and realistic days", on branch `milestone/9-trustworthy-wording`.

# Trustworthy facts, wording and realistic days (Milestone 9) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan piece by piece. Each piece is one feature branch and one pull request into the milestone branch. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every fact a traveller reads is true of stored data and traceable to its source; shaky facts say so quietly and can be checked; the AI model rewords the agent's sentences without ever stating a fact; and each day shows breakfast, the way to and from the lodging, airport and station time, and real ticket lengths across time zones.

**Architecture:** Places keeps each place's OpenStreetMap tags, last-edit time and fetch time, and refreshes a city after 30 days. Pure rules in Places, Recommendations and Itinerary decide doubt lines, reasons and the new rows of a day. Trips keeps a stay's confirmed position and each ticket end's time zone. Every reason and agent message is built from named, versioned templates whose gaps hold sourced facts. Conversation keeps a private record of each text shown and, behind its model boundary, asks the model to reword templates. Code fills and checks every version.

**Tech Stack:** Next.js 16.2 App Router, React 19, Prisma 7 on PostgreSQL (Neon), Zod 4, Vitest, Playwright. No new dependency.

**Spec:** [design, approved 2026-11-19](../specs/2026-11-19-traceable-facts-and-model-wording-design.md) (Parts 1 to 4); [requirements](../../requirements.md) TB-RSN-01 to 03, TB-TRU-02, TB-TRU-04 to 06, TB-AGT-15, TB-SYS-10, TB-SYS-11, TB-CRD-03, TB-ITN-16 and the six added by piece 0; [PRD](../../prd.md) 9.3, 9.4 and 17; [ADR-008](../../architecture/adr-008-modular-services-in-one-deployment.md), [ADR-009](../../architecture/adr-009-place-data-provider.md). Builds on [Milestone 8](2026-11-18-quality-release.md).

## How this milestone is traced

The milestone branch is `milestone/9-trustworthy-wording`. It exists at `9a06c3e`, 16 commits behind `main` (`58d0f7f`), and is an ancestor of it. Piece 0 starts by fast-forwarding it to `main`. Each piece is a feature branch cut from the milestone branch and merged by pull request with a merge commit. The pull request names its requirement IDs and its check results, and its number is written here.

| Piece                                     | Feature branch                 | Requirements                                                     | Pull request |
| ----------------------------------------- | ------------------------------ | ---------------------------------------------------------------- | ------------ |
| 0. Plan, design and target requirements   | `feature/m9-plan`              | none (process); adds TB-AGT-16, TB-FIX-07, TB-ITN-21 to 24       | #81          |
| 1. Overpass from Vercel                   | `feature/m9-overpass`          | TB-SYS-09, TB-TRU-06                                             |              |
| 2. Place provenance and refresh           | `feature/m9-provenance`        | TB-TRU-02, TB-SYS-12                                             | #82          |
| 3. True sentences and doubt rules         | `feature/m9-true-sentences`    | TB-RSN-01, TB-RSN-02, TB-RSN-03, TB-TRU-02, TB-TRU-05, TB-ITN-06 | #83          |
| 4. Check it yourself                      | `feature/m9-check-yourself`    | TB-TRU-05, TB-CRD-04, TB-DSN-05, TB-DSN-07                       | #84          |
| 5. Breakfast                              | `feature/m9-breakfast`         | TB-AGT-16, TB-ITN-21                                             | #85          |
| 6. Ticket clocks across time zones        | `feature/m9-ticket-clocks`     | TB-ITN-16, TB-ITN-24, TB-SYS-15                                  | #86          |
| 7. Airport and station time shown         | `feature/m9-ticket-allowances` | TB-ITN-23                                                        | #87          |
| 8. Where you stay                         | `feature/m9-stay`              | TB-FIX-07, TB-ITN-22, TB-ITN-06                                  | #88          |
| 9. The private record of card reasons     | `feature/m9-reason-record`     | TB-RSN-03, TB-TRU-02, TB-CRD-03                                  |              |
| 10. The private record of agent messages  | `feature/m9-message-record`    | TB-RSN-01, TB-TRU-02, TB-QPL-10                                  |              |
| 11. The wording check, and reasons worded | `feature/m9-word-reasons`      | TB-RSN-03, TB-TRU-03, TB-TRU-04, TB-AGT-15, TB-SYS-10, TB-SYS-11 |              |
| 12. Replies and confirmations worded      | `feature/m9-word-replies`      | TB-TRU-03, TB-AGT-15, TB-SYS-10, TB-SYS-11                       |              |
| 13. Proposal messages worded              | `feature/m9-word-proposals`    | TB-AGT-09, TB-TRU-03                                             |              |
| 14. Quick plan report worded              | `feature/m9-word-report`       | TB-QPL-10, TB-TRU-03                                             |              |
| 15. Evidence                              | `feature/m9-evidence`          | all of the above, re-checked                                     |              |
| 16. The rest of the review                | `feature/m9-day-order`         | TB-ITN-06, TB-ITN-21 to 24, TB-FIX-07, TB-TRU-05, TB-SYS-15      | #90          |
| 17. Traveller choices                     | `feature/m9-traveller-choices` | TB-ITN-21, TB-FIX-08, TB-CRD-13                                  | #92          |
| 18. Fair use                              | `feature/m9-fair-use`          | TB-SYS-16, TB-SYS-17                                             |              |
| 19. Cities and both ways to get there     | `feature/m9-itinerary-cities`  | TB-ITN-25, TB-ITN-26, TB-ITN-27                                  |              |
| 20. Saving the facts keeps the answers    | `feature/m9-facts-save`        | TB-FAC-01, TB-FAC-02, TB-FAC-03, TB-AGT-03                       | #91          |
| 21. Time windows                          | `feature/m9-time-windows`      | TB-ITN-22                                                        |              |

The fixes from the whole-batch review of pieces 2 to 8 are on `feature/m9-batch-fixes`, pull request #89. Piece 20 is built straight after piece 16, because it stops the loss of a traveller's answers on the live site. It then reaches `main` with the milestone (developer, 2026-11-20).

Order follows the design: Overpass first, then Part 1 (pieces 2 to 4), Part 4 (5 to 8), Part 2 (9 and 10), Part 3 (11 to 14). Piece 1 waits on the developer for its measurement. Pieces 2 to 4 do not wait for it: they are built and checked on sample places and stored real-tag fixtures.

## Global Constraints

- Service borders: import another service only through its `index.ts` or `contracts.ts`; query only the tables a service owns; raw SQL only inside the service owning every table it touches; never add to `eslint-suppressions.json`. Every new table goes into `service-map.json` and `docs/architecture/service-borders.md`, and `prisma/service-ownership.test.ts` passes.
- Migrations: one per piece that needs one (pieces 2, 6, 8, 9), written with `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`, applied with `prisma migrate deploy` to the development database only. An applied migration is never edited. They reach QA and production only through the developer's merge of the milestone and the protected migration workflow (`docs/operating-constraints.md`). No column is dropped.
- Everything works with the AI model off. Tests, the sample travellers and the design checks run with `AI_MODE=off` and `PLACE_PROVIDER_MODE=mock`.
- **The repository is public.** The contact address for OpenStreetMap lives only in `PLACES_USER_AGENT` in each environment. It never appears in code, tests, fixtures, documents, commit messages or pull requests.
- OpenStreetMap: Nominatim at most one request a second, on submit only, every result saved; light use of Overpass; the footer credit "Place data © OpenStreetMap contributors" stays.
- Google: only Maps URLs, which need no key, are linked. Nothing from Google is fetched or stored.
- Doubt is quiet: a doubt line is `font-sans text-[13px] leading-6 text-muted`, under its value, with no colour, icon or banner. Doubt lines never sit on every card.
- Designer's defaults, each a named constant the developer can change: refresh after **30 days**; hours stale after **12 months**; wording budget **2.5 seconds**; breakfast starts **07:30 to 10:00** and takes **45 minutes**; allowances **flight 120 before and 60 after; train, bus or ferry 30 before and 20 after**.
- No sentence in sample mode says "its listing says". A sample place has no "Check it yourself" row and no notability claim.
- The model never chooses, ranks or schedules (TB-TRU-04). It is reached only through Conversation's `modelCall`, under the AI cap (15 US dollars a month), never inside a database transaction. Nothing is worked after the response is sent.
- Fixed interface text is never reworded: buttons, labels, refusals, doubt lines, the "Check it yourself" row and answer choices.
- Before each merge: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` pass. A piece that changes a screen also passes `npm run quality:design -- <local server>` in Chromium, Firefox and WebKit. A piece that changes a plan or a reason also passes `npm run quality:samples -- <local server>` and commits the regenerated `docs/quality/sample-travellers.md`.

## Decisions made by the planner

Where the design leaves a choice to the builder. Each is open to change.

1. **Who chose a place is already recorded.** The design asks for a "chosen by" marker and a migration. The Quick plan build already keeps what it placed (`Plan.build.built`), and `builtPlaceIds(build, state)` (`src/features/itinerary/plan-store.ts:110-117`) returns the places the build chose and the traveller left in place. No code path lets the agent pick on request. Piece 3 uses that record, with no marker and no migration.
2. **A fetch record names its query version.** `gather` keys `PlaceFetch.scope` as `<origin>:<scope>#<version>`, using `QUERY_VERSION = { sights: 2, food: 2 }` in `place-store.ts`. A changed query is a different request, so it is fetched again on next use and its rows are updated in place. This is how rows from before provenance are replaced on next use (design, settled 3). Piece 5 moves food to 3 for bakeries. Old fetch records stay, unused.
3. **Rows with no date to judge.** For an OpenStreetMap row with hours but no `check_date` and no edit time, the doubt line is "Not known when these hours were last checked. Worth a check." The developer sees it in piece 3's pull request.
4. **Breakfast** starts at the day's start (`segment.from`) and is laid out only when that start falls within 07:30 to 10:00. "Late nights" (day starting at 10:00) therefore still gets breakfast. "Breakfast where you stay" is not shown on day 1, because no night has been spent there yet. Cafés and a new `bakery` kind serve breakfast.
5. **Where you stay:** a position counts only once the traveller confirms a found address. Each address search is cached in a new Places table, because Nominatim's policy says results must be cached. A stay with no end date covers only its check-in night.
6. **Allowances:** any ticket mode other than `FLIGHT` uses the train values. A mid-trip assumed transfer (no ticket) keeps today's 60 before and 30 after.
7. **The private record** belongs to Conversation, which owns the model boundary and the messages. It is one table, `wording_records`, with at most one template row and one model row per (trip, subject, facts key).
8. **A separate switch for wording.** `AI_WORDING=on` turns model wording on, and it is off by default. `AI_MODE` still governs reading typed input. Production keeps wording off until the developer has read a sample (design, Part 3).
9. **The cross-zone sample traveller is a fifth traveller.** The design's "ninth" counts the eight existing itineraries. Planned both ways, the fifth traveller gives ten.
10. **Templates come with the record.** The design starts Part 3 by turning texts into named, versioned templates. The record (Part 2) is built first and must name each text's template and version, so pieces 9 and 10 do the conversion, and Part 3 only adds the model path.

## Review Focus

1. **A real place whose hours are known but stale:** the closer look shows the year line, and its reason never says "It is open for the whole visit". Test in piece 3.
2. **A sample place:** no "its listing says", no "well-known" or "quieter", no link row; its diet sentence names "the sample data". Tests in pieces 3 and 4.
3. **The model off, at the cap, slow, or answering badly:** every text is its template within 2.5 seconds, the record says why, and no card waits longer. Tests in piece 11.
4. **Tokyo 18:00 to Honolulu 06:30 on the same date:** the ticket lasts 7 h 30, the Honolulu evening is planned after landing, and an end with no zone gives no length and no 60-minute fallback. Test in piece 6.
5. **A refresh fails:** old rows keep their old dates and doubt lines (piece 2). If piece 1's fallback is built, a 406 from one host moves to the next endpoint and does not pause Nominatim (piece 1).

---

## Pieces

Each piece lists its failing tests first. They are written before the code, run, seen to fail, and then made to pass.

### Piece 0: Plan, design and target requirements

**Files:** this plan as `docs/superpowers/plans/2026-11-19-trustworthy-facts-and-realistic-days.md`; the approved design (the newest version, with Part 4) as `docs/superpowers/specs/2026-11-19-traceable-facts-and-model-wording-design.md`; `docs/roadmap.md` (new "Milestone 9: Trustworthy facts, wording and realistic days"); `docs/requirements.md`; `docs/prd.md`.

**Requirements added** (target only; the status document is not touched):

| ID        | Section | Requirement                                                                                                                                                                                                                                      |
| --------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TB-AGT-16 | 5       | The agent asks whether the traveller wants breakfast: where they stay, suggested places, or none. A skipped question means none, and the agent says so.                                                                                          |
| TB-FIX-07 | 4       | A stay's address can be looked up. Its position counts only after the traveller confirms the found address, and it is saved with its source.                                                                                                     |
| TB-ITN-21 | 7       | Each day shows breakfast as the traveller chose: a row where they stay, a breakfast slot offered as cards within the breakfast window, or nothing.                                                                                               |
| TB-ITN-22 | 7       | With a confirmed stay, each day starts and ends there, with estimated legs by the preferred means, and the way back counts toward the day's end. Without one, the plan guesses no position and the day says travel from the stay is not counted. |
| TB-ITN-23 | 7       | Time allowed to reach or leave an airport or station around a ticket is shown as its own row, marked as an allowance and never as a travel time.                                                                                                 |
| TB-ITN-24 | 7       | A ticket's length is worked out from the time zones of both ends, and each of its times is shown with its place. When a zone is unknown, the length is shown as unknown.                                                                         |

**PRD lines:** 7.3 gains "**Breakfast:** where they stay, suggested places, or none." 9.3 gains rule 8, "Time allowed for airports and stations is shown as an allowance, not hidden", and rule 9, "With a confirmed stay, the day starts and ends there, and the way back counts toward the end of the day." 9.4 gains "Breakfast, when wanted, starts between 07:30 and 10:00 and takes 45 minutes. Around a ticket: a flight allows 120 minutes before and 60 after; a train, bus or ferry 30 before and 20 after."

**Done when:** `npx prettier --check` passes on the changed documents.

### Piece 1: Overpass from Vercel

overpass-api.de answers 406 to every request from the developer's home address, even `/api/status` (2026-11-19). The cause is the address, not the User-Agent. The known mirrors, overpass.private.coffee and overpass.kumi.systems, are reachable only over IPv6, and WSL has none. Production runs on Vercel, at a different address, and is untested.

**Step 1: measure from Vercel (the developer, then a read; no code, no diagnostic route).**

- [ ] The developer sets `PLACES_USER_AGENT` in the existing Vercel project's production environment. The value is held outside the repository.
- [ ] The developer opens a slot on production: sets `PLACE_PROVIDER_MODE` to a value other than `mock`, redeploys the existing production target, and starts one trip to a city with no saved real places, then opens its trip page.
- [ ] Read Vercel's runtime logs for that window, and read the production database **read-only**: `city_lookups` (did Nominatim answer?), `provider_calls` where `service = 'OSM'` (attempts), `place_fetches` where `scope LIKE 'OSM:%'` (successes, with `place_count`), and `places` where `origin = 'OSM'`.
- [ ] Record the result in this piece's pull request and in a dated note in ADR-009.

The current code logs nothing when a request is refused (`place-store.ts:116-118` returns "unavailable"). So the database rows, not the logs, show whether Overpass answered.

**If Overpass answers from Vercel:** the piece ends with the note. No code.

**Step 2: only if Vercel is refused too.**

**Files:** `src/features/places/overpass.ts`, `src/features/places/osm-http.ts`; tests `src/features/places/overpass.test.ts` (new) and `src/features/places/osm-http.test.ts` (new).

**Interfaces:** `export const OVERPASS_ENDPOINTS: readonly string[]` (overpass-api.de first, then the two mirrors, in that order). `runOverpass(query: string): Promise<FoundPlace[]>` keeps its signature.

- [ ] Failing tests: `runOverpass` "tries the next endpoint after a 406", "after a 429, a 5xx, a timeout or a network error", "throws the last error when every endpoint fails", and "sends the PLACES_USER_AGENT header to each". `politeFetch`: "a 406 from one host does not pause another host", and "logs the host and status of a refused or failed request, never the header".
- [ ] Implement: `runOverpass` loops over `OVERPASS_ENDPOINTS`. `politeFetch` keys `pausedUntil` by `new URL(url).host`, and `console.warn`s `{ host, status }` on a refusal or failure. The one-request-a-second queue stays shared.
- [ ] The check from Vercel: on the QA preview, at the developer's request, or on production after the milestone merge. See "Waiting for the developer".

### Piece 2: Place provenance and refresh

**Owner:** Places (`places`, `place_fetches`). **Migration:** `<timestamp>_place_provenance`.

```prisma
// model Place, added
  /// The OpenStreetMap tags its facts were read from, as they arrived (KEPT_TAGS only).
  osmTags      Json?     @map("osm_tags")
  /// The element's last edit on the map (Overpass `out meta`).
  lastEditedAt DateTime? @map("last_edited_at")
  /// When this row was last fetched. Null: fetched before provenance was kept.
  fetchedAt    DateTime? @map("fetched_at")
```

**Files:** `prisma/schema.prisma`; `src/features/places/{kinds.ts, overpass.ts, nominatim.ts, place-source.ts, sample-source.ts, place-store.ts, contracts.ts}`; a fixture `src/features/places/overpass-fixture.ts`, holding an Overpass `out meta` reply in Overpass's JSON form with tags copied from real elements and with their ids.

**Interfaces:**

- `KEPT_TAGS` and `keptTags(tags): Record<string, string>` in `kinds.ts`: `name`, `name:en`, `opening_hours`, `check_date`, `check_date:opening_hours`, `website`, `contact:website`, `cuisine`, every `diet:*`, `wikidata`, `wikipedia`, `amenity`, `tourism`, `leisure`, `historic`, `shop`.
- `FoundPlace` gains `tags: Record<string, string> | null` and `lastEditedAt: Date | null`.
- `PlaceDto` gains `originRef: string | null`, `tags: Record<string, string>` (`{}` when none), `lastEditedAt: string | null` and `fetchedAt: string | null` (ISO). Piece 3 adds `hoursDoubt`.
- The Overpass queries end `out center meta …;`. Nothing but the timestamp is kept from the metadata: no user names.
- `save` writes every found place in one `INSERT … ON CONFLICT ("origin","origin_ref") DO UPDATE` through `db.$executeRaw`, setting `fetched_at = now()`.
- `gather` treats a scope as done only when its record (decision 2) is younger than `REFRESH_DAYS = 30`. A failed refresh returns "unavailable" and leaves rows and fetch record untouched.

- [ ] Failing tests, in `place-store.test.ts` and `place-source.test.ts`: "keeps only the kept tags and the last edit time from an Overpass reply" (fixture); "keeps Nominatim's extratags with no edit time"; "fetches a scope again after 30 days, writing one upsert"; "a recent record means no request"; "a record of an older query version means one request"; "a failed refresh leaves rows and the record as they were and says unavailable"; "sample places carry no tags and no edit time".
- [ ] Checked once against the development database, inside a transaction that is rolled back: an upsert keeps a row's id and updates its tags and fetch time.

### Piece 3: True sentences and doubt rules

**Files:** `src/features/places/opening-hours.ts` (doubt rule), `place-store.ts` (`toDto`), `contracts.ts`; `src/features/recommendations/propose.ts`, `contracts.ts`; `src/features/itinerary/day-plan.ts`; `src/use-cases/plan.ts`; `scripts/sample-travellers/checks.ts`.

**Interfaces:**

- `hoursDoubt(place: Pick<PlaceDto, "origin" | "openingHours" | "tags" | "lastEditedAt">, today: string): string | null` in `opening-hours.ts`, exported from `places/contracts`. It returns "Hours not known. Check before you go." when the hours are absent or do not parse. For a known OpenStreetMap place, it judges `check_date:opening_hours`, else `check_date`, else `lastEditedAt`: older than `STALE_MONTHS = 12` gives "Last updated on the map in {year}. Worth a check."; no date gives decision 3's line; otherwise `null`. A sample or own place with hours gives `null`.
- `PlaceDto.hoursDoubt: string | null`, set in `toDto` from today's date.
- `CardTaste.means?: TravelMeans` and `PlanContext.means?: TravelMeans`, from `taste.getting_around` in `cardTaste` and `contextFor` (`plan.ts`). They are passed to `travelEstimate` at `propose.ts:182` and `day-plan.ts:504`.
- `chosenCards` (`plan.ts:416-447`) takes the trip's `BuildProgress` and says "I chose this for day N." for a place in `builtPlaceIds`, otherwise "You chose this for day N."
- `cardsFor` (`plan.ts:275-289`): `from` is the last entry before the slot that is not `open` or `wander`. It counts only when that entry is a `place` with a position. A commitment or a transfer gives `null`.

**Sentence rules** (exact replacement wording is the builder's; the developer reads it in the pull request):

- Drop "So I looked closer" (`propose.ts:237-239`).
- A notability sentence states only what the tag supports, that the place has or has no Wikipedia or Wikidata entry. It never appears for a sample place. The ranking weights do not change.
- "It is open for the whole visit." only when `isOpenFor` says open and `hoursDoubt` is `null`. Open but in doubt: a sentence that says its hours may be out of date and to check, never that it is open.
- Diet: a real place names the tag's own word ("its listing says it has vegan options" when `diet:vegan` implied vegetarian). A sample place says "the sample data says".
- The card front reads `"{kind} · about {N} min {walk|ride|drive}"`.

- [ ] Failing tests:
  - `opening-hours.test.ts` (new), on `hoursDoubt`: fresh `check_date:opening_hours` gives null; `check_date=2021-03-01` gives the 2021 line; only a two-year-old edit gives the year line; no dates gives decision 3's line; unparseable gives "Hours not known"; a sample place with hours gives null.
  - `propose.test.ts`: "uses the stated means for travel"; "the front says about N min"; "never says it looked closer"; "says nothing of notability for a sample place"; "says open only when hours are fresh"; "names the tag's own diet word"; "says the sample data for a sample diet".
  - `day-plan.test.ts`: "times a leg by the stated means".
  - `plan.test.ts`: "a built place left in place says I chose it"; "travel is not from a place before a booking".
  - `checks.test.ts`: the new forms pass, and "a quieter choice" fails.
- [ ] `quality:samples`: every reason passes `checkReason`; the report is regenerated.

### Piece 4: Check it yourself

**Files:** `src/features/places/links.ts` (new, exported from `contracts`), `src/features/recommendations/propose.ts` (`toCard`), `recommendations/contracts.ts`, `src/components/keepsake/{types.ts, trip-workspace.tsx (toCardPlace), closer-look.tsx}`, `scripts/design-checks/run.ts`.

**Interfaces:**

```ts
export type PlaceLinks = {
  website: string | null;
  maps: string;
  osm: string | null;
};
export function placeLinks(
  place: PlaceDto,
  cityName: string,
): PlaceLinks | null; // null for SAMPLE
```

- `website` comes from `tags.website ?? tags["contact:website"]`, only when it parses as an `http:` or `https:` URL.
- `maps` is `https://www.google.com/maps/search/?api=1&query=` with the encoded name and `lat,lon`, or with the name and city for an own place without a position.
- `osm` is `https://www.openstreetmap.org/{originRef}` for an OpenStreetMap place, and `null` for an own place.
- `CardDto` and `CardPlace` gain `links: PlaceLinks | null` and `hoursDoubt: string | null`.
- The closer look adds the doubt line under Hours and a "Check it yourself" row in the existing `<dl>`. The label uses the `<dt>` style; the links use `quiet`, `target="_blank"`, `rel="noopener noreferrer"`, and `aria-label` "{name} on Google Maps, opens in a new tab" (likewise "website" and "OpenStreetMap"). The Price and Rating rows stay.

- [ ] Failing tests:
  - `links.test.ts`: a `javascript:` website or one with no scheme gives `null`; the Maps query is encoded; `node/123` gives its OpenStreetMap URL; an own place has no OpenStreetMap link; a sample place gives `null`.
  - `keepsake.test.tsx`: the doubt line carries the label classes; the three links have the right target, rel and accessible names; a sample place has no row.
- [ ] `quality:design`: the walk adds one place by hand to its own trip, opens its closer look, and checks the row. The Maps link is reached by Tab with focus showing, has a target of at least 24 px, and gives no sideways scroll at 390 and 320. All three browsers pass every check.
- [ ] By hand, once: the Maps link for one stored real-tag fixture place lands on that place. The Maps search URL is not documented for a name with a position, so this is checked, not assumed.

### Piece 5: Breakfast

**Files:** `src/features/memory/contracts.ts` (`TASTE_TOPICS` gains `"breakfast"` after `"food"`; `TOPIC_NAMES.breakfast = "Breakfast"`); `src/features/conversation/script.ts` (`QUESTIONS.breakfast`, `TASTE_DEFAULTS.breakfast = ["none"]`); `src/features/places/{kinds.ts, overpass.ts, sample-source.ts, place-store.ts}`; `src/features/itinerary/{contracts.ts, day-plan.ts}`; `src/features/recommendations/propose.ts`; `src/use-cases/plan.ts`; `src/components/keepsake/plan-itinerary.tsx`; `scripts/sample-travellers/{checks.ts, travellers.ts}`.

**Interfaces:**

- `QUESTIONS.breakfast`: `pick_one`, prompt "Breakfast?", choices `included` "It comes with where I stay", `suggest` "Suggest somewhere", `none` "No breakfast, thanks". `skipSays` is "I will leave breakfast out; tell me if you want some." The brief's "Your style", the profile page and learning pick it up from `TASTE_TOPICS`.
- `PLACE_KINDS` gains `"bakery"` (label "Bakery", 45 minutes, a meal kind). `kindFromOsmTags` maps `shop=bakery`. `foodQuery` adds `nwr["shop"="bakery"]["name"]`. `QUERY_VERSION.food = 3`. The sample food gains one bakery and one more café.
- `SLOT_KINDS` gains `"breakfast"` ("Breakfast"). `BREAKFAST = { from: 450, until: 600, minutes: 45 }` in `day-plan.ts`. `PlanContext.breakfast?: "included" | "suggest" | "none"`.
- `kindSuitsSlot`: breakfast takes a café or bakery; lunch a restaurant or café; dinner a restaurant. Breakfast counts as a meal in `isMealSlot`, in `propose.ts` `isMeal` and in `plan.ts` `isMeal`, so dietary rules apply to it.
- `PlanEntry` gains `{ type: "breakfast-at-stay"; start: string; minutes: number }`, shown as a quiet row, "Breakfast where you stay".

- [ ] Failing tests:
  - `script.test.ts`: asks "Breakfast?" with three choices; a skip says the skip line and stores `none`.
  - `day-plan.test.ts`: "suggest" gives a 45-minute slot at the day's start before the first stop, which moves later; there is no slot when the day starts after 10:00 (a landing at 11:00); "late nights" breakfast starts at 10:00; "included" gives the row and no slot, not on day 1; "none" gives neither.
  - `place-rules.test.ts`: `shop=bakery` is a bakery; breakfast suits a café or bakery only.
  - `checks.test.ts`: an open breakfast slot is a finding when the traveller asked for suggestions.
- [ ] `travellers.ts`: Maya answers "suggest", the Okafors "included"; Dan and Priya and Sam skip. `quality:samples` passes, the report regenerated.
- [ ] `quality:design`: the walk answers the breakfast question; all three browsers pass.

### Piece 6: Ticket clocks across time zones

**Owner:** Trips (`fixed_commitments`). **Migration:** `<timestamp>_ticket_time_zones`.

```prisma
// model FixedCommitment, added
  originTimeZone      String? @map("origin_time_zone") @db.VarChar(64)
  destinationTimeZone String? @map("destination_time_zone") @db.VarChar(64)
```

**Files:** `prisma/schema.prisma`; `src/features/trips/{contracts.ts, trip-store.ts, commitment-store.ts}`; `src/use-cases/start-trip.ts`; `src/features/itinerary/{local-time.ts, day-plan.ts, contracts.ts}`; `src/components/keepsake/{plan-itinerary.tsx, ticket-stub.tsx}`; `scripts/sample-travellers/*`.

**Interfaces:**

- `NewTrip.tickets: (TicketInput & { fromZone: string | null; toZone: string | null })[]`.
- `startTrip` fills each end's zone from the trip city whose lower-cased name equals `placeKey(end)`. Otherwise it uses the first result of `findCities(placeName(end))` from `@/features/places`, one at a time; that lookup is saved by `CityLookup`.
- `CommitmentDto.transport` gains `originZone: string | null` and `destinationZone: string | null`.
- `ticketMinutes(c: CommitmentDto): number | null` in `local-time.ts`. It uses `offsetAt` at each end, and gives `null` when either zone or `endTime` is missing.
- In `fixedOn`, a ticket's `end` is its arrival clock. The commitment entry's `minutes` becomes `ticketMinutes`, and the 60-minute fallback (`day-plan.ts:191-194`) goes for tickets.
- The commitment entry gains `ticket: { from: string; to: string; arrives: string | null } | null`. The stub reads "Leaves 10:00 London time · arrives 13:00 Rome time · 2 h", or "length unknown".

- [ ] Failing tests:
  - `local-time.test.ts`: London 10:00 to Rome 13:00 on 2027-06-18 gives 120; Tokyo 18:00 to Honolulu 06:30 on one date gives 450; a missing zone gives `null`.
  - `day-plan.test.ts`: the Honolulu dinner falls after landing; an unknown zone shows no length and no 60-minute end.
  - `start-trip.test.ts` (new): the zone comes from the trip city, else from the lookup.
- [ ] Fifth sample traveller in `travellers.ts`: alone, London to Rome by a same-day flight and back, four nights, answers `getting_around: transit` and `breakfast: suggest`, with `expected.ticketMinutes`. `checkItinerary` gains "Each ticket lasts its real length". `quality:samples` passes for five travellers (ten itineraries).
- [ ] Checked against the development database, inside a rolled-back transaction: a ticket saves both zones.

### Piece 7: Airport and station time shown

**Files:** `src/features/itinerary/{day-plan.ts, contracts.ts}`, `src/components/keepsake/plan-itinerary.tsx`.

**Interfaces:**

- `ALLOWANCE: Record<"FLIGHT" | "GROUND", { before: number; after: number }> = { FLIGHT: { before: 120, after: 60 }, GROUND: { before: 30, after: 20 } }`.
- `PlanEntry` gains `{ type: "allowance"; way: "to" | "from"; mode: string; start: string; minutes: number }`.
- It replaces the hidden +60 (`day-plan.ts:291`), −120 (`:295`) and the ticket's −60/+30 (`:338-339`). An assumed transfer keeps its −60/+30.
- The UI reads "From the airport, about 1 h allowed" and "To the airport and check-in, 2 h allowed, from 15:40", with "station" for a train or bus and "port" for a ferry. Under each row, a doubt line: "Check the transfer time for your airport" (or station, or port).

- [ ] Failing tests:
  - `day-plan.test.ts`: a flight landing on day 1 gives a "from" row of 60 and the day starts after it; a last-day flight gives a "to" row of 120; a mid-trip train gives 30 before and 20 after; a night flight landing today gives a "from" row.
  - `plan-itinerary.test.tsx`: the row says "allowed", carries the doubt line in the label style, and never says "travel" or "min (estimate)".
- [ ] `quality:samples` passes (the Okafors and the fifth traveller show the rows); `quality:design` passes in all three browsers.

### Piece 8: Where you stay

**Owners:** Trips (`fixed_commitments`) and Places (new `address_lookups`, no foreign key). **Migration:** `<timestamp>_stay_position`.

```prisma
// model FixedCommitment, added: set only on a STAY whose found address the traveller confirmed
  latitude       Decimal? @db.Decimal(10, 7)
  longitude      Decimal? @db.Decimal(10, 7)
  locatedRef     String?  @map("located_ref") @db.VarChar(80)
  locatedAddress String?  @map("located_address") @db.VarChar(240)

model AddressLookup {
  /// The normalised search and the square it was bounded to.
  key       String   @id @db.VarChar(200)
  results   Json
  createdAt DateTime @default(now()) @map("created_at")

  @@map("address_lookups")
}
```

**Files:** `prisma/schema.prisma`, `service-map.json` (Places gains `AddressLookup`), `docs/architecture/service-borders.md`; `src/features/places/{address-lookup.ts (new), nominatim.ts, contracts.ts, index.ts}`; `src/app/api/v1/places/addresses/route.ts` (new), `docs/api/v1.md`; `src/features/trips/{contracts.ts, commitment-store.ts}`; `src/features/itinerary/{day-plan.ts, contracts.ts}`; `src/use-cases/plan.ts`; `src/components/keepsake/{trip-commitments.tsx, plan-itinerary.tsx}`.

**Interfaces:**

- `FoundAddress = { label: string; latitude: number; longitude: number; ref: string }` in `places/contracts`.
- `findAddresses(text: string, near: Point): Promise<{ status: "ok"; addresses: FoundAddress[] } | { status: "unavailable" | "capped" }>` in `address-lookup.ts`. It searches Nominatim through `politeFetch`, bounded about 0.3° around the city, and saves the results under its key. In mock mode it returns one sample address at the city centre and saves nothing, as `findCities` does.
- `GET /api/v1/places/addresses?q=&near=<lat>,<lon>` mirrors `/api/v1/places/cities`: 401 signed out, 503 when unavailable.
- `commitmentInputSchema` gains `located: { latitude, longitude, ref, address } | null`, accepted only when `kind` is `STAY`. `CommitmentDto.located` matches it.
- `day-plan.ts`: the morning stay is the one covering the night before; the evening stay is the one covering the night of the day. Pass 3 starts `lastPoint` at the morning stay. It adds `{ type: "return"; stay: string; start: string; travel: TravelLeg }` after the last item. It flags the last place with rule `day` when the way back ends after the day. A stay with a check-in time and a position gets `travelIn` and the title "Check in at {stay}".
- `PlanDay.stayNote: string | null`. On a day with a chosen place and no confirmed stay it says "Travel from where you stay is not counted. Add its address.", or "Travel from where you stay is not counted." when the trip has no stay that day.

- [ ] Failing tests:
  - `address-lookup.test.ts`: it parses, saves and reuses a search; mock mode saves nothing; capped and unavailable are reported.
  - `trip-rules.test.ts`: `located` is refused on a non-stay.
  - `day-plan.test.ts`: the first leg comes from the stay by the stated means; the return row is added; the way back past the day's end flags; a check-in row has travel to it; with no confirmed stay there are no legs and the note shows.
  - `routes.test.ts`: the address route answers 401, 200 and 503.
- [ ] Browser walk: add a stay, look up its address, see the found address, confirm it, and see the legs and the return row. `quality:design` covers the lookup form in all three browsers. `quality:samples` passes. The Okafors gain a stay with an address in Lisbon.

### Piece 9: The private record of card reasons

**Owner:** Conversation (new `wording_records`). The foreign key `WordingRecord.trip -> Trip (conversation -> trips)` is added to `crossBorderForeignKeys`. **Migration:** `<timestamp>_wording_records`.

```prisma
model WordingRecord {
  id           String   @id @default(dbgenerated("(gen_random_uuid())::text"))
  tripId       String   @map("trip_id")
  /// "card:<slotId>:<placeId>", "message:<messageId>" or "report:<line>".
  subject      String   @db.VarChar(160)
  /// sha256 of the sentences' templates, versions, fact values and sources. Same key: unchanged.
  factsKey     String   @map("facts_key") @db.VarChar(64)
  /// Each sentence: its template id and version, and each gap's value and source.
  sentences    Json
  shown        String   @db.Text
  /// "template" or "model".
  wordedBy     String   @map("worded_by") @db.VarChar(10)
  /// Why the template was shown: "off", "cap", "timeout", "error" or the failed check.
  fallback     String?  @db.VarChar(40)
  model        String?  @db.VarChar(40)
  inputTokens  Int?     @map("input_tokens")
  outputTokens Int?     @map("output_tokens")
  createdAt    DateTime @default(now()) @map("created_at")

  trip Trip @relation(fields: [tripId], references: [id], onDelete: Cascade)

  @@unique([tripId, subject, factsKey, wordedBy])
  @@map("wording_records")
}
```

**Interfaces**, in `src/lib/wording.ts` (pure; used by every service):

```ts
export type FactSource =
  | {
      type: "place";
      placeId: string;
      tag: string | null;
      fetchedAt: string | null;
    }
  | {
      type: "computation";
      name: string;
      inputs: Record<string, string | number>;
    }
  | { type: "traveller"; ref: string }; // "profile:<entryId>", "trip-taste:<topic>", "message:<id>"
export type Fact = { gap: string; value: string; source: FactSource };
export type Sentence = {
  template: string;
  version: number;
  text: string;
  facts: Fact[];
}; // text holds {gaps}
export function fill(sentence: Sentence): string; // throws on a gap with no fact or a fact with no gap
```

- `reasonFor` returns `Sentence[]`, built from named templates in `propose.ts` that cover every form piece 3 left. `proposeCards` returns `CardSet & { sentences: Record<string, Sentence[]> }`, and `plan.ts` strips `sentences` before the snapshot.
- `recordWordings(client, tripId, rows)` and `readWordings(client, tripId, subjects)` in `src/features/conversation/wording-store.ts`, exported from `index.ts`. `recordWordings` inserts with `skipDuplicates`.
- `shownWords(tripId: string, items: { subject: string; sentences: Sentence[] }[]): Promise<string[]>` in `src/use-cases/wording.ts`. In this piece it returns the filled templates and records them with `wordedBy: "template"` and `fallback: "off"`. `readPlan` calls it for proposed and chosen cards, outside any transaction.

- [ ] Failing tests:
  - `wording.test.ts`: `fill` fills gaps, and throws on a missing or extra gap.
  - `propose.test.ts`: each reason equals the filled sentences, and every fact has a source.
  - `wording-store.test.ts`: a repeat writes nothing; a changed value makes a new row and keeps the old one.
  - `plan.test.ts`: a card's reason is recorded once and reused on the next read.
- [ ] Deletion, checked against the development database inside a rolled-back transaction: deleting the trip removes its records, and deleting the user (the database cascade `Trip.user`; there is no account-deletion route in `src`) removes them too. `service-ownership.test.ts` passes.

### Piece 10: The private record of agent messages

**Files:** `src/features/conversation/{conversation-store.ts, turn.ts}`, `src/use-cases/{conversation.ts, plan.ts, build-report.ts}`.

**Interfaces:**

- `NewMessage` gains `sentences?: Sentence[]`. `appendMessages` writes each message and its record (`subject: "message:<id>"`, using `createManyAndReturn`) with the same client, so a turn's record joins the turn's transaction.
- The agent's replies and confirmations (`turn.ts`), the proposal message (`plan.ts:401`) and the report's lines (`buildReportOf` returns `{ line, sentences }`, recorded as `report:<n>` through `shownWords`) become named templates. Questions keep their fixed wording.

- [ ] Failing tests:
  - `conversation.test.ts`: every agent message of a turn has one record, with its templates and facts.
  - `plan.test.ts`: a proposal message is recorded.
  - `build-report.test.ts`: each line is the fill of its sentences.
  - The texts read the same as before, for every existing assertion.

### Piece 11: The wording check, and reasons worded

**Files:** `src/features/conversation/model/{mode.ts, word.ts (new), word-check.ts (new)}`, `index.ts`; `src/use-cases/wording.ts`; `scripts/model-eval/{wording-cases.ts (new), run.ts}`; `.env.example` (`AI_WORDING`).

**Interfaces:**

- `ModelCall` becomes `(request, options?: { signal?: AbortSignal }) => Promise<Anthropic.Message>`; `modelCall` passes the options to `messages.create`.
- `wordingMode(env): "on" | "off"`: on only when `aiMode` is on and `AI_WORDING=on`.
- `CLAIM_WORDS`: quiet, lively, popular, famous, best, top, hidden, authentic, local, cheap, expensive, romantic, family, busy, crowded, must, guaranteed, always, never. The developer reviews the list.
- `checkWording(template: string, version: string): WordingCheck | null`, where `WordingCheck` is one of `"gaps" | "digit" | "url" | "email" | "capital" | "claim" | "length" | "alphabet"`. It rejects:
  - a gap that is missing, repeated or unknown;
  - outside the gaps, a digit, URL, email or capitalised word (other than a sentence start or "I") that the template's own fixed text lacks;
  - a claim word;
  - a version more than 1.5 times the template's length;
  - a letter outside the Latin alphabet.
- `wordSentences(texts: Sentence[][], call: ModelCall, signal: AbortSignal): Promise<{ status: "worded"; versions: string[][]; usage: TokenUsage } | { status: "failed" | "discarded"; usage?: TokenUsage }>`. It uses structured output `{ versions: string[][] }`, one array per text and one string per sentence. The prompt is the builder's.
- `shownWords` reuses a model row for the same facts key. Otherwise, when `wordingMode` is on and under the cap, it makes one call for all items with `AbortSignal.timeout(2500)`. It checks each version, records model rows for accepted ones and template rows with their `fallback` for the rest, and counts usage with `addUsage`. A timed-out call is dropped and the next read tries again.

- [ ] Failing tests:
  - `word-check.test.ts`: one rejection per check, and an accepted version.
  - `word.test.ts`: a fake call returns versions; abort gives `failed`; a refusal gives `discarded`.
  - `wording.test.ts` (use case): off gives the template with `fallback: "off"`; at the cap, `"cap"`; a rejected version gives the template naming its check; an accepted one is reused with no second call; three reasons take one call; a call slower than 2.5 s shows the template within 2.6 s and the next read calls again.
- [ ] `npx tsx scripts/model-eval/run.ts --wording --dry-run` grades its cases, including ones built to tempt the model into claims. A real run, with the developer's key, writes `docs/quality/model-eval-wording.md` with the check's pass rate.

### Pieces 12 to 14: Replies, proposal messages and the Quick plan report worded

One pull request each, in this order. Each passes its piece-10 templates through `shownWords`'s model path. A turn words its reply after `decide` and before `runTripAction` (`conversation.ts:209-298`), so no model call is made inside the transaction. The proposal message and the report lines are worded on read, like card reasons.

- [ ] Failing tests per piece, in `conversation.test.ts`, `plan.test.ts` and `build-report.test.ts`: with wording off the text is unchanged; an accepted version is shown and recorded; a rejected one shows the template.
- [ ] Wording cases for that text group are added to `scripts/model-eval/wording-cases.ts`.

### Piece 15: Evidence

- [ ] Lint, type check, tests and build pass. `quality:samples` (five travellers) and `quality:design` (three browsers) pass, and their reports are committed.
- [ ] The walks of Milestones 4 to 8 are repeated.
- [ ] `docs/quality/requirements-evidence.md` marks every requirement this milestone names. `docs/status/current-implementation.md`, `docs/api/v1.md`, the roadmap and this plan are updated.
- [ ] The pull request of the milestone into `main` is opened, not merged.

### Piece 16: The rest of the review

Added on 2026-11-20 at the developer's word ("fix the wave scope"). It covers everything the whole-batch review and the fix-wave re-review left open, plus the ledger's deferred minors that cost little. In the ledger these are R1, R2 and the "minor (deferred)" lines.

**Owners:** Itinerary, Trips, Places, Recommendations, scripts. **Migration:** only for item 13 (`<timestamp>_place_gone`), development only.

**The order of a day** (`src/features/itinerary/day-plan.ts`, its tests and `day-order.test.ts`):

1. **R1: a day-1 date-line ticket.** On day 1, a ticket that lands today at an earlier clock time than it left sorts first, before its "from" row. An example is Tokyo 18:00 → Honolulu 06:30 on a trip that starts in Honolulu. Such a ticket is never a "later" step for the overlap or wander checks, and the clock reset at a date-line ticket applies only where the ticket is in order. Add the scenario to `day-order.test.ts`, checked per segment.
2. **R2: a pick that leaves no time for an open slot.** In pass 3, an open slot that no longer fits its hour before its part of the day ends flags the last pick before it in that part with rule `day`. The test is `start + 60 > until`, the same one pass 1 uses to create slots. The flag reads "Leaves no time for {lunch} before {16:00}." The `it.todo` becomes a case with packed-pace picks. `cardsFor` then refuses such cards through its existing "no new broken rule" check.
3. **A check-in and a booking.** A check-in step and its leg never run into a timed booking that starts after it; the check-in goes after that booking instead.
4. **Breakfast after a night ticket.** The included breakfast is skipped only when a ticket that left on an earlier date lands after `NIGHT_AT_STAY_UNTIL` (03:00 local). An earlier landing still leaves a night at the stay.
5. **Stay notes.** A day with one confirmed stay and one unconfirmed stay gets the note for the unconfirmed one. A day whose last item is an open slot or a booking still says how the way back is handled: the return row follows the last place when it fits in order, or else a quiet line reads "The way back from {last place} is not counted."
6. **Two "from" rows.** On a later day, a night-flight landing and a same-day city-change landing each get their "from" row.
7. **Tests:**
   - a 13:30 landing keeps lunch;
   - dinner under the late-meal rule;
   - a test fails if the pace buffer leaves the return flag;
   - untimed commitments are transparent for "from the stay" (`plan.ts` ~1160).

**Tickets** (`src/features/trips/`, `src/use-cases/start-trip.ts`, `src/components/keepsake/plan-itinerary.tsx`):

8. **The arrival date on the stub.** A ticket that lands on another date names that date: "arrives Sat 11 Jul 07:00 Madrid time".
9. **Where a ticket end's zone comes from.**
   - First, a trip city of the same name.
   - Otherwise, a lookup result, used only when it is unambiguous: one result, or exactly one result in a country the trip visits.
   - Otherwise the zone stays unknown, and the length reads unknown.
   - A failed lookup is tried again on the next save of that ticket.
10. **Old tickets.** A ticket end with no zone, whose city has the same name as one of the trip's cities, takes that city's zone when it is read. Nothing else is guessed.
11. **One helper.** `withoutCode` moves to `trips/contracts.ts`; the copy in `day-plan.ts` goes.

**Places** (`src/features/places/`, `src/components/keepsake/stay-address.tsx`, `src/app/api/v1/places/addresses/route.ts`):

12. **The address search moves to POST.** It becomes `POST /api/v1/places/addresses` with a JSON body, so the typed address stays out of request logs. Update `docs/api/v1.md` (with its 422), the component, its tests and the design walk. Hash the saved key when it would be longer than 200 characters.
13. **A place the provider stopped returning.** A refresh that no longer returns a place marks it as gone. A gone place is never offered on a card again, and a plan that holds it keeps it.
14. **The `DATE` pattern.** It reads a date at the start of the value again (`(?!\d)` rather than `(?=T|$)`), so "2021-03-15;2023-01-02" and "2021-03-15 10:00" are read. Year-month values and ISO times stay. Add a test.
15. **Small fixes from the ledger:**
    - The `osmTags` cast is checked.
    - A USER-origin diet sentence never says "its listing says".
    - `toDto` reads the clock once per call.
    - `hoursDoubt` gets a 12-month boundary test and a 29 February test.
    - The refresh gets an exact 30-day boundary test.
    - The prototype's static text stops saying "well-known" and "15 min walk".
    - The design walk treats breakfast as a meal, and its Shift+Tab and "holding: food" lines get a one-line why.
    - `allowed` in `plan-itinerary.tsx` gets a one-line why.
    - The stay-address label and control styles are shared with the bookings form.
    - The samples report prints the check-in leg and the stay note.
    - "Four sample travellers" and "eight itineraries" become five and ten in the docs, in `scripts/sample-travellers/run.ts` and in TB-SYS-15.

Not in this piece:

- the hand-made Overpass fixture, which waits for a real reply (piece 1);
- expiry of saved searches, which `city_lookups` lacks too;
- old vegan rows, which refetch;
- a booking's city on a date-line day, which is in piece 19.

**Checks:**

- lint, typecheck, tests and build;
- `quality:samples` with 0 failed, and the regenerated report committed;
- `quality:design` in Chromium, Firefox and WebKit;
- `prisma migrate status` on development.

### Piece 17: Traveller choices

Added on 2026-11-20 from the developer's answers. **Requirements:** TB-ITN-21, TB-FIX-08, TB-CRD-13. Check-in as a window moved to piece 21.

1. **Breakfast may repeat.** A place picked for a breakfast slot is not moved out of breakfast slots on other days. This is the one exception to "a place sits in one slot only" (`plan-actions.ts` ~46-52). The same-day exclusion stays, and lunch and dinner still do not repeat. The ranking may prefer a new café, but it never hides a repeat. Update the samples' "nothing decided moved" and no-repeat checks.
2. **The ticket type is required.** Every path that creates or changes a ticket needs one of `TICKET_MODES`:
   - the commitments POST and PATCH schemas (a PATCH that would leave a ticket without a type is refused with 422);
   - the bookings form, as a required control with no blank choice;
   - the conversation's ticket capture (`read-typed.ts`, also fixing its booking-kinds mismatch);
   - Quick plan and start-trip;
   - the fixtures, the design walk, the e2e tests and `docs/api/v1.md`.

   The column stays nullable, and old tickets keep the neutral wording.

3. **Remove a place you added.** A place the traveller added by hand (origin `USER`) can be removed by that traveller, from the closer look, with a confirm step.
   - First check that such a place records who added it. If it does not, add that (development-only migration), and refuse removal of a row with no owner.
   - Any slot holding the place reopens, and the plan says "{place} was removed."
   - It crosses Places and Itinerary through a use-case and the contracts.
   - The design walk removes its Kyoto place at the end.

**Checks:** as piece 16.

### Piece 18: Fair use: rate limits and per-person shares

Added on 2026-11-20. **Requirements:** TB-SYS-16, TB-SYS-17. The developer approved this design on 2026-11-20, and asked for a combination of identifiers instead of the internet address, so that one person with several email accounts still counts once.

- **Who is counted.** A person is a combination of three identifiers, and a request counts against every one of them it carries:
  - the signed-in account, through `withUser`;
  - a long-lived, signed, first-party device cookie, set on the first request;
  - a hashed browser-and-network signature: user agent, language and a coarse network block. It is an HMAC keyed from `AUTH_SECRET`, with a key that rotates daily.

  The internet address alone never identifies anyone, and nothing runs a fingerprinting script. A new account on the same device or browser shares that device's and that signature's counts. Many people can share a network block, so the signature's limits are generous.

- **Where the counts are kept.** Postgres fixed-window counters, updated by upsert, in the pattern of `withinCap`. They live in a new table owned by one service, entered in `service-map.json`, the borders document and the ownership test. Old windows are deleted as new ones open.
  - Not in memory, because it does not hold across serverless instances.
  - Not Redis or another new resource.
  - Vercel's firewall rate limits can be an outer layer only if the existing plan includes them. Check before proposing them.
- **Request limits,** as named constants, per person per minute:
  - 60 across `/api/v1`;
  - 20 for place gathering and cards;
  - 10 for city and address lookups;
  - 10 for conversation turns and plan builds;
  - 30 per device without sign-in (the device cookie and the signature, never the internet address alone).
- **Daily shares per person:**
  - place gathering, 30;
  - address lookups, 20;
  - AI model spend, $1 a day within the $15 monthly cap.
- **Over a limit,** the answer is 429 with `Retry-After`, and the screen says "You have made a lot of requests in a short time. Try again in a minute." Read the Next 16 guide on proxy and middleware before choosing where the check runs.

### Piece 19: Cities, going back a day, and both ways to get there

Added on 2026-11-20. **Requirements:** TB-ITN-25, TB-ITN-26, TB-ITN-27. The developer picked 1B, 2A and 3A on 2026-11-20 (mockup: https://claude.ai/artifact/QT4ydmHWBLdCbfbkoHHoUu). R1 landed in piece 16.

- **Rows grouped by city (1B).** City groups with a tinted journey strip between them. A day's rows are grouped by city: every row carries its segment's city, and the tickets and allowance rows sit between the groups. A booking on a date-line day goes with the city whose local window holds its time.
- **Going back a day (2A).** A ticket that lands on an earlier date than it left gets the calendar cue ("You get Friday twice"). A ticket that lands on the same date at an earlier clock time gets the small clock. Trip validation compares instants using both zones, not local dates.
- **Legs and cards show both ways, on one line (3A).** They show the time by the traveller's preferred means. When the hop is within walking distance, the same line adds the walking distance and time, with a directions link (fixed host, encoded query): "about 10 min by public transport · or 650 m, about 9 min on foot · Directions". The developer asked for one line, not a separate walkable badge. The plan still schedules by the preferred means (TB-ITN-06), and it never assumes a walk.

### Piece 20: Saving the facts keeps the conversation's answers

Added on 2026-11-20 from the developer's report: "Saving the facts reset some of my conversation." **Requirements:** TB-FAC-01, TB-FAC-02, TB-FAC-03, TB-AGT-03.

- **The cause.**
  - The facts form (`src/components/keepsake/trip-facts-form.tsx`) copies the facts into its state once, when it first appears, and "Save the facts" sends that whole copy.
  - The page keys it on the trip id and the archived flag, and `router.refresh()` keeps `useState`. So the copy is never refreshed after a conversation turn.
  - `saveTripFacts` then writes back the stale values, usually null: who is travelling, how firm the dates and budget are, the budget, the purpose, the dates or length. When the form appeared with no cities, it deletes the cities.
  - The conversation then asks those questions again. No messages are lost.
- **The fix.**
  - The form keeps only the traveller's own edits (`Partial<TripFacts>`).
  - It shows `{...initial, ...edits}` and sends only the edits. When either date is edited, it sends both dates, so the "ends before it starts" check still runs.
  - It clears the edits after a successful save.
  - Don't compare the state with the `initial` prop: every fact the conversation set would look like an edit. Don't change the key on each revision: that throws away unsaved input after every turn.
- **The same pattern elsewhere.** `src/components/keepsake/trip-workspace.tsx` (~71) and `brief-steps.tsx` (~115) also start state from props. Check each one: fix it the same way where a save can overwrite newer values, and leave it with a one-line why where it cannot.
- **Tests.**
  - A regression test: a facts save after the conversation has set the travellers, the firmness and the purpose leaves them as they are, and the waiting question does not go back.
  - An `@critical` e2e test: answer "who is travelling" in the conversation, fill in the nights, save the facts, reload, and check the travellers and the waiting question.

**Checks:** lint, type check, tests and build; the design checks in Chromium, Firefox and WebKit.

### Piece 21: Time windows

Added on 2026-11-20. **Requirement:** TB-ITN-22. It takes over check-in as a window from piece 17. The developer picked the bar (4B), and asked for a design decision on windows open at one end or both ends.

- **Four shapes.** A timed step can be one of four shapes. Each row reads as follows and carries the 4B bar:

  | Shape           | Row reads                 |
  | --------------- | ------------------------- |
  | any time after  | "Check in from 15:00"     |
  | any time before | "Check out by 11:00"      |
  | any time        | "Any time today"          |
  | between X and Y | "between 10:00 and 12:00" |

- **Data.** The shape and its one or two times, on whatever records the step today (development-only migration if a column is needed).
- **Scheduling.** The step is laid inside its window, once the traveller has reached that city, after the arrival and its leg.
- **Form.** A shape picker beside the time fields, with one or two times according to the shape.
- **Display.** The row's words and the bar, as in the approved mockup.

**Checks:** as piece 16.

## Waiting for the developer

- **The trip page:** pick one option in each area of the workspace mockups (https://claude.ai/artifact/HgjhYdBmSuWhzYEaaFD2BP). The pick becomes its own piece.

- **Piece 1:** the live test on 2026-11-20 failed ("I could not reach the place provider"), and the code logged nothing to say why. Production went back to sample places (`PLACE_PROVIDER_MODE=mock`) the same day, at the developer's word. Step 2 now logs the host and status of every refusal, and the QA preview moves to this milestone (developer, 2026-11-20) so the test can run again there, with real places on the QA preview only.
- **If Overpass refuses Vercel too:** the known mirrors are IPv6-only, and Vercel functions may have no outbound IPv6 (not verified). If the mirrors cannot be reached, places need a self-hosted or paid Overpass or an extract, which the operating constraints allow only with your approval.
- **The milestone's exit** needs real places checked once with the real service: on the QA preview at your request, or on production after the merge.
- Read the replacement wording of piece 3 and the doubt line of decision 3 in their pull requests.
- Review the claim list (piece 11).
- The Anthropic API key, locally for the wording evaluation and in Vercel for QA and production.
- Read a sample of accepted versions before `AI_WORDING=on` is set in production.
- Part 4's designer's calls, any of which you may change: a skip means no breakfast; the breakfast window and length; the allowances; confirmation before an address counts; no guessed position; the fifth traveller.
- Read the ten sample itineraries.
- Merge the milestone into `main`. The four migrations (pieces 2, 6, 8 and 9) reach QA and production through that merge and the protected workflow.

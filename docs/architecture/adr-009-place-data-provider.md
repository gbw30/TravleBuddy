# ADR-009: OpenStreetMap as the first place-data provider

Status: accepted
Date: 2026-11-12

## Context

The [PRD](../prd.md#17-ai-model-place-data-and-running-cost) sets a spending cap of 20 US dollars a month for the AI model and place data together, and prefers Google Places and Routes if they fit it. The product owner decided that if Google does not fit, the first version runs on OpenStreetMap data and Google is kept ready to switch on when there are funds.

The product also needs to keep enough place data to show a saved itinerary again later (TB-SYS-12).

This record checks both providers against their official price lists and terms.

## Sources

All pages were read on 2026-11-12. Figures are quoted from the provider's own pages.

| Source                                                                                                       | What it says                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Google Maps Platform price list](https://developers.google.com/maps/billing-and-pricing/pricing)            | Free cap per SKU per month, then a price per 1,000 events. Text Search Enterprise: 1,000 free, then $35.00. Place Details Enterprise: 1,000 free, then $20.00. Place Details Photos: 1,000 free, then $7.00. Compute Routes Essentials: 10,000 free, then $5.00. |
| [Google Places data fields](https://developers.google.com/maps/documentation/places/web-service/data-fields) | Opening hours, price level and rating are Enterprise fields. `servesVegetarianFood` is Enterprise + Atmosphere.                                                                                                                                                  |
| [Google Places policies](https://developers.google.com/maps/documentation/places/web-service/policies)       | "You can therefore store place ID values indefinitely." Coordinates may be cached "for up to 30 consecutive calendar days". The page says not to "copy and save business names, addresses, or user reviews". Photo authors must always be credited.              |
| [Anthropic price list](https://platform.claude.com/docs/en/about-claude/pricing)                             | Claude Haiku 5.5, prompts up to 100,000 tokens: $0.10 per million input tokens, $0.50 per million output tokens.                                                                                                                                                 |
| [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/)                           | "an absolute maximum of 1 request per second". The application must identify itself. Auto-complete search is forbidden. "Results must be cached on your side."                                                                                                   |
| [Overpass API, public instances](https://wiki.openstreetmap.org/wiki/Overpass_API)                           | Fewer than 10,000 queries and 1 GB a day is assumed not to disturb others; for regular use "divide those numbers by 100". "Commercial use should use self-hosted or paid Overpass servers."                                                                      |
| [Overpass commons guidance](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)                | Lists an app for the general public that relies on the public instances as its back end as problematic behaviour.                                                                                                                                                |
| [OSRM demo server policy](https://github.com/Project-OSRM/osrm-backend/wiki/Api-usage-policy)                | No numeric limit. "Excessive use is not allowed." No quality guarantee; access may be withdrawn at any time. The page defers to newer terms that were not read.                                                                                                  |
| [OpenStreetMap copyright](https://www.openstreetmap.org/copyright)                                           | Open Database License. "You are free to copy, distribute, transmit and adapt our data, as long as you credit OpenStreetMap and its contributors."                                                                                                                |
| [OSM `image` key](https://wiki.openstreetmap.org/wiki/Key:image)                                             | "there is no guarantee whatsoever that you can display this image."                                                                                                                                                                                              |

Not confirmed: openrouteservice's free-plan quotas (the plans page returned no content), the current terms of the OSRM demo server, whether Google has a minimum spend (the price list states none), and how complete opening hours are in OpenStreetMap.

## Usage model

An assumption of the [implementation plan](../superpowers/plans/2026-11-12-provider-check-and-prototype.md), for the portfolio stage.

| Quantity             | Per trip                                      | Per month (30 trips)     |
| -------------------- | --------------------------------------------- | ------------------------ |
| Place searches       | 30                                            | 900                      |
| Place detail lookups | 135                                           | 4,050                    |
| Photos               | 135                                           | 4,050                    |
| Travel-time lookups  | 165                                           | 4,950                    |
| AI turns             | 80, at 2,000 input and 300 output tokens each | 4.8M input, 0.72M output |

## Cost per month

| Item           | Google                                      | OpenStreetMap                  |
| -------------- | ------------------------------------------- | ------------------------------ |
| Place searches | $0.00 (900 is inside the 1,000 free)        | $0.00                          |
| Place details  | $61.00 ((4,050 − 1,000) × $20.00 per 1,000) | $0.00 (included in the search) |
| Photos         | $21.35 ((4,050 − 1,000) × $7.00 per 1,000)  | None available                 |
| Travel time    | $0.00 (4,950 is inside the 10,000 free)     | $0.00 (estimated, see below)   |
| **Place data** | **$82.35**                                  | **$0.00**                      |
| AI model       | $0.84 (4.8 × $0.10 + 0.72 × $0.50)          | $0.84                          |
| **Total**      | **$83.19**                                  | **$0.84**                      |

A leaner Google design that takes every field from the search and makes no detail lookups still costs $21.35 for photos, or $22.19 with the AI model, before any cost of showing saved itineraries again.

## Terms on saved data

- **Google:** only the place ID may be kept indefinitely, and coordinates for 30 days. Names, addresses and hours may not be saved. Showing a saved 30-item itinerary again means up to 30 paid detail lookups each time it is opened.
- **OpenStreetMap:** the data may be copied and stored, with credit to OpenStreetMap and its contributors. A saved itinerary can be shown again at no cost.

## Decision

**The first version runs on OpenStreetMap data.** Google fails both parts of the rule: it costs $83.19 a month against a cap of $20 under the usage model, and its terms do not allow keeping the data a saved itinerary needs.

Google stays as the second implementation behind the common adapter (TB-SYS-09), to be switched on when there are funds.

How OpenStreetMap is used:

1. **Places** come from the Overpass API, one area query per city and kind of place, saved in the database and reused. Requests identify the application, never run in parallel, and wait 30 seconds after an HTTP 429 or 406.
2. **City lookup** uses Nominatim, on submit only (no auto-complete), at most one request a second, with results saved.
3. **Travel time is estimated from straight-line distance** and the traveller's means of travel, and labelled as an estimate. No routing service is used in the first version, because no free service's limits could be confirmed.
4. **Every screen that shows place data credits OpenStreetMap contributors.**

## Consequences

- **No photos.** Cards use poster-style illustrations. OpenStreetMap's `image` tag cannot be relied on.
- **No ratings and almost no price levels.** These are shown as unknown, and ranking cannot use them. Ranking must rest on the traveller's preferences, distance, kind of place and what OpenStreetMap does record. This is the largest risk to itinerary quality, and the sample-traveller check in Milestone 8 is where it is judged.
- **Opening hours are present only where mappers entered them.** Missing hours are flagged as unknown (TB-ITN-05).
- **Travel times are rougher** than a routing service would give.
- **The public Overpass and Nominatim servers are shared community resources.** They suit a portfolio stage with heavy saving of results. Their guidance says an app for the general public should not rely on them as its back end, and that commercial use should be self-hosted or paid. Before real public use, places must come from a downloaded OpenStreetMap extract or a paid service.
- **Running cost is under one dollar a month** at 30 trips, nearly all of it the AI model.
- **Time zones** are not part of OpenStreetMap place data and need a separate source, to be chosen in Milestone 3.

## Owner actions

For the product owner. These are not done by the implementer.

- [ ] Set a monthly spending limit on the Anthropic account. The price list does not describe this setting; look under billing and limits in the Claude Console.
- [ ] No Google billing account is needed for the first version. When Google is switched on, set a budget and quota cap on the Google Cloud project first.

## Alternatives considered

- **Google within its free caps only.** Rejected: the storage terms rule it out regardless of cost.
- **OpenStreetMap places with Google photos.** Rejected for now: 1,000 free photos a month covers about 7 trips under the usage model, and each photo carries Google attribution rules.
- **A hosted routing service for travel time.** Deferred until a service's free limits and terms are confirmed.

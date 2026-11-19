# TravleBuddy

Status: current-state
Authority: Repository overview, setup, and entry point to what is built
Related: [Knowledge map](docs/README.md), [canonical target](docs/requirements.md), [current implementation](docs/status/current-implementation.md), [active roadmap](docs/roadmap.md)
Last reviewed: 2026-11-18

TravleBuddy is a travel agent with memory. A traveller starts a trip, tells
the agent what is already decided, and plans the days in one of two ways: in
conversation, choosing each slot from three places, or by filling in a short
brief and letting the agent build the trip. The agent remembers what it
learns about the traveller, says where each memory comes from, and lets the
traveller correct it.

The target is described in the [product vision](docs/product-vision.md), the
[PRD](docs/prd.md) and the numbered [requirements](docs/requirements.md).
What is built, and how far each part has been checked, is in the
[current implementation](docs/status/current-implementation.md). Target
behaviour must not be mistaken for current behaviour.

## What a traveller can do

- **Start a trip** from tickets or from nothing, and keep its facts and the
  things already decided: flights, stays, reservations and must-sees. The
  plan is built around them and never moves them.
- **Plan in conversation.** The agent asks one question at a time and offers
  three places for each slot, each with its reason. A picked place lands in
  the live itinerary, which flags every broken rule.
- **Plan from a brief.** Five short steps, filled in from memory. The agent
  builds the trip one day at a time and reports what it built, what it
  assumed, what it could not fit and where it was unsure.
- **Move between the two ways** at any time. Both read and write the same
  trip.
- **See and correct what the agent remembers** on the Profile page.

## Architecture

One Next.js deployment with strict service borders
([ADR-008](docs/architecture/adr-008-modular-services-in-one-deployment.md),
[service borders](docs/architecture/service-borders.md)).

```text
src/app/(app)/           the signed-in pages: Home, Create, a trip, its brief, Profile
src/app/api/v1/          every route the pages call (docs/api/v1.md)
src/use-cases/           what spans more than one service
src/features/trips/      trips, their facts and fixed commitments
src/features/places/     the place source, saved places, city lookup
src/features/itinerary/  a plan's choices, its layout and rules, its versions
src/features/recommendations/  the three cards for a slot and their reasons
src/features/conversation/     the question script, the thread, the AI model boundary
src/features/memory/     the trip profile and the personal profile
src/features/planning/   the replay ledger every change to a trip goes through
src/components/keepsake/ the interface
```

- A service is imported only through its `index.ts`, or `contracts.ts` in
  browser code, and reads only the tables it owns. Lint and a test enforce
  this.
- Every change to a trip names an operation id and the revision it was made
  against, so a repeat is recognised and a stale screen is refused.
- Place data comes from OpenStreetMap, or from sample places when
  `PLACE_PROVIDER_MODE=mock`.
- The AI model (Claude Haiku 5.5) has one job: reading what a traveller
  types. Everything works with it switched off.
- Nothing depends on a separately running background worker.

## Fixed development topology

This project deliberately reuses its existing QA and production databases
and its existing Vercel QA and production targets. Do not create additional
persistent databases, Vercel projects, or preview environments unless the
developer explicitly approves the specific addition. Existing CI's temporary
PostgreSQL service is part of the current topology and remains allowed.

See [the standing operating constraints](docs/operating-constraints.md) and
`AGENTS.md` before changing branches, development or deployment topology.

## Local setup

Requirements:

- Node.js 24
- npm
- A PostgreSQL 16-compatible database

Install dependencies and create a local environment file:

```sh
npm ci
cp .env.example .env
```

Fill in the database addresses and the Auth.js variables documented in
`.env.example`. For a run that costs nothing and calls no outside service,
set:

```text
PLACE_PROVIDER_MODE=mock
AI_MODE=off
```

Then apply the migrations and start the site:

```sh
npm run db:deploy
npm run dev
```

[Neon setup](docs/neon-env-setup.md) explains how one `.env` holds the
development, QA and production addresses, with development as the default.

## Verification

```sh
npm run prisma:validate
npm run prisma:generate
npm run typecheck
npm run lint
npm run test
npm run build
```

The `Verify` workflow runs the same on every pull request. Sample places
and a switched-off AI model are mandatory for automated tests.

The report-only QA system is described in [qa/README.md](qa/README.md). Its
deterministic gate needs an isolated writable QA database:

```sh
npm run qa:gate
npm run qa:context
```

## Not verified yet

- The real AI model: no request has been made with a real key.
- The real OpenStreetMap services, beyond replies recorded for tests.
- The QA gate for the screens and routes built since 2026-11-18.

The [roadmap](docs/roadmap.md) records, for each milestone, what is met,
what is partly met and what its exit still needs.

# Service borders: how to work with them

Status: architecture
Authority: Working rules for the service borders set by ADR-008 and ADR-010
Related: [ADR-008](adr-008-modular-services-in-one-deployment.md), [ADR-010](adr-010-service-borders-by-shrinking-exceptions.md), [architecture overview](README.md)
Last reviewed: 2026-11-18

TravleBuddy is one deployment divided into eight services. Each service owns its code and its database tables. This page says where the rules live, what they allow, and what to do when a check fails.

## Where things are

| File                               | What it holds                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `service-map.json`                 | The source of truth: each service's folders and tables, and every foreign key that crosses a border. |
| `eslint.borders.mjs`               | Builds the lint rules from the map and the Prisma schema.                                            |
| `eslint-suppressions.json`         | The known exceptions: old code that still breaks a rule. It may only shrink.                         |
| `prisma/service-ownership.test.ts` | Tests that every table has one owner and that the foreign-key list is complete.                      |

## The services

| Service         | Code                                                 | Tables                                                                             |
| --------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Identity        | `src/lib/auth*.ts`, `src/lib/authorization*.ts`      | User, Account, Session, VerificationToken                                          |
| Trips           | `src/features/trips`                                 | Trip, TripDestination, FixedCommitment                                             |
| Conversation    | `src/features/conversation`, `src/features/planning` | PlanningMutation, Conversation, ConversationMessage, AiUsage                       |
| Memory          | `src/features/memory`                                | TripProfile, Profile, ProfileEntry, ProfileNote, ProfileHistory, ForgottenEvidence |
| Places          | `src/features/places`                                | CityLookup, Place, PlaceFetch, ProviderCall                                        |
| Recommendations | `src/features/recommendations`                       | CardEvent                                                                          |
| Itinerary       | `src/features/itinerary`                             | Plan, PlanVersion                                                                  |

`service-map.json` wins if this table and the map disagree. The earlier planner's code was removed on 2026-11-18, and its 15 tables were dropped by the migration `20261119150000_drop_earlier_planner`.

## The rules

1. **Import a service only through its interface.** A service folder exposes two files:
   - `index.ts`: the functions other server code may call.
   - `contracts.ts`: types, schemas and constants that are safe in the browser. It must not import server code.

   From outside the service, `@/features/trips` and `@/features/trips/contracts` are allowed. `@/features/trips/queries` is not. Use the `@/` alias for every import that crosses a service border.

2. **Only the owning service queries a table.** `tx.trip.findMany()` is allowed inside the Trips service and nowhere else. Pages, routes and other services ask through the interface.

3. **No joins into another service's tables.** A service does not `include` or `select` a relation that leads to a table it does not own. It asks the other service.

4. **Work that spans services is a use case** in `src/use-cases`. It calls each service's interface and may pass one transaction through those calls. Every use case that shares a transaction is listed below.

5. **The browser talks to HTTP routes.** Client components import `contracts.ts` for types and call a route. They never import `index.ts`.

Test files are exempt from the lint rules, so a test may set up or inspect any table.

## Use cases that share a transaction

A shared transaction is the part that needs rework when a service moves out (ADR-008). Keep this list complete.

| Use case                         | Services                               | What shares the transaction                                                                                                                                                                                                                               |
| -------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/use-cases/trip-action.ts`   | Trips, Conversation                    | A change to a trip and its entry in the replay ledger, with the revision check.                                                                                                                                                                           |
| `src/use-cases/plan.ts`          | Trips, Itinerary, Conversation         | A change to a plan: the check that the trip may be changed, the new plan version and the ledger entry. Places are read outside the transaction.                                                                                                           |
| `src/use-cases/conversation.ts`  | Trips, Memory, Conversation            | One turn of the conversation: the change it leads to (trip facts, a fixed commitment, a taste answer or a skipped question), the messages said, and the ledger entry. The AI model, the city lookup and the plan's days are read outside the transaction. |
| `src/use-cases/save-brief.ts`    | Trips, Memory, Itinerary, Conversation | One save of the trip brief: the trip's facts, its taste answers for this trip, the "anything else" box, the plan's pace when the pace answer changes, and the ledger entry.                                                                               |
| `src/use-cases/build.ts`         | Trips, Itinerary, Conversation         | One day of a Quick plan build: the check that the trip may be changed, the new plan version, the build's progress and the ledger entry. The day is worked out before the transaction, because it reads places and may ask the place provider.             |
| `src/use-cases/planning-mode.ts` | Trips, Memory, Conversation            | A change of the way a trip is planned: the trip's mode, and the words of the brief's "anything else" box put into the thread when the traveller turns to the conversation.                                                                                |

`src/use-cases/start-trip.ts` spans Places and Trips without a shared transaction: it looks the cities up first and then saves the trip.

The older code still shares transactions across services in ways not listed here; those are among the known exceptions.

## When a check fails

- **"import is restricted":** import from the service's `index.ts` or `contracts.ts`. If what you need is not exported, add it to that file on purpose. An interface is a short list, so prefer one function that answers the question over exposing internals.
- **"This table belongs to the ... service":** move the query into the owning service and call it through the interface.
- **"This joins into another service's table":** fetch that data through the other service's interface.
- **"There are suppressions left that do not occur anymore":** you fixed an old exception. Run `npx eslint --prune-suppressions` and commit the smaller `eslint-suppressions.json`.
- **A table has no owner, or the foreign-key list differs:** update `service-map.json`. A new foreign key across a border is a new cost of moving a service out, so add one only on purpose.

When you move or rename a file that has exceptions, rename its key in `eslint-suppressions.json`; the count must stay the same.

Never add an entry to `eslint-suppressions.json`, and never run `eslint --suppress-all` or `--suppress-rule`. New code has no exceptions.

## Adding a table or a service

1. Add the model to `prisma/schema.prisma` and to its owner's `tables` in `service-map.json`.
2. Run `npm run test -- prisma/service-ownership.test.ts`. If it reports a new cross-border foreign key, either keep the key inside one service or add the reported line to `crossBorderForeignKeys`.
3. For a new service, add an entry to `service-map.json` with its folder and tables, and give the folder an `index.ts`.

## Known limits

- The join rule matches relation names, not types. A relation name used both inside and across a border is not checked.
- Raw SQL (`$queryRaw`, `$executeRaw`) is not checked. Keep raw SQL inside the service that owns every table it touches.
- Identity lives in single files under `src/lib`, so its import rule is not enforced; its table rule is.

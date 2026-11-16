# ADR-008: Modular services in one deployment

Status: accepted
Date: 2026-11-12

## Context

The product is at portfolio stage with a one-year aim of regular public use, a social side and later a phone app ([product vision](../product-vision.md)). The product owner wants a later move to separately deployed services to be cheap.

The standing [operating constraints](../operating-constraints.md) forbid adding hosts, databases or deployment targets without explicit approval. The codebase is one Next.js application with feature folders under `src/features/`, one PostgreSQL database, and a PostgreSQL-backed job queue with a separate worker process.

Four options were compared: a single application with loose borders; a single deployment with strict internal services; a separately deployed front end and back end; and separately deployed services from the start.

## Decision

TravleBuddy is **one deployment divided into services with strict borders**.

### Services

| Service         | Owns                                                                 | Existing code it grows from                               |
| --------------- | -------------------------------------------------------------------- | --------------------------------------------------------- |
| Identity        | Users, sessions, sign-in                                             | `src/lib/auth*`                                           |
| Trips           | Trip facts, cities and stays, tickets, fixed commitments, visibility | `src/features/trips`                                      |
| Conversation    | Messages, question flow, turn handling, the AI model boundary        | `src/features/planning`, `src/lib/ai`                     |
| Memory          | Personal profile, trip profile, evidence, profile versions           | `src/features/profile`, `src/features/preferences`        |
| Places          | Provider adapters, saved place data, pictures, travel times          | `src/lib/providers/places`, `src/lib/google`              |
| Recommendations | Eligibility, ranking, reasons, card sets, feedback on cards          | `src/features/recommendations`, `src/features/adaptation` |
| Itinerary       | Itinerary versions, slots, the shelf, scheduling rules, conflicts    | `src/features/itinerary`                                  |
| Jobs            | The queue, attempts, events, the worker runtime                      | `src/features/jobs`, `src/worker`                         |

Later stages add Discovery, Publishing and Media as further services.

### Rules

1. **One public interface per service.** Other code imports a service only through that interface.
2. **One owner per table.** Only the owning service reads or writes a table. Other services ask through the interface. There are no joins across services in application code. Foreign keys that already cross these borders stay while the services share one database; they are listed in the ownership map as part of the cost of moving a service out.
3. **Work that spans services is coordinated by a use case,** such as a planning action, which calls each service's interface. While everything shares one database, the use case may pass one transaction through those calls so the action commits completely or not at all.
4. **Work that can wait goes through the job queue.** One service hands work to another by writing a job, not by calling into its internals. While the worker runs only on the developer's machine, nothing a traveller does may depend on it: traveller-facing work is split into steps that each finish within one request and are saved.
5. **Every action has an HTTP route.** Every action that changes data, and every read the browser makes after a page loads, goes through a documented, versioned route, so a phone app can use the same routes later. Server-rendered pages may call service interfaces directly, in process.
6. **The borders are checked automatically.** A lint rule rejects imports that bypass an interface, and a test checks every table against the ownership map. Either failure fails the build.

### When a service is moved out

A service is deployed separately only when one of these is true and the product owner approves the added infrastructure:

- It needs to scale separately from the rest, shown by measurement.
- It needs a different release rhythm or runtime.
- A phone app or outside client needs the back end independent of the website.

Moving a service out then means replacing in-process calls to its interface with network calls, and replacing any shared transaction with a job or an outbox message. Its tables move with it.

## Consequences

- No new hosts, databases or cost at the portfolio stage.
- Development stays as fast as in a single application.
- Rule 3 is the main compromise: shared transactions are convenient now and are the part that needs rework when a service moves out. Each use case that shares a transaction must be listed, so the cost of a later move is known.
- The borders hold only while rule 6 is enforced.
- Existing code crosses these borders today. Bringing it into line is Milestone 2 of the [roadmap](../roadmap.md).

## Alternatives considered

- **Single application with loose borders:** fastest now, and the highest cost to split later.
- **Separate front end and back end:** useful once a phone app exists; needs a second host now, which the operating constraints do not allow.
- **Separate services from the start:** the most infrastructure and the slowest to build, with no benefit before there is real traffic.

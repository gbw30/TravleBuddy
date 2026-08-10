# Repository Structure

Status: architecture
Authority: Architecture-oriented map of current repository responsibilities
Related: [Architecture](architecture/README.md), [current implementation](status/current-implementation.md), [knowledge map](README.md)
Last reviewed: 2026-08-09

This map explains responsibilities rather than listing every generated or short-lived file.

```text
TravleBuddy/
├── src/
│   ├── app/                    Next.js App Router pages, layouts, route handlers
│   ├── components/             Reusable and feature-facing React presentation
│   ├── features/               Domain services and contracts
│   │   ├── adaptation/         Feedback policy and copy-on-write replacement
│   │   └── jobs/               PostgreSQL queue state and execution contracts
│   ├── lib/                    Shared auth, database, validation, and providers
│   │   └── providers/places/   Google/mock PlaceProvider boundary
│   └── worker/                 Standalone durable-job runtime
├── prisma/                     Schema, migrations, and seed support
├── docs/                       Product, status, architecture, plans, operations, history
├── qa/                         Report-only QA system, feature states, scenarios, policies
├── .github/workflows/          Existing CI, QA, migration, nightly, and release automation
├── scripts/                    Repository verification and operational helpers
├── public/                     Static web assets
└── generated/ or Prisma output Generated code; never edit as product source
```

## Application layer

`src/app` owns routing and server entry points. Route handlers must remain thin: authenticate, validate, call a domain service, and serialize a bounded DTO. Pages compose the planning workspace but do not own durable planning rules.

`src/components` separates behavior containers from presentational components. This boundary allows later visual redesign without changing semantic controls, status handling, accessibility, or server contracts.

## Domain and infrastructure layer

`src/features` contains use-case logic that can be exercised without the UI. Adaptive policy is callable both inline in tests and from the worker. Job persistence and state transitions remain separate from job-specific business logic.

`src/lib` contains shared infrastructure, including Prisma access, Auth.js integration, schemas, observability, and provider adapters. External provider response shapes must not leak into application DTOs.

`src/worker` is a process entry point, not a second business-logic implementation. It claims durable jobs and delegates execution to feature services.

## Data layer

`prisma/schema.prisma` defines durable application state. `prisma/migrations` is append-only deployment history. Migrations are applied only through the protected workflow or an explicitly authorized local procedure against the intended database.

## Documentation and QA

`docs/README.md` routes product and engineering knowledge. `docs/history` is non-authoritative. `qa/README.md` controls report-only verification, while `qa/feature-states.json` is the machine-readable feature-state authority. Generated `qa-results` evidence is run-owned and gitignored.

## Generated and secret material

Do not manually edit generated Prisma/client output or track `.env` files, credentials, QA receipts containing secrets, browser session data, or provider raw metadata. See [operating constraints](operating-constraints.md) for the fixed branch/database/deployment topology.

# ADR 005: Database-generated identifiers

- Status: Accepted
- Date: 2026-08-06

## Context

The Prisma 7 PostgreSQL adapter did not materialize Prisma's client-side
`cuid()` defaults for some normal and nested create operations. Clean CI
databases therefore rejected valid application and QA fixture inserts with a
null primary key. Supplying IDs in individual callers would leave every new
create path responsible for a storage concern and would not protect future
nested writes.

## Decision

Every single-column text primary key uses the PostgreSQL expression
`(gen_random_uuid())::text` as its database default. Prisma declares the same
contract with `dbgenerated`. Existing CUID values remain unchanged; identifiers
are opaque strings throughout application contracts and must not be parsed for
their format.

The migration changes defaults only. It does not rewrite rows, foreign keys,
or external references. Request operation IDs continue to have their own UUID
validation because they are client-provided idempotency keys rather than
database-generated entity identifiers.

## Consequences

- Direct, Prisma, and nested inserts all receive IDs from one source of truth.
- Legacy CUIDs and new UUIDs safely coexist in text columns.
- The database migration must be deployed before code that relies on omitted
  IDs reaches an existing environment.
- Integration tests inspect every affected column default and exercise a real
  nested create against a freshly migrated PostgreSQL database.

## Alternatives rejected

- Supplying `randomUUID()` in every service and fixture duplicates policy and
  remains fragile for nested writes.
- Fixing only the failing QA fixture would conceal the same production defect.
- Reverting Prisma or waiting for a dependency release would delay delivery
  and retain uncertainty about other create paths.
- Rewriting existing CUIDs would add needless migration and referential risk.

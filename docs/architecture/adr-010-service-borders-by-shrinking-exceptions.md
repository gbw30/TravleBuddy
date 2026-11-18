# ADR-010: Service borders are enforced now, with a shrinking list of exceptions

Status: accepted
Date: 2026-11-18

## Context

[ADR-008](adr-008-modular-services-in-one-deployment.md) divides the application into services with strict borders, and Milestone 2 of the roadmap was to bring the existing code into line without changing behaviour.

Measured on 2026-11-18, the existing code broke the borders in 207 places across 55 files: 124 imports of another service's internal files, 79 queries on another service's tables, and 4 joins into another service's tables. Much of that code is replaced outright in Milestones 4 to 6 (the recommendation path, scheduling, preferences).

Three options were compared:

- **A. Rework all existing code first.** Follows the earlier roadmap wording. The slowest route to a working product, and part of the rework is thrown away when the code is replaced.
- **B. Turn the checks on now and record today's violations as exceptions.** New code must be clean. Each later milestone clears the exceptions in the area it rebuilds.
- **C. Skip the borders until later.** Fastest, but new code would grow on the old tangle with nothing to stop it.

## Decision

The product owner chose **B** on 2026-11-18.

- The ownership map (`service-map.json`) and the automated checks are in force for all code from this date.
- The 207 existing violations are recorded in `eslint-suppressions.json`. The list may only shrink: a new violation fails the build, and a fixed one must be removed from the list or the build fails.
- A milestone that rebuilds or replaces code removes that code's exceptions. No milestone may add one.
- The list is empty by the end of Milestone 8. TB-SYS-01 to TB-SYS-03 are fully met only then.

The working rules are in [service-borders.md](service-borders.md).

## Consequences

- The first real screens of the new design can be built straight away, on clean borders.
- Until the list is empty, moving a service out would first need its remaining exceptions cleared. The list states that cost exactly.
- The exception count is exit evidence for every milestone from 3 onward: it must not rise, and it must fall where the milestone replaced code.

# Task 1 — AstroDiary paid-core activation boundary

## Status

Implemented the Task 1 domain boundary and current-state characterization. No
source-event persistence, schema, migration, API, UI, worker, or lifecycle
state-machine behavior was changed; those are explicitly deferred to Task 2.

## Scope and findings

- The canonical source-event transaction currently persists subscription state,
  entitlement, lifecycle/outbox effects, and the application receipt, but it
  does not insert `astro_diary_journals`.
- A first paid period (`sequence === 1`) plans exactly one active journal for
  the locked `journalEpochId`; a later period plans `continue_existing`.
- `ended` and `revoked` plan `read_only` from authoritative subscription state;
  no Diary-local lifecycle state is introduced. A fresh replacement subscription
  has a fresh first period and epoch, therefore it receives a new plan.
- The new plan carries only server-provided IDs and transaction-clock time:
  journal identity, immutable activation receipt identity, and the existing
  IDs-only `astro_diary.journal_activated.v1` event.

## Files changed

- `packages/domain/src/astro-diary/astro-diary-subscription-activation.ts`
- `packages/domain/src/astro-diary/astro-diary-subscription-activation.test.ts`
- `packages/domain/src/astro-diary/index.ts`
- `packages/db/src/adapters/client-subscriptions/drizzle-astro-diary-activation-gap.integration.ts`

## GitNexus impact

Read/query/context completed for the source-event contour. Upstream impact was
LOW for `applyClientSubscriptionSourceEvent` (one direct caller) and LOW for
`applyDrizzleClientSubscriptionSourceEventInTransaction` (two direct callers);
neither function was changed. `astroDiaryJournals` was inspected only. No
HIGH/CRITICAL result occurred.

## TDD and verification evidence

RED:

```text
pnpm test packages/domain/src/astro-diary/astro-diary-subscription-activation.test.ts
FAIL Cannot find module './astro-diary-subscription-activation'
```

GREEN:

```text
pnpm test packages/domain/src/astro-diary/astro-diary-subscription-activation.test.ts packages/domain/src/client-subscriptions/client-subscription-source-event-application-unit-of-work.test.ts packages/domain/src/client-subscriptions/client-subscription-capture-application.test.ts
3 passed, 11 passed

INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration packages/db/src/adapters/client-subscriptions/drizzle-client-subscription-source-event-uow.integration.ts packages/db/src/adapters/client-subscriptions/drizzle-astro-diary-activation-gap.integration.ts
2 passed, 5 passed

pnpm --filter @elevenhouse/domain typecheck && pnpm --filter @elevenhouse/domain build
exit 0

git diff --check
exit 0
```

The integration test uses the existing local-only guarded DB URL and proves
concurrent duplicate delivery returns `applied` + `replayed`, produces one
entitlement, and produces zero journals in the current implementation.

## Self-review

- Contract, receipt, transition, and epoch mismatches fail closed before a
  plan is returned.
- The port is pure and transaction-scoped: it has no database, worker, browser,
  clock fallback, or side effect dependency.
- The new event is validated through the existing contracts factory and contains
  only journal/epoch IDs.
- Required persistence uniqueness, activation receipt table/integrity, outbox,
  and source-event composition remain Task 2 work; no claim of paid-core
  activation completion is made here.

## Shared checkout and commit

At commit preparation the index was clean. Unowned concurrent changes include
Messaging/Instagram, `.env.example`, the DB migration journal, and a concurrent
`packages/domain/src/astro-diary/astro-diary-events.ts` edit; they were not
modified or staged. Implementation commit SHA: `bd3bc4de`.

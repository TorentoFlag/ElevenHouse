# Task 2 report — atomic paid AstroDiary activation

Date: 2026-08-18
Implementation commit: `fe1a44d6` (`feat(astro-diary): activate journals with paid capture`)

## Status

Implemented and committed. The first canonical sealed capture now creates the relationship-bound AstroDiary journal, immutable activation receipt, IDs-only journal event, realtime delivery, and IDs-only dispatch outbox row inside the same PostgreSQL transaction that persists the subscription transition, paid period, entitlement, lifecycle evidence, and source-event application receipt. No worker is an activation gate.

## Decisions

- Kept `applyDrizzleClientSubscriptionSourceEventInTransaction` as the canonical CAS/receipt boundary and added one optional `afterApplied` collaborator.
- The collaborator runs only after `persistClientSubscriptionTransition` has made the transition, period, and entitlement authoritative and before the source-event receipt/outer transaction commits.
- Rejected, idempotent, version-conflict, source-conflict, evidence-conflict, and replay branches remain unchanged and do not invoke the collaborator.
- Only the production sealed finance capture dispatch adapter supplies the AstroDiary collaborator. The generic source-event UOW remains generic and journal-neutral.
- Task 1's pure `planAstroDiarySubscriptionActivation` remains the authority for activate/continue/read-only/reject decisions. Persistence independently locks and verifies the relationship participant pair before writing.
- Renewal requires the exact existing journal plus its activation receipt and creates no second journal, activation receipt, activation event, or AstroDiary delivery.
- Terminal subscription state is represented by the existing journal reader's `read_only` access projection; journal history remains immutable/visible.
- Removed the old partial one-non-erased-journal-per-relationship index because it prevented a completed subscription epoch and a later replacement epoch from coexisting. Existing `journal_epoch_id` uniqueness is stricter than `(relationship, epoch)` for one-journal-per-epoch; the new exact journal identity constraint supports the activation receipt FK.
- No API, UI, worker, mock, browser state, or asynchronous activation path was added.

## Atomic evidence graph

`astro_diary_subscription_activation_receipts` is append-only and binds:

- journal + relationship + journal epoch;
- subscription + immutable contract + applied subscription version;
- canonical source-event id + digest + finance evidence id;
- exact subscription transition receipt;
- exact `astro_diary.journal_activated.v1` event and activation timestamp.

A deferred constraint trigger validates the complete application-receipt/transition/subscription/period/journal/event graph at commit. The activation event has IDs-only columns, its realtime delivery is `realtime_projection`, and its outbox request contains only `schemaVersion` and `deliveryId`.

## Exact changed paths

1. `packages/db/src/adapters/client-subscriptions/drizzle-client-subscription-uow.ts`
2. `packages/db/src/adapters/client-subscriptions/drizzle-client-subscription-capture-dispatch-uow.ts`
3. `packages/db/src/adapters/astro-diary/drizzle-astro-diary-subscription-activation.ts`
4. `packages/db/src/adapters/astro-diary/drizzle-astro-diary-subscription-activation.integration.ts`
5. `packages/db/src/adapters/astro-diary/index.ts`
6. `packages/db/src/schema/astro-diary/core.schema.ts`
7. `packages/db/src/schema/astro-diary/commands.schema.ts`
8. `packages/db/src/schema/astro-diary/integrity.ts`
9. `packages/db/drizzle/0053_astro_diary_subscription_activation.sql`
10. `packages/db/drizzle/meta/0053_snapshot.json`
11. `packages/db/drizzle/meta/_journal.json`

The before-list contained no Task 2-owned modifications. The shared checkout already contained unrelated `AGENTS.md`, `CLAUDE.md`, plan/spec files, and later a large foreign in-progress deletion wave. None was staged or committed by Task 2.

## Behavioral TDD evidence

### RED 1 — missing production collaborator

Command:

```text
INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration packages/db/src/adapters/client-subscriptions/drizzle-astro-diary-activation-gap.integration.ts
```

Observed before implementation: suite loading failed with `Cannot find module '../astro-diary/drizzle-astro-diary-subscription-activation'`. This established the missing atomic adapter boundary before production code was added.

The original gap test was then removed by the foreign deletion wave, so it was not restored. Per parent ruling, Task 2 created the narrow owned replacement `drizzle-astro-diary-subscription-activation.integration.ts` with self-contained local-PostgreSQL setup.

### RED 2 — migration dependency order

First real PostgreSQL run of the new test failed before cases executed:

```text
error: there is no unique constraint matching given keys for referenced table "astro_diary_journals"
```

Root cause: the generated composite receipt FK preceded the new journal exact-identity unique constraint. `0053` was reordered so the referenced constraint is created first.

### GREEN — real PostgreSQL behavior

Final fresh command after the implementation commit:

```text
INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration packages/db/src/adapters/astro-diary/drizzle-astro-diary-subscription-activation.integration.ts
```

Result:

```text
Test Files  1 passed (1)
Tests       3 passed (3)
Duration    3.83s
```

The three PG cases prove:

1. concurrent first-capture delivery yields exactly `applied + replayed`, a later replay returns the stored result, and there is exactly one relationship/epoch journal, activation receipt, activation event, realtime delivery, IDs-only dispatch outbox row, and entitlement;
2. a forced exception after the activation collaborator rolls back the subscription transition, entitlement, journal, receipt, event, and outbox together, leaving the subscription at pending version 1;
3. renewal continues the existing journal/receipt, final paid-boundary end is read-only through the real journal reader, and a later same-relationship replacement subscription produces a distinct journal epoch.

The first case also proves both UPDATE and DELETE of the activation receipt fail and the original row remains unchanged.

## Migration, reset, and no-delta evidence

Current lineage inspection found journal tag `0052_instagram_graph_app_scoped_user_id` at index 49, with Drizzle snapshots only through `0051`. The first `pnpm db:generate` therefore incorrectly proposed `0050_glossy_firebrand`, overwrote the committed `0050_snapshot.json`, and included unrelated pre-existing schema drift. No prior migration/snapshot was committed in that state.

Normalization performed:

- restored committed `meta/0050_snapshot.json` byte-for-byte;
- retained the generated current snapshot as the next forward `meta/0053_snapshot.json`;
- registered journal index 50 as `0053_astro_diary_subscription_activation`;
- reduced `0053` SQL to the mechanically required AstroDiary activation table/index/FK/trigger changes only.

Confirmed destructive target before reset:

```text
confirmed-local-reset-target localhost:5432/elevenhouse
```

`pnpm db:reset` result:

```text
Local PostgreSQL public and Drizzle metadata schemas reset
migrations applied successfully!
Database seed completed: 8 dictionary categories, 396 dictionary platform entries and 16 product templates upserted
```

Final `pnpm db:generate` result:

```text
No schema changes, nothing to migrate
```

Before/after SHA-256 values were identical:

- `_journal.json`: `58d4f3ded7c253fb90e0f1531f2c12433650ed3f6a8dc0398d8e3ec6896a1a7d`
- `0053_snapshot.json`: `777dfc0332d47974379fb1b70578d045f6e26fc0e4a34baf7d7a0f16b7b9aa6f`
- `0053_astro_diary_subscription_activation.sql`: `d35da54e5daf8d26872cbe8583e5f54d424952e81e853813e3e193e1e83f9dff`

## Other verification

Fresh after commit:

- `pnpm --filter @elevenhouse/db typecheck` — passed.
- `pnpm --filter @elevenhouse/db build` — passed.
- `git diff --check fe1a44d6^ fe1a44d6` — passed.
- Full repository lint — passed with four pre-existing React hook warnings and zero errors.
- Full Turbo typecheck — 43/43 tasks passed.
- Full Turbo build — 28/28 tasks passed.

The aggregate `pnpm verify` could not finish because the foreign deletion wave temporarily removed every unit `*.test.ts`; after Task 2's integration file was returned to the integration-only naming convention, `pnpm test` reported `No test files found`. This is external checkout state, not a Task 2 test failure. The targeted PG suite, DB typecheck, DB build, full typecheck, and full build all passed.

## GitNexus evidence

The index was five commits stale at intake. `node .gitnexus/run.cjs analyze` detected an incomplete prior run, performed a full rebuild, and completed with 36,877 nodes, 94,882 edges, 1,920 clusters, and 300 execution flows.

Pre-edit upstream impact results:

- `applyDrizzleClientSubscriptionSourceEventInTransaction`: LOW; 2 direct callers; 0 indexed flows.
- `createDrizzleClientSubscriptionCaptureDispatchUnitOfWork`: LOW; 1 direct indexed test caller.
- `astroDiaryJournals`: LOW; 0 callers for the exact schema symbol candidate.
- `astroDiarySourceSqlAppendOrder`: LOW; 0 callers.
- `sourceReceiptForApplied`: LOW; 1 direct / 3 total callers.

No HIGH or CRITICAL result occurred. GitNexus transport remained available.

Pre-commit `detect_changes(scope: staged)` after diff minimization:

```text
changed_files: 11
risk_level: low
affected_processes: 0
```

## Self-review

- Verified activation executes after transition/entitlement persistence but before source receipt insert and outer transaction commit.
- Verified source/evidence advisory locks and receipt lookup occur before the hook, so concurrent redelivery cannot create duplicate journals.
- Verified any planner/persistence/constraint failure aborts the same PostgreSQL transaction and cannot leave transition-only or journal-only state.
- Verified relationship IDs are re-read under a shared lock and cannot be caller supplied.
- Verified renewal requires the existing activation receipt, preventing continuation of an unproven journal.
- Verified no content body enters lifecycle event, AstroDiary event columns, delivery, or outbox payload.
- Verified old migration and snapshot artifacts were not rewritten.
- Verified the scoped commit contains only the 11 owned paths listed above.

## Concerns and residual risk

- The repository-wide unit-test gate was externally unavailable because another in-progress task removed the unit test corpus/config dependencies. Task 2 did not restore, stage, or commit those deletions.
- The Task 1 planner unit test file was also part of that foreign deletion wave, so its already-reported Task 1 unit suite was not rerun from the final shared state. The domain package typecheck and build passed, and Task 2 exercises the planner through real PostgreSQL.
- No API/UI/worker/browser/deploy verification was performed because those surfaces are explicitly out of Task 2 scope.

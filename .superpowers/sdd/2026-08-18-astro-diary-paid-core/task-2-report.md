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

---

# Fix round 1 — activation receipt/event ownership hardening

Date: 2026-08-18
Implementation commit: `413d817e` (`fix(astro-diary): enforce activation ownership graph`)

## Status and implemented fixes

All four Important review findings were addressed in source, the next focused forward migration, and a new narrow PostgreSQL regression suite.

1. `astro_diary_subscription_activation_receipts` now has a dedicated `BEFORE TRUNCATE FOR EACH STATEMENT` rejection trigger in addition to UPDATE/DELETE immutability. The source function handles every forbidden mutation with SQLSTATE `55000`.
2. `astro_diary.journal_activated.v1` now has reverse ownership:
   - a partial unique index permits at most one activation event for `(journal_id, journal_epoch_id)`;
   - a deferred event-side constraint trigger requires every activation event to have one exact receipt owner matching event id, journal id, epoch, and timestamp;
   - the existing deferred receipt-side graph still proves the source application, transition, subscription, period, journal, and event direction;
   - existing delivery/outbox integrity remains the authority for the event → delivery → IDs-only outbox side.
3. PostgreSQL proof now covers explicit subscription, relationship, and epoch mismatch attempts and exact rollback equality for subscription head, entitlement, lifecycle event, transition receipt, source receipt, journal, activation receipt, activation event, delivery, and outbox.
4. The suite exercises `createDrizzleClientSubscriptionCaptureDispatchUnitOfWork` after creating a real canonical finance capture application through the canonical webhook/capture UOW. It asserts dispatch, replay, one AstroDiary activation receipt, and UPDATE/DELETE/TRUNCATE immutability of the finance dispatch receipt.

The production-composition test exposed and fixed a deferred graph conflict: subscription creation and first capture happen in the same dispatch transaction, but the old contract creation trigger accepted only a final pending/version-1 head. Contract creation now has a focused deferred validator that accepts either:

- the unchanged pending/version-1 creation graph; or
- active/version-2 only when the same transaction contains the exact canonical activated transition and applied source-event receipt.

This does not permit an arbitrary active head and does not change generic source-event receipt, CAS, rejection, conflict, or replay behavior.

## Fix-round decisions

- Kept worker activation out of scope and out of the activation gate.
- Preserved `0053` byte-for-byte; all new database evolution is in `0054_astro_diary_activation_ownership.sql`.
- Used a partial unique event index plus deferred reverse trigger because receipt uniqueness alone prevents two receipts but did not prevent a raw orphan/duplicate activation event.
- Kept the original forward receipt validator. Reverse ownership is additive, so both directions must exist at commit.
- Split contract creation validation onto its own deferred trigger. This keeps the generic client-subscription graph intact while recognizing the exact create+activate transaction produced by the canonical dispatch composition.
- Did not restore or modify the foreign-deleted clean-HEAD tests `astro-diary-integrity.test.ts` or `astro-diary.schema.test.ts`. Added the narrowly named integration regression instead.

## Exact changed paths in fix commit

1. `packages/db/src/schema/astro-diary/commands.schema.ts`
2. `packages/db/src/schema/astro-diary/integrity.ts`
3. `packages/db/src/schema/client-subscriptions/client-subscription-integrity.ts`
4. `packages/db/src/adapters/astro-diary/drizzle-astro-diary-subscription-activation-integrity.integration.ts`
5. `packages/db/drizzle/0054_astro_diary_activation_ownership.sql`
6. `packages/db/drizzle/meta/0054_snapshot.json`
7. `packages/db/drizzle/meta/_journal.json`

Before the fix round, none of those seven paths had uncommitted Task 2 changes. After commit, none remains staged or modified. The report is updated separately. The large foreign test deletion wave, `AGENTS.md`, `CLAUDE.md`, and plan/spec files were not restored, staged, or committed.

## Behavioral TDD evidence

### RED — actual production composition

The new PG suite first reached the real canonical capture and real dispatch UOW but failed at commit:

```text
FAIL activates through the production capture-dispatch composition...
Caused by: error: Sealed subscription contract requires atomic creation graph
where: PL/pgSQL function elevenhouse_assert_client_subscription_graph_integrity()
constraint: client_subscription_graph_integrity
Tests: 5 passed, 1 failed
```

This demonstrated that the previously untested create+activate composition could not commit, even though the inner activation helper passed.

Earlier focused runs also established the new raw/orphan assertion reached a deferred commit failure; Drizzle wrapped the PostgreSQL message as `Failed query: commit`, so the test correctly asserts rejection rather than relying on driver message propagation.

### GREEN — focused real PostgreSQL suite

Fresh final command:

```text
INTEGRATION_DATABASE_URL=postgresql://elevenhouse:elevenhouse@localhost:5432/elevenhouse \
  pnpm test:integration \
  packages/db/src/adapters/astro-diary/drizzle-astro-diary-subscription-activation-integrity.integration.ts
```

Result:

```text
Test Files  1 passed (1)
Tests       6 passed (6)
Duration    4.73s
```

Cases prove:

- activation receipt TRUNCATE fails and the receipt remains;
- a duplicate activation event for an owned journal/epoch fails and no second event remains;
- a raw orphan activation event for a valid journal fails at deferred commit;
- subscription, relationship, and epoch mismatch attempts each reject and leave the complete artifact snapshot byte-for-byte equivalent at the SQL result level;
- a forced post-activation exception restores the pending subscription head and leaves entitlement/lifecycle/transition/source/journal/receipt/event/delivery/outbox counts unchanged;
- canonical finance capture → real production dispatch UOW → atomic journal activation commits once, replays once, and persists an immutable finance dispatch receipt.

## PostgreSQL installation evidence

Confirmed reset target from the named local Docker container:

```text
docker exec elevenhouse-postgres-1 psql -U elevenhouse -d elevenhouse ...
elevenhouse|elevenhouse
```

Post-reset catalog evidence:

```text
astro_diary_subscription_activation_receipts_no_truncate
  BEFORE TRUNCATE ... FOR EACH STATEMENT
  EXECUTE FUNCTION astro_diary_guard_subscription_activation_immutable()

astro_diary_activation_event_ownership_integrity
  AFTER INSERT OR DELETE OR UPDATE ... DEFERRABLE INITIALLY DEFERRED

astro_diary_events_one_activation_per_journal_epoch
  UNIQUE (journal_id, journal_epoch_id)
  WHERE event_type = 'astro_diary.journal_activated.v1'

client_subscription_graph_integrity
  elevenhouse_assert_client_subscription_contract_creation_graph
```

## Migration/reset/no-delta evidence

- Existing `0053_astro_diary_subscription_activation.sql` was not rewritten.
- `pnpm db:generate` initially used Drizzle sequence index 51 as a filename and proposed `0051_youthful_fantastic_four`, colliding with the historical numbering gap. The generated current snapshot/index delta was moved to the actual forward name `0054`; the temporarily generated modification to prior `0051_snapshot.json` and journal entry was restored before any commit.
- `0054` contains only the activation event index, receipt immutability/TRUNCATE trigger, reverse event ownership trigger, and focused contract create+activate graph trigger.
- Confirmed local target: Docker `elevenhouse-postgres-1`, database/user `elevenhouse` on published localhost port 5432.
- `DATABASE_URL=postgresql://elevenhouse:elevenhouse@localhost:5432/elevenhouse pnpm db:reset` passed: public/Drizzle schemas reset, all migrations applied, seed completed with 8 categories, 396 entries, and 16 templates.
- Final `pnpm db:generate` printed `No schema changes, nothing to migrate`; status showed only the intended `0054` artifacts and journal update.

## Other fresh verification

- `pnpm --filter @elevenhouse/db typecheck` — passed after final source edit.
- `pnpm --filter @elevenhouse/db build` — passed.
- `pnpm typecheck` — 43/43 Turbo tasks passed.
- `pnpm build` — 28/28 Turbo tasks passed; only existing frontend chunk-size warnings.
- `git diff --cached --check` — passed before commit.
- Focused PG integration — 6/6 passed after reset and after the final source edit.

## GitNexus evidence

Pre-edit impacts:

- `astroDiaryEvents`: LOW, 0 direct callers/flows.
- `astroDiarySourceSqlAppendOrder`: LOW, 0 direct callers/flows.
- `clientSubscriptionIntegritySql`: LOW, 0 direct callers/flows.
- `graphTriggerTables`: LOW, 0 direct callers/flows.
- `astroDiarySubscriptionActivationIntegritySql`: exact GitNexus failure `Target 'astroDiarySubscriptionActivationIntegritySql' not found`; risk UNKNOWN. Focused source/caller inspection was used.
- PostgreSQL function `elevenhouse_assert_client_subscription_graph_integrity`: exact GitNexus failure `Target 'elevenhouse_assert_client_subscription_graph_integrity' not found`; risk UNKNOWN. Focused source/trigger inspection was used.

No HIGH or CRITICAL result occurred.

Pre-commit `detect_changes(scope: staged)`:

```text
changed_files: 7
changed_symbols: 7
risk_level: low
affected_processes: 0
```

## Self-review

- Verified receipt mutation protection includes statement-level TRUNCATE and is installed by both source SQL and forward migration.
- Verified forward and reverse event ownership agree on event, journal, epoch, and timestamp.
- Verified partial uniqueness rejects a second activation event even before deferred ownership evaluation; a separate orphan case proves the reverse trigger itself.
- Verified delivery/outbox remain IDs-only and are included in rollback counts.
- Verified mismatch tests invoke the real transition persistence then fail inside activation planning/persistence, proving outer transaction rollback rather than preflight-only rejection.
- Verified the production composition asserts the immutable finance dispatch receipt rather than an in-memory receipt.
- Verified the contract graph exception is restricted to exact initial active/version-2 capture evidence, not renewals or arbitrary source applications.
- Verified generic source UOW and worker surfaces were not edited.
- Verified no foreign deletion or foreign document change entered the implementation commit.

## Concerns and unresolved clean-checkout gate

- Clean-HEAD expectation files `packages/db/src/schema/astro-diary/astro-diary-integrity.test.ts` and `packages/db/src/schema/astro-diary/astro-diary.schema.test.ts` require expectation updates for the new trigger/index. They remain foreign-deleted in the shared checkout by explicit ruling, so they were not restored, edited, staged, or committed. The new PG regression covers runtime behavior, but a clean checkout will still need those static expectations updated; this gate is unresolved, not claimed fixed.
- The current finance paid-product fulfillment registry/source-lot codec accepts only `single.once.live.solo`, not the AstroDiary `sub.sub.async.solo` product shape. To exercise real canonical finance capture without expanding Task 2 into finance product enablement, the test first seals the immutable AstroDiary purchase authority, temporarily advances the mutable product projection through the supported single-session shape for canonical capture, then restores the subscription shape before the real dispatch UOW creates and activates the subscription. Therefore the composition and atomicity are proven, but end-to-end AstroDiary checkout enablement remains outside this fix and must not be inferred from this test.
- Repository-wide unit tests remain unavailable because the foreign deletion wave removed the unit corpus. The fresh focused PG suite, full typecheck, and full build pass, but the deleted clean-HEAD static tests remain a separate gate.
- No API, UI, worker, browser, deploy, or production-data action was performed.

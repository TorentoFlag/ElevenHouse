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

## Skipped gates and residual risk

- `pnpm verify` was not run because its shared repository surface includes
  unrelated concurrent Messaging/Instagram, migration, and documentation work.
  The affected domain and real-PostgreSQL source-event surfaces were run
  directly instead.
- API/runtime/browser/design acceptance is intentionally not applicable to
  this domain/DB-boundary Task 1; Task 2 must still demonstrate the atomic
  journal/receipt/event/outbox commit before paid activation can be claimed.

## Shared checkout and commit

At commit preparation the index was clean. Unowned concurrent changes include
Messaging/Instagram, `.env.example`, the DB migration journal, and a concurrent
`packages/domain/src/astro-diary/astro-diary-events.ts` edit; they were not
modified or staged. Implementation commit SHA: `bd3bc4de`.

## Review fix round 1 — 2026-08-18

### Findings resolved

- Activation now binds the application receipt to the exact canonical
  `client_subscription.capture_applied.v1` source event: source-event ID,
  canonical digest, finance evidence, subscription, contract, and period all
  must agree. The receipt period is compared field-for-field to the locked
  subscription period before a plan is returned.
- Activation versus continuation now comes from the verified dispatch target's
  `initial|renewal` kind, not from `period.sequence`. This keeps a fresh
  replacement epoch as an `initial` activation while a renewal cannot create a
  second journal plan.
- The PostgreSQL characterization is now `it.fails` and asserts the required
  one-journal outcome. It passes only while Task 2 has not persisted that
  outcome, and will fail conspicuously once Task 2 makes the assertion true.
- Added coverage for a fresh replacement epoch, a non-capture source event,
  an exact-period mismatch, `transition_receipt_mismatch`, and
  `subscription_state_mismatch`.

### GitNexus and review evidence

- Upstream impact was requested for
  `planAstroDiarySubscriptionActivation` before the edit. GitNexus had no
  symbol entry for this newly committed module even after an incremental index
  refresh, so it returned `UNKNOWN`/not found rather than HIGH or CRITICAL.
  No existing source-event UOW symbol was changed.
- The review fix was developed red first: the non-capture source-event case
  returned `activate` before the capture binding was added.

### Green verification

```text
pnpm test packages/domain/src/astro-diary/astro-diary-subscription-activation.test.ts
1 file passed, 3 tests passed

pnpm test packages/domain/src/astro-diary/astro-diary-subscription-activation.test.ts packages/domain/src/client-subscriptions/client-subscription-source-event-application-unit-of-work.test.ts packages/domain/src/client-subscriptions/client-subscription-capture-application.test.ts
3 files passed, 11 tests passed

INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration packages/db/src/adapters/client-subscriptions/drizzle-client-subscription-source-event-uow.integration.ts packages/db/src/adapters/client-subscriptions/drizzle-astro-diary-activation-gap.integration.ts
2 files passed, 4 tests passed, 1 expected fail

pnpm --filter @elevenhouse/domain typecheck && pnpm --filter @elevenhouse/domain build
exit 0
```

### Fix-round residual risk

Task 2 still owns the actual atomic database write. The expected-failing test
is deliberate temporary characterization debt and must be converted to an
ordinary passing assertion when Task 2 persists the journal/receipt/event/outbox
graph.

### Fix-round commit and GitNexus follow-up

- Implementation/test fix commit: `125e0a12` (`fix: bind AstroDiary capture activation`).
- `detect_changes(scope=staged)` was attempted twice after exact-path staging,
  but the GitNexus MCP transport was closed after its index refresh. The staged
  list was manually verified as exactly the three Task 1 fix files and
  `git diff --cached --check` passed before commit.

## Review fix round 2 — 2026-08-18

### Finding resolved

- `AstroDiarySubscriptionActivationInput.appliedCapture` now accepts the
  sealed `FinanceClientOrderCaptureDispatchReceipt`, not an independent
  caller-supplied `initial|renewal` target. The planner rehydrates that receipt
  and rebuilds its canonical capture event before accepting it.
- The planner binds receipt source-event ID/digest, finance evidence,
  subscription, contract/order/digest, expected pre-transition version,
  captured time, and target period to the locked transition. Only the
  rehydrated receipt's target kind selects `activate` versus
  `continue_existing`.
- Regression coverage proves a valid initial capture cannot be suppressed by
  an injected renewal target, a valid renewal cannot be turned into an
  activation by an injected initial target, and post-seal initial/renewal kind
  tampering is rejected as `transition_receipt_mismatch`.
- The generic source-event UOW contract, schema/migrations, APIs, UI, workers,
  and product gates were not changed.

### GitNexus impact

- Before editing `planAstroDiarySubscriptionActivation`, upstream impact was
  requested twice. Both calls failed with `Transport closed`, so no risk level
  could be returned and therefore no HIGH/CRITICAL result was suppressed.
- Local recovery command `node .gitnexus/run.cjs analyze` also failed because
  GitNexus reported a corrupted `file_fts` index (`document for node offset
  4905 is missing during delete`). The required pre-commit
  `detect_changes(scope=compare, base_ref=main)` likewise returned
  `Transport closed`.

### TDD and verification evidence

RED:

```text
pnpm exec vitest run --config vitest.config.ts packages/domain/src/astro-diary/astro-diary-subscription-activation.test.ts
6 tests, 3 failed as intended:
- caller renewal target changed a valid initial plan to continue_existing
- caller initial target changed a valid renewal plan to activate
- post-seal receipt target mutation was accepted
```

GREEN:

```text
pnpm exec prettier --check packages/domain/src/astro-diary/astro-diary-subscription-activation.ts packages/domain/src/astro-diary/astro-diary-subscription-activation.test.ts
All matched files use Prettier code style

pnpm --filter @elevenhouse/domain typecheck
exit 0

pnpm exec vitest run --config vitest.config.ts packages/domain/src/astro-diary/astro-diary-subscription-activation.test.ts packages/domain/src/client-subscriptions/client-subscription-capture-application.test.ts packages/domain/src/finance-core/client-order-capture-purpose-dispatch.test.ts
3 files passed, 14 tests passed

pnpm exec eslint packages/domain/src/astro-diary/astro-diary-subscription-activation.ts packages/domain/src/astro-diary/astro-diary-subscription-activation.test.ts
exit 0

git diff --check
exit 0
```

### Files changed and self-review

- `packages/domain/src/astro-diary/astro-diary-subscription-activation.ts`
- `packages/domain/src/astro-diary/astro-diary-subscription-activation.test.ts`
- `.superpowers/sdd/2026-08-18-astro-diary-paid-core/task-1-report.md`

The planner remains pure and transaction-scoped. It now consumes precisely the
same sealed receipt authority that the capture dispatcher rehydrates; it does
not infer activation from period sequence or an unsealed DTO. The only
remaining paid-core risk is intentional Task 2 work: persist the accepted plan
atomically with the canonical source-event transaction.

### Fix-round commit

Implementation/test commit: `1fd09e07` (`fix: seal AstroDiary activation discriminator`).
It contains only the two activation-boundary paths listed above. The report is
committed separately because its final evidence must name that SHA.

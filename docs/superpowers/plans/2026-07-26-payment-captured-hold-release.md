# Payment Captured Hold Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Captured Arc Pay payments move the astrologer net amount into pending balance and an idempotent payment-worker release job moves eligible held funds into available balance after the order policy hold expires.

**Architecture:** Keep Arc Pay as provider adapter and ElevenHouse ledger as business balance source. The captured webhook remains the fulfillment signal; the same captured sale ledger transaction records a deterministic `holdReleaseAt`, and a payment-worker processor scans due holds and posts one idempotent `funds_released` ledger transaction per order.

**Tech Stack:** TypeScript, domain ports/use cases in `packages/domain`, Drizzle/PostgreSQL adapters in `packages/db`, Node payment-worker runtime, Vitest.

## Global Constraints

- Work in the existing checkout on `main`; do not branch, stash, reset, or revert unrelated changes.
- No production mocks, fake provider success, silent fallback, or browser-owned business state.
- Payment side effects must be idempotent, retryable, audited, and outside request controllers.
- Money remains minor units with explicit `RUB` currency.
- Captured webhook dedupe by provider webhook id must remain before ledger/outbox effects.

---

## Research

Question: how should ElevenHouse treat payment webhooks and delayed balance release?
Decision affected: payment-worker idempotency, ledger source of truth, and hold-release scheduling.
Accessed: 2026-07-26

### Sources

- Repository evidence: `docs/decisions/0004-payments-notifications-workers.md` requires payment status changes through use cases, dedicated worker contours, idempotent webhooks and non-duplicating ledger records.
- Repository evidence: `packages/domain/src/wallet/ledger-use-cases.ts` already posts captured sales to `astrologer_pending` and has `funds_released` ledger shape through payout use cases.
- Sourced fact: Stripe webhook docs require signature verification over raw payload, duplicate-event handling, and recommend quick 2xx responses before complex work for timeout-prone paths: https://docs.stripe.com/webhooks
- Sourced fact: GOV.UK Pay documents payment-event webhooks as automatic POST status notifications after payment milestones: https://docs.payments.service.gov.uk/webhooks/
- Inference: Arc Pay-specific public docs were not fetchable in this session, so provider-specific fields stay constrained to the existing `ArcPayWebhookEvent` adapter; generic webhook reliability follows primary payment provider guidance and repository ADRs.

### Recommendation

Use existing `payment-worker` and ledger. Add due-hold release as an internal worker processor, not as an API/controller path. Use finance idempotency commands scoped by order id so retries and concurrent scans cannot double-release funds.

### Rejected alternatives

- Release funds immediately on `payment.captured`: violates the approved hold policy and refund/risk window.
- Store balance directly on the astrologer profile: bypasses ledger auditability and breaks payout/refund reconciliation.
- Add a separate microservice now: no new process boundary is needed; the accepted worker boundary already exists.

## Progress

- [x] Intake and repository contour traced.
- [x] Research recorded.
- [x] Domain hold-release behavior.
- [x] Drizzle hold-release adapter.
- [x] Payment-worker processor/runtime wiring.
- [x] Targeted verification and repo gate.

## Decision Log

- 2026-07-26: Release eligibility is derived from captured sale ledger metadata and order policy snapshot, not Arc Pay settlement balance. Rationale: ElevenHouse balance is business ledger; Arc Pay settlement is reconciliation input.
- 2026-07-26: Hold-release idempotency key is `order:<orderId>`. Rationale: one captured sale hold per order under current order model; retry safety must survive worker restarts.

## Context and Orientation

Current captured flow:

```text
Arc Pay payment.captured webhook
  -> apps/payment-worker/src/webhooks/payment-webhook.server.ts
  -> apps/payment-worker/src/webhooks/payment-webhook.processor.ts
  -> packages/domain/src/wallet/ledger-use-cases.ts
  -> packages/db/src/adapters/finance/drizzle-captured-sale-unit-of-work.ts
  -> ledger + wallet_balance_read_models + outbox
```

Current gap:

```text
astrologer_pending is populated
  -> no holdReleaseAt on captured sale ledger metadata
  -> no query for due holds
  -> no idempotent pending -> available release worker
```

## Interfaces and Dependencies

Add domain types:

```ts
export type ReleasableCapturedSaleHold = {
  readonly orderId: string;
  readonly astrologerUserId: string;
  readonly amount: Money;
  readonly capturedAt: string;
  readonly holdReleaseAt: string;
  readonly paymentAttemptId: string | null;
  readonly providerEventId: string | null;
};

export type HoldReleaseStore = {
  readonly listReleasableCapturedSaleHolds: (input: {
    readonly now: string;
    readonly limit: number;
  }) => Promise<readonly ReleasableCapturedSaleHold[]>;
  readonly releaseCapturedSaleHold: (input: {
    readonly hold: ReleasableCapturedSaleHold;
    readonly now: string;
    readonly commandExpiresAt: string;
  }) => Promise<{ readonly kind: "released" | "replayed"; readonly transactionId: string }>;
};
```

Add use case:

```ts
export async function releaseDueCapturedSaleHolds(input: {
  readonly store: HoldReleaseStore;
  readonly now: Date;
  readonly limit: number;
  readonly commandTtlMs?: number;
}): Promise<{
  readonly scanned: number;
  readonly released: number;
  readonly replayed: number;
  readonly orderIds: readonly string[];
}>;
```

## Plan of Work

### Task 1: Domain captured hold metadata and release orchestration

**Files:**
- Modify: `packages/domain/src/wallet/ledger-use-cases.ts`
- Modify: `packages/domain/src/wallet/ledger-use-cases.test.ts`

**Steps:**
- [x] Add failing test that captured sale ledger transaction includes `holdReleaseAt = providerEvent.receivedAt + order.financePolicyHoldDurationHours`.
- [x] Add failing test that `releaseDueCapturedSaleHolds` releases listed holds and reports released/replayed counts.
- [x] Implement metadata helper and release orchestration using existing `funds_released` ledger shape.
- [x] Run `pnpm vitest run packages/domain/src/wallet/ledger-use-cases.test.ts`.

### Task 2: Drizzle due-hold adapter

**Files:**
- Modify: `packages/db/src/adapters/finance/drizzle-ledger-store.ts`
- Modify: `packages/db/src/adapters/finance/index.ts`
- Modify: `packages/db/src/adapters/finance/drizzle-finance-adapters.test.ts`

**Steps:**
- [x] Add failing adapter test for listing unreleased captured sale holds by JSON metadata `holdReleaseAt <= now`.
- [x] Add failing adapter test for idempotent release using `finance_idempotency_commands`.
- [x] Implement `createDrizzleHoldReleaseStore(database)`.
- [x] Run targeted DB adapter tests.

### Task 3: Payment-worker hold-release processor

**Files:**
- Create: `apps/payment-worker/src/holds/hold-release.processor.ts`
- Create: `apps/payment-worker/src/holds/hold-release.processor.test.ts`
- Modify: `apps/payment-worker/src/runtime-config.ts`
- Modify: `apps/payment-worker/src/runtime-config.test.ts`
- Modify: `apps/payment-worker/src/main.ts`

**Steps:**
- [x] Add failing processor test for one tick releasing due holds through the domain use case.
- [x] Add runtime config tests for interval and batch limit.
- [x] Implement processor and start an interval in `payment-worker` composition root.
- [x] Run `pnpm vitest run apps/payment-worker/src`.

## Validation and Acceptance

- Targeted domain tests pass.
- Targeted DB/adapter tests pass.
- Payment-worker tests and typecheck pass.
- `pnpm verify` passes or any blocker is isolated with exact unrelated paths.

## Idempotence and Recovery

- Webhook event remains retryable when any captured sale effect fails because provider event, order, ledger and outbox are in one unit of work.
- Hold release is idempotent by finance command scope/key and replay returns the original ledger transaction id.
- Re-running the worker after crash scans the same due hold and returns replay without changing wallet balances again.

## Artifacts and Notes

- No destructive DB reset is part of this plan.
- Browser verification is not required for this backend/worker slice unless the finance page available balance changes are seeded through runtime data later.

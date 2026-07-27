# Refunds and Chargebacks Ledger Reversals Plan

> **For agentic workers:** execute with behavioral TDD. Keep this plan current while working.

## Goal

Implement the first production slice of refund and chargeback handling for pay-in webhooks: Arc Pay refund/chargeback events must be idempotent, validated against the original payment, persisted transactionally, reflected in order state, and posted to the append-only ledger without direct wallet mutation.

## In Scope

- Provider webhook routing in `apps/payment-worker`.
- Domain use case for refund/chargeback financial reversals.
- Drizzle unit of work covering provider event, refund record, order transition, ledger transaction and wallet projection.
- Ledger reversal allocation: pending, then available, then reserved, then explicit negative balance.
- Tests for full refund before hold release, partial refund after release and chargeback/refund shortfall.

## Out of Scope

- Client-initiated refund request API.
- Admin dispute/evidence UI.
- Provider-side refund command execution.
- Manual payout recovery from negative balance.

## Research

Accessed: 2026-07-26.

- Stripe Connect marketplace refunds/disputes: platform balance is debited for refunds/disputes in common marketplace charge models, and recovery from connected accounts/negative balances must be modeled explicitly.
- Stripe refunds: partial refunds are supported and total refunded amount cannot exceed the original charge.
- Stripe dispute lifecycle: disputes can coexist with prior partial refunds and require a separate evidence/admin lifecycle.
- Adyen webhooks: chargebacks arrive as asynchronous external events and should drive local state/evidence workflows.

Inference for ElevenHouse: Arc Pay settlement is merchant-level evidence, not per-astrologer balance. ElevenHouse must reverse its own astrologer ledger liabilities from the current wallet buckets and record any late shortfall as explicit `negative_balance`.

## Implementation Steps

- [x] Write failing domain tests for refund/chargeback reversal entries and idempotency.
- [x] Implement domain reversal use case and ledger entry builder.
- [x] Fix negative balance wallet projection semantics so debit entries increase visible debt.
- [x] Add Drizzle reversal unit of work and provider refund persistence in transaction context.
- [x] Wire payment-worker refund/chargeback webhooks to the new use case.
- [x] Run targeted tests and affected typechecks.

## Acceptance Criteria

- Duplicate webhook id does not duplicate refund records or ledger entries.
- Duplicate provider refund id does not duplicate refund ledger impact.
- Full refund reverses the full platform fee and astrologer net from pending/available/reserved/negative balance.
- Partial refund prorates platform fee from the order snapshot and never recalculates current commission policy.
- Chargeback records provider evidence, changes order status to `chargeback`, and posts `chargeback_recorded`.
- Wallet read model remains non-negative for `pending`, `available`, `reserved`, `payout_pending` and `negative_balance`.

## Progress

- [x] 2026-07-26: Domain and worker unit coverage added for full refund, partial refund, chargeback shortfall and duplicate webhook behavior.
- [x] 2026-07-26: Payment-worker PostgreSQL integration added for signed Arc Pay refund/chargeback webhooks through parser, processor, real Drizzle stores, ledger/wallet/order/refund rows.
- [x] 2026-07-26: Fixed refund provider-id replay inside transaction by replacing unique-violation catch with conflict-safe insert/replay lookup.

## Surprises & Discoveries

- 2026-07-26: Catching a PostgreSQL unique violation inside the reversal transaction aborts the transaction, so duplicate provider refund ids must use `onConflictDoNothing().returning()` plus a replay lookup instead of catching `23505`.
- 2026-07-26: `apps/payment-worker` needed a direct dev dependency on `pg` for integration tests that create isolated PostgreSQL databases; relying on the DB package transitive dependency is not reproducible under pnpm isolation.

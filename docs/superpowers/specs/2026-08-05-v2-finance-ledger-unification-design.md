# V2 Finance Ledger Unification Design

**Status:** approved by product owner on 2026-08-05.

## Decision

`finance_online_*` is the sole authoritative financial ledger for every new
client-order money movement. No new runtime operation may mirror, synchronize,
or derive a mutable balance in the legacy `finance_wallet_*` / v1 source-lot
graph. The pre-launch reset means no opening balance, balance migration, or
historical reconciliation bridge is required.

## Why

Repository evidence shows that worker-owned client-sale capture persists only
to `finance_online_wallet_heads`, online capture receipts, commitments, root
lots, v2 journal proofs, and capture applications. The legacy refund and
payout writers instead require `finance_wallet_heads` and
`finance_payable_lots`. They are independent graphs. A bridge would create two
mutable sources of truth for one client payment and could produce a duplicate
refund, payable, or payout.

## V2 lifecycle

```text
ArcPay canonical capture
  -> pending payable source
  -> fulfillment/risk release: available + reserved
  -> manual payout: payout_pending
  -> paid confirmation | definitive no-transfer | bank return

Client refund / provider chargeback
  -> exact v2 source allocation and cumulative provider position
  -> provider command outbox (refund only)
  -> canonical provider result
  -> one v2 reversal, recovery, or approved platform-loss effect
```

Every v2 money transition:

- locks the one online wallet head and exact source records in one global order;
- advances its revision and appends an immutable commitment/journal proof;
- uses expected revisions and idempotency to make replay harmless;
- records provider I/O only through a committed outbox;
- creates no ledger consequence from a provider acknowledgement or ambiguous
  transport result;
- preserves the immutable tariff commission snapshot captured with the order.

## Explicit policies

- Refund before payout reverses the exact payable and platform commission
  allocation proportionally.
- An already paid or in-flight payout component cannot silently debit a future
  astrologer balance. It is `blocked_payout_outcome` until a separately
  authorized recovery or platform-loss policy resolves it.
- Manual payout remains manual: bank transfer is performed outside the system;
  `paid` requires bank reference, transfer time, evidence document and a
  separate confirmation action.
- ArcPay acquiring and chargeback fees remain ElevenHouse expenses unless an
  approved contract changes that policy.
- ArcPay is the company merchant only. There are no submerchants, split
  payments, or ArcPay astrologer payouts.

## Migration boundary

The legacy v1 schema may remain temporarily for read-only historical code
while shared-main migration work is consolidated, but it is excluded from all
new client payment, refund, chargeback, payout, reconciliation, and balance
read paths. It is not a fallback and must not receive a monetary mirror.

## Research

Question: how should a pre-launch system resolve two isolated ledgers that
would otherwise govern the same client payment?

Repository evidence (accessed 2026-08-05):

- `packages/db/src/adapters/finance/drizzle-online-sale-capture-commit-uow.ts`
  writes the v2 capture graph and only `finance_online_wallet_heads`.
- `packages/db/src/adapters/finance/drizzle-refund-approval-uow.ts` and
  `drizzle-refund-result-application-uow.ts` require the distinct v1 wallet
  graph.
- `packages/db/src/adapters/finance/drizzle-payout-*` follows the v1 graph.

Provider fact: ArcPay refund commands are asynchronous financial effects; an
acknowledgement is not a ledger posting authority. Existing repository research
recorded the official ArcPay refund endpoint and terminal `payment.refunded`
event on 2026-08-05. A fresh public-doc fetch was unavailable during this design
update, so no new provider behavior is inferred from that failure.

Options considered:

1. Mirror v2 capture into v1. Rejected: duplicate mutable balance and second
   financial authority.
2. Restore capture to v1. Rejected: discards the current worker-owned canonical
   capture/commitment path and reopens a completed migration boundary.
3. Finish v2 for release, payout, refund, chargeback and reconciliation.
   Selected: one financial truth for all new money.

## Definition of done

- One v2 wallet/journal record graph explains every new client payment through
  payout/refund/chargeback terminal outcome.
- No v1 monetary writer is reachable from a new client order.
- Canonical provider and bank evidence, idempotency, optimistic revision checks,
  audit records and reconciliation prove each financial state change exactly
  once.
- UI/API/browser acceptance is verified only after the worker and data contours
  are production-real; missing vendor/bank configuration remains an explicit
  fail-closed external gate.

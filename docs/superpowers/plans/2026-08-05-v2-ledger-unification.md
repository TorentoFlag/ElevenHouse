# V2 Ledger Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` task-by-task. Steps use checkbox syntax.

**Goal:** Make v2 the only ledger for new ElevenHouse client money from ArcPay capture through manual payout, refund, chargeback and reconciliation.

**Architecture:** Keep the existing v2 online capture receipt/commitment graph as the root authority. Add append-only v2 mutation receipts and source allocations for every later wallet transition; no v1 table receives a new monetary write. A transaction locks the online wallet, exact source allocation and mutable case heads, writes balanced journal evidence and an immutable commitment, then exposes any provider outbox only after commit.

**Tech Stack:** TypeScript, domain ports, Drizzle/PostgreSQL, NestJS, payment-worker, ArcPay, Vitest.

## Global constraints

- `finance_online_*` is the only ledger for new client orders; no v1 bridge or fallback.
- All financial state is RUB integer minor units and explicit source-linked allocations.
- Provider acknowledgement/transport ambiguity never posts money.
- Refund/payout decisions use WebAuthn grant, expected versions, durable audit and one DB transaction.
- No automatic payouts, ArcPay submerchants, provider payout calls, or client recurring subscriptions.

## Task 1: v2 mutable-source and commitment schema

**Files:**

- Modify `packages/db/src/schema/finance/online-sale-capture.schema.ts`
- Create `packages/db/src/schema/finance/online-wallet-mutations.schema.test.ts`
- Modify `packages/db/src/schema/finance/index.ts` and baseline consolidation inputs

- [x] Write failing schema/integration tests proving one v2 source can be allocated once at a given wallet revision; allocations are append-only; wallet mutation must advance exactly one commitment revision; no mutation can reference a v1 wallet/lot.
- [x] Add v2 mutation receipts, immutable output positions and single-use source-consumptions, with FKs to online capture root lots, online wallet heads and generic journal transactions.
- [x] Add SQL guards for immutable history, monotonic revisions, exact source conservation, a head-to-commitment link and wallet-projection equality.
- [x] Regenerate the combined baseline, execute the authorized exact-target local reset, and run an isolated PostgreSQL capture-to-release transition proof.

## Task 2: fulfillment/risk release to available and reserved

**Files:**

- Create `packages/domain/src/finance-core/online-wallet-release.ts`
- Create `packages/domain/src/finance-core/ports/online-wallet-release-uow.ts`
- Create `packages/db/src/adapters/finance/drizzle-online-wallet-release-uow.ts`
- Extend booking completion worker/module composition

- [ ] Write red domain cases for gross 9,600 with a 10% reserve -> 8,640 available + 960 reserved, zero reserve, stale revision and already released source.
- [ ] Implement deterministic v2 release authority and balanced journal builder from immutable order economics/risk/fulfillment evidence.
- [ ] Persist it through one online-wallet lock/commitment transaction and idempotent booking-completed event handler.
- [ ] Prove duplicate completion, concurrent release and transaction rollback produce one mutation and one journal effect.

## Task 3: v2 manual payout lifecycle

**Files:**

- Create v2 payout domain ports/adapters under `packages/domain/src/finance-core/ports` and `packages/db/src/adapters/finance`
- Extend `apps/astrologer-api` payout request and `apps/admin-api` review/confirmation modules

- [ ] Replace new-order payout reads with v2 available/reserved source allocations.
- [ ] Implement request -> under_review -> approved -> processing_manual -> paid / rejected / failed / returned transitions, expected versions, maker-checker and bank evidence requirements.
- [ ] Persist available -> payout_pending and terminal v2 commitments with no provider payout call.
- [ ] Prove invalid bank evidence, duplicate confirmations, changed destination after approval and concurrent refund/payout rejection.

## Task 4: v2 refund decision and canonical result

**Files:**

- Create v2 refund case/allocation schema and domain ports
- Extend `admin-api` refund decision module and `payment-worker` provider dispatcher/inbox processor

- [ ] Create the candidate-to-decision issuer under one transaction with the consumed WebAuthn grant and exact v2 source allocation.
- [ ] Dispatch ArcPay refund only from durable outbox, retain `provider_unknown` for ambiguous results.
- [ ] Apply canonical success/failure once, proportionally reversing payable/platform commission and producing a v2 commitment/journal proof.
- [ ] Keep paid/in-flight payout cases blocked until recovery/platform-loss policy is explicitly authorized.
- [ ] Prove partial cumulative refunds, duplicate/out-of-order webhooks, stale grant, rollback and payout/refund races.

## Task 5: v2 chargeback, settlement and reconciliation

- [ ] Move chargeback principal/recovery allocation and settlement/bank reconciliation projections to v2 source allocations.
- [ ] Rebuild wallet, journal, provider and bank projections from v2 records; quarantine mismatches rather than mutate balances.
- [ ] Verify restart/replay, duplicate provider fact, missing bank statement and operator audit paths.

## Task 6: switch consumers and retire v1 runtime paths

- [ ] Point client/astrologer/admin balance and operational reads at v2 projections.
- [ ] Remove v1 writers from client order/refund/payout/chargeback worker composition; preserve legacy data only as read-only until separately removed.
- [ ] Update API contracts, operations runbooks and admin/client/astrologer UI states.
- [ ] Run real role-backed browser, accessibility and design-parity evidence after the corresponding services/reference states are available.

## Task 7: acceptance

- [ ] Run targeted red/green suites, isolated PostgreSQL concurrency integration, affected typechecks and `pnpm verify`.
- [ ] Run ArcPay sandbox E2E only after sandbox terminal, webhook endpoint, fiscal profile and private artifact storage credentials are configured.
- [ ] Reconcile a synthetic capture -> release -> payout/refund/chargeback matrix and retain evidence.

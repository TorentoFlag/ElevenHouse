# Payout Terminal Status Hardening Plan

> **For agentic workers:** execute with behavioral TDD. Keep this plan current while working.

## Purpose / Big Picture

Manual payout requests already exist in ElevenHouse: astrologers create a
request, the platform reserves available balance into payout pending, and admins
manually mark the bank transfer outcome. This slice closes terminal-state gaps
so rejected, cancelled, failed and paid payouts have durable completion
semantics and do not leave unclear operational state.

## Progress

- [x] 2026-07-27: Settlement-ledger slice committed as `75676aa`.
- [x] 2026-07-27: Current payout domain, contracts, admin-api, astrologer-api and DB adapter inspected.
- [x] 2026-07-27: Confirmed existing manual payout queue/status UI and APIs; no duplicate payout queue should be built.
- [x] Add behavioral coverage for rejected/cancelled terminal completion and ledger reversal.
- [x] Fix DB adapter terminal timestamp semantics.
- [x] Fix admin-api e2e fake reconciliation store contract after settlement-ledger port expansion.
- [x] Run targeted payout/admin verification and affected package checks.
- [x] 2026-07-27: `@elevenhouse/db typecheck` still has an unrelated messaging test blocker: `messagingThreadIdentities` is not defined in `drizzle-messaging-store.test.ts`.

## Research

Question:
Which payout gap should be implemented next without duplicating existing
manual-payout architecture?

Decision affected:
Payout state machine, DB adapter semantics, admin API verification.

Accessed: 2026-07-27

### Sources

- Repository evidence: `packages/domain/src/payouts/payout-use-cases.ts`
- Repository evidence: `packages/db/src/adapters/finance/drizzle-payout-store.ts`
- Repository evidence: `apps/admin-api/src/modules/finance-policies/finance-policies.service.ts`
- Repository evidence: `apps/admin-web/src/features/finance-policies/ui/FinancePoliciesPage.tsx`
- Repository evidence: `apps/astrologer-api/src/modules/finance/finance.service.ts`

### Findings

- Repository evidence: astrologer payout creation already reserves available
  wallet money into `astrologer_payout_pending`.
- Repository evidence: admin status updates already produce audit records and
  idempotent terminal commands.
- Repository evidence: domain treats `paid`, `failed`, `rejected` and
  `cancelled` as terminal statuses.
- Repository evidence: DB adapter currently sets `completedAt` only for
  `paid` and `failed`, leaving `rejected` and `cancelled` terminal rows
  operationally open.
- Repository evidence: admin-api e2e fake `ReconciliationStore` is missing the
  new `findAttemptByProviderPaymentId` method introduced by settlement-ledger
  ingestion.

### Options

1. Hardening existing terminal semantics, recommended: small, testable,
   production-risk reducing; preserves current manual payout architecture.
2. Build more admin payout UI: not the next bottleneck because UI/API already
   support queue and status updates.
3. Add Arc Pay payout provider adapter now: rejected because Arc Pay terminal
   payout support is not production-ready for this product path yet.

### Recommendation

Implement terminal status hardening. `rejected` and `cancelled` should close the
request with `completedAt` and keep ledger reversal behavior from
`payout_pending` back to `available` when money was reserved by the original
request.

### Rejected Alternatives

- Leave `completedAt` null for cancelled rows: rejected because cancelled is
  terminal in domain and admin reports need a durable close timestamp.
- Build a second payout queue module: rejected because admin-api/admin-web
  already own the queue.

### User Decisions

None for this slice. It follows the approved manual payout architecture.

## Context and Orientation

Relevant files:

- `packages/domain/src/payouts/payout-use-cases.ts`
- `packages/domain/src/payouts/payout-use-cases.test.ts`
- `packages/db/src/adapters/finance/drizzle-payout-store.ts`
- `apps/admin-api/src/modules/finance-policies/finance-policies.e2e.test.ts`

## Interfaces and Dependencies

- Domain owns payout transition and ledger-intent semantics.
- DB adapter owns persistence timestamps and status evidence validation.
- Admin API executes domain use cases inside finance unit of work and audit sink.

## Plan of Work

1. Domain RED/GREEN: rejected and cancelled terminal updates return reserved
   money from payout pending to available and set request `completedAt`.
2. DB adapter RED/GREEN: `updateRequestStatus` sets `completedAt` for every
   terminal payout state.
3. Admin API RED/GREEN: e2e payout rejected/cancelled response has `completedAt`
   and ledger/audit evidence; fake reconciliation store implements the extended
   port.
4. Verification: targeted tests, admin-api typecheck/build, domain/db focused
   checks.

## Validation and Acceptance

- Domain payout tests cover terminal completion and ledger reversal.
- Admin API e2e covers CSRF-protected manual payout terminal update.
- `@elevenhouse/admin-api` typecheck/build passes after fake port fix.
- Existing unrelated messaging DB typecheck blocker remains out of scope.

## Idempotence and Recovery

Terminal admin payout updates remain idempotent through
`admin.finance.payout-status.terminal`; replay returns the persisted payout row
without posting another ledger transaction or audit row.

# Finance Contour Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the production ElevenHouse finance contour: client orders and Arc Pay checkout, webhook-backed payments, append-only wallet ledger, configurable holds/risk/reserves, manual payout requests through admin, refunds/disputes, reconciliation, and finance analytics without premature microservice extraction.

**Architecture:** Finance is a strict bounded context inside the existing modular monolith, backed by PostgreSQL/Drizzle, domain use cases, provider ports/adapters and a dedicated `payment-worker` runtime. `public-api`, `astrologer-api` and `admin-api` expose role-specific routes; durable side effects use transactional outbox and idempotent consumers. The design is extraction-ready, but the first production implementation does not create a standalone payment microservice.

**Tech Stack:** TypeScript, Zod shared contracts, NestJS feature modules, Drizzle/PostgreSQL, BullMQ/Redis workers, transactional outbox, Arc Pay Hosted Checkout/webhooks/settlement APIs, React/Vite frontends, existing custom design system.

## Global Constraints

- Work in the existing shared checkout on `main`; do not create a branch/worktree, stash, rebase, switch branches, or sweep the shared index.
- Current accepted architecture is modular-first, extraction-ready monolith; do not introduce a payment microservice in this implementation.
- `packages/domain` declares use cases/services/ports and must not import `packages/db`.
- `packages/db` owns Drizzle schema, migrations, runtime and adapters.
- App feature modules compose ports/adapters; controllers stay thin.
- `payment-worker` owns provider webhooks, reconciliation, release jobs, refund jobs and payout-provider status jobs.
- Money is always integer minor units plus explicit ISO currency. No floating-point money.
- Ledger is append-only; balance read models are derived/materialized from ledger entries, not directly mutated by controllers.
- Browser booking/order/payment commands require CSRF and `Idempotency-Key`.
- Provider webhook endpoints are CSRF-exempt only because provider signature validation and webhook idempotency are mandatory.
- Arc Pay is the first pay-in/acquiring provider. Arc Pay merchant settlement balance is not the astrologer balance.
- Hosted Checkout is the first Arc Pay payment method. JS Hosted Fields can be added only if product needs native checkout; H2H card forms require explicit PCI acceptance.
- `payment.captured` is the fulfillment signal. `success_url` is UX-only. `timeout` is unknown, not failed.
- Default astrologer hold is 48 hours after service completion/product delivery, and not before provider settlement/reconciliation is clear.
- Admin can configure hold/risk/reserve policy and manually assign astrologer risk tiers.
- Finance policy is snapshotted on order/payment creation; existing orders are not silently recalculated when policy changes.
- Payouts are manual through `admin-api/admin-web` now; future Arc Pay terminal/API payouts must be an adapter, not a rewrite of wallet/ledger.
- Client cabinet remains direct-link relationship scoped; no marketplace discovery/search/recommendations.
- Admin/moderator financial operations live only in `admin-api` and write audit logs.
- Accessed research date: 2026-07-24.

---

## Research

Question:
How should ElevenHouse implement a scalable production finance contour without premature microservices, while preserving payment correctness, ledger integrity, payout evolution and provider replaceability?

Decision affected:
Bounded context boundaries, DB ownership, API split, worker topology, payment provider integration, ledger design, hold/release policy, payout workflow and future extraction path.

Accessed: 2026-07-24

### Sources

- [Arc Pay Hosted Checkout and OpenAPI](https://finext.gitbook.io/arc-pay/ru/readme.md) - Arc Pay supports hosted checkout, cards, SBP, idempotency, webhooks, refunds, settlement ledger and reports.
- [Arc Pay settlement](https://finext.gitbook.io/arc-pay/ru/operacionka/settlement.md) - merchant funds become Arc Pay `available` on T+1 after capture day, subject to settlement/reconciliation.
- [Arc Pay reconciliation](https://finext.gitbook.io/arc-pay/ru/operacionka/reconciliation.md) - settlement discrepancies can pause payouts and require human resolution before money moves.
- [Arc Pay payouts and reserve](https://finext.gitbook.io/arc-pay/ru/operacionka/payouts.md) - provider-side merchant payouts, reserves, failed payout behavior and payout statements.
- [Arc Pay payment lifecycle](https://finext.gitbook.io/arc-pay/ru/koncepcii/payment-lifecycle.md) - `captured`/`settled` can still move to refund/chargeback; `timeout` is non-terminal.
- [Arc Pay payment.captured](https://finext.gitbook.io/arc-pay/ru/vebkhuki/catalog/payment-captured.md) - capture is the order fulfillment signal and must be saved idempotently with the webhook.
- [Arc Pay refunds](https://finext.gitbook.io/arc-pay/ru/vebkhuki/catalog/payment-refunded.md) - partial refunds produce separate idempotent webhook events.
- [Arc Pay chargebacks](https://finext.gitbook.io/arc-pay/ru/operacionka/chargebacks.md) - chargeback windows can reach 540 days and evidence retention must cover worst-case windows.
- [AWS Transactional Outbox Pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html) - official guidance for avoiding dual-write inconsistency and requiring idempotent consumers.
- [Debezium Outbox Event Router](https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html) - official implementation pattern for outbox-based service/event exchange.
- [Stripe Connect separate charges and transfers](https://docs.stripe.com/connect/separate-charges-and-transfers) - mature marketplace pattern decouples charge from transfers, with platform balance exposure to fees/refunds/chargebacks.
- [Stripe marketplace refunds/disputes](https://docs.stripe.com/connect/marketplace/tasks/refunds-disputes) - platform is often liable for refunds/disputes and must account for negative balances/reserves.
- [Adyen split payments at authorization](https://docs.adyen.com/platforms/online-payments/split-transactions/split-payments-at-authorization/) - mature platform systems split sale, commission, transaction fees and remainder across balance accounts.
- [Modern Treasury ledger scaling](https://www.moderntreasury.com/journal/how-to-scale-a-ledger-part-v) - double-entry and immutability are core ledger guarantees for reconstructable financial state.

### Findings

- Repository evidence: `docs/architecture/overview.md` already chooses modular-first architecture with extraction points, separate `payment-worker`, PostgreSQL and one DB as initial infrastructure.
- Repository evidence: `docs/architecture/backend-modules.md` defines `Orders`, `Payments/Billing`, `Wallet/Ledger`, `Subscriptions`, `Analytics`, `AuditLog` and the workflow `Booking -> Orders -> Payments -> payment-worker -> Wallet`.
- Repository evidence: `docs/decisions/0004-payments-notifications-workers.md` forbids controller-side payment status changes and requires idempotent webhooks, reconciliation, refunds, ledger correctness and auditability.
- Repository evidence: `docs/decisions/0007-cookie-auth-csrf-and-idempotency.md` requires CSRF plus `Idempotency-Key` for booking/order/payment browser mutations.
- Sourced fact: Arc Pay confirms pay-in, provider settlement, refunds, webhooks, reports and reconciliation. It does not make Arc Pay merchant balance an astrologer balance.
- Sourced fact: Arc Pay settlement is T+1 for ElevenHouse as merchant, but refunds and chargebacks remain possible after settlement.
- Sourced fact: Arc Pay webhooks are at-least-once; dedupe by `Webhook-Id` and persist side effects transactionally.
- Sourced fact: marketplace-grade providers model platform commission, seller balance, refunds, disputes, reserves and negative balances explicitly.
- Inference: ElevenHouse needs its own append-only ledger regardless of whether future payout execution is manual, Arc Pay terminal/API, T-Bank, YooKassa, Mandarin or another provider.
- Inference: a payment microservice now would add distributed consistency risk before the order/payment/wallet domain model stabilizes. Strict modules plus `payment-worker` give most reliability benefits with lower operational complexity.

### Options

1. **Premature payment microservice**
   - Benefits: independent deployment/security boundary and easier future multi-product finance reuse.
   - Risks: distributed transaction/saga complexity before the domain is stable; duplicated read models; higher test and ops cost; likely distributed monolith.
   - Rejection reason: not justified for first production contour and conflicts with current modular-first ADR direction.

2. **Controller-side payment module**
   - Benefits: fastest superficial implementation.
   - Risks: webhook retries duplicate money, booking/order/ledger side effects race, reconciliation and refunds become patches, no reliable audit.
   - Rejection reason: violates ADR 0004 and production integrity.

3. **Finance bounded context inside modular monolith plus `payment-worker`**
   - Benefits: one transactional DB for order/payment/ledger invariants, isolated provider/worker runtime, clear extraction points, lower distributed failure surface.
   - Risks: requires strict module boundaries, disciplined outbox/event contracts and no direct table coupling from frontend/API controllers.
   - Selected direction.

### Recommendation

Implement option 3. Keep Finance in the monorepo as a strict bounded context with extraction-ready ports, events and read models. Use `payment-worker` as a separate runtime for asynchronous provider and finance jobs. Treat Arc Pay as the first pay-in provider and manual admin payout as the first payout executor, while preserving a future `PayoutProviderPort`.

### Rejected Alternatives

- Using Arc Pay settlement balance as astrologer balance: rejected because provider merchant balance belongs to ElevenHouse, not individual astrologers.
- Releasing astrologer funds immediately on `payment.captured`: rejected because settlement discrepancies, refunds, delivery disputes and chargebacks remain possible.
- Holding 100 percent of astrologer funds for 540 days: rejected because it is product-hostile; use short delivery/refund hold plus configurable reserve/negative-balance controls.
- Applying platform take-rate again at payout: rejected because commission is fixed at sale time; payout can only show a separately defined payout/provider fee.
- Frontend-computed finance metrics: rejected because dashboard/finance/analytics must read backend read models derived from ledger/events.

### User Decisions

- Accepted: no standalone payment microservice for the first production implementation.
- Accepted: modular monolith plus separate `payment-worker` runtime.
- Accepted: Arc Pay pay-in now; payout requests manual through admin.
- Accepted: future Arc Pay payouts are an adapter.
- Accepted: default hold is 48 hours after service completion/delivery and provider settlement/reconciliation clearance.
- Accepted: admin can configure hold/risk/reserve and assign astrologer risk manually.
- Accepted: policy snapshots are taken at sale time.

## Purpose / Big Picture

When a client buys from an astrologer, ElevenHouse should:

1. Create a client/astrologer/product/order record before provider redirect.
2. Send the client through Arc Pay Hosted Checkout.
3. Process `payment.captured` idempotently.
4. Confirm the order and booking/product delivery.
5. Post immutable ledger entries for platform clearing, platform revenue and astrologer pending balance.
6. Release astrologer funds only after service delivery/product delivery, the configured hold window and provider settlement/reconciliation clearance.
7. Let astrologers request payout from available funds.
8. Put payout requests into admin queue for manual transfer.
9. Record manual payout completion/failure with audit evidence and ledger movements.
10. Support full/partial refunds, disputes, chargebacks, reserves, negative balances and reconciliation exceptions without data repair scripts.

## Progress

- [x] 2026-07-24: User accepted modular monolith plus `payment-worker`, no first-stage payment microservice.
- [x] 2026-07-24: User accepted Arc Pay pay-in, manual admin payout queue now, future Arc Pay payout adapter.
- [x] 2026-07-24: User accepted default 48h hold, admin-configurable hold/risk/reserve and risk overrides.
- [x] 2026-07-24: Research and architecture plan created.
- [x] 2026-07-24: Task 1 finance contracts and money primitives implemented and verified.
- [x] 2026-07-24: Task 2 finance DB schema and baseline migration implemented and schema/typecheck verified; local `db:reset` not run because DB lifecycle authority was not granted.
- [x] 2026-07-24: Task 3 domain store ports and Drizzle finance adapters implemented and verified with focused tests/typechecks; local DB integration was not run because DB lifecycle authority was not granted.
- [x] 2026-07-24: Task 4 order domain use case and `public-api` `POST /orders` implemented and verified with focused HTTP e2e/typechecks; local DB/live service verification was not run because lifecycle authority was not granted.
- [x] 2026-07-24: Task 5 public payment checkout implemented and verified with domain/provider/public-API HTTP tests and affected package typechecks; no live Arc Pay request was made.
- [x] 2026-07-24: Task 6 payment-worker webhook ingestion implemented and verified with focused signature/parser/processor tests and affected package typechecks; review fixes added `/v1/payments/{id}` lookup, preflight duplicate webhook detection and real Arc Pay `payment.pending_3ds`/`payment.expired` event support. No worker process, database integration, or live Arc Pay webhook was started.
- [x] 2026-07-24: Task 7 captured-sale ledger posting implemented and verified with focused domain/db/worker tests and affected package typechecks; review fix made captured-sale outbox inserts idempotent on `(event_type, aggregate_id)`.

## Surprises & Discoveries

- 2026-07-24: Arc Pay provider settlement has its own `pending/available/reserved`, but those states are merchant settlement states for ElevenHouse, not astrologer wallet states.
- 2026-07-24: Arc Pay chargeback windows can reach 540 days. The product needs evidence retention and reserve/negative-balance policy, not a 540-day full hold.
- 2026-07-24: Current repo has only platform billing for astrologer plans and confirmed/manual bookings; there is no orders/payments/wallet/ledger production contour yet.
- 2026-07-24: Shared checkout contains unrelated chart-engine changes, including dirty docs. This finance plan is intentionally added as a new file only.
- 2026-07-24: Review of Task 1 found that response contracts must enforce financial evidence invariants too, not only command contracts. Paid payout responses now require external transfer reference and transfer timestamp.
- 2026-07-24: Review of Task 2 found PostgreSQL `CHECK` constraints must be explicitly NULL-safe; finance payout, reconciliation, idempotency and risk-override constraints were tightened.
- 2026-07-24: Finance DB money columns use PostgreSQL `bigint` but retain the current number-based contract boundary by enforcing `<= Number.MAX_SAFE_INTEGER` in DB checks.
- 2026-07-24: Refund provider identifiers are scoped by provider/environment at the DB layer, so `refunds` stores denormalized provider and environment columns for uniqueness.
- 2026-07-24: Task 3 exposed that cross-package typecheck reads `@elevenhouse/domain` from built `dist`; `pnpm --filter @elevenhouse/domain build` is required before DB typecheck can see newly added domain exports.
- 2026-07-24: Wallet balance read models are recomputed from ledger entries inside the ledger transaction for affected astrologer buckets, using credit minus debit for astrologer liability buckets.
- 2026-07-24: Provider events linked to a payment attempt must validate `providerPaymentId` when both sides have it; provider/environment alone is not enough to prevent attaching a webhook to the wrong attempt.
- 2026-07-24: `payment_attempts.idempotency_key` is not independently unique while provider payment ids may be null before provider confirmation. The checkout use-case must wrap payment attempt creation in `finance_idempotency_commands` or add an explicit DB uniqueness rule if this adapter is exposed directly.
- 2026-07-24: Order request idempotency belongs in the `Idempotency-Key` header, not JSON body. The contract now normalizes optional `directLinkIntentId` to `null` so existing linked clients can repeat purchases without a fresh join intent.
- 2026-07-24: Product model supports free/zero-price products, but those must not enter the paid finance order/checkout flow; Task 4 rejects `paymentModel = free` or `priceMinor <= 0` for `POST /orders`.
- 2026-07-24: Arc Pay Hosted Checkout OpenAPI uses `payment_methods[].method = bank_card` for cards and `capture_mode = one_stage | two_stage`; invalid shorthand such as `card` or `automatic` must be rejected by runtime config before provider calls.
- 2026-07-24: Arc Pay payment lookup endpoint is `/v1/payments/{id}`. Webhook duplicate detection must query stored provider events before calling Arc Pay, otherwise already-processed retries can fail if the provider API is temporarily unavailable.
- 2026-07-24: Captured provider event, `pending_payment -> paid`, sale ledger posting, wallet pending projection and captured-sale outbox rows must commit atomically. Otherwise a stored duplicate webhook can suppress the retry that would repair missing ledger movement.

## Decision Log

- 2026-07-24: Use Hosted Checkout first. Rationale: keeps card data in Arc Pay and avoids H2H PCI scope.
- 2026-07-24: Use `payment.captured` for fulfillment and ignore `success_url` as a business proof. Rationale: provider docs say browser return is UX only.
- 2026-07-24: Store provider webhooks first, process idempotently inside DB transaction/outbox. Rationale: webhook delivery is at-least-once.
- 2026-07-24: Use append-only double-entry style ledger with materialized balances. Rationale: reconstructable financial state and no silent balance mutation.
- 2026-07-24: Keep provider settlement and astrologer wallet separate. Rationale: Arc Pay merchant account is not a per-astrologer ledger.
- 2026-07-24: Payout request reserves funds immediately. Rationale: prevents double payout requests against the same available balance.
- 2026-07-24: Admin risk/hold/reserve changes are snapshotted on new orders. Rationale: avoid retroactive hidden financial changes.
- 2026-07-24: Do not create a payment microservice now. Rationale: order/booking/payment/ledger are still a cohesive transactional workflow.
- 2026-07-24: Keep finance DB money columns within JS safe-integer range while contracts/domain use `number`. Rationale: Postgres `bigint` avoids 32-bit caps, but adapters must not read values that lose precision before a future BigInt/string money boundary is deliberately introduced.
- 2026-07-24: Store provider/environment on refunds. Rationale: provider refund id uniqueness must be enforceable directly in DB as `(provider, environment, provider_refund_id)`, not indirectly through payment attempts.
- 2026-07-24: Expose finance adapters via `@elevenhouse/db/finance` and `@elevenhouse/db/adapters/finance`. Rationale: API apps and `payment-worker` should compose the bounded context through a stable adapter entrypoint.
- 2026-07-24: Keep `directLinkIntentId` nullable on orders. Rationale: explicit client-astrologer relationship is the authorization boundary; a join intent is evidence for initial linking, not a required artifact for every later purchase.

## Outcomes & Retrospective

- Tasks 1-3 are implemented for contracts, schema, domain ports and Drizzle adapter infrastructure.
- Task 3 achieved the API/worker-facing write layer foundation: finance idempotency, order persistence, payment attempt/provider event/refund persistence with provider context guards, ledger transaction posting with wallet read-model recompute, manual/provider-ready payout records and configurable policy/risk profile access.
- Real Postgres integration remains pending until a task has explicit authority to manage local DB lifecycle and apply the finance baseline to the local database.

## Context and Orientation

Current relevant repository state:

- `apps/public-api` has identity, client join and client profile foundations; booking/orders/payments are missing.
- `apps/astrologer-api` has products, profile, verification submission, calendar/manual booking and platform billing; wallet/finance/payouts are missing.
- `apps/admin-api` is health-only; admin finance, payout queue, disputes and settings are missing.
- `apps/payment-worker` has readiness only; webhook/reconciliation/release/payout jobs are missing.
- `packages/contracts` exports platform billing/products/calendar contracts but no order/payment/wallet contracts.
- `packages/domain` now exports finance money primitives plus order/payment/wallet/payout/policy ports for the finance bounded context.
- `packages/db` now has finance schema and Drizzle adapter foundations, while API modules and payment-worker wiring are still pending later tasks.
- `ElevenHouseDesign/app/finance.jsx` and `finance-data.jsx` define the visual target for astrologer finance, but the payout modal deducts platform fee at payout and must be corrected in production.

Core terms:

- `gross_amount_minor`: client-paid amount before ElevenHouse commission.
- `platform_fee_minor`: ElevenHouse take-rate fixed at sale time.
- `provider_fee_minor`: Arc Pay/acquirer fee from provider settlement. This is not the platform fee.
- `astrologer_net_amount_minor`: amount owed to astrologer before reserves/payouts.
- `pending`: astrologer funds not yet releasable.
- `available`: astrologer funds eligible for payout request.
- `reserved`: risk reserve withheld from available for a defined period.
- `payout_pending`: funds reserved by an open payout request.
- `negative_balance`: amount astrologer owes platform after late refund/chargeback exceeds available/reserved funds.
- `provider_cleared`: internal state saying Arc Pay settlement/reconciliation did not block this payment.

## File Structure

Expected new/modified files by area. Exact files may be split further if existing patterns require it, but dependency direction must stay the same.

### Shared Contracts

- Created `packages/contracts/src/money.ts`: reusable money/currency/minor-unit schemas.
- Created `packages/contracts/src/orders.ts`: client order/checkout contracts and status schemas.
- Created `packages/contracts/src/payments.ts`: payment attempt/provider/webhook/refund contracts.
- Created `packages/contracts/src/wallet.ts`: astrologer finance read contracts, ledger transaction filters, balance response.
- Created `packages/contracts/src/payouts.ts`: astrologer payout request and admin payout queue contracts.
- Created `packages/contracts/src/finance-policies.ts`: hold/risk/reserve policy contracts.
- Modified `packages/contracts/src/index.ts`: export finance contracts.

### Domain

- Created `packages/domain/src/money/money.ts`: integer money helpers, allocation and rounding.
- Create `packages/domain/src/orders/order-types.ts`: order aggregate/status types.
- Create `packages/domain/src/orders/order-use-cases.ts`: create order and mark paid/cancelled/refunded.
- Create `packages/domain/src/payments/payment-types.ts`: payment attempt, provider events, provider port types.
- Create `packages/domain/src/payments/payment-use-cases.ts`: create checkout, apply captured/refunded/chargeback webhooks.
- Create `packages/domain/src/wallet/ledger-types.ts`: ledger account, transaction and entry types.
- Create `packages/domain/src/wallet/ledger-use-cases.ts`: post sale, release funds, reserve funds, payout reservation, reversals.
- Create `packages/domain/src/payouts/payout-types.ts`: payout request/status/admin action types.
- Create `packages/domain/src/payouts/payout-use-cases.ts`: request payout, approve, mark manual paid, fail/reject/cancel.
- Create `packages/domain/src/finance-policies/finance-policy-types.ts`: policy/risk snapshot types.
- Create `packages/domain/src/finance-policies/finance-policy-use-cases.ts`: read/update policies, assign astrologer risk, snapshot policy for order.
- Create `packages/domain/src/reconciliation/reconciliation-types.ts`: provider reconciliation statuses/exceptions.
- Create `packages/domain/src/reconciliation/reconciliation-use-cases.ts`: mark provider cleared, open/resolve exceptions.

### Database

- Created `packages/db/src/schema/finance/finance-values.ts`: enum constants and check values.
- Created `packages/db/src/schema/finance/orders.schema.ts`.
- Create `packages/db/src/schema/finance/payment-attempts.schema.ts`.
- Create `packages/db/src/schema/finance/payment-provider-events.schema.ts`.
- Create `packages/db/src/schema/finance/refunds.schema.ts`.
- Create `packages/db/src/schema/finance/ledger-accounts.schema.ts`.
- Create `packages/db/src/schema/finance/ledger-transactions.schema.ts`.
- Create `packages/db/src/schema/finance/ledger-entries.schema.ts`.
- Create `packages/db/src/schema/finance/wallet-balance-read-models.schema.ts`.
- Create `packages/db/src/schema/finance/payout-methods.schema.ts`.
- Create `packages/db/src/schema/finance/payout-requests.schema.ts`.
- Create `packages/db/src/schema/finance/finance-policies.schema.ts`.
- Create `packages/db/src/schema/finance/astrologer-risk-profiles.schema.ts`.
- Create `packages/db/src/schema/finance/reconciliation-runs.schema.ts`.
- Create `packages/db/src/schema/finance/reconciliation-exceptions.schema.ts`.
- Create `packages/db/src/schema/finance/relations.schema.ts`.
- Create `packages/db/src/schema/finance/index.ts`.
- Modify `packages/db/src/schema/index.ts`: include finance schema.
- Create `packages/db/src/adapters/finance/*`: Drizzle adapters for domain ports.
- Regenerate `packages/db/drizzle/0000_sticky_rictor.sql` and `packages/db/drizzle/meta/0000_snapshot.json` in the implementation slice that adds schema.

### API Apps

- Create `apps/public-api/src/modules/orders/*`: client order creation/read.
- Create `apps/public-api/src/modules/payments/*`: checkout creation and provider return-state read.
- Create `apps/astrologer-api/src/modules/finance/*`: wallet summary, operations and payout request.
- Create `apps/admin-api/src/modules/finance-policies/*`: policy/risk/reserve settings.
- Create `apps/admin-api/src/modules/payouts/*`: admin payout queue/actions.
- Create `apps/admin-api/src/modules/payments/*`: payment/refund/reconciliation support.
- Create `apps/admin-api/src/modules/disputes/*`: dispute/refund/chargeback queues if not split into a later moderation module.

### Workers

- Expand `apps/payment-worker/src/runtime-config.ts`: Arc Pay config, webhook secrets, job intervals, release/reconciliation settings.
- Create `apps/payment-worker/src/arc-pay/*`: provider client, signature verifier, webhook parser.
- Create `apps/payment-worker/src/webhooks/*`: webhook controller/server or route module depending on existing worker HTTP pattern.
- Create `apps/payment-worker/src/reconciliation/*`: settlement polling/report ingestion and exception jobs.
- Create `apps/payment-worker/src/releases/*`: pending-to-available release processor.
- Create `apps/payment-worker/src/refunds/*`: provider refund request/status processor.
- Create `apps/payment-worker/src/payouts/*`: manual payout status no-op plus future provider payout adapter seam.

### Frontend

- Create `apps/client-web/src/features/orders/*`: order creation/read API, checkout state model.
- Create `apps/client-web/src/features/payments/*`: checkout redirect/return handling and payment status polling.
- Create `apps/client-web/src/pages/checkout/*`: payment pending/success/failure/expired states when product route exists.
- Create `apps/astrologer-web/src/features/finance/*`: wallet API/query model.
- Create `apps/astrologer-web/src/pages/finance/*`: production finance page from real read models.
- Create `apps/admin-web/src/features/finance/*`: admin policies/payouts/payments API/query model.
- Create `apps/admin-web/src/pages/finance/*`: finance policies, payout queue and reconciliation exception UI.

### Documentation

- Modify `docs/architecture/backend-modules.md`: update implemented-state notes after slices land.
- Modify `docs/api/api-boundaries.md`: add exact finance routes once contracts are implemented.
- Modify `docs/product/roadmap.md`: update completion/progress after verified slices.
- Optionally create ADR `docs/decisions/00xx-finance-ledger-and-payout-policy.md` if implementation introduces durable policy beyond this plan.

## Interfaces and Dependencies

### Domain Command Flow

```text
public-api POST /orders
  -> Orders.createOrder(command, idempotencyKey)
  -> Booking/Availability hold validation when order has a slot
  -> FinancePolicy.snapshotForOrder(astrologerId, productType, amount)
  -> DB transaction: order, optional booking hold linkage, outbox event

public-api POST /payments/checkout
  -> Payments.createCheckout(orderId, clientId, idempotencyKey)
  -> PaymentProviderPort.createHostedCheckoutSession(...)
  -> DB transaction: payment_attempt, provider reference, checkout URL

payment-worker POST /webhooks/arc-pay
  -> verify signature before parsing business payload
  -> store payment_provider_event by provider webhook id
  -> Payments.applyProviderEvent(event)
  -> DB transaction: payment attempt state, order state, booking state, ledger transaction, outbox notifications

payment-worker release job
  -> Wallet.releaseEligiblePendingFunds(now)
  -> DB transaction: pending -> available/reserved entries, outbox events

astrologer-api POST /finance/payout-requests
  -> Payouts.requestPayout(astrologerId, amount, idempotencyKey)
  -> DB transaction: available -> payout_pending entries, payout_request, admin notification outbox

admin-api POST /admin/payout-requests/:id/mark-paid
  -> Payouts.markManualPaid(adminId, requestId, externalReference)
  -> DB transaction: payout_pending -> paid_out, payout status, audit log
```

### Core Statuses

Order status:

```ts
type OrderStatus =
  | "draft"
  | "pending_payment"
  | "paid"
  | "fulfilled"
  | "cancelled"
  | "expired"
  | "partially_refunded"
  | "refunded"
  | "chargeback";
```

Payment attempt status:

```ts
type PaymentAttemptStatus =
  | "created"
  | "checkout_opened"
  | "pending"
  | "authorized"
  | "captured"
  | "settled"
  | "failed"
  | "declined"
  | "timeout"
  | "voided"
  | "partially_refunded"
  | "refunded"
  | "chargeback";
```

Payout request status:

```ts
type PayoutRequestStatus =
  | "requested"
  | "under_review"
  | "approved"
  | "processing_manual"
  | "processing_provider"
  | "paid"
  | "failed"
  | "rejected"
  | "cancelled";
```

Risk tier:

```ts
type AstrologerRiskTier =
  | "low"
  | "standard"
  | "elevated"
  | "high"
  | "manual_review";
```

Default policy:

```ts
const DEFAULT_FINANCE_POLICY = {
  defaultHoldHours: 48,
  defaultReserveBps: 0,
  defaultReserveDays: 0,
  payoutManualReviewRequired: true
} as const;
```

Risk tier examples:

```ts
const RISK_TIER_PRESETS = {
  low: { holdHours: 24, reserveBps: 0, reserveDays: 0, payoutReview: false },
  standard: { holdHours: 48, reserveBps: 0, reserveDays: 0, payoutReview: true },
  elevated: { holdHours: 72, reserveBps: 500, reserveDays: 90, payoutReview: true },
  high: { holdHours: 168, reserveBps: 1000, reserveDays: 180, payoutReview: true },
  manual_review: { holdHours: null, reserveBps: 1000, reserveDays: 180, payoutReview: true }
} as const;
```

### Ledger Invariants

- Every posted ledger transaction balances per currency.
- No ledger entry is updated or deleted after posting.
- Corrections are new reversal/adjustment transactions.
- Account balances are derived by summing posted entries, then materialized for read performance.
- `available` cannot go below zero except through explicit `negative_balance` transaction type.
- A payout request atomically moves funds from `available` to `payout_pending`.
- Refund/chargeback reversal tries `pending`, then `available`, then `reserved`, then creates `negative_balance`.
- Provider webhook, payment status transition and ledger entries are persisted in one transaction.
- Every external provider id has a uniqueness constraint scoped by provider/environment.
- Every idempotent command stores request hash and persisted response reference.

### Extraction Boundary

Finance can be extracted later if:

- command interfaces are already expressed as ports/use cases;
- API apps do not read finance tables directly;
- queues/outbox carry identifiers only;
- finance events are versioned;
- all provider adapters are behind `PaymentProviderPort`/`PayoutProviderPort`;
- read models have explicit ownership and can be replicated.

Until extraction, all finance write invariants stay in one PostgreSQL transaction where possible.

## Plan of Work

### Task 1: Finance Contracts and Money Primitives

**Files:**

- Create: `packages/contracts/src/money.ts`
- Create: `packages/contracts/src/money.test.ts`
- Create: `packages/contracts/src/orders.ts`
- Create: `packages/contracts/src/orders.test.ts`
- Create: `packages/contracts/src/payments.ts`
- Create: `packages/contracts/src/payments.test.ts`
- Create: `packages/contracts/src/wallet.ts`
- Create: `packages/contracts/src/wallet.test.ts`
- Create: `packages/contracts/src/payouts.ts`
- Create: `packages/contracts/src/payouts.test.ts`
- Create: `packages/contracts/src/finance-policies.ts`
- Create: `packages/contracts/src/finance-policies.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/domain/src/money/money.ts`
- Create: `packages/domain/src/money/money.test.ts`

**Interfaces:**

- Produces shared money/order/payment/wallet/payout/policy Zod schemas.
- Produces domain money helpers:

```ts
type Money = { readonly amountMinor: number; readonly currency: "RUB" };
function allocateBps(input: { amountMinor: number; bps: number }): {
  readonly feeMinor: number;
  readonly remainderMinor: number;
};
```

- [ ] Write failing tests for integer money validation, currency validation, bps fee allocation and no fractional output.
- [ ] Run `pnpm test packages/domain/src/money/money.test.ts packages/contracts/src/*.test.ts` with expected failures from missing exports.
- [ ] Implement contracts and money helpers.
- [ ] Run `pnpm test packages/domain/src/money/money.test.ts packages/contracts/src/money.test.ts packages/contracts/src/orders.test.ts packages/contracts/src/payments.test.ts packages/contracts/src/wallet.test.ts packages/contracts/src/payouts.test.ts packages/contracts/src/finance-policies.test.ts`.
- [ ] Run `pnpm --filter @elevenhouse/contracts typecheck`.

### Task 2: Finance DB Schema and Baseline Migration

**Files:**

- Create: `packages/db/src/schema/finance/*`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/src/schema/finance/finance.schema.test.ts`
- Modify: `packages/db/drizzle/0000_sticky_rictor.sql`
- Modify: `packages/db/drizzle/meta/0000_snapshot.json`

**Interfaces:**

- Produces Drizzle tables for orders, payment attempts, provider events, refunds, ledger accounts/transactions/entries, balance read models, payout methods, payout requests, finance policies, risk profiles and reconciliation records.
- Produces uniqueness constraints:
  - `(provider, environment, provider_payment_id)` for payment attempts when provider id exists.
  - `(provider, environment, provider_webhook_id)` for provider events.
  - `(scope, idempotency_key)` for idempotent finance commands.
  - `(ledger_transaction_id, account_id, entry_side)` indexes for ledger reads.

- [x] Write failing schema tests for enum checks, money currency checks, webhook uniqueness, provider payment uniqueness, payout status checks and ledger entry account references.
- [x] Add Drizzle schema files and relations.
- [x] Regenerate the current Drizzle baseline according to `docs/development/agent-runbooks/04-database-and-migrations.md`.
- [x] Run `pnpm test packages/db/src/schema/finance/finance.schema.test.ts`.
- [ ] Run the required local DB reset only if this implementation slice has explicit authority to manage local DB lifecycle; otherwise record reset as blocked. Blocked: no DB lifecycle authority in this implementation turn.

### Task 3: Domain Stores and Idempotent Command Infrastructure

**Files:**

- Create: `packages/domain/src/finance/shared/idempotent-command.ts`
- Create: `packages/domain/src/orders/order-store.ts`
- Create: `packages/domain/src/payments/payment-store.ts`
- Create: `packages/domain/src/wallet/ledger-store.ts`
- Create: `packages/domain/src/payouts/payout-store.ts`
- Create: `packages/domain/src/finance-policies/finance-policy-store.ts`
- Create: `packages/db/src/adapters/finance/drizzle-finance-command-store.ts`
- Create: `packages/db/src/adapters/finance/drizzle-order-store.ts`
- Create: `packages/db/src/adapters/finance/drizzle-payment-store.ts`
- Create: `packages/db/src/adapters/finance/drizzle-ledger-store.ts`
- Create: `packages/db/src/adapters/finance/drizzle-payout-store.ts`
- Create: `packages/db/src/adapters/finance/drizzle-finance-policy-store.ts`

**Interfaces:**

- Consumes DB schema from Task 2.
- Produces ports and Drizzle adapters used by API modules and `payment-worker`.
- Idempotency behavior:
  - same key + same request hash returns persisted result;
  - same key + different request hash returns stable conflict;
  - command result is written in the same transaction as business state.

- [x] Write focused adapter tests for idempotent command replay and conflict.
- [x] Write focused ledger adapter guard tests for balanced/unbalanced transaction validation.
- [x] Implement domain ports and adapters without importing DB into domain.
- [x] Run focused DB adapter tests.
- [x] Run `pnpm --filter @elevenhouse/domain typecheck` and `pnpm --filter @elevenhouse/db typecheck`.

### Task 4: Orders Domain and Public Order Creation

**Files:**

- Create: `packages/domain/src/orders/order-use-cases.ts`
- Create: `packages/domain/src/orders/order-use-cases.test.ts`
- Create: `apps/public-api/src/modules/orders/orders.module.ts`
- Create: `apps/public-api/src/modules/orders/orders.controller.ts`
- Create: `apps/public-api/src/modules/orders/orders.service.ts`
- Create: `apps/public-api/src/modules/orders/orders.tokens.ts`
- Create: `apps/public-api/src/modules/orders/orders.e2e.test.ts`
- Modify: `apps/public-api/src/app.module.ts`

**Interfaces:**

- Produces `POST /orders`.
- Request includes direct-link context, product id, optional booking intent/slot, locale and accepted policy version.
- Response includes order id, status, amount snapshot, product snapshot, client id and astrologer id.

- [x] Write failing domain tests for order creation from active direct-link client relationship and active product.
- [x] Write failing e2e tests that order creation requires CSRF and `Idempotency-Key`.
- [x] Implement order use case and `public-api` feature module.
- [x] Run order domain tests and public-api e2e tests.
- [x] Verify order creation does not call Arc Pay and does not mutate ledger.

### Task 5: Payment Checkout Creation with Arc Pay Provider Port

**Files:**

- Create: `packages/domain/src/payments/payment-provider-port.ts`
- Create: `packages/domain/src/payments/payment-use-cases.ts`
- Create: `packages/domain/src/payments/payment-use-cases.test.ts`
- Create: `apps/public-api/src/modules/payments/payments.module.ts`
- Create: `apps/public-api/src/modules/payments/payments.controller.ts`
- Create: `apps/public-api/src/modules/payments/payments.service.ts`
- Create: `apps/public-api/src/modules/payments/payments.tokens.ts`
- Create: `apps/public-api/src/modules/payments/arc-pay-checkout-provider.ts`
- Create: `apps/public-api/src/modules/payments/payments.e2e.test.ts`
- Modify: `apps/public-api/src/app.module.ts`

**Interfaces:**

- Produces `POST /payments/checkout`.
- Provider request sends `external_id = orderId` or `paymentAttemptId`, amount/currency, customer id/email when available, HTTPS return URLs and metadata references.
- Browser response exposes checkout URL and payment attempt id, not provider secrets.

- [x] Write provider-port unit tests for amount/currency/external id propagation.
- [x] Write e2e tests for CSRF/idempotency, order ownership and duplicate checkout replay.
- [x] Implement Arc Pay Hosted Checkout provider adapter behind `PaymentProviderPort`.
- [x] Run payment checkout tests.
- [x] Run `pnpm --filter @elevenhouse/public-api typecheck`.

### Task 6: Payment Worker Webhook Ingestion

**Files:**

- Expand: `apps/payment-worker/src/runtime-config.ts`
- Create: `apps/payment-worker/src/arc-pay/arc-pay-signature.ts`
- Create: `apps/payment-worker/src/arc-pay/arc-pay-webhook.ts`
- Create: `apps/payment-worker/src/webhooks/payment-webhook.server.ts`
- Create: `apps/payment-worker/src/webhooks/payment-webhook.processor.ts`
- Create: `apps/payment-worker/src/webhooks/payment-webhook.processor.test.ts`
- Modify: `apps/payment-worker/src/main.ts`

**Interfaces:**

- Consumes Arc Pay webhook headers/body.
- Produces stored provider event and invokes payment use case.
- Required checks:
  - signature valid before parse;
  - timestamp inside allowed skew;
  - `Webhook-Id` unique;
  - provider payment id belongs to stored attempt;
  - amount/currency match order;
  - event ordering is tolerated.

- [x] Write failing tests for invalid signature, duplicate webhook id, amount mismatch, currency mismatch and duplicate captured event.
- [x] Implement signature verification and raw-body event storage.
- [x] Implement processing for `payment.captured`, `payment.refunded`, `payment.chargeback`, `payment.timeout`, terminal failure events.
- [x] Run `pnpm test apps/payment-worker/src/webhooks/payment-webhook.processor.test.ts`.
- [x] Run `pnpm --filter @elevenhouse/payment-worker typecheck`.

### Task 7: Ledger Posting for Sales and Fulfillment Side Effects

**Files:**

- Create: `packages/domain/src/wallet/ledger-use-cases.ts`
- Create: `packages/domain/src/wallet/ledger-use-cases.test.ts`
- Modify: `packages/domain/src/payments/payment-use-cases.ts`
- Modify: `packages/db/src/adapters/finance/drizzle-ledger-store.ts`
- Modify: `packages/db/src/schema/outbox/outbox-events.schema.ts` only if new event type constraints are needed.

**Interfaces:**

- Consumes captured payment event from Task 6.
- Produces ledger transaction:

```text
sale_captured:
  debit  platform_clearing      gross_amount
  credit astrologer_pending     astrologer_net_amount
  credit platform_revenue       platform_fee_amount
```

- Produces outbox events:
  - `finance.payment_captured`
  - `orders.order_paid`
  - `booking.payment_confirmed`
  - `notifications.payment_confirmation_requested`

- [x] Write failing tests for balanced sale posting, commission snapshot use, duplicate event replay and outbox event creation.
- [x] Implement sale ledger posting in same transaction as payment/order state.
- [x] Wire booking confirmation only through domain use case/outbox boundary; do not confirm booking in webhook controller.
- [x] Run finance domain tests.
- [x] Record affected scheduling/booking tests as not applicable until Task 8 lands.

### Task 8: Booking Lifecycle Rewrite for Paid Client Flow

**Files:**

- Modify: `packages/contracts/src/calendar.ts` or create dedicated `packages/contracts/src/bookings.ts`.
- Modify: `packages/domain/src/bookings/booking-types.ts`
- Modify: `packages/domain/src/bookings/booking-use-cases.ts`
- Modify: `packages/db/src/schema/scheduling/bookings.schema.ts`
- Modify: `packages/db/src/schema/scheduling/scheduling-values.ts`
- Modify: `apps/public-api/src/modules/booking/*` when created.
- Modify: `apps/astrologer-api/src/modules/bookings/*` only for owner-facing reads/manual flows.

**Interfaces:**

- Adds booking states `hold`, `pending_payment`, `confirmed`, `completed`, `cancelled`, `no_show`, `expired`.
- Client paid flow owns `hold -> pending_payment -> confirmed`.
- Manual astrologer booking remains supported but explicit as manual source.

- [ ] Write failing tests for slot hold, hold expiry, payment failure release, payment captured confirmation and no double booking.
- [ ] Migrate schema values and booking domain state machine.
- [ ] Implement public booking intent/select-slot routes.
- [ ] Preserve existing manual booking behavior with explicit source/status mapping.
- [ ] Run calendar/booking contracts, domain and API tests.

### Task 9: Finance Policies, Risk Profiles and Admin Settings

**Files:**

- Create: `packages/domain/src/finance-policies/finance-policy-use-cases.ts`
- Create: `packages/domain/src/finance-policies/finance-policy-use-cases.test.ts`
- Create: `apps/admin-api/src/modules/finance-policies/*`
- Create: `apps/admin-api/src/modules/finance-policies/finance-policies.e2e.test.ts`
- Create: `apps/admin-web/src/features/finance-policies/*`
- Create: `apps/admin-web/src/pages/finance-policies/*`

**Interfaces:**

- Produces admin routes:
  - `GET /admin/finance/policies`
  - `PUT /admin/finance/policies/default`
  - `PUT /admin/finance/risk-profiles/:astrologerId`
  - `POST /admin/finance/orders/:orderId/apply-risk-policy` for explicit current-order action.
- Writes audit logs for every change.

- [ ] Write failing domain tests for default 48h, risk tier override and order policy snapshot.
- [ ] Write failing admin e2e tests for permission, CSRF, audit and no silent retroactive recalculation.
- [ ] Implement policy use cases and admin API module.
- [ ] Implement admin UI for settings and risk assignment with neutral copy.
- [ ] Run admin-api and admin-web focused tests.

### Task 10: Fund Release and Reserve Jobs

**Files:**

- Create: `packages/domain/src/wallet/fund-release-use-cases.ts`
- Create: `packages/domain/src/wallet/fund-release-use-cases.test.ts`
- Create: `apps/payment-worker/src/releases/fund-release.processor.ts`
- Create: `apps/payment-worker/src/releases/fund-release.processor.test.ts`
- Modify: `apps/payment-worker/src/main.ts`

**Interfaces:**

- Release conditions:
  - payment captured;
  - order fulfilled or booking completed/no-show under policy;
  - `holdUntil <= now`;
  - provider settlement/reconciliation clear;
  - no blocking dispute/refund/chargeback case;
  - risk tier is not `manual_review`.

- Ledger movement:

```text
release_available:
  debit  astrologer_pending
  credit astrologer_available

release_reserved:
  debit  astrologer_pending
  credit astrologer_reserved
```

- [ ] Write failing tests for 48h default, settlement block, manual review block, reserve split and idempotent release retry.
- [ ] Implement release use case and worker processor.
- [ ] Run targeted release tests.
- [ ] Add metrics/logging for eligible, released, skipped_by_reason and failed counts.

### Task 11: Astrologer Finance Read Model and `/finance`

**Files:**

- Create: `packages/domain/src/wallet/wallet-read-use-cases.ts`
- Create: `packages/domain/src/wallet/wallet-read-use-cases.test.ts`
- Create: `apps/astrologer-api/src/modules/finance/*`
- Create: `apps/astrologer-api/src/modules/finance/finance.e2e.test.ts`
- Create: `apps/astrologer-web/src/features/finance/*`
- Create: `apps/astrologer-web/src/pages/finance/*`

**Interfaces:**

- Produces astrologer routes:
  - `GET /finance/summary`
  - `GET /finance/operations?type=&from=&to=&cursor=`
  - `GET /finance/payout-method`
  - `POST /finance/payout-requests`
- Finance UI maps to reference `finance.jsx`, but removes second platform commission deduction at payout.

- [ ] Write failing read model tests for pending/available/reserved/payout_pending totals from ledger.
- [ ] Write failing API tests for owner scope and pagination.
- [ ] Implement API module and frontend query model.
- [ ] Implement `/finance` page with loading/empty/success/error states.
- [ ] Run frontend tests and typecheck/build.
- [ ] Perform design parity when a browser/runtime surface is available.

### Task 12: Manual Payout Requests and Admin Queue

**Files:**

- Create: `packages/domain/src/payouts/payout-use-cases.ts`
- Create: `packages/domain/src/payouts/payout-use-cases.test.ts`
- Create: `apps/admin-api/src/modules/payouts/*`
- Create: `apps/admin-api/src/modules/payouts/payouts.e2e.test.ts`
- Create: `apps/admin-web/src/features/payouts/*`
- Create: `apps/admin-web/src/pages/payouts/*`

**Interfaces:**

- Astrologer request moves `available -> payout_pending`.
- Admin queue exposes risk warnings:
  - unreconciled payments;
  - open disputes;
  - high refund rate;
  - negative balance;
  - missing/expired payout requisites;
  - manual_review risk tier.
- Admin actions:
  - under review;
  - approve;
  - mark processing manual;
  - mark paid with external reference;
  - fail and return funds;
  - reject and return funds;
  - cancel and return funds.

- [ ] Write failing payout domain tests for reservation, double-request prevention, mark-paid, fail/reject returning funds and audit event output.
- [ ] Write failing admin-api e2e tests for permission, CSRF, audit and state transitions.
- [ ] Implement admin payout queue.
- [ ] Implement admin UI with reference/document fields for manual transfer evidence.
- [ ] Run admin payout tests and affected frontend gates.

### Task 13: Refunds, Disputes and Chargebacks

**Files:**

- Create: `packages/domain/src/refunds/*`
- Create: `packages/domain/src/disputes/*`
- Create: `apps/admin-api/src/modules/payments/refunds.*`
- Create: `apps/admin-api/src/modules/disputes/*`
- Expand: `apps/payment-worker/src/refunds/*`
- Expand: `apps/payment-worker/src/webhooks/payment-webhook.processor.ts`
- Create: `apps/client-web/src/pages/disputes/*` only when client dispute entry is in scope.

**Interfaces:**

- Refund reversal order:
  1. reduce unreleased `pending`;
  2. reduce `available`;
  3. reduce `reserved`;
  4. create `negative_balance` if funds were already paid out.
- Full refund reverses platform commission according to product policy.
- Partial refund prorates astrologer net/platform fee according to order snapshot.
- Chargeback opens admin dispute case and ledger clawback.

- [ ] Write failing tests for full refund before release, partial refund after release, refund after payout creating negative balance and chargeback fee accounting.
- [ ] Implement refund domain use cases and provider refund command processor.
- [ ] Implement chargeback webhook handling and dispute queue creation.
- [ ] Run targeted tests.
- [ ] Verify no refund/provider operation can execute without idempotency key and audit reason.

### Task 14: Provider Settlement and Reconciliation

**Files:**

- Create: `packages/domain/src/reconciliation/reconciliation-use-cases.ts`
- Create: `packages/domain/src/reconciliation/reconciliation-use-cases.test.ts`
- Create: `apps/payment-worker/src/reconciliation/arc-pay-settlement-client.ts`
- Create: `apps/payment-worker/src/reconciliation/reconciliation.processor.ts`
- Create: `apps/payment-worker/src/reconciliation/reconciliation.processor.test.ts`
- Create: `apps/admin-api/src/modules/reconciliation/*`
- Create: `apps/admin-web/src/pages/reconciliation/*`

**Interfaces:**

- Reads Arc Pay settlement balance/ledger/reports.
- Marks payments `provider_cleared` only after settlement/reconciliation criteria.
- Opens reconciliation exceptions for amount mismatch, missing on provider, missing locally and provider payout discrepancies.
- Release job must skip payments with open exceptions.

- [ ] Write failing tests for settlement-cleared payment enabling release.
- [ ] Write failing tests for exception blocking release.
- [ ] Implement reconciliation polling/report import.
- [ ] Implement admin exception queue and resolve/waive actions with audit.
- [ ] Run worker/admin tests.

### Task 15: Subscriptions and Recurring Billing

**Files:**

- Create: `packages/contracts/src/subscriptions.ts`
- Create: `packages/domain/src/subscriptions/*`
- Create: `packages/db/src/schema/finance/subscriptions.schema.ts`
- Create: `apps/public-api/src/modules/subscriptions/*`
- Expand: `apps/payment-worker/src/webhooks/payment-webhook.processor.ts`
- Create: `apps/client-web/src/pages/billing/*`

**Interfaces:**

- Saved-card consent and recurring payment attempts are linked to client, astrologer, product and subscription plan.
- Subscription renewal creates a new order/payment attempt and ledger sale on capture.
- Cancel stops future charges but preserves access through paid period.
- Retry/grace states are explicit.

- [ ] Write failing tests for recurring capture creating order/ledger entries.
- [ ] Write failing tests for cancellation and grace behavior.
- [ ] Implement subscription domain and provider adapter seam.
- [ ] Run subscription tests.

### Task 16: Admin Finance Analytics and Reports

**Files:**

- Create: `packages/domain/src/analytics/finance-analytics-use-cases.ts` or extend existing analytics module when it exists.
- Create: `apps/admin-api/src/modules/finance-analytics/*`
- Create: `apps/admin-web/src/pages/finance-analytics/*`
- Create: `apps/astrologer-api/src/modules/analytics/*` if astrologer finance analytics is in same phase.

**Interfaces:**

- Admin metrics:
  - GMV;
  - platform revenue;
  - provider fees;
  - refunds;
  - chargebacks;
  - payout requested/paid/failure volume;
  - pending/available/reserved exposure;
  - negative balances;
  - reconciliation exceptions.
- Astrologer metrics:
  - monthly gross;
  - net earned;
  - pending/available;
  - refund rate;
  - MRR for subscriptions.

- [ ] Write failing read model tests from ledger/events.
- [ ] Implement backend read models.
- [ ] Implement dashboards only from backend data.
- [ ] Run affected API/frontend tests.

### Task 17: Observability, Operations and Runbooks

**Files:**

- Create: `docs/operations/finance-runbook.md`
- Create: `docs/operations/payment-provider-incidents.md`
- Expand: `apps/payment-worker/src/readiness.ts`
- Expand runtime config tests for all finance settings.

**Interfaces:**

- Metrics:
  - webhook accepted/duplicate/rejected counts;
  - payment capture latency;
  - release eligible/released/skipped;
  - payout requested/paid/failed;
  - reconciliation exception count and age;
  - negative balance total;
  - chargeback count/rate.
- Logs must redact provider secrets, raw card data, webhook secrets, customer private data and raw provider payloads where not needed.

- [ ] Write tests for runtime config validation.
- [ ] Add readiness details that do not expose secrets.
- [ ] Document manual payout procedure, refund procedure, reconciliation exception handling and chargeback evidence collection.
- [ ] Run typecheck/tests for worker/runtime config.

### Task 18: Extraction Readiness Review

**Files:**

- Create: `docs/architecture/finance-extraction-readiness.md`
- Review only; code changes only if a clear violation is found in previous tasks.

**Interfaces:**

- Confirms no app imports DB finance tables directly.
- Confirms provider adapters are isolated.
- Confirms outbox events are versioned and carry identifiers.
- Confirms finance read models have explicit ownership.

- [ ] Run `rg -n "from .*schema/finance|finance.*schema" apps packages/domain packages/contracts`.
- [ ] Run dependency-direction checks or manual import review.
- [ ] Document extraction prerequisites and current blockers.
- [ ] Do not extract service unless a separate ADR approves it.

## Concrete Steps

Run commands from `/Users/anton/Finext/ElevenHouse`.

Baseline before every implementation session:

```bash
git branch --show-current
git status --short
git diff --cached --name-status
```

Expected:

```text
main
```

Targeted package checks by slice:

```bash
pnpm --filter @elevenhouse/contracts typecheck
pnpm --filter @elevenhouse/domain typecheck
pnpm --filter @elevenhouse/db typecheck
pnpm --filter @elevenhouse/public-api test
pnpm --filter @elevenhouse/astrologer-api test
pnpm --filter @elevenhouse/admin-api test
pnpm --filter @elevenhouse/payment-worker test
pnpm --filter @elevenhouse/client-web test
pnpm --filter @elevenhouse/astrologer-web test
pnpm --filter @elevenhouse/admin-web test
```

Affected full-surface gates after major slices:

```bash
pnpm --filter @elevenhouse/contracts test
pnpm --filter @elevenhouse/domain test
pnpm --filter @elevenhouse/db test
pnpm --filter @elevenhouse/public-api test
pnpm --filter @elevenhouse/astrologer-api test
pnpm --filter @elevenhouse/admin-api test
pnpm --filter @elevenhouse/payment-worker test
pnpm --filter @elevenhouse/client-web build
pnpm --filter @elevenhouse/astrologer-web build
pnpm --filter @elevenhouse/admin-web build
git diff --check
```

Runtime/browser acceptance requires user authority if services are not already running. Do not start/stop processes without explicit permission.

## Validation and Acceptance

Automated acceptance:

- Contract tests parse and reject every public/astrologer/admin finance request/response shape.
- Domain tests prove money allocation, policy snapshots, ledger balancing, idempotency, release, reserve, payout and reversal behavior.
- DB tests prove constraints, uniqueness, indexes and safe idempotent replay.
- API e2e tests prove owner scope, direct-link scope, CSRF, `Idempotency-Key`, admin permissions and audit logging.
- Worker tests prove webhook signature/idempotency, settlement exception handling, release retry safety and refund/chargeback idempotency.
- Frontend tests prove loading/empty/success/error/pending/blocked states and no client-side finance arithmetic beyond display formatting.

Runtime acceptance:

- Client creates order and checkout for a direct-link astrologer product.
- Arc Pay sandbox Hosted Checkout returns a real provider payment and webhook.
- `payment.captured` confirms order/booking and posts ledger exactly once.
- Astrologer finance shows pending balance from real ledger.
- Completion plus 48h simulated/test clock and provider clearance releases funds.
- Payout request moves available funds to payout pending and appears in admin queue.
- Admin marks manual payout paid and ledger reflects paid out.
- Refund after release reverses ledger correctly.
- Duplicate webhook does not duplicate order/ledger/notification.
- Reconciliation exception blocks release until resolved.

Visual acceptance:

- `/finance` desktop/mobile matches `ElevenHouseDesign/app/finance.jsx` and `mobile-finance.jsx` visual language.
- Payout modal does not deduct platform take-rate again.
- Admin finance/payout screens use admin reference language and show risk/reconciliation warnings clearly.
- Client checkout states do not show false success from `success_url` alone.

## Idempotence and Recovery

- Every browser mutation in booking/order/payment/payout uses `Idempotency-Key`.
- Every provider webhook is deduped by provider webhook id.
- Every provider mutation uses provider idempotency key where supported.
- Worker jobs carry identifiers only and reload authoritative DB state.
- If webhook processing writes DB and fails before `2xx`, retry returns success without repeating side effects.
- If Arc Pay returns timeout, keep payment/order pending and poll/wait for webhook.
- If release job fails after partial work, ledger transaction uniqueness prevents double release.
- If manual payout transfer fails, admin marks failed and funds return from `payout_pending` to `available`.
- If refund/chargeback exceeds available/reserved funds, create explicit `negative_balance` and admin case.
- Unknown provider state does not become success or failure by default; it becomes observable pending/exception state.

## Scalability and Anti-Costyle Gates

- No direct `balance += amount` updates outside ledger materialization.
- No frontend-derived finance totals.
- No provider response shape guessed without schema/parser.
- No hidden fallback from Arc Pay failure to fake success.
- No order fulfillment from browser return URL.
- No admin finance action outside `admin-api`.
- No payout request without immediate funds reservation.
- No broad “finance service” file that owns all behavior; split by orders/payments/wallet/payouts/policies/reconciliation.
- No synchronous provider calls inside unrelated booking/product controllers.
- No queue payloads with full provider payloads or mutable business snapshots.
- No long-term dependency from packages to apps.
- No raw card data or webhook secrets in logs.
- No retroactive finance policy changes without explicit admin action and audit.
- No microservice extraction until the extraction readiness checklist passes and a new ADR approves it.

## Artifacts and Notes

- Design QA artifacts for finance UI belong under `.design-qa/finance-contour-YYYY-MM-DD/`.
- Provider sandbox evidence should record provider payment id, order id, webhook id, ledger transaction ids and commands used.
- Reconciliation evidence should record Arc Pay settlement/report job ids and internal reconciliation run ids.
- Admin manual payout evidence should store external transfer reference, paid timestamp, admin id and optional private attachment/media id.

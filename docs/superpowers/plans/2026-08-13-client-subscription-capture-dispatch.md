# Client-subscription capture dispatch

**Goal:** a verified `client_order` capture activates the exact one-time
ClientSubscription paid period asynchronously, without changing booking,
ordinary-order or platform-tariff subscription semantics.

## Research

- Repository event runbook (`docs/development/agent-runbooks/06-workers-and-events.md`):
  the payment transaction writes an IDs-only outbox event; the worker owns the
  idempotent side effect and terminal failures remain inspectable.
- Repository migration runbook (`docs/development/agent-runbooks/04-database-and-migrations.md`):
  DB source is canonical and this change needs one focused forward migration.
- Current source: `finance_issue_verified_capture_application_receipt()` emits
  the unconsumed `finance.economic_payment.capture_applied` event for every
  client-order capture. The sealed purchase authority, subscription contract,
  source-event UoW, and bounded outbox claim fence already exist.

**Decision:** replace that one unconsumed client-order event with the single
literal `finance.client_order.capture_applied.v1`, payload only
`captureApplicationReceiptId`. Do not dual-publish. The worker rehydrates all
authority from PostgreSQL, publishes non-subscription orders as a no-op, and
quarantines bad authority. Three total attempts are allowed: two requeues,
then quarantine.

## Steps

0. **Prerequisite:** the capture dispatcher creates the pending
   subscription/contract from the sealed order-side purchase authority in the
   same transaction as the initial capture. This avoids a paid order with a
   stranded pending subscription, and ordinary order creation remains unchanged.
1. Export and migrate the immutable capture-dispatch receipt table and strict
   outbox payload/check as forward migration `0044`; append the receipt
   integrity SQL after generated DDL.
2. Implement a PostgreSQL dispatch UoW that locks the capture/order/contract/
   subscription authority, allocates output IDs once, invokes the existing
   source-event UoW, and writes/replays the immutable dispatch receipt.
3. Make the finance capture trigger issue the purpose-specific event only.
4. Wire the payment-worker relay to the shared fenced outbox store and the
   dispatch UoW, using the established interval/config values and exactly three
   total attempts.
5. Prove real PostgreSQL initial activation, activation replay, ordinary-order
   no-op, malformed/quarantined event, stale claim, and retry exhaustion;
   then run affected package checks, generate/no-delta, and local reset.

## Scope

Included: `packages/domain` dispatch evidence already prepared, DB finance and
client-subscription adapters, payment worker relay/composition, one forward
migration, focused tests.

Excluded: provider API calls, public API/UI routes, AstroDiary command/media
work, changing prior migrations, and any external deployment.

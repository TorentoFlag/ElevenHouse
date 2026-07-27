# Provider Reconciliation Foundation Plan

> **For agentic workers:** execute with behavioral TDD. Keep this plan current while working.

## Purpose / Big Picture

ElevenHouse must not make astrologer funds available from `pending` until the approved hold window has elapsed and provider settlement/reconciliation is clear when the order policy requires it. Arc Pay is the pay-in provider; Arc Pay settlement balance is merchant-level evidence, not the astrologer wallet. This slice adds the domain and persistence foundation for provider reconciliation records and wires provider settlement/exception webhooks into the existing `payment-worker`.

## Progress

- [x] 2026-07-27: Research refreshed against current Arc Pay settlement, reconciliation, reports and `payment.settled` docs.
- [x] 2026-07-27: Domain reconciliation port/use-cases added for matched settlement evidence and unresolved provider exceptions.
- [x] 2026-07-27: Drizzle reconciliation store with real PostgreSQL integration coverage.
- [x] 2026-07-27: `payment-worker` routes `payment.settled` and `reconciliation.exception` through the reconciliation use-cases.
- [x] 2026-07-27: Admin read/resolve/waive exception queue with CSRF-protected mutations and durable audit.
- [x] 2026-07-27: Targeted verification and diff review completed; commit prepared.

## Research

Question:
How should ElevenHouse ingest Arc Pay settlement/reconciliation evidence so hold release and admin operations are reliable?

Decision affected:
Payment-worker webhook routing, reconciliation DB port, hold-release eligibility, admin exception workflow.

Accessed: 2026-07-27

### Sources

- [Arc Pay settlement API](https://finext.gitbook.io/arc-pay/api-reference/settlement.md) - settlement balance/ledger/payout APIs require secret keys and expose integer minor units, cursors and settlement ledger fields.
- [Arc Pay reports API](https://finext.gitbook.io/arc-pay/api-reference/reports.md) - reports are asynchronous jobs; transaction/balance/commission reports can be generated and later downloaded.
- [Arc Pay settlement schedule](https://finext.gitbook.io/arc-pay/ru/operacionka/settlement.md) - default T+1 merchant-local settlement, merchant `pending/available/reserved`, refunds/fees/reserves in net payout.
- [Arc Pay reconciliation](https://finext.gitbook.io/arc-pay/ru/operacionka/reconciliation.md) - daily reconciliation checks Arc Pay captured records against bank settlement files, any discrepancy alerts ops and can pause payout until resolved.
- [Arc Pay payment.settled](https://finext.gitbook.io/arc-pay/webhooks/catalog/payment-settled.md) - `payment.settled` is for reconciliation/back-office state, not buyer fulfillment.

### Findings

- Repository evidence: ADR 0004 requires payment status changes, reconciliation, refunds and ledger correctness outside controllers.
- Repository evidence: `reconciliation_records` schema already exists with provider/environment identifiers, `matched/exception/ignored` statuses and unresolved `resolved_at` semantics.
- Repository evidence: hold release now blocks on `reconciliation_records.status = matched` when `orders.finance_policy_provider_settlement_required = true` and blocks unresolved exceptions.
- Sourced fact: Arc Pay `payment.captured` fulfills the order, while `payment.settled` is back-office settlement evidence.
- Sourced fact: Arc Pay reconciliation can find `amount_mismatch`, `missing_on_bank` and `missing_on_arcpay`; any non-zero discrepancy needs ops review.
- Inference: The first production-safe slice should persist matched/exception evidence idempotently and expose admin resolution. Full report-job polling/download can then reuse the same store without changing hold-release logic.

### Recommendation

Use `payment-worker` to persist Arc Pay settlement and reconciliation exception events into `reconciliation_records`. Keep `payment.settled` as `matched` evidence and `reconciliation.exception` as an open `exception`. Admin-api owns read/resolve/waive operations with audit; hold release continues reading the same records.

### Rejected Alternatives

- Treat `payment.settled` as client fulfillment: rejected because Arc Pay docs position it as back-office evidence; `payment.captured` remains fulfillment.
- Release funds purely from T+1 time math: rejected because reconciliation exceptions can pause payout.
- Build report-job ingestion before webhook evidence: rejected for this slice because webhook evidence closes the immediate release gate with less provider surface area; reports remain a later batch reconciliation extension.

### User Decisions

None required; this implements already accepted finance policy and reconciliation boundaries.

## Context and Orientation

Relevant current files:

- `packages/domain/src/reconciliation/*` - new port/use-cases.
- `packages/db/src/schema/finance/reconciliation.schema.ts` - existing table.
- `packages/db/src/adapters/finance/drizzle-ledger-store.ts` - hold-release query reads reconciliation state.
- `apps/payment-worker/src/webhooks/payment-webhook.processor.ts` - Arc Pay webhook routing.
- `apps/admin-api/src/modules/finance-policies/*` - current admin finance composition, auth, CSRF and audit pattern.

## Plan of Work

1. Domain reconciliation TDD: matched settlement, provider exception and unknown attempt rejection.
2. DB adapter TDD: create/dedupe matched and exception records, list open exceptions, resolve/waive with payload evidence.
3. Worker TDD: `payment.settled` creates matched reconciliation, `reconciliation.exception` creates exception, duplicate webhook stays idempotent.
4. Admin API TDD: authenticated list, CSRF-protected resolve/waive, durable audit.
5. Verification: targeted domain/db/worker/admin tests, affected package typecheck/build where not blocked by unrelated dirty work.

## Idempotence and Recovery

- Provider event dedupe remains by `Webhook-Id`.
- Reconciliation record dedupe uses provider/environment/payment/status/evidence semantics in the store.
- Failed admin resolution does not mutate ledger and remains retryable.
- Full Arc Pay reports polling is intentionally deferred to avoid guessing CSV/XLSX download shape before provider sandbox evidence.

## Outcomes & Retrospective

- `payment.settled` is persisted as provider event evidence and creates a `matched` reconciliation record.
- `reconciliation.exception` is accepted by the Arc Pay parser, persisted as provider event evidence and creates an unresolved exception record.
- Admin-api exposes `GET /admin/finance/reconciliation/exceptions` and CSRF-protected `PUT /admin/finance/reconciliation/exceptions/:id` for `resolved`/`waived`.
- Hold release already consumes the same reconciliation records and remains blocked by open exceptions.

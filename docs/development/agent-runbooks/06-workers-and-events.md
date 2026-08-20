# Runbook: Workers And Events

Используй этот ранбук для payments, notifications, chart calculations,
analytics ingestion, reminders, outbox relay and any asynchronous side effect.

## Цель

Side effects должны быть reliable, retryable, idempotent and outside request
controller scripts.

## Contours

- `payment-worker`: payment webhooks, reconciliation, refunds, payout jobs.
- `notification-worker`: email, SMS, Telegram, push, reminders, retries,
  delivery logs.
- `chart-worker`: heavy chart calculations.
- `workers`: scheduled jobs, analytics ingestion, cleanup tasks.
- `packages/db/src/adapters/outbox`: transactional outbox relay support.

## Core Rule

Request/API transaction writes business state and domain/outbox event together.
Workers process delivery/calculation/payment side effects asynchronously.

Do not send critical notifications, mutate ledgers, process refunds or perform
heavy chart calculations directly in request controllers.

## Пошаговая процедура

1. Identify the side effect:
   - notification;
   - payment/refund/payout;
   - chart calculation;
   - analytics event;
   - reminder/scheduled task.

2. Identify the owning domain event/use case.
3. Confirm event schema or add one in shared contracts/domain event layer.
4. Ensure business transaction writes outbox event with the state change.
5. Add worker-side processor/job handler.
6. Make handler idempotent:
   - deterministic job keys where appropriate;
   - processed-state checks;
   - provider idempotency keys for payment/provider APIs;
   - no duplicate ledger/notification records on retry.

7. Add retry/failure behavior:
   - log enough context;
   - do not leak secrets;
   - keep permanent failures inspectable.

## Payment Rules

- Payment status changes happen through payment use cases.
- Webhook handling is idempotent.
- Ledger entries must not duplicate on repeated events.
- Refunds and payouts are audited and provider-backed.
- Booking/order state changes after payment success are explicit.

## Notification Rules

- Notification templates/preferences/delivery logs are backend-owned.
- External providers are adapters.
- Use `notification-worker` for real delivery.
- Auth-code delivery can use dev console mode locally. Real email delivery uses
  configured SMTP credentials; SMS delivery remains an explicit provider
  adapter gap until an SMS provider is selected.

## Chart Rules

- Heavy calculations belong to `chart-worker` or future chart contour, not UI.
- Design calculation helpers in `ElevenHouseDesign/` are not production
  calculation services.
- Add fixtures and authoritative rules before exposing chart/numerology/matrix
  results as product behavior.

## Verification

Use targeted tests per layer:

```bash
pnpm test packages/domain/src/domain-events
pnpm test packages/db/src/adapters/outbox
pnpm test apps/notification-worker/src
pnpm test apps/payment-worker/src
pnpm test apps/chart-worker/src
pnpm --filter @elevenhouse/notification-worker typecheck
pnpm --filter @elevenhouse/payment-worker typecheck
pnpm --filter @elevenhouse/chart-worker typecheck
```

Adjust exact paths to changed files.

## Stop Conditions

- Side effect is implemented inside request controller.
- Retry can duplicate payment, ledger, booking or critical notification records.
- Worker needs provider credentials that are not modeled in runtime config.
- Chart calculation lacks authoritative rules/fixtures.

## Done Checklist

- Side effect has domain/event owner.
- Outbox/job path is explicit.
- Handler is idempotent.
- Failure/retry behavior is inspectable.
- Tests cover duplicate/retry behavior for critical workflows.

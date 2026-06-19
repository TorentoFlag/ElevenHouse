# ADR 0004: Платежи и уведомления как отдельные контуры

## Status

Accepted

## Decision

Payments и notifications должны быть изолированы как отдельные контуры с первого дня.

Они могут жить в одном monorepo и использовать shared packages, но там, где уместно, должны запускаться через dedicated workers/processes:

- `payment-worker`
- `notification-worker`

## Rationale

Payments требуют idempotent webhooks, reconciliation, refunds, ledger correctness и auditability. Их нельзя реализовывать как простые controller-side status changes.

Notifications естественно асинхронны и не должны блокировать core user workflows. Им нужны retries, delivery logs, templates, preferences и provider adapters.

## Consequences

- Payment status changes происходят через payment use cases и idempotent webhook handling.
- Booking/order state changes, вызванные successful payment, явные и auditable.
- Notifications запускаются через transactional outbox: request/API транзакция пишет доменное
  событие в PostgreSQL вместе с бизнес-изменением, а worker-side relay публикует это событие в
  BullMQ/Redis job.
- Реальная доставка email/SMS/Telegram/push происходит в `notification-worker`, а не в
  request controllers и не в `public-api` request path.
- Duplicate jobs не должны создавать duplicate financial records или duplicate critical notifications.

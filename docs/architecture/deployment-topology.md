# Deployment Topology

## Начальная форма

```text
CDN
  -> client-web assets
  -> astrologer-web assets
  -> admin-web assets

client-web -> public-api -> PostgreSQL / Redis / Queue
astrologer-web -> astrologer-api -> PostgreSQL / Redis / Queue
admin-web -> admin-api -> PostgreSQL / Redis / Queue   (scaffolded; internal modules pending)

Queue -> payment-worker
Queue -> notification-worker
Queue -> chart-worker -> chart-engine
Queue -> workers
```

## Приоритеты масштабирования

Клиентский трафик ожидается существенно выше, чем трафик астрологов/админов. Независимо масштабируемыми должны быть:

- `client-web`
- `public-api`
- доставка публичных media
- checkout/booking endpoints

Трафик астрологов и админов должен масштабироваться отдельно через
`astrologer-api` и `admin-api`. Внутренние admin/moderator workflows нельзя
добавлять в `astrologer-api`; они должны жить в `admin-api` с отдельными
auth/permissions и audit boundaries.

## Ответственности workers

- `payment-worker`: payment webhooks, reconciliation, refunds, payout jobs.
- `notification-worker`: delivery, reminders, retries, provider failover.
- `chart-worker`: BullMQ delivery, leases, retries, persistence of chart
  calculation results and internal calls to `chart-engine`.
- `chart-engine`: private Python/FastAPI runtime for Kerykeion-backed
  calculation. It is not routed by Caddy and is reachable only on the private
  deployment network. It exposes `/live` for process liveness and `/ready` for
  readiness; production healthchecks gate on `/ready`.
- `workers`: scheduled jobs, analytics ingestion, cleanup tasks.

Workers должны быть idempotent. Повтор job не должен создавать дубли payments, notifications, bookings или ledger entries.

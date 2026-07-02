# Deployment Topology

## Начальная форма

```text
CDN
  -> client-web assets
  -> astrologer-web assets
  -> admin-web assets

client-web -> public-api -> PostgreSQL / Redis / Queue
astrologer-web -> astrologer-api -> PostgreSQL / Redis / Queue
admin-web -> admin-api -> PostgreSQL / Redis / Queue   (planned; app not created yet)

Queue -> payment-worker
Queue -> notification-worker
Queue -> chart-worker
Queue -> workers
```

## Приоритеты масштабирования

Клиентский трафик ожидается существенно выше, чем трафик астрологов/админов. Независимо масштабируемыми должны быть:

- `client-web`
- `public-api`
- доставка публичных media
- checkout/booking endpoints

Трафик астрологов и админов должен масштабироваться отдельно через `astrologer-api`
и будущий `admin-api`. До появления `admin-api` нельзя добавлять внутренние
admin/moderator workflows в `astrologer-api`.

## Ответственности workers

- `payment-worker`: payment webhooks, reconciliation, refunds, payout jobs.
- `notification-worker`: delivery, reminders, retries, provider failover.
- `chart-worker`: тяжёлые chart calculations.
- `workers`: scheduled jobs, analytics ingestion, cleanup tasks.

Workers должны быть idempotent. Повтор job не должен создавать дубли payments, notifications, bookings или ledger entries.

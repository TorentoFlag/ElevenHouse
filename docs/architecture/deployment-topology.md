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

## Production Docker artifact retention

Production deploy stores one rollback image set on the VPS and removes older
unused Docker artifacts only after the deploy has passed Compose health waiting
and external smoke checks. Before switching `IMAGE_TAG`, the workflow captures
image IDs from the currently running `elevenhouse` Compose project. After a
successful deploy, `deployment/server/cleanup-docker-retention.sh` removes
stopped containers, unused images not referenced by current containers or that
single rollback set, build cache and unused networks.

The cleanup step intentionally does not prune Docker volumes. PostgreSQL, Redis
and MinIO data live in Docker volumes, so volume deletion is a separate
destructive operation and is never part of routine deploy cleanup.

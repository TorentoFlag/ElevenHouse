# ADR 0001: Monorepo и границы приложений

## Status

Accepted

## Decision

Использовать monorepo с отдельными frontend apps, отдельными backend processes и shared packages.

Frontend apps:

- `landing`
- `client-web`
- `astrologer-web`
- `admin-web`

Backend apps/processes:

- `public-api`
- `astrologer-api`
- `admin-api` as the internal API surface; currently scaffolded with only a technical health module
- `workers`
- `payment-worker`
- `notification-worker`
- `chart-worker`

## Rationale

У продукта разные профили трафика и разные пользовательские поверхности. Клиентский трафик ожидается значительно выше, чем трафик астрологов/админов, поэтому client surface и public API должны масштабироваться независимо.
Публичная acquisition-поверхность для астрологов отделена в `landing`, чтобы
её SEO/performance, статический контент и marketing lifecycle не смешивались с
client direct-link flows или authenticated astrologer CRM.

При этом домен глубоко связан: booking, orders, payments, wallet, notifications и admin support участвуют в одном business workflow. Если слишком рано разнести всё по независимым microservices, это добавит лишнюю distributed-system complexity.

## Consequences

- Ясные app boundaries с первого дня.
- Shared domain logic через packages.
- Более простое future extraction для high-load contours.
- Нужна дисциплина, чтобы shared packages не превратились в dumping ground.
- Internal admin/moderator workflows wait for `admin-api` instead of being placed into `astrologer-api`.

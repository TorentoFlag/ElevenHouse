# Структура репозитория

Фактическая структура production-кода:

```text
ElevenHouse/
  apps/
    landing/
    client-web/
    astrologer-web/
    admin-web/
    public-api/
    astrologer-api/
    admin-api/
    workers/
    payment-worker/
    notification-worker/
    chart-worker/
    chart-engine/

  packages/
    ai/
    auth/
    birth-place-search/
    chart-engine-client/
    config/
    contracts/
    db/
    design-system/
    domain/
    finance-infrastructure/
    i18n/
    numerology-presentation/
    observability/
    testing/
    validation/

  docs/
    api/
    architecture/
    decisions/
    development/
    product/
```

`apps/admin-api` является отдельной backend-поверхностью для
moderator/admin/super_admin workflows. В текущем коде реализован технический
`health` module и первый internal finance-policy/risk/payout contour с
admin-session auth guard, CSRF, database composition, idempotent finance
commands and durable audit writes. Остальные moderator/admin/super_admin
workflows добавляются только здесь, а не в `public-api` или `astrologer-api`.

## Apps

`apps/` содержит deployable applications и процессы.

- Frontend apps — React + Vite.
- `apps/landing` — публичная acquisition-поверхность ElevenHouse для
  астрологов. Она ведёт в регистрацию `astrologer-web`, не обслуживает
  клиентские direct-link booking flows и не является каталогом/discovery.
- Backend apps — Nest.js. Внутри Nest apps feature modules должны жить в `src/modules/<module-name>/`; root `app.module.ts` импортирует module classes, а не напрямую собирает controllers/providers всех features.
- Worker apps запускают queue processors и scheduled jobs.
- `apps/chart-engine` — private Python/FastAPI calculation runtime for
  provider-backed chart calculations; it is called by workers on the internal
  network and does not own business workflows.

## Packages

`packages/` содержит общий код.

- `ai`: provider-neutral AI generation ports, prompt definitions and prompt registry.
- `auth`: roles, permissions, session helpers and auth crypto helpers.
- `birth-place-search`: provider-neutral birth-place search ports plus the
  Geoapify and Redis cache/single-flight/rate-limit infrastructure reused by
  authenticated API composition roots.
- `chart-engine-client`: typed client for the private chart-engine runtime.
- `config`: typed environment configuration helpers.
- `contracts`: API DTOs, event schemas, generated clients или shared contracts.
- `db`: schema, migrations, repositories, transaction helpers.
- `design-system`: собственная UI-система ElevenHouse, tokens, primitives, components.
- `domain`: business use cases и domain services.
- `finance-infrastructure`: private finance-only adapters for sealed provider
  artifacts and object storage. It implements domain ports; provider credentials
  never enter browser bundles or the general shared-contract package.
- `i18n`: translation infrastructure и shared message keys.
- `numerology-presentation`: deterministic presentation helpers for numerology
  result rendering.
- `observability`: logging, metrics, tracing helpers.
- `session-infrastructure`: provider adapters for media-room credentials,
  room termination and verified provider webhooks; no browser secrets.
- `session-web-client`: lazy-loaded web media/chat experience and typed Session
  HTTP client shared by the astrologer and client web apps.
- `testing`: factories, mocks, test utilities.
- `validation`: shared validation schemas.

## Направление зависимостей

Разрешено:

```text
apps/* -> packages/*
packages/db -> packages/domain
packages/domain -> packages/contracts, packages/validation, packages/auth
packages/design-system -> packages/i18n, если нужно
```

Запрещено:

```text
packages/* -> apps/*
packages/domain -> packages/db
public-api -> astrologer-api
astrologer-api -> public-api
frontend app -> backend internals
```

Domain package объявляет use cases, domain services и ports. `packages/db` реализует эти
ports через Drizzle adapters и владеет schema/migrations/runtime. Приложения связывают
domain use cases с DB adapters на своих composition roots.

Используй contracts, events и domain use cases вместо cross-app imports.

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

  packages/
    ai/
    auth/
    config/
    contracts/
    db/
    design-system/
    domain/
    i18n/
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
moderator/admin/super_admin workflows. В текущем коде создана минимальная
заготовка приложения с техническим `health` module; доменные admin workflows,
auth/permissions и audit-contour ещё не реализованы.

## Apps

`apps/` содержит deployable applications и процессы.

- Frontend apps — React + Vite.
- `apps/landing` — публичная acquisition-поверхность ElevenHouse для
  астрологов. Она ведёт в регистрацию `astrologer-web`, не обслуживает
  клиентские direct-link booking flows и не является каталогом/discovery.
- Backend apps — Nest.js. Внутри Nest apps feature modules должны жить в `src/modules/<module-name>/`; root `app.module.ts` импортирует module classes, а не напрямую собирает controllers/providers всех features.
- Worker apps запускают queue processors и scheduled jobs.

## Packages

`packages/` содержит общий код.

- `ai`: provider-neutral AI generation ports, prompt definitions and prompt registry.
- `auth`: roles, permissions, session helpers and auth crypto helpers.
- `config`: typed environment configuration helpers.
- `contracts`: API DTOs, event schemas, generated clients или shared contracts.
- `db`: schema, migrations, repositories, transaction helpers.
- `design-system`: собственная UI-система ElevenHouse, tokens, primitives, components.
- `domain`: business use cases и domain services.
- `i18n`: translation infrastructure и shared message keys.
- `observability`: logging, metrics, tracing helpers.
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

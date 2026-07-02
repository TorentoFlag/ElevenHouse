# Структура репозитория

Ожидаемая структура корня:

```text
ElevenHouse/
  apps/
    client-web/
    astrologer-web/
    admin-web/
    public-api/
    astrologer-api/
    admin-api/
    ops-api/
    workers/
    payment-worker/
    notification-worker/
    chart-worker/

  packages/
    design-system/
    domain/
    db/
    contracts/
    validation/
    auth/
    config/
    i18n/
    observability/
    testing/

  docs/
    architecture/
    product/
    decisions/
    api/

  infra/
    docker/
    nginx/
    terraform/
    k8s/

  scripts/
    dev/
    ci/
    db/

  tools/
    generators/
    eslint-config/
    tsconfig/
```

## Apps

`apps/` содержит deployable applications и процессы.

- Frontend apps — React + Vite.
- Backend apps — Nest.js. Внутри Nest apps feature modules должны жить в `src/modules/<module-name>/`; root `app.module.ts` импортирует module classes, а не напрямую собирает controllers/providers всех features.
- Worker apps запускают queue processors и scheduled jobs.

## Packages

`packages/` содержит общий код.

- `design-system`: собственная UI-система ElevenHouse, tokens, primitives, components.
- `domain`: business use cases и domain services.
- `db`: schema, migrations, repositories, transaction helpers.
- `contracts`: API DTOs, event schemas, generated clients или shared contracts.
- `validation`: shared validation schemas.
- `auth`: roles, permissions, session helpers.
- `config`: typed environment configuration.
- `i18n`: translation infrastructure и shared message keys.
- `observability`: logging, metrics, tracing helpers.
- `testing`: factories, mocks, test utilities.

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
public-api -> ops-api
ops-api -> public-api
frontend app -> backend internals
```

Domain package объявляет use cases, domain services и ports. `packages/db` реализует эти
ports через Drizzle adapters и владеет schema/migrations/runtime. Приложения связывают
domain use cases с DB adapters на своих composition roots.

Используй contracts, events и domain use cases вместо cross-app imports.

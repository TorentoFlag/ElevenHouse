# Local Development Setup

Этот документ описывает только технический запуск foundation-слоя.

## Prerequisites

- Node.js `>=24`
- pnpm `>=10`
- Docker Desktop или совместимый Docker runtime

## Install

```bash
pnpm install
```

Для локальных значений окружения можно использовать `.env.example` как источник дефолтов. Если нужен отдельный локальный файл, создай `.env` в корне репозитория.

## Local Infrastructure

```bash
docker compose up -d postgres redis
```

Сервисы:

- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

Переменные окружения для локального запуска описаны в `.env.example`.

## Database Tooling

Database schema и migrations живут в `packages/db` и управляются через Drizzle.

При изменении DB schema не создаём цепочки incremental `ALTER`-миграций. Всегда пересобираем актуальную миграцию заново и делаем полный reset локальной базы.

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

Для полной пересборки локальной development базы:

```bash
pnpm db:reset
```

`db:reset` сбрасывает только local development PostgreSQL schema и отказывается работать с `NODE_ENV=production` или non-local database hosts.

## Verification

```bash
pnpm verify
```

Команда выполняет:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

## Development Servers

```bash
pnpm --filter @elevenhouse/client-web dev
pnpm --filter @elevenhouse/astrologer-web dev
pnpm --filter @elevenhouse/admin-web dev
pnpm --filter @elevenhouse/public-api dev
pnpm --filter @elevenhouse/ops-api dev
```

Порты по умолчанию:

- `client-web`: `5173`
- `astrologer-web`: `5174`
- `admin-web`: `5175`
- `public-api`: `3001`
- `ops-api`: `3002`

## Foundation Scope

Этот слой не содержит бизнес-фич. Его задача:

- держать monorepo границы;
- запускать apps independently;
- проверять shared packages;
- предоставить локальную PostgreSQL/Redis инфраструктуру;
- дать одну команду технической проверки.

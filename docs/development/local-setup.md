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
docker compose up -d postgres redis minio minio-init
```

Сервисы:

- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- MinIO S3 API: `localhost:9000`
- MinIO console: `http://localhost:9001`
- Local media bucket: `elevenhouse-local-media`

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
pnpm --filter @elevenhouse/astrologer-api dev
pnpm --filter @elevenhouse/admin-api dev
pnpm --filter @elevenhouse/workers dev
pnpm --filter @elevenhouse/payment-worker dev
pnpm --filter @elevenhouse/notification-worker dev
pnpm --filter @elevenhouse/chart-worker dev
```

Порты по умолчанию:

- `client-web`: `5173`
- `astrologer-web`: `5174`
- `admin-web`: `5175`
- `public-api`: `3001`
- `astrologer-api`: `3002`
- `admin-api`: `3003`
- `notification-worker` readiness: `3013`

`admin-api` сейчас является health-only заготовкой. Запускай его только когда
явно нужна проверка внутренней API-поверхности; доменные admin routes ещё не
реализованы.

For local passwordless auth development, set
`NOTIFICATION_WORKER_AUTH_CODE_DELIVERY_MODE=dev_console`. In this mode the
notification worker decrypts the auth code, writes it to the worker log, marks
the delivery as sent, and does not require real email/SMS provider credentials.
Use `http` mode only when real delivery endpoints and bearer tokens are
configured.

## Current Foundation Scope

Фундаментальный слой уже содержит первые production-срезы identity, dictionary,
products, notification outbox delivery и AI draft generation. Его базовые задачи:

- держать monorepo границы;
- запускать apps independently;
- проверять shared packages;
- предоставить локальную PostgreSQL/Redis инфраструктуру;
- дать одну команду технической проверки.

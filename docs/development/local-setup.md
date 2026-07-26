# Local Development Setup

Этот документ описывает только технический запуск foundation-слоя. Каноническая
матрица команд и предусловий находится в `commands.md`, стратегия тестирования
и уровни evidence — в `testing-strategy.md`.

## Prerequisites

- Node.js `>=24`
- pnpm `>=10`
- Docker Desktop или совместимый Docker runtime

## Install

Установи зависимости командой `pnpm install`.

Для локальных значений окружения можно использовать `.env.example` как источник дефолтов. Если нужен отдельный локальный файл, создай `.env` в корне репозитория.

## Local Infrastructure

Команда запуска инфраструктуры приведена в `commands.md`. Управлять локальными
процессами можно только по прямой команде пользователя.

Сервисы:

- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- MinIO S3 API: `localhost:9000`
- MinIO console: `http://localhost:9001`
- Local media bucket: `elevenhouse-local-media`
- Local private bucket: `elevenhouse-local-private`

`minio-init` — one-shot setup service: создаёт оба bucket, разрешает anonymous
download только для `elevenhouse-local-media` и сохраняет private policy для
`elevenhouse-local-private`.

Переменные окружения для локального запуска описаны в `.env.example`.

## Database Tooling

Database schema и migrations живут в `packages/db` и управляются через Drizzle.

При изменении DB schema не создаём цепочки incremental `ALTER`-миграций. Всегда пересобираем актуальную миграцию заново и делаем полный reset локальной базы.

Команды generate/migrate/seed/reset, проверка фактического Docker-порта и
требования к `DATABASE_URL` описаны в `commands.md`.

`db:reset` сбрасывает только local development PostgreSQL schema и отказывается работать с `NODE_ENV=production` или non-local database hosts.

## Verification

Используй TDD и evidence ladder из `testing-strategy.md`. Полная repository
verification и targeted examples зафиксированы в `commands.md`.

## Development Servers

Команды приложений доступны через их `dev` scripts; точные примеры и правило
явного разрешения на управление процессами находятся в `commands.md`.

Порты по умолчанию:

- `client-web`: `5173`
- `astrologer-web`: `5174`
- `admin-web`: `5175`
- `public-api`: `3001`
- `astrologer-api`: `3002`
- `admin-api`: `3003`
- `notification-worker` readiness: `3013`

`admin-api` сейчас содержит `health` и первый finance-policy/risk/payout
contour. Запускай его только когда явно нужна проверка внутренней
API-поверхности; broader user, verification, moderation, payment-support and
platform-settings routes ещё не реализованы.

For local passwordless auth development, set
`NOTIFICATION_WORKER_AUTH_CODE_DELIVERY_MODE=dev_console`. In this mode the
notification worker decrypts the auth code, writes it to the worker log, marks
the delivery as sent, and does not require real email/SMS provider credentials.
Use `http` mode only when real delivery endpoints and bearer tokens are
configured.

## Current Foundation Scope

Фундаментальный слой уже содержит первые production-срезы identity, dictionary,
products, client cabinet foundation, direct-link booking/order/payment commands,
calendar/manual booking, calculation methods, messaging, finance/admin policy,
notification outbox delivery и AI draft generation. Его базовые задачи:

- держать monorepo границы;
- запускать apps independently;
- проверять shared packages;
- предоставить локальную PostgreSQL/Redis инфраструктуру;
- дать одну команду технической проверки.

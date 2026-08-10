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

`AGENTS.md` даёт standing local-development authority для этого checkout:
управление local Docker/services и local test data допустимо без повторного
запроса. `docker-compose.yml` описывает ожидаемую local infrastructure; до
lifecycle-команды и destructive DB action сначала проверь текущий
процесс/порт и exact target read-only по `commands.md`.

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

При изменении DB schema добавляем следующую focused forward migration. Уже
committed SQL, journal и snapshot artifacts не переписываются, не
переименовываются и не меняют порядок; чистая локальная БД строится применением
всей текущей lineage, а не регенерацией единого baseline.

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
- `landing`: `5176`
- `public-api`: `3001`
- `astrologer-api`: `3002`
- `admin-api`: `3003`
- `workers` readiness: `3010`
- `payment-worker` readiness: `3011`
- `chart-worker` readiness: `3012`
- `notification-worker` readiness: `3013`

`payment-worker` webhook listener по умолчанию также использует `3013`
(`PAYMENT_WORKER_WEBHOOK_PORT`). Поэтому `payment-worker` и
`notification-worker` нельзя запускать одновременно с default configuration:
до запуска задай свободный override для одного из них и проверь, что выбранный
порт не занят.

`admin-api` сейчас содержит `health` и internal finance contour: policy/risk,
versioned fiscal profiles and tariffs, payout evidence, saved-card disclosures,
refund-candidate review и finance authorizations. Запускай его только когда
явно нужна проверка этой внутренней API-поверхности; broader user,
verification, moderation, payment-support and platform-settings routes ещё не
реализованы.

### Admin Finance Browser Fixture

Для network-backed проверки `admin-web` finance без frontend mocks можно
засидить локальную БД реальным admin session и finance-сценарием:

```bash
set -a
source .env
set +a
pnpm --filter @elevenhouse/db exec tsx scripts/seed-dev-admin-finance.ts
```

Скрипт отказывается работать с production или non-local `DATABASE_URL`. Он
создаёт deterministic local rows для admin user/session, CSRF token,
astrologer/client, manual payout method, открытую заявку на вывод, заявку в
`processing_manual`, заявку, отменённую из-за chargeback, balanced ledger
transactions, wallet read model и reconciliation exception. Для
предсказуемого сценария активная `manual_review` finance policy переключается
на fixture policy с `48` часами hold, а каждый fixture order ссылается на
опубликованную immutable tariff version со snapshot-комиссией `800` bps.

После выполнения скрипт печатает `Session cookie`, `CSRF cookie`, `CSRF header`
и browser helper. Открой `admin-web` на `http://localhost:5175`, выполни helper
в консоли браузера и перезагрузи страницу. Дальше `/finance/payouts`,
`/finance/reconciliation` и связанные admin finance API читают реальные строки
из локальной БД через `admin-api`. Для `127.0.0.1` нужно добавить этот origin в
`ADMIN_API_ALLOWED_ORIGINS`; default local CSRF origin — `http://localhost:5175`.

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

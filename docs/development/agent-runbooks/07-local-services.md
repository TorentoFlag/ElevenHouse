# Runbook: Local Services

Используй этот ранбук, когда пользователь просит проверить, запустить,
остановить или использовать локальные сервисы.

## Цель

Работать с локальными процессами безопасно: не перезапускать чужие процессы,
не занимать неожиданные порты и не запускать long-running services без явной
команды пользователя.

## Strict Process Rule

Никогда не запускай, не останавливай, не перезапускай и не убивай локальные
dev-процессы без прямой явной команды пользователя.

Если для проверки нужен сервис:

1. Сначала сделай read-only диагностику.
2. Если сервис уже запущен, используй его.
3. Если сервис не запущен, сообщи пользователю и остановись.
4. Запускай сервис только после явной команды.

## Standard Ports

- `client-web`: `5173`
- `astrologer-web`: `5174`
- `admin-web`: `5175`
- `public-api`: `3001`
- `astrologer-api`: `3002`
- `admin-api`: `3003`
- `notification-worker`: readiness on `3013`
- PostgreSQL: `5432`
- Redis: `6379`

## Read-Only Diagnostics

```bash
lsof -nP -iTCP:5174 -sTCP:LISTEN
lsof -nP -iTCP:3002 -sTCP:LISTEN
lsof -nP -iTCP:3003 -sTCP:LISTEN
lsof -nP -iTCP:3013 -sTCP:LISTEN
ps aux | rg "admin-api|astrologer-api|astrologer-web|notification-worker|vite|node"
curl -fsS http://localhost:3002/health
curl -fsS http://localhost:3003/health
curl -fsS http://localhost:3013/ready
```

Use `/ready` for `notification-worker`; `/health` is not its readiness endpoint.

## Infrastructure

Docker Compose в этом repo определяет PostgreSQL, Redis, MinIO и one-shot
`minio-init`, который создаёт public/private local buckets и выставляет их
policy:

```bash
docker compose up -d postgres redis minio minio-init
```

Run this only when the user explicitly asked to start infrastructure or services.
Для существующей infrastructure используй read-only `docker compose ps` и
health/readiness checks; не перезапускай её ради проверки.

## Start Commands

Only after explicit user command:

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

`astrologer-api` and `chart-worker` use the shared compiled dev runner. Their
`dev` scripts first run a workspace-aware build for the app and dependencies
(`pnpm --filter @elevenhouse/<app>... build`), then start local TypeScript watch
and `node --watch dist/main.js`. This is intentional: local workspace package
exports resolve through `dist`, so chart runtime proof must not replace these
scripts with direct `tsx src/main.ts` execution.

For local passwordless auth development:

```bash
set -a
source .env
set +a
NOTIFICATION_WORKER_AUTH_CODE_DELIVERY_MODE=dev_console pnpm --filter @elevenhouse/notification-worker dev
```

## Stop/Restart

Only stop or restart a process after explicit user command. State which process
and port will be affected before acting.

Preferred identification:

```bash
lsof -nP -iTCP:<port> -sTCP:LISTEN
ps -p <pid> -o pid,ppid,command
```

## Done Checklist

- Read-only diagnostics happened before process changes.
- No existing process was killed without explicit permission.
- Standard ports were checked.
- Readiness endpoint is correct.
- User has the URL/port and actual readiness result.

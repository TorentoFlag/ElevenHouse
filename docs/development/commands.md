# Canonical Commands

Этот документ фиксирует проверенные команды репозитория и необходимые для них
предусловия. Он описывает способ запуска, но не расширяет полномочия агента:
правила управления процессами и разрушительных действий остаются в `AGENTS.md`.

| Purpose                           | Command                                                                                                                                                                                                                                                 | Preconditions / authority                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Full verification                 | `pnpm verify`                                                                                                                                                                                                                                           | No service startup; shared-layer completion gate                                                             |
| Generate current implementation state | `node scripts/agent-docs/generate-current-state.mjs`                                                                                                                                                                                                 | Regenerates committed current app/module/worker-port inventory; no services                                  |
| Generate API route inventory | `node scripts/agent-docs/generate-route-inventory.mjs`                                                                                                                                                                                               | Regenerates committed Nest-controller route inventory; no services                                           |
| Numerology domain tests           | `pnpm test packages/domain/src/numerology`                                                                                                                                                                                                              | No long-running process                                                                                      |
| Calculation integration tests     | `INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration packages/db/src/adapters/calculations/drizzle-calculation-pdf-job-store.integration.ts packages/db/src/adapters/calculations/drizzle-calculation-store.integration.ts`                  | Load root `.env` first; both URLs must point to existing local PostgreSQL                                    |
| Chart Engine Python tests         | `(cd apps/chart-engine && .venv/bin/python -m pytest -q)`                                                                                                                                                                                               | Existing project virtualenv; no service startup                                                              |
| Chart worker focused tests        | `pnpm exec vitest run apps/chart-worker/src/chart-queue-telemetry.test.ts apps/chart-worker/src/chart-jobs.processor.test.ts apps/chart-worker/src/chart-worker-runtime.test.ts apps/chart-worker/src/runtime-config.test.ts --config vitest.config.ts` | No service startup                                                                                           |
| Chart worker typecheck/build      | `pnpm --filter @elevenhouse/chart-worker typecheck && pnpm --filter @elevenhouse/chart-worker build`                                                                                                                                                    | No service startup                                                                                           |
| Domain typecheck                  | `pnpm --filter @elevenhouse/domain typecheck`                                                                                                                                                                                                           | No long-running process                                                                                      |
| Domain build                      | `pnpm --filter @elevenhouse/domain build`                                                                                                                                                                                                               | No long-running process                                                                                      |
| Generate migration                | `pnpm db:generate`                                                                                                                                                                                                                                      | Validate committed lineage and append the next focused migration                                              |
| Reset local DB                    | `pnpm db:reset`                                                                                                                                                                                                                                         | Explicitly required task; local DB only; destructive; `DATABASE_URL` must identify the active ElevenHouse DB |

## Runnable now

Команды, не требующие запущенных сервисов, можно выполнять непосредственно:

```bash
pnpm test packages/domain/src/numerology
pnpm --filter @elevenhouse/domain typecheck
pnpm --filter @elevenhouse/domain build
pnpm verify
```

Выбирай самый узкий тест, доказывающий изменение, затем расширяй проверку по
`testing-strategy.md`.

Для изменения `AGENTS.md`, canonical docs, runbook'ов или `.agents/skills`
проверяй diff:

```bash
git diff --check
```

### Chart Engine verification, runtime and logs

Focused verification does not start a service:

```bash
(cd apps/chart-engine && .venv/bin/python -m pytest -q)
pnpm exec vitest run \
  apps/chart-worker/src/chart-queue-telemetry.test.ts \
  apps/chart-worker/src/chart-jobs.processor.test.ts \
  apps/chart-worker/src/chart-worker-runtime.test.ts \
  apps/chart-worker/src/runtime-config.test.ts \
  --config vitest.config.ts
pnpm --filter @elevenhouse/chart-worker typecheck
pnpm --filter @elevenhouse/chart-worker build
pnpm --filter @elevenhouse/astrologer-api typecheck
```

When process-management authority is explicit and the required ports are free,
the local services use the checked-in runtimes and fixed ports:

```bash
(cd apps/chart-engine && PYTHONPATH=src .venv/bin/uvicorn chart_engine.main:app --host 127.0.0.1 --port 8012)
pnpm --filter @elevenhouse/chart-worker dev
```

Both runtimes write structured records to stdout. For an already-running
production Compose project, the read-only inspection command is:

```bash
docker compose -f deployment/compose/compose.production.yml logs --no-color chart-worker chart-engine \
  | rg 'chart calculation|chart_provider_'
```

Expected operational records include `chart_job_command_completed`,
`chart calculation job processed`, `chart calculation recovery completed`,
`chart calculation queue telemetry`, `chart_provider_operation` and
`chart_provider_readiness`. Do not broaden logging to birth input, place,
coordinates, questions, prompts, result payloads or raw exception diagnostics.
Production requires a positive explicit `CHART_WORKER_TELEMETRY_INTERVAL_MS`;
there is no production fallback to a default metric value or Moshier provider.

## Requires existing infrastructure

Интеграционные тесты используют уже запущенный локальный PostgreSQL. Они не
дают разрешения запускать Docker или управлять существующими процессами.

```bash
set -a
source .env
set +a
INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration packages/db/src/adapters/calculations/drizzle-calculation-store.integration.ts
```

Integration guard отклоняет non-local PostgreSQL targets. До запуска проверь,
что `DATABASE_URL` указывает именно на локальную базу ElevenHouse, а не на БД
соседнего проекта.

Для полного persistence-контура расчётов запускай оба адаптера:

```bash
INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration \
  packages/db/src/adapters/calculations/drizzle-calculation-pdf-job-store.integration.ts \
  packages/db/src/adapters/calculations/drizzle-calculation-store.integration.ts
```

Production `workers` требует явных `WORKERS_CALCULATION_PDF_*`, `REDIS_URL` и
private object-storage settings. Локальные defaults разрешены только вне
`NODE_ENV=production`. Readiness доступна на `/ready` и считается успешной
только при доступности PostgreSQL, calculation PDF queue/worker и private
object storage. Compose задаёт `stop_grace_period: 60s`; Redis queue transport
должен сохранять AOF и использовать `maxmemory-policy=noeviction`.

Ordinary production deploy запускает fail-closed `db-baseline-preflight` до
остановки writers и повторно после `db-migrator`, до `db-seeder` и запуска
services. Любая неизвестная migration history или drift критичных Flow
authority tables, включая shared outbox, останавливает deploy до backup либо
до service start соответственно.

Одноразовый pre-launch reset из ADR 0012 доступен только в ручном
`Deploy Production` workflow с `prelaunch_reset=true`. После writer quiesce,
zero-client-session fence и backup workflow запускает
`db:reset-production-prelaunch` с exact target `postgres:5432/elevenhouse` и
release-bound confirmation. Затем `db-migrator` применяет всю committed
migration lineage, а
`db-seeder` вставляет только reviewed system data. Push-driven deploy не может
включить reset; локальный `pnpm db:reset` никогда не используется против
production.

## Process management

Запуск, остановка, перезапуск и завершение frontend, API, workers, Docker,
PostgreSQL, Redis и других long-running процессов допустимы только по прямой
команде пользователя. Сначала выполняется read-only диагностика, например:

```bash
lsof -nP -iTCP:3002 -sTCP:LISTEN
curl -fsS http://localhost:3002/health
```

Если сервис не запущен, агент сообщает об этом и не подбирает другой порт.

`@elevenhouse/astrologer-api` and `@elevenhouse/chart-worker` run through the
compiled dev runner. Their `dev` scripts perform a workspace-aware build
(`pnpm --filter @elevenhouse/<app>... build`) before starting TypeScript watch
and `node --watch dist/main.js`, because local workspace exports resolve from
`dist`.

## Command patterns

### Targeted verification

Перед общей проверкой запускай тест изменённого слоя:

```bash
pnpm test packages/contracts/src/numerology.test.ts
```

### Package verification

Для изменений общего доменного пакета:

```bash
pnpm --filter @elevenhouse/domain typecheck
pnpm --filter @elevenhouse/domain build
```

### Database schema workflow

После изменения Drizzle schema добавь следующую focused forward migration:

```bash
pnpm db:generate
```

Не переписывай, не переименовывай и не меняй порядок уже committed SQL,
journal или snapshot artifacts. Проверь, что diff содержит только новый
module-owned migration и его meta artifacts. `pnpm db:reset` разрушителен и
выполняется только когда задача явно требует DB workflow и цель подтверждена как
локальная ElevenHouse DB; он применяет всю committed lineage к чистой БД.

Parallel compose override может отображать ElevenHouse PostgreSQL не на
`5432`. Перед разрушительной командой проверь реальный контейнер и порт:

```bash
docker compose ps postgres
docker port "$(docker compose ps -q postgres)" 5432/tcp
```

Если корневой `.env` не соответствует активному контейнеру, передай явный
локальный `DATABASE_URL`, например для порта `55433`:

```bash
DATABASE_URL="postgresql://elevenhouse:elevenhouse@localhost:55433/elevenhouse" pnpm db:reset
```

### Integration test

```bash
set -a
source .env
set +a
INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration packages/db/src/adapters/calculations/drizzle-calculation-store.integration.ts
```

Обе переменные должны указывать на существующий локальный PostgreSQL; guard
отклоняет non-local targets.

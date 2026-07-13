# Canonical Commands

Этот документ фиксирует проверенные команды репозитория и необходимые для них
предусловия. Он описывает способ запуска, но не расширяет полномочия агента:
правила управления процессами и разрушительных действий остаются в `AGENTS.md`.

| Purpose | Command | Preconditions / authority |
| --- | --- | --- |
| Full verification | `pnpm verify` | No service startup; shared-layer completion gate |
| Numerology domain tests | `pnpm test packages/domain/src/numerology` | No long-running process |
| Calculation integration test | `INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration packages/db/src/adapters/calculations/drizzle-calculation-store.integration.ts` | Load root `.env` first; both URLs must point to existing local PostgreSQL |
| Domain typecheck | `pnpm --filter @elevenhouse/domain typecheck` | No long-running process |
| Domain build | `pnpm --filter @elevenhouse/domain build` | No long-running process |
| Generate migration | `pnpm db:generate` | Rebuild current baseline after schema changes |
| Reset local DB | `pnpm db:reset` | Explicitly required task; local DB only; destructive; `DATABASE_URL` must identify the active ElevenHouse DB |

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

## Process management

Запуск, остановка, перезапуск и завершение frontend, API, workers, Docker,
PostgreSQL, Redis и других long-running процессов допустимы только по прямой
команде пользователя. Сначала выполняется read-only диагностика, например:

```bash
lsof -nP -iTCP:3002 -sTCP:LISTEN
curl -fsS http://localhost:3002/health
```

Если сервис не запущен, агент сообщает об этом и не подбирает другой порт.

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

После изменения Drizzle schema пересобери текущую baseline migration:

```bash
pnpm db:generate
```

Не создавай incremental `ALTER`-цепочку. `pnpm db:reset` разрушителен и
выполняется только когда задача явно требует DB workflow и цель подтверждена как
локальная ElevenHouse DB.

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


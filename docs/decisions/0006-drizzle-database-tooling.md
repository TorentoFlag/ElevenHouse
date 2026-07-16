# ADR 0006: Drizzle для database schema и migrations

## Status

Accepted

## Decision

Использовать Drizzle ORM и Drizzle Kit для PostgreSQL schema definitions, migrations и локального DB workflow.

Начальная интеграция живёт в `packages/db`:

- `src/schema/index.ts` — entrypoint для Drizzle schema.
- `src/schema/<domain-module>/` — таблицы, constraints, indexes и DB constants по доменным модулям.
- `src/runtime/` — создание `pg` pool и Drizzle database runtime.
- `src/connection/` — typed connection config и safety guards для local DB operations.
- `src/adapters/<domain-module>/` — Drizzle adapters для domain use-case ports.
- `drizzle.config.ts` — конфигурация migration tooling.
- `drizzle/` — generated migrations.
- `scripts/seed.ts` — seed command.
- `scripts/reset.ts` — local development reset command.

## Rationale

Drizzle хорошо подходит текущей modular-first архитектуре:

- schema остаётся TypeScript-кодом внутри shared package;
- domain и API apps могут быть отделены от ORM деталей через repositories/use cases;
- migrations являются явными артефактами в репозитории;
- tooling не требует отдельного generated runtime client.

## Consequences

- `packages/db` владеет schema, migrations и низкоуровневым database access.
- DB adapters должны явно реализовывать ports, объявленные в domain/use-case слое, а не дублировать их типы локально.
- Domain layer не должен напрямую размазывать SQL/ORM details по apps.
- `db:reset` предназначен только для локальной development базы и должен отказываться работать с production или non-local hosts.
- Изменения schema вносятся через пересборку актуальной миграции и полный reset локальной базы, а не через цепочку incremental `ALTER` migrations.
- Пересобранный baseline нельзя повторно применять поверх уже существующей
  production schema. Если baseline был пересобран после production deploy,
  deploy обязан сначала выполнить отдельный fail-closed reconciliation:
  распознать только явно одобренную migration history, проверить legacy schema
  и data invariants, выполнить data/DDL transition в одной транзакции и только
  после успешной проверки записать текущий baseline в Drizzle ledger.
- Production database никогда не сбрасывается ради синхронизации baseline.
  Неизвестная migration history или schema drift останавливают deploy.
- Бизнес-таблицы добавляются отдельными focused feature changes вместе с domain/use-case кодом.

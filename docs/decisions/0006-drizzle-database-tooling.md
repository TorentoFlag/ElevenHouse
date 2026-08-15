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
- `packages/db/src/schema/**` остаётся schema source of truth, а
  `packages/db/drizzle/` — append-only линейной Drizzle migration lineage.
  Committed SQL, journal и snapshot artifacts immutable: их нельзя
  переписывать, переименовывать, удалять или менять порядок.
- Изменение schema добавляет следующую focused module-owned forward migration;
  несколько migrations допустимы только для фактического dependency order.
  `db:reset` пересоздаёт только disposable local DB, применяя всю committed
  lineage и seed data, а не переписывает историю.
- Production database развивается только forward и никогда не сбрасывается
  ради синхронизации lineage. Preflight сверяет exact approved ordered lineage;
  unknown history или schema drift останавливают deploy. Для известного legacy
  state deploy выполняет отдельный fail-closed reconciliation с approved
  lineage, schema/data guards, transactional data/DDL transition и advisory
  lock.
- New compatibility or lineage shortcuts are forbidden by default. Do not add
  ad hoc `v1`/`v2`/`vN` labels, alternate cache namespaces, legacy columns,
  backfill scripts, fallback readers, silent converters, old-data migrations or
  backward-compatible data paths to make predecessor data keep working. A
  version label is allowed only when it is an accepted product/API/ADR contract
  with explicit persistence ownership, transition authority, reconciliation
  tests and deploy/rollback behavior. Otherwise the change must fail closed and
  require a new architecture decision before implementation.
- Бизнес-таблицы добавляются отдельными focused feature changes вместе с domain/use-case кодом.

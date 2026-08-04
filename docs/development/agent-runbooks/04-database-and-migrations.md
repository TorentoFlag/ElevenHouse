# Runbook: Database And Migrations

Используй этот ранбук для изменений в `packages/db`, Drizzle schema, migrations,
repositories/adapters and local DB workflow.

## Цель

Сохранять DB schema modular, reproducible and aligned with domain ports, without
incremental migration chains during active development.

## Ownership

- Schema: `packages/db/src/schema/<domain-module>/`
- Schema exports: `packages/db/src/schema/index.ts`
- Adapters: `packages/db/src/adapters/<domain-module>/`
- Migrations: `packages/db/drizzle/`
- Local reset tooling: `packages/db/scripts/`

## Critical Rule

При изменении DB schema не создавай цепочки incremental `ALTER`-миграций.
Всегда пересобирай актуальную миграцию заново и делай полный reset локальной
базы через `db:reset`.

Это правило относится к repository baseline и локальной development DB. Уже
развёрнутая production DB не сбрасывается и не получает новый baseline поверх
существующих таблиц. При смене baseline для известного production state нужен
явный reconciliation step с approved migration hashes, schema/data guards,
transactional DDL/data migration, advisory lock и записью нового baseline в
ledger только после успешного перехода. Неизвестное состояние должно завершать
deploy ошибкой.

Единственное текущее исключение — принятый ADR
`0012-prelaunch-production-baseline-reset.md`: initial Finance rollout может
один раз пересоздать объявленную disposable ElevenHouse production DB после
fresh-database rehearsal и точной проверки host/database/container. Это не
разрешение использовать `db:reset` с локальными defaults против production;
rollout обязан иметь отдельную fail-before-delete проверку target identity.

## Пошаговая процедура

1. Confirm domain ownership in `docs/architecture/backend-modules.md`.
2. Confirm Drizzle policy in `docs/decisions/0006-drizzle-database-tooling.md`.
3. Inspect existing schema style:

   ```bash
   find packages/db/src/schema/products -maxdepth 2 -type f | sort
   find packages/db/src/adapters/products -maxdepth 2 -type f | sort
   ```

4. Add focused schema files under `packages/db/src/schema/<module>/`.
5. Export schema from `packages/db/src/schema/<module>/index.ts`.
6. Export module schema from `packages/db/src/schema/index.ts`.
7. If the domain needs persistence, implement adapter ports under
   `packages/db/src/adapters/<module>/`.
8. Export adapters from `packages/db/src/adapters/index.ts`.
9. Regenerate the current migration:

   ```bash
   pnpm db:generate
   ```

10. Reset local development DB only when the user explicitly asked for DB
    workflow or when the task requires it:

    ```bash
    pnpm db:reset
    ```

    Do not run this against non-local or production DBs.

11. Если предыдущий baseline уже развёрнут в production и ADR 0012 не применим,
    добавь или обнови
    production reconciliation и его integration fixture. Проверь как минимум:
    approved legacy transition, сохранение данных, повторный no-op запуск и
    отказ на неизвестной migration history.

12. Для одноразового ADR 0012 rollout вместо legacy-data reconciliation докажи
    полный baseline на новой пустой БД, exact production target preflight,
    reset/restore rehearsal на disposable clone, reviewed seeds и post-reset
    deploy/E2E. До прохождения этих gates destructive production command не
    запускается.

## Schema Test Expectations

Add or update tests that prove:

- table exports exist;
- current baseline migration contains new table/index/constraint;
- important checks and FKs are in the migration;
- adapters implement domain behavior with integration tests where meaningful.

Example commands:

```bash
pnpm test packages/db/src/schema.test.ts
pnpm test packages/db/src/adapters/<module>/<adapter>.integration.ts
pnpm --filter @elevenhouse/db typecheck
pnpm --filter @elevenhouse/db build
```

## Adapter Rules

- Adapters implement ports from `packages/domain`.
- Do not duplicate domain types locally.
- Keep transaction boundaries explicit.
- Use DB constraints for uniqueness, references and invariant support.
- Translate expected DB conflicts to domain errors where the domain layer needs
  them.

## Stop Conditions

- Schema change lacks a domain owner.
- Migration was created as a new incremental chain when policy requires
  rebuilding current baseline.
- Adapter imports app code.
- Domain imports DB code.
- Reset would affect a non-local DB.

## Done Checklist

- Schema lives under the correct domain folder.
- Exports are wired.
- Migration regenerated according to project policy.
- Schema tests cover table/index/constraint presence.
- Adapter tests cover persistence behavior.
- Local reset was run only when appropriate and safe.

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

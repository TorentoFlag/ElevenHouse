# Runbook: Backend Feature Module

Используй этот ранбук для Nest backend work in `apps/public-api`,
`apps/astrologer-api` and `apps/admin-api`.

## Цель

Добавлять backend features через modular-first architecture: feature module,
thin controllers, domain use cases, explicit contracts and app-local
composition.

## Выбор API Surface

- `public-api`: guest/client direct-link flows, booking, orders, payments,
  client cabinet.
- `astrologer-api`: authenticated astrologer workspace workflows.
- `admin-api`: internal moderator/admin/super_admin workflows.

Never put admin/moderator/super_admin workflows into `public-api` or
`astrologer-api`.

## Required Structure

Every feature module should live under:

```text
apps/<api>/src/modules/<module-name>/
  <module-name>.module.ts
  <module-name>.controller.ts
  <module-name>.service.ts
  <module-name>.tokens.ts
  *.test.ts
  *.e2e.test.ts when route behavior matters
```

Root `app.module.ts` imports module classes only. It must not list feature
controllers/providers directly.

## Domain Placement

- Business use cases and domain services: `packages/domain`.
- Request/response schemas: `packages/contracts`.
- Drizzle schema, migrations, adapters: `packages/db`.
- App-specific guards, route metadata, runtime config wiring: owning app.

`packages/domain` must not import `packages/db`.

## Пошаговая процедура

1. Confirm API surface with `docs/api/api-boundaries.md`.
2. Confirm domain module ownership with `docs/architecture/backend-modules.md`.
3. Search existing patterns:

   ```bash
   find apps/astrologer-api/src/modules/products -maxdepth 2 -type f | sort
   find apps/public-api/src/modules/identity -maxdepth 3 -type f | sort
   ```

4. Add or update shared contracts first.
5. Add or update domain use cases and ports.
6. Add DB schema/adapters only if persistence is required.
7. Add Nest feature module with app-local composition.
8. Import the feature module in root `app.module.ts`.
9. Add tests at the lowest meaningful layer:
   - contract schema tests;
   - domain use-case tests;
   - adapter integration tests when DB behavior matters;
   - service/controller/e2e tests for app behavior.

## Controller Rules

- Controllers parse input, call services/use cases, return contract-shaped
  responses.
- Controllers do not own business workflows.
- Do not hide status transitions in controllers.
- Admin actions must call domain use cases and write audit logs.

## Error Handling

- Domain errors should be explicit types/classes in `packages/domain`.
- App services translate domain errors to HTTP exceptions.
- Do not leak provider internals or database errors to API responses.
- Auth failure responses should avoid account enumeration.

## Verification

Choose the narrowest commands that prove the changed layers:

```bash
pnpm test packages/contracts/src/<module>.test.ts
pnpm test packages/domain/src/<module>/index.test.ts
pnpm test apps/<api>/src/modules/<module>/<module>.service.test.ts
pnpm test apps/<api>/src/modules/<module>/<module>.e2e.test.ts
pnpm --filter @elevenhouse/<api> typecheck
pnpm --filter @elevenhouse/<api> build
```

Run broader `pnpm verify` when the change touches shared contracts, shared
domain, app root modules or multiple surfaces.

## Stop Conditions

- The feature belongs to `admin-api`, but the required auth/permissions,
  audit logging or domain use-case boundary is not defined yet.
- A module needs payments/booking/order idempotency, but no idempotency design is
  present.
- A workflow requires side effects that should be events/jobs, but the proposed
  implementation runs them inside request controllers.
- The change would require `packages/domain -> packages/db`.

## Done Checklist

- Correct API surface.
- Feature module structure exists.
- Root app imports module class only.
- Contracts/domain/db/app layers have correct dependency direction.
- Tests cover contracts and meaningful behavior.
- Docs updated if boundaries or architecture changed.

# Runbook: Frontend Production Work

Используй этот ранбук для изменений в `apps/client-web`, `apps/astrologer-web`,
`apps/admin-web` и `packages/design-system`.

## Цель

Делать production UI, который следует каноническому дизайну, сохраняет app
boundaries и не дублирует backend contracts вручную.

## Поверхности

- `apps/client-web`: direct-link public page, booking, checkout, client cabinet.
- `apps/astrologer-web`: CRM/workspace астролога.
- `apps/admin-web`: internal admin/moderator workspace.
- `packages/design-system`: reusable primitives, icons, navigation, motion,
  cross-surface workflow components.

## Пошаговая процедура

1. Определи owning surface через inventory.
2. Найди route/component entrypoints:

   ```bash
   rg -n "route|component|label" apps/<app>/src
   rg --files apps/<app>/src/pages apps/<app>/src/features apps/<app>/src/layouts
   ```

3. Проверь contracts/API usage:

   ```bash
   rg -n "@elevenhouse/contracts|HttpClient|useQuery|useMutation" apps/<app>/src
   ```

4. Если UI элемент reusable:
   - добавь его в `packages/design-system/src/components/<Component>/`;
   - добавь `types.ts`, `<Component>.tsx`, `<Component>.css`,
     `<Component>.test.tsx`, `index.ts`;
   - экспортируй из `packages/design-system/src/components/index.ts`;
   - проверь root export tests.

5. Если нужен новый icon:
   - добавь папку в `packages/design-system/src/icons/<Icon>/`;
   - добавь `Icon.tsx`, `Icon.test.tsx`, `index.ts`;
   - добавь export в `packages/design-system/src/icons/index.ts`;
   - если используется subpath import, проверь package exports and app aliases.

6. Для app-specific composition держи код в owning app. Не выноси page-specific
   business composition в design system.

7. Все user-facing API data обрабатывай через shared contracts или generated
   client. Не дублируй DTO вручную.

## UI Quality Rules

- First screen должен быть actual usable surface, не marketing placeholder,
  кроме настоящих acquisition/landing surfaces.
- Form-heavy SaaS/CRM screens должны быть плотными, спокойными и рабочими.
- Text must fit in containers across mobile/desktop.
- Do not nest cards inside cards.
- Do not use decorative orbs/bokeh backgrounds.
- Do not build one-note palettes when creating new surfaces.
- Buttons should use icons for familiar actions where possible.

## Responsive Rules

- Mobile design files define responsive behavior for the same web app unless
  inventory explicitly says otherwise.
- Use stable dimensions for boards, toolbars, grids, icon buttons and counters.
- Do not use `ios-frame.jsx` as production wrapper.

## Tests

Targeted examples:

```bash
pnpm test apps/astrologer-web/src/pages/products/ProductsPage.test.tsx
pnpm --filter @elevenhouse/astrologer-web typecheck
pnpm --filter @elevenhouse/astrologer-web build
pnpm test packages/design-system/src/index.test.ts
pnpm --filter @elevenhouse/design-system typecheck
pnpm --filter @elevenhouse/design-system build
```

Use the narrowest test set that proves the change, then broaden when touching
shared UI, contracts or app shell behavior.

## Stop Conditions

- UI needs backend state transitions that do not exist yet.
- Public client UI would expose astrologer discovery.
- Admin UI requires `admin-api`, but the task tries to use `astrologer-api`.
- New design-system component would encode unresolved business workflow.

## Done Checklist

- Owning app/package is correct.
- Design-system extraction is justified by reuse.
- Contracts are shared, not manually duplicated.
- Mobile/responsive state is covered.
- Visible surfaces were grepped before finishing.
- Targeted tests/typecheck/build were run or explicitly skipped with reason.

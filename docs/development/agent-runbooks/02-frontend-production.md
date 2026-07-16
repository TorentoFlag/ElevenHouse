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

1. Для любого visible change сначала выполни
   `01-design-to-production.md` и repo skill `elevenhouse-design-parity`.
2. Определи owning surface через inventory и product/domain truth.
3. Найди route/component entrypoints:

   ```bash
   rg -n "route|component|label" apps/<app>/src
   rg --files apps/<app>/src/pages apps/<app>/src/features apps/<app>/src/layouts
   ```

4. Проверь contracts/API usage и full state matrix:

   ```bash
   rg -n "@elevenhouse/contracts|HttpClient|useQuery|useMutation" apps/<app>/src
   ```

5. Спроектируй file map до правок:
   - page/layout только композирует feature sections;
   - один focused React component на файл по умолчанию;
   - derived state, option mappings, validation adapters и transitions живут в
     `features/<feature>/model`;
   - API/query code живёт в `features/<feature>/api`;
   - component-specific CSS/test лежит рядом с component согласно existing
     package pattern.

6. Если UI элемент reusable:
   - добавь его в `packages/design-system/src/components/<Component>/`;
   - добавь `types.ts`, `<Component>.tsx`, `<Component>.css`,
     `<Component>.test.tsx`, `index.ts`;
   - экспортируй из `packages/design-system/src/components/index.ts`;
   - проверь root export tests.

7. Если нужен новый icon:
   - добавь папку в `packages/design-system/src/icons/<Icon>/`;
   - добавь `Icon.tsx`, `Icon.test.tsx`, `index.ts`;
   - добавь export в `packages/design-system/src/icons/index.ts`;
   - если используется subpath import, проверь package exports and app aliases.

8. Для app-specific composition держи код в owning app. Не выноси page-specific
   business composition в design system.

9. Все user-facing API data обрабатывай через shared contracts или generated
   client. Не дублируй DTO вручную.

10. Реализуй loading, empty, success, validation, error, disabled и retry states
    из approved behavior. Не используй silent fallback, guessed shape,
    placeholder completion или local business state.

## UI Quality Rules

- First screen должен быть actual usable surface, не marketing placeholder,
  кроме настоящих acquisition/landing surfaces.
- Form-heavy SaaS/CRM screens должны быть плотными, спокойными и рабочими.
- Text must fit in containers across mobile/desktop.
- Do not nest cards inside cards.
- Do not use decorative orbs/bokeh backgrounds.
- Do not build one-note palettes when creating new surfaces.
- Buttons should use icons for familiar actions where possible.
- Visual geometry/tokens повторяют exact reference state. Общие вкусовые rules
  не дают права заменять существующий `ElevenHouseDesign` собственной
  интерпретацией.
- Semantic HTML, accessible names, visible focus, keyboard order, error
  association и contrast обязательны вместе с visual parity.

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

После automated tests user-visible change обязательно проходит Runtime E2E и
Design Parity из `../testing-strategy.md`: exact role/route/locale/viewport,
Browser/Computer Use interaction, DOM/computed styles, console/network,
reference/production screenshots и affected responsive/edge states.

## Stop Conditions

- UI needs backend state transitions that do not exist yet.
- Public client UI would expose astrologer discovery.
- Admin UI requires `admin-api`, but the task tries to use `astrologer-api`.
- New design-system component would encode unresolved business workflow.
- Required production service или browser surface недоступен: automated checks
  можно завершить, но visible acceptance остаётся blocked.

## Done Checklist

- Owning app/package is correct.
- Design-system extraction is justified by reuse.
- Contracts are shared, not manually duplicated.
- Mobile/responsive state is covered.
- Component/file decomposition и feature model reviewed.
- Visible surfaces were grepped before finishing.
- Targeted tests/typecheck/build, Runtime E2E, accessibility и Design Parity
  были выполнены либо имеют explicit blocked status с residual risk.

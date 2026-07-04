# Runbook: Design To Production

Используй этот ранбук, когда задача связана с переносом экранов, UX-flow,
терминологии или состояний из `ElevenHouseDesign/` в production-код.

## Цель

Реализовать канонический сверстанный дизайн через production apps, packages,
contracts, domain use cases и design system, не копируя prototype architecture.

## Source Of Truth

1. `docs/architecture/design-reference-inventory.md`
2. `ElevenHouseDesign/ElevenHouse.html`
3. релевантные `ElevenHouseDesign/app/*.jsx`
4. релевантные `ElevenHouseDesign/screenshots/*.png`
5. production-код в `apps/` и `packages/`

Если дизайн и inventory расходятся, сначала проверь код и дизайн, затем
обнови inventory или явно зафиксируй расхождение пользователю.

## Что можно брать из дизайна

- Состав экранов и функциональных зон.
- Layout, визуальную иерархию, состояния, терминологию.
- User flow и expected interactions.
- Иконографику, visual vocabulary, responsive states.
- Смысл mock data как product requirements.

## Что нельзя переносить как production architecture

- `window.*` globals.
- `localStorage` как источник business state.
- Demo-router и `DemoSwitch`.
- `TweaksPanel`.
- UMD/Babel-in-browser загрузку.
- Mock datasets как runtime data layer.
- Однофайловые prototype component boundaries.
- `image-slot.js` как production media module.

## Пошаговая процедура

1. Найди строку в inventory для design area.
2. Если строки нет, добавь её до реализации:
   - design files;
   - production surface;
   - domain ownership;
   - API/contracts readiness;
   - frontend readiness;
   - design-system needs;
   - integration notes.
3. Открой релевантные design files:

   ```bash
   sed -n '1,260p' ElevenHouseDesign/app/<file>.jsx
   ```

4. Открой production surface:

   ```bash
   rg -n "route_or_component_name" apps packages
   ```

5. Раздели дизайн на:
   - reusable UI primitives для `packages/design-system`;
   - app-specific composition для `apps/<surface>`;
   - API contract gaps для `packages/contracts`;
   - domain/use-case gaps для `packages/domain`;
   - DB gaps для `packages/db`;
   - worker/event gaps для async side effects.

6. Реализуй только production-supported behavior. Если дизайн показывает
   поведение без backend/domain основы, делай typed disabled/empty state или
   scoped placeholder, но не имитируй business workflow в браузере.

7. Проверь все видимые поверхности, а не только первый call site:

   ```bash
   rg -n "component|label|icon|route|copy" apps packages
   ```

## Special Rules

- Публичные страницы астрологов принадлежат `client-web` + `public-api` для
  public reads и `astrologer-web` + `astrologer-api` для управления.
- Client cabinet может показывать только уже связанных с клиентом астрологов.
  Не создавай discovery, catalog, search или recommendations.
- Admin screens принадлежат `admin-web` + будущему `admin-api`.
- Mobile design files — это responsive requirements для web surfaces, не
  отдельное приложение и не iOS wrapper.

## Verification

- Для UI: targeted component tests плюс typecheck/build релевантного app/package.
- Для docs-only design mapping: `git diff --check` и grep на старые/ложные
  формулировки.
- Для visual parity, если есть running app и пользователь разрешил процессы:
  проверить существующий dev server read-only; запускать новый только по явной
  команде пользователя.

## Done Checklist

- Inventory актуален для затронутой design area.
- Prototype runtime не перенесён в production.
- Все visible call sites проверены через `rg`.
- Unsupported flows не симулируют backend/domain state в браузере.
- Проверки выполнены или риск явно указан.

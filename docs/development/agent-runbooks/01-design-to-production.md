# Runbook: Design To Production

Используй этот runbook для любого visible UI/UX изменения, переноса screen/state
из `ElevenHouseDesign/` или проверки visual parity.

## Цель

Реализовать утверждённое production behavior в точном visual language
`ElevenHouseDesign`, сохраняя real contracts, domain state, accessibility и
production component architecture.

## Source model

- Product behavior: user instruction → product docs → ADR → contracts/domain.
- Architecture: architecture/API/security docs → current production code.
- Visual contract: exact `ElevenHouseDesign` screen/state.
- Mapping/readiness: `docs/architecture/design-reference-inventory.md`.
- Proof: tests + real browser/network/runtime evidence.

Design prototype не является automatic source для business scope,
authorization, persistence, state transitions или component boundaries. Его
mock behavior может раскрыть product question; вопрос исследуется/решается до
implementation, а не копируется молча.

## Required pre-change evidence

1. Найди design area в inventory и owning production surface.
2. Зафиксируй exact pair:
   - reference route/state;
   - production route/state;
   - role, locale, viewport, data prerequisites;
   - approved business differences.
3. Read-only проверь стандартные ports. Используй существующие процессы; не
   меняй lifecycle без прямой команды пользователя.
4. Открой exact reference state в Browser/Computer Use.
5. Сними screenshot каждого affected desktop/mobile state.
6. Через Developer mode/CDP измерь:
   - width/height, grid/flex geometry;
   - margin/padding/gap;
   - font family/size/weight/line-height/letter spacing;
   - colors, borders, radii, shadows;
   - z-index, overflow, scroll behavior;
   - hover/focus/active/disabled/open/closed states.
7. Прочитай релевантные design JSX/CSS только для visual composition и
   interaction evidence.

## Production decomposition

Раздели работу на:

- stable reusable visual primitives в `packages/design-system`;
- app-owned page/layout composition;
- focused components (один component на файл по умолчанию);
- feature model для derived state, mappings и transitions;
- validated shared/generated contracts;
- domain/API/DB/worker gaps полного behavior contour.

Не переноси `window.*`, localStorage business state, mock datasets, demo-router,
`DemoSwitch`, `TweaksPanel`, `image-slot.js`, one-file prototype boundaries или
browser calculation helpers.

Если approved behavior требует отсутствующий backend/domain contour, реализуй
его в текущем scope либо обозначь material blocker. Не выдавай fake success,
local-only workflow, silent fallback, скрыто disabled control или placeholder за
completed feature.

## Implementation loop

1. Напиши failing behavioral test для первого approved state/interaction.
2. Реализуй production slice через correct contracts/boundaries.
3. Подтверди targeted green и продолжай до полного state matrix.
4. Exercise real network-backed production flow.
5. Capture production screenshot/measurements при том же viewport/state.
6. Compare geometry, tokens, iconography и interactions.
7. Исправляй расхождения и повторяй, пока acceptance evidence не совпадает.

Проверь loading, empty, success, validation, error, disabled, retry,
responsive, keyboard и focus states, затронутые задачей. Для modal/select/
dropdown/table/sidebar/overlay static screenshot одного closed state
недостаточен.

## Product-specific boundaries

- Public astrologer page: `client-web` + `public-api` reads; management:
  `astrologer-web` + `astrologer-api`.
- Client cabinet показывает только уже связанных астрологов; design selector не
  разрешает discovery/catalog/search/recommendations.
- Admin screens: `admin-web` + `admin-api` с permissions/audit.
- Mobile design — responsive state той же web surface, не iOS wrapper.

## Evidence artifacts

Не сохраняй task-specific visual evidence в checkout или Git. Для active task
используй временное место вне repository либо согласованное external artifact
location:

- reference screenshot(s);
- production screenshot(s);
- side-by-side/diff, если доступен;
- route/state/viewport matrix;
- relevant computed-style measurements;
- intentional deviations с rationale/source.

Перед завершением task удали локальные evidence artifacts, если они не нужны
для прямо согласованного external handoff. Не добавляй screenshots, browser
logs, PID files или mutable summary в source repository.

## Done Checklist

- Product behavior и visual contract не смешаны.
- Exact reference/production state pair зафиксирован.
- Full contour реализован без prototype runtime/fake fallback.
- Focused component/model boundaries соблюдены.
- Automated behavior, Runtime E2E, accessibility и Design Parity evidence
  выполнены по `../testing-strategy.md`.
- Console/network и edge/responsive states проверены.
- Inventory/docs обновлены по фактическому current state.
- Blocked browser/runtime acceptance не названа pass.

# Раскрытие карточек сравнения совместимости в нумерологии

**Дата:** 2026-07-17
**Статус:** утверждён пользователем
**Surface:** `apps/astrologer-web`, `/numerology`, режим совместимости

## Outcome

Пользователь может прочитать полное объяснение каждого сравнения прямо внутри
карточки. Клик по закрытой карточке раскрывает её, повторный клик сворачивает,
а открытие другой карточки автоматически закрывает предыдущую.

## Scope

В scope входят карточки трёх списков внутри разбора совместимости:

- ключевые числа;
- психоматрица;
- линии матриц.

Не меняются расчёты, contracts, API, persistence, тексты объяснений, матрицы,
зоны совместимости, итог совместимости и полноэкранная презентация.

## Current evidence

`CompatibilityComparisonList` уже рендерит каждое сравнение как `button`, но
описание принудительно остаётся в одну строку через `white-space: nowrap`,
`overflow: hidden` и `text-overflow: ellipsis`. Клик обновляет общий
`selectedSelector`; в compatibility workspace это даёт только подсветку и не
делает полный текст видимым.

## Interaction design

Общий `selectedSelector` остаётся единственным источником состояния выбора и
раскрытия:

1. Если selector карточки не выбран, клик передаёт её selector и раскрывает её.
2. Если selector уже выбран, повторный клик возвращает выбор к selector итога
   совместимости и сворачивает карточку.
3. Поскольку selector общий для всех трёх списков, одновременно раскрыта не
   более чем одна карточка.
4. Выбор другого comparison selector, в том числе через связанную матрицу,
   раскрывает соответствующую карточку и закрывает предыдущую.
5. При первом показе режима совместимости карточки закрыты, потому что default
   selector указывает на итог совместимости.

Отдельный локальный React state не добавляется: он мог бы расходиться с
selection state страницы при переключении расчётов или выборе элемента матрицы.

## Visual design

Закрытая карточка сохраняет текущую геометрию, цвета, типографику, badge,
значения и разницу. В раскрытом состоянии:

- применяется существующая selected-подсветка;
- заголовок и объяснение перестают использовать ellipsis;
- текст переносится на строки внутри доступной ширины карточки;
- высота карточки увеличивается по содержимому;
- значения, relation badge и разница сохраняют текущий порядок и визуальные
  tokens.

Новый декоративный icon не добавляется: существующая подсветка показывает
активное состояние, а новый icon без reference-state был бы лишним визуальным
отклонением.

## Accessibility

Карточка остаётся нативной кнопкой и получает `aria-expanded`. Поэтому клик,
`Enter` и `Space` используют одно и то же поведение без отдельного keyboard
handler. Существующий tab order сохраняется; для карточки явно проверяется и,
если текущего browser focus недостаточно, добавляется заметный `:focus-visible`
outline в visual language ElevenHouse. Полный текст остаётся в DOM и становится
визуально доступным при раскрытии.

## Implementation boundaries

Ожидаемые owned paths:

- `apps/astrologer-web/src/features/numerology/components/CompatibilityComparisonList.tsx`;
- `apps/astrologer-web/src/features/numerology/components/CompatibilityWorkspace.tsx`;
- `apps/astrologer-web/src/features/numerology/components/NumerologyComponents.module.css`;
- focused component test рядом с compatibility components.

Изменение остаётся app-owned и не добавляется в `packages/design-system`,
поскольку это поведение конкретной Numerology composition.

## Behavioral acceptance

- Закрытая карточка показывает компактный однострочный preview.
- Клик раскрывает полный текст выбранной карточки.
- Повторный клик сворачивает ту же карточку.
- Клик по другой карточке раскрывает её и закрывает предыдущую.
- Состояние корректно синхронизируется между тремя comparison lists.
- `aria-expanded` соответствует видимому состоянию.
- Управление работает мышью, `Enter` и `Space`.
- На затронутых desktop и mobile viewport текст не обрезан и не выходит за
  границы карточки.

## Verification

Реализация выполняется через behavioral TDD:

1. focused component test сначала доказывает отсутствующее toggle behavior;
2. targeted Vitest подтверждает red, затем green;
3. root ESLint проверяет изменённые Numerology files;
4. `@elevenhouse/astrologer-web` typecheck проверяет типы;
5. уже запущенный `/numerology` проверяется через Computer Use в существующей
   вкладке Chrome: закрытие, раскрытие, повторное сворачивание, переключение
   карточек, keyboard interaction и responsive presentation;
6. screenshots и route/state/viewport evidence сохраняются в
   `.design-qa/numerology-compatibility-card-expansion/`.

Если текущая runtime surface или требуемое состояние недоступны, automated
checks можно завершить, но Runtime E2E и Design Parity остаются blocked.

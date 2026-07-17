# Скрытие выбора года в режиме совместимости нумерологии

**Дата:** 2026-07-17
**Статус:** утверждено пользователем; письменная самопроверка завершена
**Surface:** `apps/astrologer-web`, `/numerology`, toolbar режима совместимости

## Outcome

В режиме совместимости toolbar полностью скрывает выбор прогнозного года.
Освободившееся место остаётся двум селекторам участников и устраняет наложение
партнёра на неиспользуемый control года.

При возврате в индивидуальный режим выбор года снова показывается с ранее
выбранным значением и состоянием периода.

## Current evidence and root cause

Production toolbar всегда рендерит `NumerologyYearPicker`. В режиме
совместимости он получает `disabled`, но продолжает занимать ширину рядом с
двумя `ClientSearchCombobox`. На ограниченной desktop-ширине второй selector
заходит в область года.

`toNumerologyPreviewPeriodRequest` формирует explicit personal year/months
только для индивидуального режима. Для совместимости выбранный год не влияет на
результат. Контроллер уже закрывает открытый year picker при переходе в
совместимость.

Prototype reference оставляет кнопку «Год» в toolbar, однако это его локальный
runtime behavior, а не production business rule. Согласованное скрытие является
intentional product deviation: неактивный и не относящийся к текущему режиму
control не показывается, при этом визуальный язык оставшихся controls не
меняется.

## Chosen behavior

- Индивидуальный режим рендерит `NumerologyYearPicker` без изменений.
- Режим совместимости не рендерит `NumerologyYearPicker` в DOM.
- Кнопка «Совместимость» и menu «Действия» сохраняют текущие размеры, порядок,
  active-state и accessibility semantics.
- Вход в режим совместимости закрывает открытый popover года.
- Выбранный год и `isPeriodVisible` не сбрасываются: после возврата в
  индивидуальный режим пользователь продолжает прежний прогнозный контекст.
- Расчёты, contracts, API requests, persistence и period state machine не
  меняются.

## Alternatives considered

### Оставить disabled control и уплотнить toolbar

Сохраняет бесполезный control, усложняет responsive geometry и продолжает
подсказывать пользователю, что год относится к совместимости. Отклонено.

### Перенести выбор года в «Действия»

Устраняет переполнение, но ухудшает доступ к частому control в индивидуальном
режиме и расширяет scope меню без продуктовой причины. Отклонено.

## Behavioral acceptance

- В compatibility-state два selector участников не перекрывают control года,
  потому что control отсутствует.
- `NumerologyYearPicker` отсутствует в compatibility render tree.
- В individual-state `NumerologyYearPicker` остаётся доступным и функционально
  неизменным.
- Переход compatibility → individual возвращает ранее выбранный год и видимый
  период.
- Toolbar сохраняет корректный desktop/mobile responsive layout, keyboard
  order и focus-visible states.

## Implementation boundaries

Ожидаемые owned paths:

- `apps/astrologer-web/src/pages/numerology/NumerologyPageView.tsx`;
- `apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx`;
- task-specific evidence в
  `.design-qa/numerology-compatibility-year-control/`.

CSS и controller меняются только если failing behavioral/browser evidence
покажет отдельную необходимость. Новые компоненты, API или design-system
primitives не требуются.

## Verification

Реализация выполняется через behavioral TDD:

1. focused view test сначала требует отсутствия year picker в compatibility и
   подтверждает его наличие в individual mode;
2. targeted Vitest проходит red → green;
3. root ESLint и `@elevenhouse/astrologer-web` typecheck проверяют затронутую
   поверхность;
4. существующая вкладка Chrome проверяется через Computer Use без управления
   lifecycle сервисов: compatibility/individual transitions, сохранение года,
   desktop viewport со скриншота, responsive viewport, keyboard/focus, console
   и network;
5. screenshots и route/state/viewport evidence сохраняются в task-specific
   `.design-qa` directory.

Если runtime surface недоступна, automated checks можно завершить, но Runtime
E2E и visual acceptance остаются blocked.

## Scope and authority

В scope входит только видимость year control и её behavioral/browser evidence.
Изменения compatibility content, расчётов, presentation, PDF, AI, API и
responsive redesign находятся вне scope.

Commit, push, deploy и управление процессами не выполняются без отдельной
authority пользователя. Текущие shared-main изменения, включая уже
существующие Numerology edits, сохраняются и не переписываются.

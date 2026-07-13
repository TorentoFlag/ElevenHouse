# Agent Workflow

Этот документ дополняет `AGENTS.md` техническими правилами параллельной работы.

Операционные процедуры для повторяемых задач лежат в
`docs/development/agent-runbooks/`. Для любой нетривиальной задачи агент сначала
проходит `agent-runbooks/00-task-intake.md`, затем выбирает профильный ранбук и
перед финальным ответом проходит `agent-runbooks/08-verification-and-git.md`.

## Task Intake Output

Перед изменениями зафиксируй рабочую рамку:

- Outcome
- In scope
- Out of scope
- Source of truth
- Owned paths
- Risks and invariants
- Verification
- External authority / destructive actions

Команды бери из `commands.md`, уровни доказательств — из
`testing-strategy.md`.

## Parallel Work

Над проектом могут одновременно работать несколько агентов. Каждый агент работает только с файлами, относящимися к его текущей задаче.

Правила:

- Перед изменениями прочитать релевантные docs и локальные файлы задачи.
- Перед нетривиальными изменениями открыть соответствующий runbook из
  `docs/development/agent-runbooks/`.
- Не делать unrelated cleanup, formatting или refactor.
- Не откатывать изменения, которые агент сам не вносил.
- Если встречены чужие изменения, считать их валидной работой пользователя или другого агента.
- Если чужие изменения пересекаются с текущей задачей, адаптировать решение к ним.
- Если конфликт невозможно безопасно разрешить локально, остановиться и коротко описать конфликт пользователю.

## Technical Focus

Агент оценивает решения по техническим критериям:

- module boundaries;
- dependency direction;
- contract clarity;
- testability;
- operational reliability;
- security posture;
- maintainability;
- developer experience.

Бизнес-стратегия, маркетинг, монетизация и продуктовые приоритеты обсуждаются только по явной просьбе пользователя.

## Verification

После изменений выбери минимальную достаточную проверку по
`testing-strategy.md` и точную команду по `commands.md`. Если проверка не может
быть выполнена, явно укажи причину и фактический непроверенный риск.

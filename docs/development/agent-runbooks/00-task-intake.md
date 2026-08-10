# Runbook: Task Intake

Используй этот ранбук в начале любой нетривиальной задачи: feature, bugfix,
архитектурное изменение, UI-реализация, API/backend работа, DB изменение,
локальная диагностика или документационная синхронизация.

## Цель

Быстро понять задачу, выбрать правильные документы, не задеть чужие изменения и
не начать строить поверх неверной архитектурной предпосылки.

## Shared-main intake

Работа выполняется в существующем checkout на `main`. До чтения target paths
сними shared baseline:

```bash
git branch --show-current
git status --short
git diff --cached --name-status
```

Если current branch не `main`, не переключай его самостоятельно: сообщи
blocker. Раздели owned paths задачи, существующие unowned modifications,
untracked files и staged entries. Dirty tree ожидаем и не требует cleanup,
worktree, stash или новой ветки.

Непосредственно перед каждой связной группой правок заново прочитай complete
target file и выполни `git diff -- <path>`. Если файл изменился после первого
осмотра, обнови решение по current content; не применяй stale patch.

## Шаги

1. Проверь shared-main baseline командами выше и зафиксируй owned/unowned paths.

2. Если есть изменения, которых ты не делал:
   - считай их работой пользователя или другого агента;
   - не откатывай и не форматируй их;
   - если они не относятся к задаче, игнорируй;
   - если пересекаются с задачей, перечитай current file/path diff и адаптируй
     решение;
   - спрашивай пользователя только при несовместимом semantic conflict.

3. Определи источники по виду истины:
   - product truth: user instruction, `docs/product/`, contracts/domain;
   - architecture truth: ADR, architecture/API/security docs, current code;
   - visual truth: exact `ElevenHouseDesign` screen/state для visible UI;
   - implemented-state evidence: tests, generated schema, runtime/network/logs.

4. Прочитай короткий обязательный контекст:

   ```text
   AGENTS.md
   docs/README.md
   docs/development/agent-runbooks/README.md
   ```

5. Выбери только источники, относящиеся к scope/risk:

   | Scope/risk | Required routing |
   | --- | --- |
   | Product behavior | relevant `docs/product/` scope/roadmap and owning contracts/domain |
   | Architecture/module boundary | relevant `docs/architecture/` and exact accepted ADR |
   | Visible UI | design inventory row, exact `ElevenHouseDesign` state, `01-design-to-production.md`, `02-frontend-production.md` |
   | API/backend | `docs/api/api-boundaries.md`, `docs/architecture/backend-modules.md`, ADR `0003` and `0007` when applicable, `03-backend-feature-module.md` |
   | DB/schema/migration | ADR `0006`, `04-database-and-migrations.md` |
   | Worker/event/payment side effect | `06-workers-and-events.md`; add API/DB/security sources for each affected boundary |
   | Local process/service | `07-local-services.md`, `commands.md` and only relevant runtime config |
   | Novel/risky or ambiguous decision | `research-strategy.md`, relevant ADR/current code and `elevenhouse-research` |
   | Documentation/agent rules | `09-documentation-maintenance.md` and the canonical source being changed |

   Не читай directory целиком по умолчанию: выбери exact document/ADR по
   маршруту и расширяй контекст только когда contour или evidence это требует.

6. Для API/backend задач дополнительно прочитай, когда они относятся к
   конкретному route/flow:

   ```text
   docs/api/api-boundaries.md
   docs/decisions/0003-nestjs-modular-backend.md
   docs/decisions/0007-cookie-auth-csrf-and-idempotency.md
   ```

7. Для DB задач дополнительно прочитай:

   ```text
   docs/decisions/0006-drizzle-database-tooling.md
   docs/development/agent-runbooks/04-database-and-migrations.md
   ```

8. Для UI задач дополнительно прочитай:

   ```text
   docs/decisions/0002-react-vite-without-next.md
   docs/decisions/0005-custom-design-system.md
   docs/development/agent-runbooks/01-design-to-production.md
   docs/development/agent-runbooks/02-frontend-production.md
   ```

9. Найди релевантные production-файлы и history через быстрые команды:

   ```bash
   rg --files apps packages docs | sort
   rg -n "relevant_term" apps packages docs
   git log --oneline --all -- relevant/path
   ```

10. Трассируй complete contour, а не только первый call site:

   ```text
   route/state -> frontend -> contract -> API -> domain -> DB
               -> events/workers -> security/config/observability -> tests/deploy
   ```

11. Определи research requirement по `../research-strategy.md`:
    - technical research обязателен для novel/risky architecture и
      unfamiliar stack behavior;
    - product research нужен для requested alternatives или ambiguous workflow;
    - если research не нужен, зафиксируй, какой existing contract/pattern делает
      решение однозначным.

12. До изменений сформулируй рабочую границу:

    ```text
    Outcome
    Observable definition of done
    In scope
    Out of scope
    Product / architecture / visual / implemented-state sources
    Owned paths
    Risks and invariants
    Required research and decisions
    Current runtime/browser state
    Automated / integration / runtime E2E / design-parity verification
    External authority / destructive actions
    ```

13. Для multi-step task выбери plan lifecycle по `../agent-workflow.md`:
    concise inline plan для one-session low-risk work; durable ExecPlan только
    для cross-session/agent или high-risk boundary. Не архивируй executed plan
    под `docs/`. Пользователю выноси material product/architecture choices;
    routine implementation decomposition делает агент.

Команды и authority requirements бери из `../commands.md`, а уровень
доказательств — из `../testing-strategy.md`.

## Stop Conditions

Остановись и сообщи пользователю, если:

- задача требует изменения admin/moderator workflows, но `admin-api` ещё не
  создан и пользователь просит поместить это в `public-api` или `astrologer-api`;
- задача требует запуска/остановки сервисов, но пользователь не дал явную
  команду на управление процессами;
- чужие изменения конфликтуют с задачей так, что безопасная локальная адаптация
  невозможна;
- документация, inventory и код расходятся в критичной архитектурной части.

## Done Checklist

- Ты знаешь целевую production surface.
- Ты знаешь релевантные документы и ADR.
- Ты подтвердил `main`, текущие status и staged paths.
- Ты отделил свои будущие изменения от чужих.
- Ты знаешь, что target files будут перечитаны непосредственно перед edits.
- Ты трассировал полный dependency/runtime contour.
- Ты определил research requirement и definition of done.
- Ты знаешь runtime/browser availability для required acceptance.
- Ты выбрал специализированный ранбук для следующего шага.

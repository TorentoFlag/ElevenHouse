# Runbook: Task Intake

Используй этот ранбук в начале любой нетривиальной задачи: feature, bugfix,
архитектурное изменение, UI-реализация, API/backend работа, DB изменение,
локальная диагностика или документационная синхронизация.

## Цель

Быстро понять задачу, выбрать правильные документы, не задеть чужие изменения и
не начать строить поверх неверной архитектурной предпосылки.

## Шаги

1. Проверь текущий статус:

   ```bash
   git status --short
   ```

2. Если есть изменения, которых ты не делал:
   - считай их работой пользователя или другого агента;
   - не откатывай и не форматируй их;
   - если они не относятся к задаче, игнорируй;
   - если пересекаются с задачей, сначала прочитай их и адаптируй решение.

3. Прочитай обязательный базовый контекст:

   ```text
   AGENTS.md
   docs/README.md
   docs/architecture/design-reference-inventory.md
   docs/architecture/overview.md
   docs/architecture/repository-structure.md
   docs/architecture/backend-modules.md
   docs/product/full-functional-scope.md
   docs/product/roadmap.md
   docs/decisions/
   ```

4. Для API/backend задач дополнительно прочитай:

   ```text
   docs/api/api-boundaries.md
   docs/decisions/0003-nestjs-modular-backend.md
   docs/decisions/0007-cookie-auth-csrf-and-idempotency.md
   ```

5. Для DB задач дополнительно прочитай:

   ```text
   docs/decisions/0006-drizzle-database-tooling.md
   docs/development/agent-runbooks/04-database-and-migrations.md
   ```

6. Для UI задач дополнительно прочитай:

   ```text
   docs/decisions/0002-react-vite-without-next.md
   docs/decisions/0005-custom-design-system.md
   docs/development/agent-runbooks/01-design-to-production.md
   docs/development/agent-runbooks/02-frontend-production.md
   ```

7. Найди релевантные production-файлы через быстрые команды:

   ```bash
   rg --files apps packages docs | sort
   rg -n "relevant_term" apps packages docs
   ```

8. Перед изменениями сформулируй рабочую границу:
   - Outcome
   - In scope
   - Out of scope
   - Source of truth
   - Owned paths
   - Risks and invariants
   - Verification
   - External authority / destructive actions

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
- Ты знаешь текущий git status.
- Ты отделил свои будущие изменения от чужих.
- Ты выбрал специализированный ранбук для следующего шага.

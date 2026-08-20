# Runbook: Verification And Git

Используй этот ранбук перед финальным ответом, commit, push or PR.

## Цель

Не заявлять о готовности без свежей проверки и не смешивать свои изменения с
чужими.

## Pre-Final Verification

Выбирай evidence level по `../testing-strategy.md`, а команды и их
предусловия — по `../commands.md`. Не запускай или не перезапускай процессы ради
verification без прямого разрешения пользователя.

1. Проверь рабочее дерево:

   ```bash
   git branch --show-current
   git status --short
   git diff --cached --name-status
   ```

2. Отдели свои изменения от чужих:
   - перечисли файлы, которые менял ты;
   - если есть unrelated files, не добавляй их в commit;
   - если файл содержит смешанные изменения, внимательно проверь diff.

3. Проверь формат diff:

   ```bash
   git diff --check
   ```

4. Запусти targeted tests для изменённых слоёв.

5. Сопоставь acceptance claims с evidence level:
   - domain/contract;
   - adapter/integration;
   - API/security;
   - frontend behavior;
   - Runtime E2E;
   - Design Parity/accessibility;
   - repository gate.

   Для visible scope component tests не закрывают Runtime E2E/Design Parity.

6. Если менялись shared contracts/domain/db/app shell, расширь проверку:

   ```bash
   pnpm verify
   ```

   Если `pnpm verify` слишком широк из-за известных unrelated changes, запусти
   меньший набор и явно укажи непроверенный риск.

7. Выполни self-review полного diff:
   - correctness/security/idempotency/data integrity;
   - module/dependency direction;
   - missing error/retry/edge states;
   - mock, silent fallback, fake success, placeholder completion;
   - oversized files, duplicated logic, derived behavior in JSX;
   - stale docs и unrelated edits.

8. Для agent documentation выполни:

   ```bash
   git diff --check
   ```

## Commands By Change Type

Используй examples профильного runbook’а и canonical patterns из
`../commands.md`. Для docs всегда запускай `git diff --check`; для
contracts/domain/db/app composition расширяй targeted evidence до repository
verification, если нет известного unrelated blocker.

## Shared Index

Git index разделяется всеми агентами и пользователем так же, как filesystem.
До staging или commit выполни:

```bash
git status --short
git diff -- <owned-path>...
git diff --cached --name-status
git diff --cached -- <relevant-path>...
```

Если cached diff содержит изменения, которых ты не делал, не очищай index через
`git reset`, `git restore --staged` или аналог и не включай их в свой commit.
Не используй `git add .`, `git add -A` или другую broad staging команду.
Добавляй только exact owned paths после повторной проверки их current diff.

При наличии unowned staged entries не создавай aggregate commit. Оставь свои
изменения unstaged/uncommitted; если authority задачи требует commit, сообщи
exact staged paths и запроси решение пользователя. Никогда не заявляй
авторство над combined diff другого агента.

## Commit Discipline

Commit only when the user explicitly asks or the current task includes
commit/push follow-through.

Before commit:

```bash
git status --short
git diff --stat
git diff --check
git diff --cached --name-status
```

Stage only relevant files:

```bash
git add <file1> <file2>
git diff --cached --name-status
git diff --cached --stat
git diff --cached --check
git commit -m "<type>: <summary>"
```

If user says "закомить и пушни", verification, commit and push are part of the
task.

## Final Response Must Include

- What changed.
- What verification ran and its result.
- What was not run and why.
- Any unrelated changes noticed but not touched.
- Skipped checks, reason and residual risk.
- Для UI: exact reference/production route-state, viewport и artifact paths.

## Stop Conditions

- Verification command fails.
- Diff includes unrelated files you cannot separate safely.
- Tests require starting services but user did not permit process management.
- Runtime/visual acceptance требует недоступную browser surface: mark blocked,
  не заменяй pass более узким тестом.
- You are about to claim "done" without fresh verification.

## Done Checklist

- `git diff --check` passed.
- Targeted verification ran.
- Every acceptance claim mapped to sufficient evidence level.
- Whole-diff fallback/boundary/size/docs review completed.
- Branch, status, owned path diffs и shared index reviewed.
- Final answer names skipped verification or residual risk.

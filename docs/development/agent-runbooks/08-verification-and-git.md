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
   git status --short
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

5. Если менялись shared contracts/domain/db/app shell, расширь проверку:

   ```bash
   pnpm verify
   ```

   Если `pnpm verify` слишком широк из-за известных unrelated changes, запусти
   меньший набор и явно укажи непроверенный риск.

## Commands By Change Type

Используй examples профильного runbook’а и canonical patterns из
`../commands.md`. Для docs всегда запускай `git diff --check`; для
contracts/domain/db/app composition расширяй targeted evidence до repository
verification, если нет известного unrelated blocker.

## Commit Discipline

Commit only when the user explicitly asks or the current task includes
commit/push follow-through.

Before commit:

```bash
git status --short
git diff --stat
git diff --check
```

Stage only relevant files:

```bash
git add <file1> <file2>
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

## Stop Conditions

- Verification command fails.
- Diff includes unrelated files you cannot separate safely.
- Tests require starting services but user did not permit process management.
- You are about to claim "done" without fresh verification.

## Done Checklist

- `git diff --check` passed.
- Targeted verification ran.
- Status/diff reviewed.
- Final answer names skipped verification or residual risk.

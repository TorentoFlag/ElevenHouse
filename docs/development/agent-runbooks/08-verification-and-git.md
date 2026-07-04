# Runbook: Verification And Git

Используй этот ранбук перед финальным ответом, commit, push or PR.

## Цель

Не заявлять о готовности без свежей проверки и не смешивать свои изменения с
чужими.

## Pre-Final Verification

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

## Suggested Commands By Change Type

Docs-only:

```bash
git diff --check
rg -n "stale_phrase" docs AGENTS.md || true
```

Design system:

```bash
pnpm test packages/design-system/src/index.test.ts
pnpm --filter @elevenhouse/design-system typecheck
pnpm --filter @elevenhouse/design-system build
```

Frontend app:

```bash
pnpm test apps/<app>/src/<changed-test>.test.tsx
pnpm --filter @elevenhouse/<app> typecheck
pnpm --filter @elevenhouse/<app> build
```

Contracts/domain:

```bash
pnpm test packages/contracts/src/<module>.test.ts
pnpm test packages/domain/src/<module>/index.test.ts
pnpm --filter @elevenhouse/contracts typecheck
pnpm --filter @elevenhouse/domain typecheck
```

Backend app:

```bash
pnpm test apps/<api>/src/modules/<module>/<module>.service.test.ts
pnpm test apps/<api>/src/modules/<module>/<module>.e2e.test.ts
pnpm --filter @elevenhouse/<api> typecheck
pnpm --filter @elevenhouse/<api> build
```

DB:

```bash
pnpm test packages/db/src/schema.test.ts
pnpm test packages/db/src/adapters/<module>/<adapter>.integration.ts
pnpm --filter @elevenhouse/db typecheck
pnpm --filter @elevenhouse/db build
```

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

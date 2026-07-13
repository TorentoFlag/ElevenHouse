# Runbook: Documentation Maintenance

Используй этот ранбук, когда задача меняет architecture, product scope,
module boundaries, API surface, security policy, local workflow, design mapping
or agent rules.

## Цель

Документация должна оставаться living source of truth and not compete with stale
implementation plans.

Команды docs verification бери из `../commands.md`, а требования к отчёту об
evidence — из `../testing-strategy.md`.

## Документы по назначению

- `AGENTS.md`: правила для агентов в репозитории.
- `docs/README.md`: карта документации и правила source of truth.
- `docs/architecture/design-reference-inventory.md`: primary design-to-production
  inventory.
- `docs/architecture/*.md`: architecture boundaries and module ownership.
- `docs/api/api-boundaries.md`: public/astrologer/admin API split.
- `docs/decisions/*.md`: accepted architecture decisions.
- `docs/product/*.md`: full product scope and technical roadmap.
- `docs/development/*.md`: operational workflow and local setup.
- `docs/development/agent-runbooks/*.md`: repeatable agent procedures.

## What Not To Keep As Living Docs

Do not keep executed agentic implementation plans/specs as source of truth under
`docs/`. They drift quickly. If a plan resulted in durable architecture, move
that information into architecture docs, ADRs, inventory or runbooks.

## Пошаговая процедура

1. Identify what changed:
   - architecture;
   - product scope;
   - design mapping;
   - API boundary;
   - DB policy;
   - security/idempotency policy;
   - local workflow;
   - agent workflow.

2. Find affected docs:

   ```bash
   rg -n "term|module|surface|route|workflow" docs AGENTS.md
   ```

3. Update the canonical doc first:
   - design mapping -> inventory;
   - app/module boundary -> architecture docs/ADR;
   - API route/surface -> `api-boundaries.md`;
   - process rule -> `AGENTS.md` or runbook;
   - local service detail -> `local-setup.md` or `07-local-services.md`.

4. Update references from secondary docs.

5. Remove stale docs that now conflict with canonical docs.

6. Check for contradictory language:

   ```bash
   rg -n "old_term|old_surface|reference only|ops-api|admin workflow" docs AGENTS.md
   ```

7. Run scoped `git diff --check` and inspect the docs/`AGENTS.md` diff; exact
   command patterns are canonical in `../commands.md`.

## Writing Rules

- Prefer concrete paths, module names and commands.
- Say "missing", "partial" or "ready" explicitly where readiness matters.
- Avoid business-priority language unless user asks for strategy.
- Do not call ElevenHouse MVP/prototype/temporary.
- If a fact is based on current working tree, say so when it may change.

## Stop Conditions

- Docs would contradict user instruction.
- Docs would make `ElevenHouseDesign/` production architecture.
- Docs would permit admin workflows in existing public/astrologer APIs.
- Docs would turn client direct-link model into discovery/catalog behavior.

## Done Checklist

- Canonical doc updated first.
- Secondary docs aligned.
- Stale implementation plans/specs removed or ignored.
- `rg` found no old contradictory wording.
- `git diff --check` passed.

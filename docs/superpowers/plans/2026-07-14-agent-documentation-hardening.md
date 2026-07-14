# Agent Documentation Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ElevenHouse agent guidance concise, discoverable, command-accurate, and evidence-driven without importing Locker-specific rules.

**Architecture:** Keep mandatory repository invariants in the root `AGENTS.md`; route repeatable procedures to canonical development documents and existing runbooks. Add one command matrix and one testing strategy, then align docs navigation and task/verification runbooks.

**Tech Stack:** Markdown, pnpm monorepo scripts, Git.

## Global Constraints

- Preserve all ElevenHouse production, product-surface, module-boundary, design-reference, dirty-worktree, DB, and local-process invariants.
- Do not add nested `AGENTS.md`, repo-specific Codex permissions/model configuration, or Locker business rules.
- Do not touch the existing user-owned Numerology controller/test changes.
- Finish as a scoped docs commit before production code changes.

## File Map

- Create `docs/development/commands.md`: runnable command matrix and authority requirements.
- Create `docs/development/testing-strategy.md`: TDD contract and evidence ladder.
- Modify `AGENTS.md`: compact mandatory invariants and route operational detail to docs.
- Modify `docs/README.md`: source-of-truth order and ownership map.
- Modify `docs/development/agent-workflow.md`: standard task-intake output.
- Modify `docs/development/local-setup.md`: link canonical commands and tests.
- Modify runbook README plus task intake, verification, and docs-maintenance runbooks.

---

### Task 1: Canonical Commands And Testing Strategy

**Files:**
- Create: `docs/development/commands.md`
- Create: `docs/development/testing-strategy.md`
- Modify: `docs/development/local-setup.md`
- Test: docs command/source checks

**Interfaces:**
- Consumes: root and DB package scripts.
- Produces: canonical command/testing links for Task 2.

- [ ] **Step 1: Record the executable command surface**

Run:

```bash
node -e 'const p=require("./package.json"); console.log(JSON.stringify(p.scripts,null,2))'
node -e 'const p=require("./packages/db/package.json"); console.log(JSON.stringify(p.scripts,null,2))'
```

Expected: root output includes `lint`, `typecheck`, `test`, `test:integration`, `build`, `verify`, and DB commands; DB output includes `db:generate`, `db:migrate`, `db:reset`, and `db:seed`.

- [ ] **Step 2: Prove the canonical files are missing**

Run:

```bash
test -f docs/development/commands.md
test -f docs/development/testing-strategy.md
```

Expected: FAIL because both files do not exist.

- [ ] **Step 3: Add `commands.md`**

Create a table with these exact rows:

```markdown
| Purpose | Command | Preconditions / authority |
| --- | --- | --- |
| Full verification | `pnpm verify` | No service startup; shared-layer completion gate |
| Numerology domain tests | `pnpm test packages/domain/src/numerology` | No long-running process |
| Calculation integration test | `INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration packages/db/src/adapters/calculations/drizzle-calculation-store.integration.ts` | Load root `.env` first; both URLs must point to existing local PostgreSQL |
| Domain typecheck | `pnpm --filter @elevenhouse/domain typecheck` | No long-running process |
| Domain build | `pnpm --filter @elevenhouse/domain build` | No long-running process |
| Generate migration | `pnpm db:generate` | Rebuild current baseline after schema changes |
| Reset local DB | `pnpm db:reset` | Explicitly required task; local DB only; destructive; `DATABASE_URL` must identify the active ElevenHouse DB |
```

Add sections `Runnable now`, `Requires existing infrastructure`, `Process management`, and `Command patterns`. Every pattern must include one concrete ElevenHouse example.
The integration pattern must show `set -a`, `source .env`, `set +a`, followed by
the command above, and must state that the integration guard rejects non-local
PostgreSQL targets.
The DB section must also state that a parallel compose override can map
ElevenHouse PostgreSQL away from `5432`; inspect `docker compose ps postgres`
and `docker port "$(docker compose ps -q postgres)" 5432/tcp` before destructive
commands, and pass an explicit local `DATABASE_URL` when root `.env` does not
match the active container.

- [ ] **Step 4: Add `testing-strategy.md`**

Include this exact TDD contract:

```markdown
1. Write or update the smallest failing test that proves the requested behavior.
2. Run it and confirm the failure is caused by missing or incorrect behavior.
3. Implement the smallest production change that makes it pass.
4. Run the targeted test again.
5. Refactor only while the targeted test stays green.
6. Expand verification according to the changed dependency surface.
```

Define six evidence levels: pure domain/contracts, adapters/integration, API, frontend, browser flow, repository verification. Require final reports to list skipped checks and residual risk.

- [ ] **Step 5: Link local setup to the canonical files**

Replace duplicated command prose in `docs/development/local-setup.md` with links to `commands.md` and `testing-strategy.md`, while preserving port and process-management facts.

- [ ] **Step 6: Verify and commit**

Run:

```bash
test -f docs/development/commands.md
test -f docs/development/testing-strategy.md
rg -n "pnpm verify|pnpm db:reset|Runnable now|evidence" docs/development/commands.md docs/development/testing-strategy.md
git diff --check -- docs/development
git add docs/development/commands.md docs/development/testing-strategy.md docs/development/local-setup.md
git diff --cached --check
git commit -m "docs: add canonical agent commands and testing strategy"
```

Expected: all checks pass; only Task 1 files are committed.

### Task 2: Root Guidance And Runbook Routing

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/README.md`
- Modify: `docs/development/agent-workflow.md`
- Modify: `docs/development/agent-runbooks/README.md`
- Modify: `docs/development/agent-runbooks/00-task-intake.md`
- Modify: `docs/development/agent-runbooks/08-verification-and-git.md`
- Modify: `docs/development/agent-runbooks/09-documentation-maintenance.md`
- Test: instruction size, links, invariant scans

**Interfaces:**
- Consumes: canonical docs from Task 1.
- Produces: concise project entrypoint and deterministic runbook routing.

- [ ] **Step 1: Capture mandatory invariants before editing**

Run:

```bash
wc -c AGENTS.md
rg -n "production|ElevenHouseDesign|packages/domain|packages/db|admin-api|db:reset|локальн|процесс|чуж" AGENTS.md
```

Expected: size is about 25.5 KiB and every invariant family is present.

- [ ] **Step 2: Add the source-of-truth order to `docs/README.md`**

Add this order:

```markdown
1. Current user instruction for the task.
2. Accepted ADRs and canonical architecture/product documents.
3. `design-reference-inventory.md` plus `ElevenHouseDesign` for visible UI/UX.
4. Shared contracts and production code for implemented behavior.
5. Runbooks for execution procedure.
6. Plans/specs as temporary execution artifacts only.
```

Add ownership links for architecture, API, product, commands, testing, and runbooks.

- [ ] **Step 3: Standardize task intake**

Add this block to `agent-workflow.md` and `00-task-intake.md`:

```markdown
- Outcome
- In scope
- Out of scope
- Source of truth
- Owned paths
- Risks and invariants
- Verification
- External authority / destructive actions
```

Keep all existing stop conditions.

- [ ] **Step 4: Route verification and documentation maintenance**

Update the runbook index, verification, and docs-maintenance runbooks to link canonical commands/testing instead of duplicating them. Preserve scoped staging, no unrequested process management, and skipped-check reporting.

- [ ] **Step 5: Compress `AGENTS.md`**

Keep concise sections for product context, required reading/routing, skills, architecture, process safety, DB rules, design-reference transfer, and completion reporting. Add:

```markdown
- Commands: `docs/development/commands.md`
- Testing and evidence: `docs/development/testing-strategy.md`
- Task routing: `docs/development/agent-runbooks/README.md`
```

Target less than 18 KiB while retaining every invariant captured in Step 1.

- [ ] **Step 6: Verify and commit**

Run:

```bash
test "$(wc -c < AGENTS.md)" -lt 18432
rg -n "production|ElevenHouseDesign|packages/domain|packages/db|admin-api|db:reset|локальн|процесс|чуж" AGENTS.md
rg -n "Outcome|In scope|Out of scope|Source of truth|Owned paths|Verification" docs/development/agent-workflow.md docs/development/agent-runbooks/00-task-intake.md
git diff --check -- AGENTS.md docs
git add AGENTS.md docs/README.md docs/development/agent-workflow.md docs/development/agent-runbooks/README.md docs/development/agent-runbooks/00-task-intake.md docs/development/agent-runbooks/08-verification-and-git.md docs/development/agent-runbooks/09-documentation-maintenance.md
git diff --cached --check
git commit -m "docs: streamline ElevenHouse agent guidance"
```

Expected: size and invariant checks pass; user-owned Numerology files remain unstaged.

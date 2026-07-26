# Documentation Current-State Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile active ElevenHouse documentation with the current repository implementation so future agents use current code facts instead of stale module/status claims.

**Architecture:** Treat current code, generated contracts and canonical docs as the evidence chain. Update canonical architecture/API/docs first, then strengthen `scripts/agent-docs/check-agent-docs.mjs` so basic app/package/module drift is detected automatically.

**Tech Stack:** Markdown docs, Node.js `node:test`, existing `pnpm docs:check:test`, `pnpm docs:check`, `git diff --check`.

## Global Constraints

- Work in the existing `main` checkout; do not create a branch/worktree, stash, rebase or switch.
- Do not touch untracked `.design-qa/*` artifacts or unrelated untracked test files.
- Do not start, stop, restart or kill long-running services.
- Code is implemented-state evidence; stale active docs are corrected rather than archived.
- Historical specs/plans remain historical artifacts unless they contain active canonical contradictions.

---

## Progress

- [x] 2026-07-26: Captured shared-main baseline: branch `main`, no staged entries, existing untracked `.design-qa/*` artifacts plus `packages/db/scripts/seed-dev-calendar.test.ts`.
- [x] 2026-07-26: Ran initial `pnpm docs:check`; current checker passed while stale module/status docs remained.
- [x] 2026-07-26: Compared actual `apps/`, `packages/` and Nest `src/modules/*` directories with active docs.
- [x] 2026-07-26: Updated canonical architecture/API/status docs from repository evidence.
- [x] 2026-07-26: Extended docs checker and tests for app/package/module drift.
- [x] 2026-07-26: Ran docs verification and inspected final diff boundaries.

## Surprises & Discoveries

- Current `docs:check` does not validate the app/package/module lists that agents rely on during intake.
- `apps/public-api` already has first `booking`, `orders` and `payments` command modules.
- `apps/admin-api` is no longer health-only: it imports `FinancePoliciesModule`, whose module composes database, identity, security, finance policy stores, ledger/order/payout stores, idempotent finance commands and durable audit writes.
- Human Design compatibility, transits, AI draft and PDF routes exist in code; an active API paragraph still described those contours as future.

## Decision Log

- 2026-07-26: Use repository-only technical research. External docs are not needed because this task is reconciliation against local implemented state, not a new framework/provider decision.
- 2026-07-26: Strengthen docs checker with mechanical current-state assertions rather than relying on one-time manual prose updates.

## Context and Orientation

Relevant current code evidence:

- App directories: `admin-api`, `admin-web`, `astrologer-api`, `astrologer-web`, `chart-engine`, `chart-worker`, `client-web`, `landing`, `notification-worker`, `payment-worker`, `public-api`, `workers`.
- Package directories: `ai`, `auth`, `chart-engine-client`, `config`, `contracts`, `db`, `design-system`, `domain`, `i18n`, `numerology-presentation`, `observability`, `testing`, `validation`.
- Public API modules: `booking`, `client-join`, `client-profile`, `database`, `health`, `identity`, `orders`, `payments`, `redis`, `security`.
- Astrologer API modules: `ai`, `astro-calendar`, `astrologer-profile`, `availability`, `bookings`, `calculations`, `calendar`, `charts`, `clients`, `clock`, `database`, `dictionary`, `dictionary-ai`, `finance`, `health`, `human-design`, `identity`, `matrix`, `media`, `messaging`, `numerology`, `platform-billing`, `products`, `redis`, `security`, `verification`.
- Admin API modules: `database`, `finance-policies`, `health`, `identity`, `security`.

## Interfaces and Dependencies

- `checkAgentDocs({ rootDir })` remains the public checker interface.
- New checker assertions must use filesystem truth and active Markdown content only; they must not start services or require generated artifacts.
- Documentation status must distinguish backend command readiness from frontend flow readiness.

## Plan of Work

### Task 1: Architecture And API Docs

**Files:**
- Modify: `docs/architecture/repository-structure.md`
- Modify: `docs/architecture/backend-modules.md`
- Modify: `docs/api/api-boundaries.md`
- Modify: `docs/architecture/design-reference-inventory.md`
- Modify: `docs/development/local-setup.md`

**Validation:** `pnpm docs:check` and manual `rg` checks for corrected stale phrases.

- [ ] Update app/package lists from filesystem evidence.
- [ ] Update backend module lists and readiness statements from module directories and root module imports.
- [ ] Correct API current-state paragraphs for public booking/order/payment, astrologer finance/messaging/Human Design and admin finance policy/payout routes.
- [ ] Update design inventory production baseline and frontend baseline.
- [ ] Remove health-only admin wording from local setup.

### Task 2: Mechanical Docs Checker

**Files:**
- Modify: `scripts/agent-docs/check-agent-docs.mjs`
- Modify: `scripts/agent-docs/check-agent-docs.test.mjs`

**Validation:** `pnpm docs:check:test`.

- [ ] Add filesystem-backed assertions for required app directories, package directories and backend module directories.
- [ ] Add stale statement checks for Human Design future wording and admin health-only wording.
- [ ] Add isolated fixture tests proving module-list drift is rejected.

### Task 3: Verification And Review

**Files:**
- Review all modified files.

**Validation:**
- `pnpm docs:check:test`
- `pnpm docs:check`
- `git diff --check`

- [ ] Run verification commands fresh.
- [ ] Inspect `git status --short --branch`, `git diff --stat` and owned-path diff.
- [ ] Record implemented, verified, skipped and residual risks in final response.

## Concrete Steps

1. Run `find apps -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort` and compare with `docs/architecture/repository-structure.md`.
2. Run `find packages -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort` and compare with `docs/architecture/repository-structure.md`.
3. Run `find apps/<api>/src/modules -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort` for each backend API and update module docs.
4. Read affected target docs and current `git diff -- <path>` immediately before patching.
5. Patch docs and checker.
6. Run the validation commands listed in Task 3.

## Validation and Acceptance

Acceptance is documentation-only:

- Active docs no longer claim `admin-api` is health-only.
- Active docs list the current app/package/backend module directories.
- Active API docs no longer call implemented Human Design compatibility/transit/AI/PDF contours future.
- `pnpm docs:check:test`, `pnpm docs:check` and `git diff --check` pass.

## Idempotence and Recovery

All changes are text/checker changes. If a patch conflicts with concurrent edits, reread the current target file, inspect `git diff -- <path>`, and reapply the smallest compatible edit. Do not reset or clean unrelated files.

## Artifacts and Notes

- Initial docs gate evidence: `pnpm docs:check` returned `agent-docs: ok (142 Markdown files)`.
- Final docs checker test evidence: `pnpm docs:check:test` returned 8 passing Node tests.
- Final docs gate evidence: `pnpm docs:check` returned `agent-docs: ok (144 Markdown files)`.
- Whitespace evidence: `git diff --check` returned no errors.
- No runtime/browser evidence is required because no visible UI behavior is changed.

## Outcomes & Retrospective

- Active architecture/API/status docs now reflect current app directories,
  package directories and backend module directories.
- `admin-api` is documented as the current finance-policy/risk/payout internal
  API foundation rather than a health-only scaffold.
- `public-api` is documented as having first booking/order/payment command
  modules while client-facing checkout and full public read flows remain
  incomplete.
- Human Design compatibility, transit overlay, AI draft and PDF contours are
  documented as implemented where the current code exposes them.
- The docs checker now mechanically rejects undocumented app/package/backend
  module drift and known stale admin/Human Design statements.

# Foundation Monorepo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first technical foundation for ElevenHouse: a runnable monorepo skeleton with apps, shared packages, local infra, and verification commands.

**Architecture:** Use a pnpm workspace with Turborepo orchestration. Apps live under `apps/`, shared code under `packages/`, and packages never import from apps.

**Tech Stack:** pnpm, Turborepo, TypeScript, React, Vite, Nest.js, Vitest, ESLint, Prettier, PostgreSQL, Redis.

---

### Task 1: Workspace Tooling

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `eslint.config.js`
- Create: `vitest.config.ts`
- Create: `.prettierrc.json`
- Create: `.gitignore`

- [x] Define root scripts for `dev`, `build`, `lint`, `test`, `typecheck`, and `verify`.
- [x] Configure workspace package discovery for `apps/*` and `packages/*`.
- [x] Configure shared TypeScript, ESLint, Prettier, and Vitest defaults.

### Task 2: Runnable App Shells

**Files:**
- Create: `apps/client-web/**`
- Create: `apps/astrologer-web/**`
- Create: `apps/admin-web/**`
- Create: `apps/public-api/**`
- Create: `apps/ops-api/**`
- Create: `apps/workers/**`
- Create: `apps/payment-worker/**`
- Create: `apps/notification-worker/**`
- Create: `apps/chart-worker/**`

- [x] Add minimal Vite React shells for frontend apps.
- [x] Add minimal Nest `/health` endpoints for API apps.
- [x] Add worker readiness shells for worker apps.

### Task 3: Shared Package Shells

**Files:**
- Create: `packages/config/**`
- Create: `packages/contracts/**`
- Create: `packages/db/**`
- Create: `packages/domain/**`
- Create: `packages/auth/**`
- Create: `packages/validation/**`
- Create: `packages/i18n/**`
- Create: `packages/observability/**`
- Create: `packages/testing/**`
- Create: `packages/design-system/**`

- [x] Add focused package entrypoints.
- [x] Add small behavior tests for foundational helpers.
- [x] Keep packages independent from `apps/*`.

### Task 4: Local Infra and Docs

**Files:**
- Create: `.env.example`
- Create: `docker-compose.yml`
- Create: `docs/development/local-setup.md`
- Create: `docs/development/agent-workflow.md`

- [x] Provide PostgreSQL and Redis local services.
- [x] Document installation, verification, and parallel-agent workflow.

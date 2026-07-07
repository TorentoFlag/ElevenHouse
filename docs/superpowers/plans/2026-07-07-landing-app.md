# Landing App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `apps/landing` as a separate React/Vite acquisition frontend that visually follows `ElevenHouseDesign/app/landing*.jsx` while keeping production boundaries.

**Architecture:** The app is a standalone package under `apps/landing`, with focused section components, static typed content, lazy visual effects, and CTA links into `astrologer-web` registration. It does not copy prototype `window.*`, localStorage, mock runtime routing, or business state.

**Tech Stack:** React 19, Vite 8, TypeScript 6, Vitest, local CSS modules/global CSS, existing workspace scripts.

---

### Task 1: Package Scaffold And Smoke Test

**Files:**
- Create: `apps/landing/package.json`
- Create: `apps/landing/index.html`
- Create: `apps/landing/tsconfig.json`
- Create: `apps/landing/vite.config.ts`
- Create: `apps/landing/src/app-title.ts`
- Create: `apps/landing/src/App.test.tsx`
- Create: `apps/landing/src/App.tsx`
- Create: `apps/landing/src/main.tsx`

- [ ] Write a failing Vitest smoke test for the package title and section inventory.
- [ ] Run `pnpm test apps/landing/src/App.test.tsx` and confirm it fails because files do not exist yet.
- [ ] Add the package scaffold and minimal app exports.
- [ ] Re-run the same test and confirm it passes.

### Task 2: Landing Visual System And Sections

**Files:**
- Create: `apps/landing/src/content/landingContent.ts`
- Create: `apps/landing/src/components/Icon.tsx`
- Create: `apps/landing/src/components/Logo.tsx`
- Create: `apps/landing/src/components/CosmosScene.tsx`
- Create: `apps/landing/src/components/FeatureVisual.tsx`
- Create: `apps/landing/src/components/sections/*.tsx`
- Create: `apps/landing/src/styles.css`
- Modify: `apps/landing/src/App.tsx`

- [ ] Write a failing test that asserts required section ids and CTA URLs.
- [ ] Implement static content and section components from the design reference.
- [ ] Implement CSS tokens, glass panels, cosmic background, responsive grids, pricing cards, FAQ, footer, and modal visuals to match the reference.
- [ ] Re-run targeted tests.

### Task 3: Workspace Docs And Verification

**Files:**
- Modify: `docs/architecture/repository-structure.md`
- Modify: `docs/architecture/design-reference-inventory.md`

- [ ] Document `apps/landing` as the acquisition frontend.
- [ ] Run `pnpm --filter @elevenhouse/landing typecheck`.
- [ ] Run `pnpm --filter @elevenhouse/landing build`.
- [ ] Run `git diff --check`.
- [ ] If browser validation is possible without managing local processes, compare reference and implementation screenshots; otherwise report the local-process blocker.

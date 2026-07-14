# Numerology Saved Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete saved, manual-create, replacement-recalculate, and archive workflows inside the existing Numerology workspace.

**Architecture:** Reuse existing calculation list/create/recalculate/archive endpoints and keep all arithmetic server-side. Add a focused pure workspace model plus three small UI components, while the existing page controller owns mutation orchestration and explicit state transitions.

**Tech Stack:** React 19, TypeScript 6, TanStack Query 5, Vitest 4, CSS Modules, ElevenHouse design system and shared contracts.

## Global Constraints

- Work directly in `main`, as explicitly requested by the user.
- Preserve the canonical toolbar and three-column result workspace.
- Do not add a setup modal, settings page, method selector, version history, or client-side arithmetic.
- Selecting a CRM client or saved calculation is side-effect free.
- Manual participants never create CRM clients.
- Recalculation replaces the current record and invalidates stale derived content through the existing backend lifecycle.
- Archive uses the existing auditable endpoint; do not implement hard deletion.
- Do not change local service lifecycle without a new explicit user command.
- Every production behavior follows RED-GREEN-REFACTOR.

---

### Task 1: Saved Workspace Model

**Files:**

- Create: `apps/astrologer-web/src/features/numerology/model/numerologySavedWorkspaceModel.ts`
- Create: `apps/astrologer-web/src/features/numerology/model/numerologySavedWorkspaceModel.test.ts`

**Interfaces:**

- Produces `NumerologyEditorMode`, `NumerologyEditorState`, `getActiveNumerologyCalculations`, `toSavedCalculationListItem`, `createNewNumerologyEditorState`, `createRecalculationEditorState`, `updateNumerologyEditorParticipant`, `toNumerologyCreateRequest`, and `toNumerologyRecalculateRequest`.
- Consumes existing `NumerologyFormState`, `toCreateNumerologyRequest`, `toNumerologyFormState`, and shared calculation contracts.

- [ ] **Step 1: Write failing tests** for filtering archived records, updated-at descending order, active labels, blank manual creation, rehydrated recalculation, immutable participant/source updates, and create/recalculate request projection.
- [ ] **Step 2: Run RED:** `pnpm test apps/astrologer-web/src/features/numerology/model/numerologySavedWorkspaceModel.test.ts`; expect module-not-found or missing-export failures.
- [ ] **Step 3: Implement the pure model** with discriminated editor mode (`create | recalculate`), a complete `NumerologyFormState` draft, field-level validation based on `getNumerologyFormErrors`, and request projection that includes title for both create and replacement recalculation.
- [ ] **Step 4: Run GREEN** with the Step 2 command and expect all model cases to pass.
- [ ] **Step 5: Commit:** stage only the model and test, then commit `feat: model Numerology saved workspace`.

### Task 2: Archive Query Boundary

**Files:**

- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyQueries.ts`
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyHooks.ts`
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyQueries.test.ts`

**Interfaces:**

- Produces `archiveNumerologyMutationOptions(queryClient)` and `useArchiveNumerologyMutation()`.
- Consumes the existing `archiveCalculation(calculationId)` API and `calculationsQueryKeys.all()` invalidation prefix.

- [ ] **Step 1: Add a failing query-options test** asserting the archive mutation calls the generic API with the calculation ID and invalidates `calculationsQueryKeys.all()` on success.
- [ ] **Step 2: Run RED:** `pnpm test apps/astrologer-web/src/features/numerology/model/numerologyQueries.test.ts`; expect the archive option export to be missing.
- [ ] **Step 3: Implement the mutation option and hook** following the existing link/publish invalidation pattern.
- [ ] **Step 4: Run GREEN** with the Step 2 command.
- [ ] **Step 5: Commit:** stage the three files and commit `feat: expose Numerology archive mutation`.

### Task 3: Saved Menu And Inline Editor Components

**Files:**

- Create: `apps/astrologer-web/src/pages/numerology/NumerologyCalculationMenu.tsx`
- Create: `apps/astrologer-web/src/pages/numerology/NumerologyCalculationEditor.tsx`
- Create: `apps/astrologer-web/src/pages/numerology/NumerologyArchiveDialog.tsx`
- Create: `apps/astrologer-web/src/pages/numerology/NumerologySavedWorkspace.module.css`
- Create: `apps/astrologer-web/src/pages/numerology/NumerologySavedWorkspace.test.tsx`

**Interfaces:**

- `NumerologyCalculationMenu` receives active list items, selected ID, disabled state, `onSelect`, and `onCreate`.
- `NumerologyCalculationEditor` receives editor state, CRM participant callbacks, immutable draft callbacks, validation errors, busy state, `onSubmit`, and `onCancel`.
- `NumerologyArchiveDialog` receives title, pending state, `onConfirm`, and `onClose`, and reuses the shared `Modal`.

- [ ] **Step 1: Write failing component tests** for saved titles/metadata/current selection, `Новый расчёт`, manual individual fields, compatibility partner fields, CRM/manual source switching, title editing, submit/cancel callbacks, archive confirmation, and pending disabled states.
- [ ] **Step 2: Run RED:** `pnpm test apps/astrologer-web/src/pages/numerology/NumerologySavedWorkspace.test.tsx`; expect missing-component failures.
- [ ] **Step 3: Implement the three focused components and CSS** with semantic labels, `aria-expanded`, `aria-current`, field-associated errors, keyboard-accessible native controls, and no numerology derivation.
- [ ] **Step 4: Run GREEN** with the Step 2 command.
- [ ] **Step 5: Commit:** stage only Task 3 files and commit `feat: add Numerology saved workspace controls`.

### Task 4: Page Controller Lifecycle

**Files:**

- Modify: `apps/astrologer-web/src/pages/numerology/useNumerologyPageController.ts`
- Modify: `apps/astrologer-web/src/pages/numerology/NumerologyPageView.tsx`
- Modify: `apps/astrologer-web/src/pages/numerology/NumerologyPage.module.css`
- Modify: `apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx`
- Modify: `apps/astrologer-web/src/pages/numerology/NumerologyPage.test.tsx`

**Interfaces:**

- Adds view props for editor state, archive target, open/create/recalculate/archive callbacks, draft updates, manual participant updates, and explicit submit/cancel.
- Uses the existing create and recalculate mutations plus Task 2 archive mutation.
- Uses Task 1 model projections and Task 3 presentation components.

- [ ] **Step 1: Replace obsolete negative view assertions with failing lifecycle tests** proving the toolbar exposes calculations/new/recalculate/archive, editor replaces only the center workspace, saved selection calls `onSelectSaved`, and archived/current states disable forbidden actions.
- [ ] **Step 2: Add failing controller tests/source assertions** proving create uses the explicit create mutation, replacement uses the recalculate mutation and same ID, archive clears or selects the next active record, and CRM/saved selection never invokes create/recalculate/archive.
- [ ] **Step 3: Run RED:** `pnpm test apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx apps/astrologer-web/src/pages/numerology/NumerologyPage.test.tsx`; expect missing props/actions and old UI failures.
- [ ] **Step 4: Implement controller state transitions**: invalidate preview on editor/open; keep last result behind editor; submit create/recalculate explicitly; keep editor on error; confirm archive; remove auto-selection side effects beyond opening an already returned list record.
- [ ] **Step 5: Integrate components in the view** while retaining the existing result branch and `.workspaceGrid`; render the editor as the alternative central workspace state and archive confirmation alongside the existing presentation dialog.
- [ ] **Step 6: Run GREEN** with the Step 3 command, then run all Numerology web tests: `pnpm test apps/astrologer-web/src/features/numerology apps/astrologer-web/src/pages/numerology`.
- [ ] **Step 7: Commit:** stage only Task 4 files and commit `feat: complete Numerology calculation lifecycle`.

### Task 5: Verification And Documentation

**Files:**

- Modify: `docs/api/api-boundaries.md` only if the visible lifecycle contract needs clarification.
- Modify: `docs/superpowers/specs/2026-07-14-numerology-production-completion-design.md` to record Phase 3 evidence.

**Interfaces:**

- Produces reproducible automated and browser evidence for create, reopen, replace and archive.

- [ ] **Step 1: Run focused tests:** `pnpm test apps/astrologer-web/src/features/numerology apps/astrologer-web/src/pages/numerology`; expect PASS.
- [ ] **Step 2: Run package gates:** `pnpm --filter @elevenhouse/astrologer-web typecheck` and `pnpm exec eslint` on changed TypeScript/TSX files; expect zero errors.
- [ ] **Step 3: Run formatting and diff checks:** `pnpm exec prettier --check` on changed code/docs and `git diff --check`; expect clean output.
- [ ] **Step 4: Use Computer Use on the existing authorized production tab** to create a manual individual record, reopen it, recalculate it in place, create compatibility data, archive a disposable record, and confirm client/saved selection is side-effect free.
- [ ] **Step 5: Update the completion design** with exact test commands and browser evidence, clearly recording any unavailable browser surface as blocked rather than substituting another browser.
- [ ] **Step 6: Run the repository verification gate:** `pnpm verify`; expect PASS or report unrelated pre-existing failures with exact evidence.
- [ ] **Step 7: Commit:** stage only Phase 3 documentation/evidence and commit `docs: record Numerology lifecycle evidence`.

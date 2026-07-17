# Numerology Preview, Linking, And Archive-As-Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Numerology preview available for manual participants, persist only calculations containing at least one CRM client, and present the existing archive mutation as `Удалить расчёт` in the astrologer UI.

**Architecture:** Keep preview and persistence as separate validated contracts. The frontend editor always previews new input, while the existing link action performs the explicit create-and-link mutation for previews containing CRM participants. Preserve the current archive API and database status transition, but derive one destructive delete action and consistent confirmation copy in the frontend.

**Tech Stack:** TypeScript, Zod contracts, NestJS, React 19, TanStack Query, Vitest, PostgreSQL-backed calculation adapters, ElevenHouse design system.

## Global Constraints

- Work in the existing shared `main` checkout; do not create a branch, worktree, stash or broad staging operation.
- Preserve all unowned dirty-tree changes and reread every target file plus its scoped diff immediately before editing.
- Preview accepts manual/manual, CRM/manual, manual/CRM and CRM/CRM participant combinations.
- Persistence requires at least one `source = crm_client` participant.
- New calculations use `Рассчитать`; persistence occurs only through the explicit link action.
- Manual participants never create or update CRM clients.
- `Удалить расчёт` continues to call `POST /calculations/:calculationId/archive`; physical deletion is out of scope.
- Do not add a schema migration, worker, localStorage state, frontend arithmetic or a new design-system component.
- No commit or staging operation is authorized by this task; commit steps remain conditional on later explicit authority.

---

## File Map

- `packages/contracts/src/numerology.ts`: preview/persist/recalculate request invariants.
- `packages/contracts/src/numerology.test.ts`: contract matrix for zero/one/two CRM participants.
- `apps/astrologer-api/src/modules/numerology/numerology.service.test.ts`: persistence rejection and mixed-link behavior.
- `apps/astrologer-api/src/modules/numerology/numerology.e2e.test.ts`: HTTP validation and persisted-link response.
- `apps/astrologer-web/src/features/numerology/model/numerologyFormModel.ts`: participant validation, CRM counting, title derivation and independent request projection.
- `apps/astrologer-web/src/features/numerology/model/numerologyFormModel.test.ts`: preview/persist/recalculate model behavior.
- `apps/astrologer-web/src/features/numerology/model/numerologySavedWorkspaceModel.ts`: create-editor prefill, preview errors and linked-only active list.
- `apps/astrologer-web/src/features/numerology/model/numerologySavedWorkspaceModel.test.ts`: editor and legacy-unlinked filtering behavior.
- `apps/astrologer-web/src/features/numerology/model/numerologyToolbarActionsModel.ts`: link-versus-delete action derivation and danger tone.
- `apps/astrologer-web/src/features/numerology/model/numerologyToolbarActionsModel.test.ts`: toolbar action state matrix.
- `apps/astrologer-web/src/pages/numerology/NumerologyCalculationEditor.tsx`: preview-only create copy and title visibility.
- `apps/astrologer-web/src/pages/numerology/NumerologyArchiveDialog.tsx`: approved delete confirmation copy.
- `apps/astrologer-web/src/pages/numerology/NumerologyCalculationMenu.tsx`: consistent delete wording in the saved list.
- `apps/astrologer-web/src/pages/numerology/NumerologySavedWorkspace.test.tsx`: editor and modal observable behavior.
- `apps/astrologer-web/src/pages/numerology/NumerologyPageView.tsx`: action-menu handler/tone mapping.
- `apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx`: menu ids, callbacks, icon and destructive treatment.
- `apps/astrologer-web/src/pages/numerology/useNumerologyPageController.ts`: create-editor preview, prefill, link persistence and archive orchestration.

---

### Task 1: Enforce The Persistence Boundary In Shared Contracts And API

**Files:**

- Modify: `packages/contracts/src/numerology.ts`
- Modify: `packages/contracts/src/numerology.test.ts`
- Modify: `apps/astrologer-api/src/modules/numerology/numerology.service.test.ts`
- Modify: `apps/astrologer-api/src/modules/numerology/numerology.e2e.test.ts`

**Interfaces:**

- Consumes: existing `numerologyParticipantRequestSchema`, preview/persist/recalculate unions and `NumerologyService.createCalculation`.
- Produces: `persistNumerologyCalculationRequestSchema` that rejects requests whose participants contain no `crm_client`; preview and recalculate schemas remain unchanged.

- [ ] **Step 1: Write failing contract tests for the participant matrix**

Add a manual participant fixture and assertions equivalent to:

```ts
const manualPartner = {
  role: "partner",
  source: "manual",
  clientId: null,
  displayName: "Мария",
  calculationName: "Мария",
  calculationNameSource: "manual_entry",
  birthDate: "1990-03-14"
} as const;

expect(previewNumerologyRequestSchema.safeParse(manualCompatibility).success).toBe(true);
expect(
  persistNumerologyCalculationRequestSchema.safeParse({
    ...manualCompatibility,
    title: "Мария + Алексей"
  }).success
).toBe(false);
expect(
  persistNumerologyCalculationRequestSchema.safeParse({
    ...manualCompatibility,
    title: "Антон + Мария",
    participants: [individualPreviewRequest.participants[0], manualPartner]
  }).success
).toBe(true);
```

- [ ] **Step 2: Run the contract test and confirm RED**

Run:

```bash
pnpm test packages/contracts/src/numerology.test.ts
```

Expected: FAIL because the current persist schema accepts manual-only participants.

- [ ] **Step 3: Add the persist-only Zod refinement**

Build the persist union first and refine only that value:

```ts
const persistNumerologyCalculationRequestBaseSchema = z.discriminatedUnion("mode", [
  individualRequestSchema("required"),
  compatibilityRequestSchema("required")
]);

export const persistNumerologyCalculationRequestSchema =
  persistNumerologyCalculationRequestBaseSchema.superRefine((value, ctx) => {
    if (value.participants.some((participant) => participant.source === "crm_client")) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["participants"],
      message: "Persisted numerology calculation requires at least one CRM client"
    });
  });
```

Do not apply this refinement to preview or recalculation.

- [ ] **Step 4: Update service and HTTP tests**

Replace saved manual-individual fixtures with CRM-backed fixtures where the test is about persistence, recalculation, AI or PDF rather than preview. Add one mixed compatibility service test that expects:

```ts
expect(response.calculation.links).toEqual([expect.objectContaining({ clientId })]);
expect(store.create).toHaveBeenCalledWith(expect.objectContaining({ linkClientIds: [clientId] }));
```

Add an HTTP assertion that manual-only `POST /numerology/calculations` returns `400 NUMEROLOGY_VALIDATION_FAILED`, while `POST /numerology/preview` with the same participants remains successful.

- [ ] **Step 5: Run targeted contract and API tests**

Run:

```bash
pnpm test packages/contracts/src/numerology.test.ts
pnpm test apps/astrologer-api/src/modules/numerology/numerology.service.test.ts
pnpm test apps/astrologer-api/src/modules/numerology/numerology.e2e.test.ts
```

Expected: all targeted tests PASS with zero-CRM persistence rejected and mixed persistence linked once.

- [ ] **Step 6: Conditional review checkpoint**

Review scoped diffs and `git diff --check`. Do not stage or commit without a later explicit user instruction.

---

### Task 2: Separate Preview And Persistence In The Frontend Model

**Files:**

- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyFormModel.ts`
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyFormModel.test.ts`
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologySavedWorkspaceModel.ts`
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologySavedWorkspaceModel.test.ts`
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyPageModel.ts`

**Interfaces:**

- Produces: `getNumerologyPreviewErrors(state)`, `getNumerologyPersistErrors(state)`, `countNumerologyCrmParticipants(state)`, `getNumerologyCalculationTitle(state)`, independent `toPreviewNumerologyRequest(state, period?)`, `toCreateNumerologyRequest(state)` and `toRecalculateNumerologyRequest(state)`.
- Produces: `createNewNumerologyEditorState(prefilledSubject?)` and an active-list filter requiring at least one client link.

- [ ] **Step 1: Write failing model tests**

Cover these observable outcomes:

```ts
expect(getNumerologyPreviewErrors(validManualStateWithoutTitle())).toEqual([]);
expect(() => toPreviewNumerologyRequest(validManualStateWithoutTitle())).not.toThrow();
expect(getNumerologyPersistErrors(validManualStateWithoutTitle())).toContain(
  "Выберите хотя бы одного CRM-клиента"
);
expect(toCreateNumerologyRequest(mixedStateWithoutTitle()).title).toBe(
  "Антон + Мария, совместимость"
);
expect(getActiveNumerologyCalculations([unlinked, linked]).map(({ id }) => id)).toEqual([
  linked.id
]);
```

Also prove that a prefilled CRM subject is copied into a new editor without mutating the original form state.

- [ ] **Step 2: Run model tests and confirm RED**

Run:

```bash
pnpm test apps/astrologer-web/src/features/numerology/model/numerologyFormModel.test.ts
pnpm test apps/astrologer-web/src/features/numerology/model/numerologySavedWorkspaceModel.test.ts
```

Expected: FAIL because title is currently mandatory, preview delegates through persist projection and unlinked records remain active.

- [ ] **Step 3: Refactor request projection without a persist dependency**

Create a shared participant/period projection that contains no title. Parse it directly with `previewNumerologyRequestSchema`. For persistence, add the derived title and parse with `createNumerologyCalculationRequestSchema`. For recalculation, parse with `recalculateNumerologyCalculationRequestSchema` so legacy manual-only records can still be rehydrated safely until they are hidden/archived.

Move the title function from `numerologyPageModel.ts` into `numerologyFormModel.ts`:

```ts
export function getNumerologyCalculationTitle(state: NumerologyFormState): string {
  const subjectName = state.subject.displayName || state.subject.fullName || "Клиент";
  if (state.mode === "compatibility") {
    const partnerName = state.partner.displayName || state.partner.fullName || "Партнер";
    return `${subjectName} + ${partnerName}, совместимость`;
  }
  return `${subjectName}, психоматрица`;
}
```

Use `state.title.trim() || getNumerologyCalculationTitle(state)` only for persist/recalculate payloads.

- [ ] **Step 4: Split validation by user intent**

Participant and duplicate-client validation is shared. Preview validation does not require title or CRM participants. Persist validation adds `Выберите хотя бы одного CRM-клиента`. Recalculation validation requires the existing title but does not change participant identity rules.

- [ ] **Step 5: Prefill create editor and hide legacy unlinked records**

Allow `createNewNumerologyEditorState` to accept a CRM participant and copy it into `form.subject`. Update `getActiveNumerologyCalculations` to require:

```ts
calculation.module === "numerology" &&
  calculation.status !== "archived" &&
  calculation.links.length > 0;
```

- [ ] **Step 6: Run targeted model tests**

Run the two commands from Step 2. Expected: PASS.

- [ ] **Step 7: Conditional review checkpoint**

Review scoped diffs and `git diff --check`. Do not stage or commit without explicit authority.

---

### Task 3: Derive Link And Delete Toolbar States

**Files:**

- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyToolbarActionsModel.ts`
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyToolbarActionsModel.test.ts`
- Modify: `apps/astrologer-web/src/pages/numerology/NumerologyPageView.tsx`
- Modify: `apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx`
- Modify: `apps/astrologer-web/src/pages/numerology/NumerologyCalculationMenu.tsx`
- Modify: `apps/astrologer-web/src/pages/numerology/NumerologyArchiveDialog.tsx`
- Modify: `apps/astrologer-web/src/pages/numerology/NumerologySavedWorkspace.test.tsx`

**Interfaces:**

- Produces: `NumerologyToolbarActionId = "presentation" | "link" | "delete" | "pdf"` and `tone: "default" | "danger"` on every derived action.
- Consumes: existing `onLink` and `onRequestArchive` callbacks; existing `ActionMenuItem.tone` and design-system `trash` icon.

- [ ] **Step 1: Write failing toolbar and component tests**

For linked state expect:

```ts
expect(actions[1]).toEqual({
  id: "delete",
  label: "Удалить расчёт",
  iconName: "trash",
  tone: "danger",
  disabled: false,
  description: null
});
```

Assert the linked page maps `delete` to `onRequestArchive`, the menu item carries `tone: "danger"`, the saved-calculation disclosure says `Удалить расчёт`, and the modal copy/buttons are exactly:

```text
Удалить расчёт?
«<название>» исчезнет из рабочего пространства. Восстановить его через интерфейс не получится.
Удалить
Удаление…
Отмена
```

- [ ] **Step 2: Run tests and confirm RED**

Run:

```bash
pnpm test apps/astrologer-web/src/features/numerology/model/numerologyToolbarActionsModel.test.ts
pnpm test apps/astrologer-web/src/pages/numerology/NumerologySavedWorkspace.test.tsx
pnpm test apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx
```

Expected: FAIL on the existing disabled `Привязано к клиенту` row and archive wording.

- [ ] **Step 3: Implement the pure action model**

Add `trash` to the icon union and `tone` to `NumerologyToolbarAction`. Return `delete` only when `isCalculationLinked`; disable it only while `isBusy` and expose `Действие выполняется` as the disabled reason.

- [ ] **Step 4: Wire the page without JSX-owned state rules**

Map handlers as:

```ts
const toolbarActionHandlers = {
  presentation: onOpenPresentation,
  link: onLink,
  delete: onRequestArchive,
  pdf: onPdf
} satisfies Readonly<Record<NumerologyToolbarActionId, () => void>>;
```

Forward `action.tone` to `ActionMenuItem.tone` and keep icons decorative.

- [ ] **Step 5: Update existing archive surfaces with approved user copy**

Change visible labels only; retain prop names, mutation names and backend archive terminology. Pending modal state keeps destructive and cancel controls disabled.

- [ ] **Step 6: Run targeted UI tests**

Run the three commands from Step 2. Expected: PASS.

- [ ] **Step 7: Conditional review checkpoint**

Review exact UI diffs and `git diff --check`; do not stage or commit.

---

### Task 4: Make New Calculation Preview-First And Link-To-Save

**Files:**

- Modify: `apps/astrologer-web/src/pages/numerology/NumerologyCalculationEditor.tsx`
- Modify: `apps/astrologer-web/src/pages/numerology/useNumerologyPageController.ts`
- Modify: `apps/astrologer-web/src/pages/numerology/useNumerologyPageController.test.tsx`
- Modify: `apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx`

**Interfaces:**

- Consumes: Task 2 preview/persist/recalculate projection and validation functions.
- Produces: create-editor submit that calls only `previewMutation`; recalculate submit that calls only `recalculateMutation`; toolbar link that calls `createMutation` for a CRM-backed preview.

- [ ] **Step 1: Write failing editor/controller behavior tests**

Assert create editor copy and state:

```ts
expect(findButton(editorView, "Рассчитать")).toBeDefined();
expect(findOptionalInput(editorView, "Название расчёта")).toBeNull();
expect(findButton(pendingEditorView, "Расчёт…").props.disabled).toBe(true);
```

Extract focused pure controller helpers if necessary so tests can prove:

- create submit sends `PreviewNumerologyRequest` and returns preview state;
- recalculation keeps its persisted request and title;
- open-create prefills the current CRM subject;
- link is skipped for manual-only preview and persists a mixed/CRM preview;
- create/link failures preserve editor or preview respectively.

- [ ] **Step 2: Run controller/editor tests and confirm RED**

Run:

```bash
pnpm test apps/astrologer-web/src/pages/numerology/NumerologySavedWorkspace.test.tsx
pnpm test apps/astrologer-web/src/pages/numerology/useNumerologyPageController.test.tsx
pnpm test apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx
```

Expected: FAIL because create submit currently calls `createMutation` and requires a title.

- [ ] **Step 3: Update editor presentation**

Render the title field only for `editor.kind === "recalculate"`. Use create labels `Рассчитать` / `Расчёт…`; preserve `Пересчитать` / `Пересчёт…` for recalculation. Replace the create explanatory copy with `Ручные участники используются только для текущего расчёта и не создают CRM-клиентов.`

- [ ] **Step 4: Update controller orchestration**

`openCreateEditor` passes the current CRM subject when present. `submitEditor` branches before request projection:

```ts
if (editorState.kind === "create") {
  const response = await previewMutation.mutateAsync(toNumerologyPreviewRequest(editorState));
  setSelectedResponse(null);
  setPreviewResult(response.result);
  setFormState(editorState.form);
} else {
  // existing replacement recalculation path
}
setEditorState(null);
setEditorErrors([]);
```

The existing `onLink` preview branch remains the sole create mutation and uses the derived title from Task 2. Guard it with the CRM participant count so manual-only previews never send a persist request.

- [ ] **Step 5: Preserve async and error guarantees**

Invalidate stale preview/AI guards when opening/submitting the editor, keep editor inputs on preview failure, keep preview on link failure, and continue selecting the next active linked calculation after archive success.

- [ ] **Step 6: Run targeted frontend tests**

Run the three commands from Step 2 plus:

```bash
pnpm test apps/astrologer-web/src/features/numerology/model/numerologyPageModel.test.ts
pnpm test apps/astrologer-web/src/features/numerology/model/numerologyCompatibilityFlowModel.test.ts
```

Expected: PASS.

- [ ] **Step 7: Conditional review checkpoint**

Review controller/model/UI diffs together and run `git diff --check`; do not stage or commit.

---

### Task 5: Verify The Affected Surface And Runtime Flow

**Files:**

- Modify if current truth changed: `docs/architecture/design-reference-inventory.md`
- Evidence only: `.design-qa/numerology-preview-link-archive/`

**Interfaces:**

- Consumes: completed Tasks 1–4.
- Produces: automated, runtime, accessibility and design-parity evidence without changing process lifecycle.

- [ ] **Step 1: Run focused test suites**

```bash
pnpm test packages/contracts/src/numerology.test.ts
pnpm test apps/astrologer-api/src/modules/numerology/numerology.service.test.ts
pnpm test apps/astrologer-api/src/modules/numerology/numerology.e2e.test.ts
pnpm test apps/astrologer-web/src/features/numerology/model/numerologyFormModel.test.ts
pnpm test apps/astrologer-web/src/features/numerology/model/numerologySavedWorkspaceModel.test.ts
pnpm test apps/astrologer-web/src/features/numerology/model/numerologyToolbarActionsModel.test.ts
pnpm test apps/astrologer-web/src/pages/numerology/NumerologySavedWorkspace.test.tsx
pnpm test apps/astrologer-web/src/pages/numerology/useNumerologyPageController.test.tsx
pnpm test apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx
```

Expected: all PASS.

- [ ] **Step 2: Run affected package gates**

```bash
pnpm --filter @elevenhouse/contracts typecheck
pnpm --filter @elevenhouse/astrologer-api typecheck
pnpm --filter @elevenhouse/astrologer-web typecheck
pnpm --filter @elevenhouse/astrologer-web build
```

Expected: all commands exit 0. If an unrelated dirty-tree failure occurs, preserve exact output and separate it from owned changes.

- [ ] **Step 3: Run documentation and diff checks**

```bash
pnpm docs:check:test
pnpm docs:check
git diff --check
```

Expected: all exit 0.

- [ ] **Step 4: Inspect existing runtime availability without process changes**

Use read-only `lsof`/`curl` for the documented ElevenHouse ports. Do not start, stop or restart frontend, API, worker, PostgreSQL, Redis or Docker.

- [ ] **Step 5: Exercise the real signed-in browser flow when available**

Using the existing Chrome tab and real network data:

1. create a manual/manual compatibility preview and verify no calculation POST, AI or PDF action;
2. create a CRM/manual compatibility preview and invoke `Привязать к клиенту`;
3. reload and verify the linked calculation remains in the saved list;
4. open `Действия`, activate `Удалить расчёт`, cancel once, then confirm;
5. verify the network mutation is the archive endpoint and the calculation disappears;
6. verify keyboard focus returns correctly and no unexpected console errors occur.

- [ ] **Step 6: Capture design-parity evidence**

Capture reference/production screenshots for linked action-menu closed/open and delete modal states at the reference viewport plus one responsive viewport. Record the intentional business difference from the supplied screenshot: the disabled `Привязано к клиенту` row is now an enabled danger `Удалить расчёт` row with trash icon.

- [ ] **Step 7: Final scoped review**

Review owned diffs, current `git status --short`, cached diff, test evidence, skipped/blocked runtime checks and unowned modifications. Do not stage or commit without explicit authority.

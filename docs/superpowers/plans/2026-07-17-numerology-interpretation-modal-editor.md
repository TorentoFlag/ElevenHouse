# Numerology Interpretation Modal Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. ElevenHouse shared-main policy forbids worktrees, branches, staging, and commits without direct authority.

**Goal:** Replace the narrow inline Numerology interpretation textarea with a large accessible modal editor opened from the compact AI disclosure while preserving the existing checksum-safe draft and approval workflow.

**Architecture:** Keep `interpretationText`, dirty state, mutation state, and callbacks in the existing Numerology controller/model contour. `NumerologyInterpretationEditor` owns only disclosure/modal presentation state and composes a new app-owned `NumerologyInterpretationModal`; the shared design system gains only a generic optional initial-focus target and a reusable `expand` icon.

**Tech Stack:** React 19, TypeScript 6, CSS Modules, ElevenHouse design-system `Modal`/`IconButton`/`Tooltip`/`Button`, shared i18n dictionary, Vitest with jsdom for interaction tests, Computer Use in the existing Chrome session.

## Progress

- 2026-07-17: Tasks 1–5 implemented through behavioral RED → GREEN cycles.
- 2026-07-17: Modal focus, icon registry, RU/EN copy, modal semantics/geometry,
  same-buffer close/reopen, AI/expand separation, Save/Approve behavior, and both
  Numerology modes are covered by focused tests.
- 2026-07-17: design-system and astrologer-web targeted tests, typechecks, and
  builds passed.
- 2026-07-17: ports 5174, 3002, and 8000 were confirmed available read-only.
- 2026-07-17: Runtime E2E and Design Parity are blocked because the Computer Use
  Sky service failed to start. No replacement browser context was opened and no
  process lifecycle was changed.

## Surprises & Discoveries

- The original `IconButton` does not forward refs, so exact return-focus uses the
  opening event target and an enabled expand-button fallback.
- The existing shared `Modal` already owned focus trapping, Escape, scroll lock,
  and generic return focus; only a contained initial-focus target was missing.
- The compatibility static test counts all `aria-expanded` controls, so the new
  closed interpretation disclosure adds one legitimate false state.

## Decision Log

- 2026-07-17: Keep the editor text controller-owned; modal open/closed state is
  presentation-only.
- 2026-07-17: Keep Save and Approve open after invocation and preserve all
  existing checksum/persistence callbacks.
- 2026-07-17: Do not substitute a fresh browser context when Computer Use cannot
  attach; report runtime/visual acceptance as blocked.

## Outcomes & Retrospective

The narrow inline textarea has been replaced in code by the approved compact
action row and large shared-buffer modal. Automated behavior, accessibility
contracts, typechecks, builds, and the full repository gate pass. Runtime E2E,
network inspection, screenshots, computed-style comparison, and manual
responsive/keyboard acceptance remain blocked only by unavailable Computer Use.

## Context and Orientation

The owning route is `/numerology` in `apps/astrologer-web`. The page controller
continues to own interpretation text, dirty state, mutations, and checksum-safe
server behavior. `NumerologyInterpretationEditor` owns disclosure and modal-open
presentation state; `NumerologyInterpretationModal` owns only composition.

## Interfaces and Dependencies

The app consumes the shared `Modal`, `Button`, `IconButton`, `Tooltip`, and
`Icon` APIs. The only shared API extension is optional `Modal.initialFocusRef`;
the only shared visual addition is the registered `expand` icon. No contract,
API, domain, DB, worker, or deployment interface changed.

## Plan of Work

Tasks 1–5 below describe the completed TDD slices. Task 6 describes the
automated gates and the browser/design evidence that remains blocked.

## Concrete Steps

Exact commands and expected observations are preserved under each task below;
their final results are summarized in Progress and the evidence artifact.

## Validation and Acceptance

Fresh `pnpm verify` passed lint, 33/33 typecheck tasks, 409/409 test files with
1787/1787 tests, and 23/23 build tasks. Docs checks pass. Component tests cover
modal semantics, locale copy, initial/fallback/return focus, same-buffer reopen,
and distinct AI/expand actions. Browser-level acceptance is blocked.

## Idempotence and Recovery

All edits are source/test/docs changes and can be rechecked safely. No external
write, process lifecycle change, DB mutation, staging, commit, or push occurred.
The shared checkout remains recoverable through the exact owned diffs.

## Artifacts and Notes

Automated and blocked-evidence details are recorded in
`.design-qa/numerology-interpretation-modal-editor/evidence.md`. Screenshot
slots remain intentionally absent because no browser evidence was captured.

## Global Constraints

- Work in the existing checkout on `main`; do not create a branch or worktree.
- Do not stage or commit without separate authority; every task ends with exact-path diff/status inspection instead.
- Preserve unrelated shared-main calendar work and reread every target file plus `git diff -- <path>` immediately before each edit group.
- Do not start, stop, reload, restart, or kill frontend, API, workers, Docker, PostgreSQL, Redis, queues, or browser processes.
- Preserve current Numerology AI generation, checksum, persistence, approval, archive, publication, PDF, and error contracts.
- Do not add local storage, autosave, fake success, a second interpretation buffer, a new API, or backend changes.
- The inline disclosure keeps the exact approved Numerology reference language; the modal is the user-approved production extension and must reuse established ElevenHouse modal tokens.
- Desktop modal geometry is `width: min(840px, calc(100vw - 48px))` and `height: min(720px, calc(100dvh - 48px))`.
- Mobile at `640px` and below uses a `16px` inset and `height: calc(100dvh - 32px)`; actions stack at `360px` and below.
- Editor typography is `16px` with `line-height: 1.6`; textarea resizing is disabled.
- New or changed copy must exist in RU and EN.
- Runtime and visual acceptance require real network/browser evidence; unavailable services leave those checks blocked.

---

## File Map

- Modify `packages/design-system/src/components/Modal/types.ts`: add the backward-compatible `initialFocusRef` prop.
- Modify `packages/design-system/src/components/Modal/Modal.tsx`: prefer a validated in-dialog initial focus target.
- Create `packages/design-system/src/components/Modal/helpers/getInitialFocusElement.ts`: pure focus-target selection.
- Create `packages/design-system/src/components/Modal/helpers/getInitialFocusElement.test.ts`: target/fallback containment tests.
- Create `packages/design-system/src/components/Modal/Modal.focus.test.tsx`: real jsdom focus and return-focus behavior.
- Create `packages/design-system/src/icons/Expand/Expand.tsx`, `Expand.test.tsx`, and `index.ts`: reusable maximize-style glyph.
- Modify `packages/design-system/src/icons/Icon/iconRegistry.ts`, `packages/design-system/src/icons/Icon/Icon.test.tsx`, `packages/design-system/src/icons/index.ts`, and `packages/design-system/src/index.test.ts`: register/export/prove `expand`.
- Modify `apps/astrologer-web/src/common/i18n/astrologerCopy.ts` and `.test.ts`: add typed RU/EN Numerology interpretation copy.
- Create `apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationModal.tsx`: app-owned long-form editor modal.
- Create `apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationModal.module.css`: desktop/mobile modal geometry and editor layout.
- Create `apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationModal.test.tsx`: semantics, copy, actions, and geometry evidence.
- Modify `apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationEditor.tsx`, `.test.tsx`, and `NumerologyComponents.module.css`: compact action row, expand trigger, same-buffer modal wiring, and no inline textarea.
- Modify `DetailPanel.tsx`, `CompatibilityWorkspace.tsx`, `NumerologyResultPanel.tsx`, their focused tests, and `NumerologyPageView.tsx`/`.test.tsx`: pass typed copy through both modes.
- Modify `docs/architecture/design-reference-inventory.md`: update implemented-state wording after evidence exists.
- Update this plan with progress, surprises, exact commands, and evidence paths.

---

### Task 1: Backward-Compatible Modal Initial Focus

**Files:**

- Create: `packages/design-system/src/components/Modal/helpers/getInitialFocusElement.ts`
- Create: `packages/design-system/src/components/Modal/helpers/getInitialFocusElement.test.ts`
- Create: `packages/design-system/src/components/Modal/Modal.focus.test.tsx`
- Modify: `packages/design-system/src/components/Modal/types.ts`
- Modify: `packages/design-system/src/components/Modal/Modal.tsx`

**Interfaces:**

- Consumes: existing `getFocusableElements(dialog: HTMLElement): HTMLElement[]`.
- Produces: `getInitialFocusElement(dialog, preferred): HTMLElement` and `ModalProps.initialFocusRef?: RefObject<HTMLElement | null>`.
- Invariant: preferred focus is accepted only when the referenced element is inside the active dialog; existing consumers keep first-focusable fallback.

- [ ] **Step 1: Reread shared-main targets and diffs**

Run:

```bash
sed -n '1,220p' packages/design-system/src/components/Modal/types.ts
sed -n '1,240p' packages/design-system/src/components/Modal/Modal.tsx
git diff -- packages/design-system/src/components/Modal
```

Expected: current `main` content; no overlapping unowned Modal edits.

- [ ] **Step 2: Write failing pure focus-selection tests**

Create `getInitialFocusElement.test.ts` with these behaviors:

```ts
import { describe, expect, it, vi } from "vitest";
import { getInitialFocusElement } from "./getInitialFocusElement.js";

describe("getInitialFocusElement", () => {
  it("prefers an explicit focus target contained by the dialog", () => {
    const preferred = { focus: vi.fn() } as unknown as HTMLElement;
    const fallback = { focus: vi.fn() } as unknown as HTMLElement;
    const dialog = {
      contains: vi.fn((candidate) => candidate === preferred),
      querySelectorAll: vi.fn(() => [fallback])
    } as unknown as HTMLElement;

    expect(getInitialFocusElement(dialog, preferred)).toBe(preferred);
  });

  it("falls back to the first focusable control when the preferred target is external", () => {
    const external = { focus: vi.fn() } as unknown as HTMLElement;
    const fallback = { focus: vi.fn() } as unknown as HTMLElement;
    const dialog = {
      contains: vi.fn(() => false),
      querySelectorAll: vi.fn(() => [fallback])
    } as unknown as HTMLElement;

    expect(getInitialFocusElement(dialog, external)).toBe(fallback);
  });

  it("falls back to the dialog when no focusable control exists", () => {
    const dialog = {
      contains: vi.fn(() => false),
      querySelectorAll: vi.fn(() => [])
    } as unknown as HTMLElement;

    expect(getInitialFocusElement(dialog, null)).toBe(dialog);
  });
});
```

- [ ] **Step 3: Run the pure test and verify RED**

Run:

```bash
pnpm test packages/design-system/src/components/Modal/helpers/getInitialFocusElement.test.ts
```

Expected: FAIL because `getInitialFocusElement.ts` does not exist.

- [ ] **Step 4: Implement focus selection and Modal prop**

Create:

```ts
import { getFocusableElements } from "./getFocusableElements.js";

export function getInitialFocusElement(
  dialog: HTMLElement,
  preferred: HTMLElement | null | undefined
): HTMLElement {
  if (preferred && dialog.contains(preferred)) return preferred;
  return getFocusableElements(dialog)[0] ?? dialog;
}
```

Add to `types.ts`:

```ts
import type { ReactNode, RefObject } from "react";

readonly initialFocusRef?: RefObject<HTMLElement | null>;
```

Destructure `initialFocusRef` in `Modal.tsx`, replace the current first-focusable block with:

```ts
requestAnimationFrame(() => {
  const dialog = dialogRef.current;
  if (!dialog) return;
  getInitialFocusElement(dialog, initialFocusRef?.current).focus();
});
```

and add `initialFocusRef` to the effect dependency list.

- [ ] **Step 5: Run the pure test and verify GREEN**

Run:

```bash
pnpm test packages/design-system/src/components/Modal/helpers/getInitialFocusElement.test.ts
```

Expected: PASS, three tests.

- [ ] **Step 6: Write and run the jsdom focus regression test**

Create `Modal.focus.test.tsx` using `createRoot`, a textarea ref, an external trigger, and an immediate `requestAnimationFrame` stub. Assert that opening focuses the textarea and unmount/close restores the trigger:

```tsx
// @vitest-environment jsdom
import { act, useRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it("focuses the preferred field and restores the trigger", () => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  const trigger = document.createElement("button");
  const container = document.createElement("div");
  document.body.append(trigger, container);
  trigger.focus();
  const root = createRoot(container);

  function Harness() {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    return (
      <Modal
        title="Трактовка"
        closeLabel="Закрыть"
        initialFocusRef={textareaRef}
        onClose={() => undefined}
      >
        <textarea ref={textareaRef} aria-label="Текст трактовки" />
      </Modal>
    );
  }

  act(() => root.render(<Harness />));
  expect(document.activeElement).toBe(document.querySelector("textarea"));
  act(() => root.unmount());
  expect(document.activeElement).toBe(trigger);
});
```

Run:

```bash
pnpm test packages/design-system/src/components/Modal/Modal.focus.test.tsx packages/design-system/src/components/Modal/Modal.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Verify the task diff without staging**

Run:

```bash
pnpm exec eslint packages/design-system/src/components/Modal
git diff --check -- packages/design-system/src/components/Modal
git diff -- packages/design-system/src/components/Modal
git status --short
```

Expected: only owned Modal files changed/created; unrelated calendar paths remain untouched.

---

### Task 2: Shared Expand Icon

**Files:**

- Create: `packages/design-system/src/icons/Expand/Expand.tsx`
- Create: `packages/design-system/src/icons/Expand/Expand.test.tsx`
- Create: `packages/design-system/src/icons/Expand/index.ts`
- Modify: `packages/design-system/src/icons/Icon/iconRegistry.ts`
- Modify: `packages/design-system/src/icons/Icon/Icon.test.tsx`
- Modify: `packages/design-system/src/icons/index.ts`
- Modify: `packages/design-system/src/index.test.ts`

**Interfaces:**

- Produces: `Expand(props?: SVGProps<SVGSVGElement>)` and `Icon` name `expand`.
- Visual contract: four outward corner strokes, `24x24` viewBox, currentColor, `1.7` stroke, round caps/joins.

- [ ] **Step 1: Reread icon targets and diffs**

Run:

```bash
sed -n '1,220p' packages/design-system/src/icons/Icon/iconRegistry.ts
sed -n '1,130p' packages/design-system/src/icons/Icon/Icon.test.tsx
git diff -- packages/design-system/src/icons packages/design-system/src/index.test.ts
```

- [ ] **Step 2: Write the failing Expand test and registry expectations**

Create `Expand.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { Expand } from "./Expand.js";

describe("Expand", () => {
  it("renders the maximize-style four-corner glyph", () => {
    const icon = Expand({ "aria-hidden": true });
    expect(icon.type).toBe("svg");
    expect(icon.props.viewBox).toBe("0 0 24 24");
    expect(icon.props["aria-hidden"]).toBe(true);
    expect(icon.props.children.map((child: { props: { d: string } }) => child.props.d)).toEqual([
      "M8 3H3v5",
      "M16 3h5v5",
      "M21 16v5h-5",
      "M3 16v5h5"
    ]);
  });
});
```

Add `"expand"` to the exact sorted registry expectation and assert `designSystem.Expand` in the root-export test.

- [ ] **Step 3: Run icon tests and verify RED**

Run:

```bash
pnpm test packages/design-system/src/icons/Expand/Expand.test.tsx packages/design-system/src/icons/Icon/Icon.test.tsx packages/design-system/src/index.test.ts
```

Expected: FAIL because the icon/export/registry entries do not exist.

- [ ] **Step 4: Implement and register the icon**

Create `Expand.tsx`:

```tsx
import type { SVGProps } from "react";

export type ExpandProps = SVGProps<SVGSVGElement>;

export function Expand(props: ExpandProps = {}) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M8 3H3v5" />
      <path d="M16 3h5v5" />
      <path d="M21 16v5h-5" />
      <path d="M3 16v5h5" />
    </svg>
  );
}
```

Export it from `Expand/index.ts` and `icons/index.ts`; import/register it as `expand` in `iconRegistry.ts`.

- [ ] **Step 5: Run icon tests and verify GREEN**

Run the Step 3 command again.

Expected: PASS.

- [ ] **Step 6: Verify the task diff without staging**

Run:

```bash
pnpm exec eslint packages/design-system/src/icons/Expand packages/design-system/src/icons/Icon
git diff --check -- packages/design-system/src/icons packages/design-system/src/index.test.ts
git diff -- packages/design-system/src/icons packages/design-system/src/index.test.ts
git status --short
```

---

### Task 3: Typed RU/EN Interpretation Copy

**Files:**

- Modify: `apps/astrologer-web/src/common/i18n/astrologerCopy.ts`
- Modify: `apps/astrologer-web/src/common/i18n/astrologerCopy.test.ts`

**Interfaces:**

- Produces: exported `NumerologyInterpretationCopy` and `AstrologerCopy["numerology"]["interpretation"]`.
- Exact fields: `sectionLabel`, `createAiDraftLabel`, `creatingAiDraftLabel`, `openEditorLabel`, `modalTitle`, `closeModalLabel`, `textLabel`, `individualPlaceholder`, `compatibilityPlaceholder`, `saveDraftLabel`, `approveLabel`.

- [ ] **Step 1: Reread i18n targets and diffs**

Run:

```bash
sed -n '1,220p' apps/astrologer-web/src/common/i18n/astrologerCopy.ts
git diff -- apps/astrologer-web/src/common/i18n/astrologerCopy.ts apps/astrologer-web/src/common/i18n/astrologerCopy.test.ts
```

- [ ] **Step 2: Write a failing copy contract test**

Add:

```ts
it("contains complete Numerology interpretation editor copy in both locales", () => {
  expect(astrologerCopyByLocale.ru.numerology.interpretation).toEqual({
    sectionLabel: "AI-разбор портрета",
    createAiDraftLabel: "Создать AI-черновик",
    creatingAiDraftLabel: "Создаём AI-черновик…",
    openEditorLabel: "Открыть редактор трактовки",
    modalTitle: "Трактовка нумерологического портрета",
    closeModalLabel: "Закрыть редактор трактовки",
    textLabel: "Текст трактовки",
    individualPlaceholder: "Введите трактовку для клиента",
    compatibilityPlaceholder: "Введите трактовку для пары",
    saveDraftLabel: "Сохранить черновик",
    approveLabel: "Утвердить"
  });
  expect(astrologerCopyByLocale.en.numerology.interpretation).toEqual({
    sectionLabel: "AI portrait interpretation",
    createAiDraftLabel: "Create AI draft",
    creatingAiDraftLabel: "Creating AI draft…",
    openEditorLabel: "Open interpretation editor",
    modalTitle: "Numerology portrait interpretation",
    closeModalLabel: "Close interpretation editor",
    textLabel: "Interpretation text",
    individualPlaceholder: "Enter an interpretation for the client",
    compatibilityPlaceholder: "Enter an interpretation for the pair",
    saveDraftLabel: "Save draft",
    approveLabel: "Approve"
  });
});
```

- [ ] **Step 3: Run the copy test and verify RED**

Run:

```bash
pnpm test apps/astrologer-web/src/common/i18n/astrologerCopy.test.ts
```

Expected: FAIL because `numerology.interpretation` is absent.

- [ ] **Step 4: Add the typed copy and locale entries**

Add:

```ts
export type NumerologyInterpretationCopy = {
  readonly sectionLabel: string;
  readonly createAiDraftLabel: string;
  readonly creatingAiDraftLabel: string;
  readonly openEditorLabel: string;
  readonly modalTitle: string;
  readonly closeModalLabel: string;
  readonly textLabel: string;
  readonly individualPlaceholder: string;
  readonly compatibilityPlaceholder: string;
  readonly saveDraftLabel: string;
  readonly approveLabel: string;
};
```

Add `numerology: { interpretation: NumerologyInterpretationCopy }` to `AstrologerCopy`, then add the exact RU/EN objects from the test next to the other page dictionaries.

- [ ] **Step 5: Run the copy test and verify GREEN**

Run the Step 3 command again.

Expected: PASS.

- [ ] **Step 6: Verify the task diff without staging**

Run:

```bash
pnpm exec eslint apps/astrologer-web/src/common/i18n/astrologerCopy.ts apps/astrologer-web/src/common/i18n/astrologerCopy.test.ts
git diff --check -- apps/astrologer-web/src/common/i18n
git diff -- apps/astrologer-web/src/common/i18n
git status --short
```

---

### Task 4: App-Owned Long-Form Interpretation Modal

**Files:**

- Create: `apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationModal.tsx`
- Create: `apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationModal.module.css`
- Create: `apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationModal.test.tsx`

**Interfaces:**

- Consumes: `NumerologyInterpretationCopy`, controller-owned `text`, existing pending/error/disabled props and callbacks.
- Produces: `NumerologyInterpretationModal(props)` with `open`, `copy`, `text`, `placeholder`, `isCreatingAiDraft`, `aiDraftErrorMessage`, `saveDisabled`, `approveDisabled`, `onClose`, `onTextChange`, `onSave`, and `onApprove`.
- Invariant: modal has no independent text state and performs no write on close.

- [ ] **Step 1: Confirm current component and CSS diffs**

Run:

```bash
sed -n '1,240p' apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationEditor.tsx
git diff -- apps/astrologer-web/src/features/numerology/components
```

- [ ] **Step 2: Write failing static and CSS contract tests**

Create tests that render the modal open with RU copy and assert:

```tsx
expect(markup).toContain('role="dialog"');
expect(markup).toContain("Трактовка нумерологического портрета");
expect(markup).toContain('<label');
expect(markup).toContain("Текст трактовки");
expect(markup).toContain('aria-label="Закрыть редактор трактовки"');
expect(markup).toContain("Сохранить черновик");
expect(markup).toContain("Утвердить");
expect(markup).toContain('role="alert"');
```

Read the CSS file and require exact geometry:

```ts
expect(css).toMatch(/\.dialog\s*\{[^}]*width:\s*min\(840px, calc\(100vw - 48px\)\)/s);
expect(css).toMatch(/\.dialog\s*\{[^}]*height:\s*min\(720px, calc\(100dvh - 48px\)\)/s);
expect(css).toMatch(/\.textarea\s*\{[^}]*font-size:\s*16px/s);
expect(css).toMatch(/\.textarea\s*\{[^}]*line-height:\s*1\.6/s);
expect(css).toMatch(/\.textarea\s*\{[^}]*max-width:\s*80ch/s);
expect(css).toMatch(/\.textarea\s*\{[^}]*resize:\s*none/s);
expect(css).toContain("@media (max-width: 640px)");
expect(css).toContain("@media (max-width: 360px)");
```

- [ ] **Step 3: Run the modal test and verify RED**

Run:

```bash
pnpm test apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationModal.test.tsx
```

Expected: FAIL because the component and styles do not exist.

- [ ] **Step 4: Implement the stateless modal composition**

Use shared `Modal`, `Button`, and `Icon`; create a textarea ref and pass it through `initialFocusRef`. The essential structure is:

```tsx
export function NumerologyInterpretationModal({
  open,
  copy,
  text,
  placeholder,
  isCreatingAiDraft,
  aiDraftErrorMessage,
  saveDisabled,
  approveDisabled,
  onClose,
  onTextChange,
  onSave,
  onApprove
}: NumerologyInterpretationModalProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const textareaId = useId();

  return (
    <Modal
      open={open}
      title={copy.modalTitle}
      closeLabel={copy.closeModalLabel}
      initialFocusRef={textareaRef}
      className={styles.dialog}
      contentClassName={styles.content}
      onClose={onClose}
    >
      <div className={styles.editor}>
        <label className={styles.label} htmlFor={textareaId}>{copy.textLabel}</label>
        <textarea
          ref={textareaRef}
          id={textareaId}
          className={styles.textarea}
          value={text}
          placeholder={placeholder}
          disabled={isCreatingAiDraft}
          onChange={(event) => onTextChange(event.currentTarget.value)}
        />
        <div className={styles.status} aria-live="polite">
          {isCreatingAiDraft ? <p>{copy.creatingAiDraftLabel}</p> : null}
          {aiDraftErrorMessage ? <p role="alert">{aiDraftErrorMessage}</p> : null}
        </div>
        <footer className={styles.footer}>
          <Button disabled={saveDisabled} onClick={onSave} size="medium" title={copy.saveDraftLabel} variant="glass" />
          <Button disabled={approveDisabled} onClick={onApprove} size="medium" title={copy.approveLabel} variant="brand" />
        </footer>
      </div>
    </Modal>
  );
}
```

CSS uses a fixed-height grid with `grid-template-rows: auto minmax(0, 1fr) auto auto`, the exact desktop/mobile geometry, readable centered editor width capped near `80ch`, and full-width stacked footer actions at `360px`.

- [ ] **Step 5: Run the modal test and verify GREEN**

Run the Step 3 command again.

Expected: PASS.

- [ ] **Step 6: Verify the task diff without staging**

Run:

```bash
pnpm exec eslint apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationModal.tsx apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationModal.test.tsx
git diff --check -- apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationModal*
git diff -- apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationModal*
git status --short
```

---

### Task 5: Move Editing From Inline Panel Into The Modal

**Files:**

- Modify: `apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationEditor.tsx`
- Modify: `apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationEditor.test.tsx`
- Modify: `apps/astrologer-web/src/features/numerology/components/NumerologyComponents.module.css`
- Modify: `apps/astrologer-web/src/features/numerology/components/DetailPanel.tsx`
- Modify: `apps/astrologer-web/src/features/numerology/components/CompatibilityWorkspace.tsx`
- Modify: `apps/astrologer-web/src/features/numerology/components/CompatibilityWorkspace.test.tsx`
- Modify: `apps/astrologer-web/src/features/numerology/components/NumerologyResultPanel.tsx`
- Modify: `apps/astrologer-web/src/features/numerology/components/NumerologyResultPanel.test.tsx`
- Modify: `apps/astrologer-web/src/pages/numerology/NumerologyPageView.tsx`
- Modify: `apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx`

**Interfaces:**

- `NumerologyInterpretationEditorProps` gains `copy: NumerologyInterpretationCopy`; existing business callbacks and state props remain unchanged.
- `NumerologyResultPanel` gains `interpretationCopy`; it passes the same object to individual and compatibility editors.
- `NumerologyPageView` resolves `astrologerCopyByLocale[locale].numerology.interpretation` and passes it downward.

- [ ] **Step 1: Reread all target files and exact diffs**

Run:

```bash
sed -n '1,260p' apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationEditor.tsx
sed -n '1,240p' apps/astrologer-web/src/features/numerology/components/DetailPanel.tsx
sed -n '1,240p' apps/astrologer-web/src/features/numerology/components/CompatibilityWorkspace.tsx
sed -n '1,260p' apps/astrologer-web/src/features/numerology/components/NumerologyResultPanel.tsx
sed -n '1,360p' apps/astrologer-web/src/pages/numerology/NumerologyPageView.tsx
git diff -- apps/astrologer-web/src/features/numerology/components apps/astrologer-web/src/pages/numerology/NumerologyPageView.tsx apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx
```

- [ ] **Step 2: Replace the editor test with RED interaction coverage**

Use jsdom, `createRoot`, and RU copy. Cover:

1. closed disclosure has no inline textarea;
2. opening disclosure shows AI and expand controls but still no textarea;
3. expand click opens the modal without calling AI;
4. AI click opens the modal and calls AI once;
5. typing calls `onTextChange` with the new value;
6. closing and reopening renders the same parent-owned text;
7. save and approve callbacks fire only from modal actions;
8. EN copy renders when supplied.

Key expectations:

```ts
expect(container.querySelector('textarea')).toBeNull();
expect(container.querySelector('[aria-label="Открыть редактор трактовки"]')).not.toBeNull();
act(() => expandButton.click());
expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
expect(onCreateAiDraft).not.toHaveBeenCalled();
act(() => aiButton.click());
expect(onCreateAiDraft).toHaveBeenCalledOnce();
```

- [ ] **Step 3: Run the focused editor test and verify RED**

Run:

```bash
pnpm test apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationEditor.test.tsx
```

Expected: FAIL because the inline textarea still exists and no expand/modal wiring exists.

- [ ] **Step 4: Implement the compact action row and modal state**

In `NumerologyInterpretationEditor`:

```tsx
const [isModalOpen, setIsModalOpen] = useState(false);
const expandTriggerContainerRef = useRef<HTMLSpanElement>(null);
const returnFocusRef = useRef<HTMLButtonElement | null>(null);

function openEditor(event: MouseEvent<HTMLButtonElement>): void {
  returnFocusRef.current = event.currentTarget;
  setIsModalOpen(true);
}

function createAiDraft(event: MouseEvent<HTMLButtonElement>): void {
  returnFocusRef.current = event.currentTarget;
  setIsModalOpen(true);
  onCreateAiDraft();
}

function closeEditor(): void {
  setIsModalOpen(false);
  requestAnimationFrame(() => {
    const preferred = returnFocusRef.current;
    const fallback = expandTriggerContainerRef.current?.querySelector("button") ?? null;
    const target = preferred && !preferred.disabled ? preferred : fallback;
    target?.focus();
  });
}
```

Replace inline textarea/actions/error with:

```tsx
<div className={styles.interpretationActionRow}>
  <span className={styles.aiDraftButtonTooltip} title={aiDraftDisabledReason ?? undefined}>
    <Button
      disabled={aiDraftDisabled}
      onClick={createAiDraft}
      size="small"
      startIcon={<Icon iconName="sparkle" width={13} height={13} aria-hidden="true" />}
      title={isCreatingAiDraft ? copy.creatingAiDraftLabel : copy.createAiDraftLabel}
      variant="glass"
    />
  </span>
  <span ref={expandTriggerContainerRef}>
    <Tooltip content={copy.openEditorLabel} id={`${regionId}-expand-tooltip`}>
      <IconButton
        aria-haspopup="dialog"
        label={copy.openEditorLabel}
        icon={<Icon iconName="expand" aria-hidden="true" />}
        size="medium"
        variant="default"
        onClick={openEditor}
      />
    </Tooltip>
  </span>
</div>
<NumerologyInterpretationModal
  open={isModalOpen}
  copy={copy}
  text={text}
  placeholder={placeholder}
  isCreatingAiDraft={isCreatingAiDraft}
  aiDraftErrorMessage={aiDraftErrorMessage}
  saveDisabled={saveDisabled}
  approveDisabled={approveDisabled}
  onClose={closeEditor}
  onTextChange={onTextChange}
  onSave={onSave}
  onApprove={onApprove}
/>
```

The explicit close handler preserves exact trigger focus when possible and uses
the enabled expand control when the AI trigger is temporarily disabled by an
in-flight request.

Use `copy.sectionLabel` in the disclosure header. Import the shared IconButton/Tooltip CSS and remove obsolete inline textarea/action/status rules from `NumerologyComponents.module.css`.

- [ ] **Step 5: Pass typed copy through both modes**

Add `copy`/`interpretationCopy` props through `DetailPanel`, `CompatibilityWorkspace`, and `NumerologyResultPanel`. In `NumerologyPageView`:

```ts
import { astrologerCopyByLocale } from "../../common/i18n/astrologerCopy";

const interpretationCopy = astrologerCopyByLocale[locale].numerology.interpretation;
```

Pass `interpretationCopy={interpretationCopy}` to `NumerologyResultPanel` and update all focused fixtures with `astrologerCopyByLocale.ru.numerology.interpretation`.

- [ ] **Step 6: Run focused and affected tests and verify GREEN**

Run:

```bash
pnpm test \
  apps/astrologer-web/src/common/i18n/astrologerCopy.test.ts \
  apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationModal.test.tsx \
  apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationEditor.test.tsx \
  apps/astrologer-web/src/features/numerology/components/NumerologyResultPanel.test.tsx \
  apps/astrologer-web/src/features/numerology/components/CompatibilityWorkspace.test.tsx \
  apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx \
  apps/astrologer-web/src/features/numerology/model/numerologyInterpretationModel.test.ts \
  apps/astrologer-web/src/pages/numerology/useNumerologyPageController.test.tsx
```

Expected: PASS with existing business-state tests unchanged.

- [ ] **Step 7: Run lint and exact-path diff review**

Run:

```bash
pnpm exec eslint \
  apps/astrologer-web/src/common/i18n/astrologerCopy.ts \
  apps/astrologer-web/src/common/i18n/astrologerCopy.test.ts \
  apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationModal.tsx \
  apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationModal.test.tsx \
  apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationEditor.tsx \
  apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationEditor.test.tsx \
  apps/astrologer-web/src/features/numerology/components/DetailPanel.tsx \
  apps/astrologer-web/src/features/numerology/components/CompatibilityWorkspace.tsx \
  apps/astrologer-web/src/features/numerology/components/NumerologyResultPanel.tsx \
  apps/astrologer-web/src/pages/numerology/NumerologyPageView.tsx
git diff --check
git diff -- apps/astrologer-web/src/common/i18n apps/astrologer-web/src/features/numerology/components apps/astrologer-web/src/pages/numerology/NumerologyPageView.tsx apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx packages/design-system/src/components/Modal packages/design-system/src/icons packages/design-system/src/index.test.ts
git status --short
```

Expected: no edits to unowned calendar files and no broad formatting churn.

---

### Task 6: Package Gates, Runtime E2E, Design Parity, And Documentation

**Files:**

- Modify after successful evidence: `docs/architecture/design-reference-inventory.md`
- Modify: `docs/superpowers/plans/2026-07-17-numerology-interpretation-modal-editor.md`
- Create evidence under `.design-qa/numerology-interpretation-modal-editor/`

**Interfaces:**

- Consumes: completed Tasks 1–5.
- Produces: fresh automated/runtime/accessibility/visual evidence and accurate implemented-state docs.

- [ ] **Step 1: Run design-system gates**

Run:

```bash
pnpm test \
  packages/design-system/src/components/Modal/Modal.test.tsx \
  packages/design-system/src/components/Modal/Modal.focus.test.tsx \
  packages/design-system/src/components/Modal/helpers/getInitialFocusElement.test.ts \
  packages/design-system/src/components/Modal/helpers/getFocusableElements.test.ts \
  packages/design-system/src/components/Modal/helpers/handleDialogKeyDown.test.ts \
  packages/design-system/src/icons/Expand/Expand.test.tsx \
  packages/design-system/src/icons/Icon/Icon.test.tsx \
  packages/design-system/src/index.test.ts
pnpm --filter @elevenhouse/design-system typecheck
pnpm --filter @elevenhouse/design-system build
```

Expected: PASS.

- [ ] **Step 2: Run astrologer-web gates**

Run:

```bash
pnpm --filter @elevenhouse/astrologer-web typecheck
pnpm --filter @elevenhouse/astrologer-web build
```

Expected: PASS. If an unowned calendar file fails because of concurrent work,
record the exact failure as unrelated evidence; do not edit calendar paths or
claim the full app typecheck passed.

- [ ] **Step 3: Check existing runtime availability without changing lifecycle**

Run:

```bash
lsof -nP -iTCP:5174 -sTCP:LISTEN
lsof -nP -iTCP:3002 -sTCP:LISTEN
curl -I --max-time 5 http://localhost:5174/numerology
curl -I --max-time 5 http://localhost:8000/ElevenHouse.html
```

Expected: use only already-running surfaces. A missing port is a blocker, not permission to start a service or choose another port.

- [ ] **Step 4: Capture exact reference and production states with Computer Use**

Use the user's existing Chrome tab. Do not open a fresh browser context unless explicitly approved.

Reference:

- `http://localhost:8000/ElevenHouse.html`;
- Numerology individual result;
- compact `AI-разбор портрета` closed/open state;
- capture current reference disclosure metrics and screenshots.

Production:

- `http://localhost:5174/numerology`;
- authenticated astrologer, saved individual calculation with representative long text;
- repeat for compatibility mode;
- desktop viewport matching reference and mobile viewport at/below `640px`.

Save artifacts as:

```text
.design-qa/numerology-interpretation-modal-editor/reference-disclosure-desktop.png
.design-qa/numerology-interpretation-modal-editor/production-disclosure-desktop.png
.design-qa/numerology-interpretation-modal-editor/production-modal-clean-desktop.png
.design-qa/numerology-interpretation-modal-editor/production-modal-dirty-desktop.png
.design-qa/numerology-interpretation-modal-editor/production-modal-mobile.png
```

- [ ] **Step 5: Exercise runtime, keyboard, network, and responsive behavior**

Verify:

- disclosure opens by mouse and keyboard;
- expand control tooltip/name and `aria-haspopup="dialog"`;
- expand opens without an AI request;
- AI action opens and creates exactly one network request;
- textarea receives initial focus;
- Tab/Shift+Tab stay inside; Escape closes; focus returns to the correct trigger;
- closing/reopening retains dirty text without a network write;
- save uses the existing interpretation endpoint and leaves modal open;
- approval is disabled while dirty, then uses the existing saved interpretation id and leaves modal open;
- AI loading/error leaves last text visible;
- individual and compatibility use the same modal;
- RU/EN new copy, `200%` zoom, `640px` and `360px` layouts;
- console has no unexpected errors and network has no duplicate mutation.

Use Developer mode/CDP to measure width/height, typography, padding, gaps,
borders, radius, shadow, z-index, overflow, focus ring, and scrolling. Record
measurements in this plan's progress/evidence section.

- [ ] **Step 6: Update inventory only after evidence**

Update the Numerology implemented-state cell to mention the accessible large
interpretation modal, compact action row, same-buffer close/reopen behavior,
and evidence status. Do not claim live validation for states that were blocked.

- [ ] **Step 7: Run docs and final fresh verification**

Run:

```bash
pnpm docs:check:test
pnpm docs:check
git diff --check
git status --short
git diff --stat
```

Then rerun the focused test set from Task 5 and the package gates from Steps 1–2.

Expected: all owned automated checks pass; any runtime/design blocker is exact and explicit.

- [ ] **Step 8: Final self-review and evidence report**

Inspect every owned diff and report separately:

- implemented;
- commands and fresh results;
- browser/network/accessibility/design evidence and artifact paths;
- partially implemented or intentionally deferred items;
- blocked/skipped checks and residual risk;
- unrelated calendar changes observed and not touched;
- uncommitted status because commit authority was not granted.

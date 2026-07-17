# Numerology Interpretation Editor Visual Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. ElevenHouse shared-main policy forbids worktrees, branches, staging, and commits without direct authority.

**Goal:** Restyle the `/numerology` interpretation editor as a compact reference-matched `AI-разбор портрета` disclosure with polished ElevenHouse buttons while preserving the existing AI, edit, save, and approval workflow.

**Architecture:** Keep business state and callbacks in the existing controller/model contour. `NumerologyInterpretationEditor` owns only local expanded/collapsed presentation state and reuses the shared design-system `Button` primitive; its CSS Module owns the Numerology-specific reference composition.

**Tech Stack:** React 19, TypeScript, CSS Modules, ElevenHouse design-system `Button` and `Icon`, Vitest, Computer Use in the existing Chrome session.

## Global Constraints

- Work in the existing checkout on `main`; do not create a branch or worktree.
- Do not stage or commit without separate authority.
- Preserve all current AI draft, dirty-state, checksum, save, approval, error, and disabled behavior.
- Do not change API, controller, domain, DB, or deterministic Numerology logic.
- Use the exact Numerology reference detail-panel state as visual truth.
- Do not touch the unrelated calendar/i18n work currently present in the shared checkout.
- Do not start, stop, reload, or restart application processes.

## Progress

- [x] 2026-07-17: Captured the exact closed reference state at 1333x768.
- [x] 2026-07-17: Added RED disclosure/button tests and observed both expected failures.
- [x] 2026-07-17: Implemented the accessible disclosure and design-system actions.
- [x] 2026-07-17: Passed focused and affected Numerology tests, lint, targeted typecheck, build, and diff check.
- [x] 2026-07-17: Captured visually matching production closed and expanded states at 1333x768.

## Surprises And Discoveries

- The exact reference source uses a 12px-radius `accent-soft` disclosure with a
  12px/14px header, accent border, sparkle icon, 12.5px bold label, and rotating
  chevron. The production closed state now follows the same composition.
- The shared Chrome window is concurrently used by the calendar task. Closed
  and expanded screenshots were captured, but a later keyboard-focus sequence
  was interrupted when the active tab changed back to Calendar.
- Full `astrologer-web` typecheck currently fails only in unowned calendar files
  on `timeZone` and missing booking-detail exports. A targeted TypeScript check
  of both changed Numerology TSX files passes.

---

## File Map

- Modify `apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationEditor.test.tsx`: behavioral markup coverage for closed, expanded, loading/error, accessibility, and design-system actions.
- Modify `apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationEditor.tsx`: accessible disclosure state and design-system button composition.
- Modify `apps/astrologer-web/src/features/numerology/components/NumerologyComponents.module.css`: exact reference-like disclosure, editor, action, focus, hover, pressed, disabled, and responsive styling.
- Update this plan only for living progress/evidence notes.

### Task 1: Reference-matched interpretation disclosure

**Files:**

- Modify: `apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationEditor.test.tsx`
- Modify: `apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationEditor.tsx`
- Modify: `apps/astrologer-web/src/features/numerology/components/NumerologyComponents.module.css`

**Interfaces:**

- Consumes: the existing `NumerologyInterpretationEditorProps` without changing callback or disabled-state semantics.
- Produces: an accessible disclosure whose expanded region contains the existing textarea, AI draft action, save action, approval action, and live error region.
- Reuses: `Button` from `@elevenhouse/design-system/components/Button` and `Icon` names `sparkle` and `chevronDown`.

- [x] **Step 1: Write failing component expectations for the closed disclosure**

Replace the first static-markup test expectations with assertions that require the new semantic structure and remove the old always-visible form contract:

```tsx
expect(markup).toContain("AI-разбор портрета");
expect(markup).toContain('aria-expanded="false"');
expect(markup).toContain('aria-controls="numerology-interpretation-');
expect(markup).not.toContain('aria-label="Текст трактовки"');
expect(markup).not.toContain("Создать AI-черновик");
expect(markup).not.toContain("eh-button");
```

- [x] **Step 2: Write failing expectations for an automatically expanded active/error state**

Render with `isCreatingAiDraft` and `aiDraftErrorMessage="AI временно недоступен"`, then require the complete workflow and design-system button variants:

```tsx
expect(markup).toContain('aria-expanded="true"');
expect(markup).toContain('aria-label="Текст трактовки"');
expect(markup).toContain("Создаём черновик…");
expect(markup).toContain("Сохранить");
expect(markup).toContain("Утвердить");
expect(markup).toContain("ehButton--glass");
expect(markup).toContain("ehButton--brand");
expect(markup).toContain('role="alert"');
expect(markup).toContain("AI временно недоступен");
expect(markup).toContain('title="Сначала сохраните или отмените изменения"');
```

- [x] **Step 3: Run the focused test and verify RED**

Run:

```bash
pnpm test apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationEditor.test.tsx
```

Expected: FAIL because the current editor has no disclosure semantics, always renders the textarea, uses the purple AI button, and uses obsolete `eh-button` class names.

- [x] **Step 4: Implement the accessible disclosure composition**

Update imports and local state:

```tsx
import { Button } from "@elevenhouse/design-system/components/Button";
import "@elevenhouse/design-system/components/Button.css";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { useId, useState } from "react";

const regionId = `numerology-interpretation-${useId()}`;
const [isExpanded, setIsExpanded] = useState(
  () => isCreatingAiDraft || aiDraftErrorMessage !== null
);
```

Replace the current card/heading/body with this structure while preserving every existing callback and disabled prop:

```tsx
<div className={styles.manualInterpretation} data-expanded={isExpanded ? "true" : undefined}>
  <button
    aria-controls={regionId}
    aria-expanded={isExpanded}
    className={styles.interpretationDisclosure}
    onClick={() => setIsExpanded((current) => !current)}
    type="button"
  >
    <span className={styles.interpretationDisclosureLabel}>
      <Icon iconName="sparkle" width={14} height={14} aria-hidden="true" />
      <span>AI-разбор портрета</span>
    </span>
    <span className={styles.interpretationChevron} data-open={isExpanded ? "true" : undefined}>
      <Icon iconName="chevronDown" width={14} height={14} aria-hidden="true" />
    </span>
  </button>
  {isExpanded ? (
    <div className={styles.interpretationContent} id={regionId}>
      <span className={styles.aiDraftButtonTooltip} title={aiDraftDisabledReason ?? undefined}>
        <Button
          className={styles.aiDraftButton}
          disabled={aiDraftDisabled}
          onClick={onCreateAiDraft}
          size="small"
          startIcon={<Icon iconName="sparkle" width={13} height={13} aria-hidden="true" />}
          title={isCreatingAiDraft ? "Создаём черновик…" : "Создать AI-черновик"}
          variant="glass"
        />
      </span>
      <textarea
        aria-label="Текст трактовки"
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
        placeholder={placeholder}
        disabled={isCreatingAiDraft}
      />
      <div className={styles.interpretationActions}>
        <Button disabled={saveDisabled} onClick={onSave} size="small" title="Сохранить" variant="glass" />
        <Button disabled={approveDisabled} onClick={onApprove} size="small" title="Утвердить" variant="brand" />
      </div>
      <div className={styles.interpretationStatus} aria-live="polite">
        {aiDraftErrorMessage ? <p role="alert">{aiDraftErrorMessage}</p> : null}
      </div>
    </div>
  ) : null}
</div>
```

The toggle is never disabled by AI availability, so the astrologer can always open the editor to save or review manual text. Only the actual AI action retains `aiDraftDisabled` and its existing reason.

- [x] **Step 5: Replace the purple/local generic styling with reference tokens**

Replace the current `.manualInterpretation`, textarea, heading, and AI button rules with a cohesive block:

```css
.manualInterpretation {
  margin-top: 2px;
  overflow: hidden;
  border: 1px solid rgb(246 210 102 / 0.32);
  border-radius: 12px;
  background: rgb(246 210 102 / 0.1);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.03);
}

.manualInterpretation[data-expanded="true"] {
  background: rgb(10 9 27 / 0.72);
}

.interpretationDisclosure {
  display: flex;
  width: 100%;
  min-height: 38px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 13px;
  border: 0;
  background: transparent;
  color: var(--numerology-accent, #f6d266);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 750;
  text-align: left;
}

.interpretationDisclosure:hover {
  background: rgb(246 210 102 / 0.06);
}

.interpretationDisclosure:focus-visible {
  outline: 2px solid rgb(246 210 102 / 0.52);
  outline-offset: -3px;
}

.interpretationDisclosureLabel {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.interpretationChevron {
  display: inline-flex;
  color: rgb(236 234 247 / 0.58);
  transition: transform 180ms ease;
}

.interpretationChevron[data-open="true"] {
  transform: rotate(180deg);
}

.interpretationContent {
  display: grid;
  gap: 10px;
  padding: 2px 13px 13px;
  border-top: 1px solid rgb(216 212 236 / 0.08);
}

.aiDraftButtonTooltip {
  display: inline-flex;
  justify-self: start;
  margin-top: 10px;
}

.aiDraftButton {
  color: var(--numerology-accent, #f6d266);
}

.interpretationContent textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 126px;
  padding: 11px 12px;
  border: 1px solid rgb(216 212 236 / 0.14);
  border-radius: 10px;
  outline: none;
  background: rgb(6 5 18 / 0.66);
  color: var(--eh-color-moon-120);
  font: inherit;
  font-size: 12.5px;
  line-height: 1.55;
  resize: vertical;
  transition: border-color 180ms ease, box-shadow 180ms ease, background-color 180ms ease;
}

.interpretationContent textarea:focus {
  border-color: rgb(246 210 102 / 0.46);
  background: rgb(8 7 22 / 0.82);
  box-shadow: 0 0 0 3px rgb(246 210 102 / 0.1);
}

.interpretationContent textarea::placeholder {
  color: rgb(185 177 219 / 0.62);
}

.interpretationContent textarea:disabled {
  cursor: wait;
  opacity: 0.64;
}

.interpretationActions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
```

Keep the existing `.interpretationStatus` error rules, and remove obsolete `.interpretationHeading`, purple `.aiDraftButton` background/border rules, `.manualInterpretation > div`, and global `eh-button` usage.

- [x] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
pnpm test apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationEditor.test.tsx
```

Expected: PASS with both closed disclosure and expanded loading/error workflow covered.

- [x] **Step 7: Run affected Numerology behavior checks**

Run:

```bash
pnpm test \
  apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationEditor.test.tsx \
  apps/astrologer-web/src/features/numerology/components/NumerologyResultPanel.test.tsx \
  apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx \
  apps/astrologer-web/src/features/numerology/model/numerologyInterpretationModel.test.ts \
  apps/astrologer-web/src/pages/numerology/useNumerologyPageController.test.tsx
pnpm exec eslint \
  apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationEditor.tsx \
  apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationEditor.test.tsx
pnpm --filter @elevenhouse/astrologer-web typecheck
pnpm --filter @elevenhouse/astrologer-web build
git diff --check
```

Expected: every command exits `0`; no behavior, type, lint, build, or whitespace regression is introduced.

Observed: tests (42), lint, targeted TypeScript check, build, and `git diff --check`
passed. The broad app typecheck is blocked by unowned in-progress Calendar test
changes; none of its diagnostics point to the Numerology editor.

### Task 2: Runtime and visual acceptance

**Files:**

- Do not modify production files unless comparison finds a concrete mismatch.
- Update: `docs/superpowers/plans/2026-07-17-numerology-interpretation-editor-visual-parity.md` with measured evidence and any intentional deviation.

**Interfaces:**

- Consumes: already-running `localhost:8000` design surface and `localhost:5174` astrologer surface.
- Produces: Computer Use evidence for the same right-panel state in reference and production.

- [x] **Step 1: Refresh shared-main and service evidence without lifecycle changes**

Run:

```bash
git branch --show-current
git status --short
git diff --cached --name-status
lsof -nP -iTCP:5174 -sTCP:LISTEN
lsof -nP -iTCP:8000 -sTCP:LISTEN
```

Expected: branch is `main`, both ports are already listening, and unowned calendar/i18n files remain untouched.

- [x] **Step 2: Capture the reference state in the existing Chrome session**

Using Computer Use, select the existing `localhost:8000/ElevenHouse.html` tab, open Numerology, select a key number, and record the closed `AI-разбор портрета` state at the current desktop viewport. Record header geometry, padding, radius, warm border/background, label/icon/chevron alignment, hover/focus treatment, and panel spacing.

Expected: the exact reference state is visible; no substitute screenshot or prototype state is used.

- [ ] **Step 3: Exercise production closed and expanded states**

Using Computer Use, select or navigate the existing production Chrome tab to `localhost:5174/numerology`, choose an existing saved calculation and selected detail, then exercise:

```text
closed disclosure -> keyboard focus -> Enter/Space open -> textarea edit
-> Save disabled/enabled contract -> AI disabled reason where reachable
-> polished glass Save -> polished warm Approve
```

Do not trigger a provider write solely for visual QA unless an already-authorized real scenario requires it. Loading/error states may remain automated-only if they cannot be reached without an external mutation.

Observed: click-to-open and closed/expanded visual states passed. Runtime keyboard
focus order, dirty edit, loading/error, and provider-backed generation were not
completed because the shared Chrome tab focus was taken by the concurrent
Calendar task. Automated accessibility/dirty/loading/error coverage passed.

- [x] **Step 4: Compare and iterate**

Compare reference and production geometry/tokens. If a mismatch is found, re-read the current target file and path diff, make the smallest CSS/component correction with `apply_patch`, and rerun Task 1 Steps 6–7 before inspecting again.

Expected: closed header matches the reference visual language; expanded editor and all actions extend that language without purple/local-generic styling.

- [x] **Step 5: Final shared-main and diff review**

Run:

```bash
git branch --show-current
git status --short
git diff --cached --name-status
git diff -- \
  apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationEditor.tsx \
  apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationEditor.test.tsx \
  apps/astrologer-web/src/features/numerology/components/NumerologyComponents.module.css \
  docs/superpowers/specs/2026-07-17-numerology-interpretation-editor-visual-parity-design.md \
  docs/superpowers/plans/2026-07-17-numerology-interpretation-editor-visual-parity.md
git diff --check
```

Expected: only owned paths contain this task's edits, cached diff remains unowned/empty as observed, and `git diff --check` passes.

Observed: branch remains `main`; cached diff is empty; the owned Numerology,
spec, plan, and visual-evidence paths are isolated from the unowned
Calendar/i18n work; final `git diff --check` passed.

## Completion Report Contract

Report separately:

- implemented component/style behavior;
- exact automated commands and results;
- exact reference and production route/state plus viewport/browser evidence;
- disabled/loading/error states not reached at runtime;
- any visual deviation and its reason;
- unowned calendar/i18n changes observed and left untouched;
- no commit/push performed without separate authority.

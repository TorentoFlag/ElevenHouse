# Numerology Compatibility Year Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the unused year picker from the Numerology compatibility toolbar while preserving the existing individual-mode year workflow and period state.

**Architecture:** Keep the change inside the app-owned `NumerologyPageView` composition. Derive visibility from the existing `formState.mode`; do not add state, change the controller, modify period requests, or change CSS unless browser evidence reveals a separate layout defect.

**Tech Stack:** React 19, TypeScript, Vitest, CSS Modules, pnpm workspace, Computer Use on the existing Chrome tab.

## Global Constraints

- Work in the existing shared `main` checkout; do not create a branch, worktree, stash, rebase, or checkout.
- Preserve all pre-existing dirty Numerology changes and reread both target files plus their path diffs immediately before each edit.
- Do not start, stop, restart, or kill frontend, API, workers, Docker, PostgreSQL, Redis, or other long-running processes.
- Do not commit, push, deploy, or mutate external state without separate user authority.
- `ElevenHouseDesign/app/numerology.jsx` remains the visual reference, with the user-approved intentional deviation that the irrelevant year control is absent in compatibility mode.
- Individual mode must retain the current year-picker props and behavior.

---

### Task 1: Hide the year picker in compatibility mode

**Files:**
- Modify: `apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx`
- Modify: `apps/astrologer-web/src/pages/numerology/NumerologyPageView.tsx`
- Verify only if available: `.design-qa/numerology-compatibility-year-control/`

**Interfaces:**
- Consumes: `formState.mode: "individual" | "compatibility"` and the existing `NumerologyYearPicker` props.
- Produces: a view tree where `NumerologyYearPicker` exists only when `formState.mode !== "compatibility"`; no new public types or component props.

- [x] **Step 1: Re-read shared-main target state**

Run:

```bash
git branch --show-current
git status --short
git diff -- apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx apps/astrologer-web/src/pages/numerology/NumerologyPageView.tsx
sed -n '430,505p' apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx
sed -n '208,260p' apps/astrologer-web/src/pages/numerology/NumerologyPageView.tsx
```

Expected: branch `main`; only the already-observed locale/presentation changes appear in the two target-file diffs; the compatibility test still expects a disabled year picker.

- [x] **Step 2: Write the failing behavioral test**

Rename the compatibility test to `hides period selection in compatibility while exposing presentation`. Replace its year-picker lookup and disabled/open assertions with an absence assertion while keeping participant, active button, and action-menu assertions:

```tsx
expect(
  findElements(view).some((element) => element.type === NumerologyYearPicker)
).toBe(false);
```

The existing individual-mode test `matches the approved menu icons and directly visible calculation controls` continues to assert:

```tsx
expect(findRequiredElementByType(view, NumerologyYearPicker)).toBeDefined();
```

- [x] **Step 3: Run the focused test and verify RED**

Run:

```bash
pnpm --filter @elevenhouse/astrologer-web exec vitest run src/pages/numerology/NumerologyPageView.test.tsx
```

Expected: FAIL only because compatibility render still contains `NumerologyYearPicker`; the individual-mode assertion remains green.

- [x] **Step 4: Implement the minimal conditional render**

In `NumerologyPageView.tsx`, wrap the existing year picker with the already-derived compatibility flag and leave its individual-mode props unchanged:

```tsx
{!isCompatibilityMode ? (
  <NumerologyYearPicker
    selectedYear={selectedYear}
    isOpen={isYearPickerOpen}
    isPeriodVisible={isPeriodVisible}
    isPreviewPending={isPreviewPending}
    errorMessage={periodErrorMessage}
    disabled={!pageModel.model}
    onToggle={onToggleYearPicker}
    onApply={onApplyYear}
    onHide={onHidePeriod}
    onRetry={onRetryPeriod}
  />
) : null}
```

Do not change `useNumerologyPageController.ts`: `activateCompatibilityMode()` already calls `setIsYearPickerOpen(false)`, and `selectedYear` plus `isPeriodVisible` intentionally survive the mode transition.

- [x] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
pnpm --filter @elevenhouse/astrologer-web exec vitest run src/pages/numerology/NumerologyPageView.test.tsx
```

Expected: all tests in the file PASS with zero failures.

- [x] **Step 6: Verify the affected automated surface**

Run:

```bash
pnpm exec eslint apps/astrologer-web/src/pages/numerology/NumerologyPageView.tsx apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx
pnpm --filter @elevenhouse/astrologer-web typecheck
git diff --check -- apps/astrologer-web/src/pages/numerology/NumerologyPageView.tsx apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx docs/superpowers/specs/2026-07-17-numerology-compatibility-year-control-design.md docs/superpowers/plans/2026-07-17-numerology-compatibility-year-control.md
```

Expected: every command exits `0`; no lint, type, or whitespace errors.

- [x] **Step 7: Attempt real visible-state verification without process lifecycle changes**

Using Computer Use on the existing Chrome tab only:

1. Open or reuse `/numerology` with a valid individual calculation.
2. Confirm `Год · <year>` is visible in individual mode.
3. Enter compatibility mode and select/retain two clients.
4. At the screenshot desktop viewport, confirm no year control exists and the partner selector does not overlap `Совместимость` or `Действия`.
5. Return to individual mode and confirm the prior year and period presentation return.
6. Check the affected responsive viewport and keyboard focus order.
7. Confirm no new console errors or failed Numerology network requests.
8. Save screenshots and a short route/state/viewport evidence note under `.design-qa/numerology-compatibility-year-control/` if the current runtime permits capture.

Expected: the user-approved intentional deviation is visible; if the existing tab or required runtime state is unavailable, record Runtime E2E and visual acceptance as blocked instead of substituting automated tests.

Execution result: **blocked**. Computer Use did not return the existing Chrome
state within 60 seconds, so the bounded attempt was terminated without any UI
action. No alternative browser surface was used and no runtime process was
started or restarted. Screenshots, responsive inspection, focus order, console
and network evidence remain unverified.

- [x] **Step 8: Review the owned diff without committing**

Run:

```bash
git status --short
git diff -- apps/astrologer-web/src/pages/numerology/NumerologyPageView.tsx apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx docs/superpowers/specs/2026-07-17-numerology-compatibility-year-control-design.md docs/superpowers/plans/2026-07-17-numerology-compatibility-year-control.md
git diff --cached --name-status
```

Expected: the owned diff contains only the conditional year-picker rendering, its behavioral test, and the task documents; no staged entries are added by this task and no commit is created.

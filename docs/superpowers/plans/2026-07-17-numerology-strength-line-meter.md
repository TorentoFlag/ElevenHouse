# Numerology Strength-Line Meter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. ElevenHouse shared-main policy forbids worktrees and branches unless the user explicitly requests them.

**Goal:** Make each strength-line meter represent the approved semantic level so an expressed line with raw count `3` appears 75% filled and a strong line appears fully filled.

**Architecture:** Keep the canonical raw count and domain classification unchanged. Add a pure presentation mapping to the existing numerology result-panel model, then consume it from the result component; the visual percentage is not exposed as a numerological measurement.

**Tech Stack:** React, TypeScript, Vitest, CSS Modules.

## Global Constraints

- Approved scale is `0` absent, `1` weak, `2` moderate, `3` expressed, `4+` strong.
- The frontend must not recalculate or mutate the canonical raw strength-line count.
- Derived presentation logic belongs in `features/numerology/model`, not inline JSX.
- Existing unowned changes in shared `main` must remain untouched.
- Do not stage or commit without separate user authority.

---

## Purpose / Big Picture

On `/numerology`, an astrologer scanning the `Линии силы` panel should see a bar consistent with the selected line's semantic interpretation. For `Семейность` with value `3` and level `expressed`, the meter width must be `75%`, while the visible raw value remains `3`.

## Progress

- [x] 2026-07-17: Root cause confirmed in `NumerologyResultPanel.tsx`: width used the arbitrary formula `value / 7`.
- [x] 2026-07-17: Added red presentation-model tests for all five levels and unknown input.
- [x] 2026-07-17: Added red component tests proving the old `43%` width and missing accessible semantic label.
- [x] 2026-07-17: Implemented the semantic level-to-fill mapping and accessible line description.
- [x] 2026-07-17: Passed targeted component/model tests and the `astrologer-web` typecheck.
- [x] 2026-07-17: Restored the required Computer Use helper and verified the selected `Семейность = 3` state in the existing Chrome tab: the semantic level is `expressed`, the meter is 75% filled, and the interpretation panel matches.

## Surprises & Discoveries

- The domain and approved specification already agree on the five semantic levels; only the frontend meter formula is inconsistent.
- `numerologyWorkspaceModel.*` and `NumerologyComponents.module.css` have unowned edits, so this fix avoids those files.
- The already-running production Vite surface serves the transformed component with the semantic helper. The initial Computer Use failure was a stale native helper process with accumulated Chrome AX observers; restarting that helper and reloading the existing tab restored synchronized AX and screenshot capture.

## Decision Log

- 2026-07-17, user + Codex: preserve raw counts and map `absent`, `weak`, `moderate`, `expressed`, `strong` to `0`, `25`, `50`, `75`, `100` visual percent.
- 2026-07-17, Codex: keep the meter decorative and include the human-readable level in the button's accessible label; do not announce an artificial percentage.

## Outcomes & Retrospective

The panel now maps `expressed` to a 75% fill and `strong` to a full fill while preserving the raw number. The row's accessible name includes the line label, raw count and translated semantic level. Targeted automated acceptance and live rendered verification in the existing Chrome tab are complete.

## Context and Orientation

- UI component: `apps/astrologer-web/src/features/numerology/components/NumerologyResultPanel.tsx`.
- Presentation model: `apps/astrologer-web/src/features/numerology/model/numerologyResultPanelModel.ts`.
- Model tests: `apps/astrologer-web/src/features/numerology/model/numerologyResultPanelModel.test.ts`.
- Component tests: `apps/astrologer-web/src/features/numerology/components/NumerologyResultPanel.test.tsx`.
- Component behavior coverage: `apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx`.
- Domain classification source: `packages/domain/src/numerology/methods/pythagorean-ru/strength-lines.ts`.
- Exact visual reference: `ElevenHouseDesign/app/numerology-extra.jsx`; the approved production difference is semantic scaling against the canonical domain levels rather than the prototype's arbitrary `/ 7` width.

## Interfaces and Dependencies

The model produces:

```ts
export function getStrengthLineMeterPercent(level: string): number;
```

It returns `0`, `25`, `50`, `75`, or `100`. Unknown levels fail closed to `0` because they cannot be assigned a trustworthy semantic strength.

## Plan of Work

### Task 1: Semantic strength-line meter

**Files:**

- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyResultPanelModel.test.ts`
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyResultPanelModel.ts`
- Modify: `apps/astrologer-web/src/features/numerology/components/NumerologyResultPanel.tsx`
- Modify only if component coverage requires it and after re-reading unowned changes: `apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx`

**Interfaces:**

- Consumes: `line.levelCode`, `line.level`, `line.value` from `NumerologyWorkspaceStrengthLine`.
- Produces: semantic meter width and an accessible button name containing label, raw value, and level.

- [x] **Step 1: Write the failing model test**

```ts
expect(getStrengthLineMeterPercent("absent")).toBe(0);
expect(getStrengthLineMeterPercent("weak")).toBe(25);
expect(getStrengthLineMeterPercent("moderate")).toBe(50);
expect(getStrengthLineMeterPercent("expressed")).toBe(75);
expect(getStrengthLineMeterPercent("strong")).toBe(100);
expect(getStrengthLineMeterPercent("unknown")).toBe(0);
```

- [x] **Step 2: Run the focused test and verify RED**

Run from `/Users/anton/Finext/ElevenHouse`:

```bash
pnpm test apps/astrologer-web/src/features/numerology/model/numerologyResultPanelModel.test.ts
```

Expected: FAIL because `getStrengthLineMeterPercent` is not exported.

- [x] **Step 3: Add the minimal model mapping**

```ts
const strengthLineMeterPercentByLevel: Readonly<Record<string, number>> = {
  absent: 0,
  weak: 25,
  moderate: 50,
  expressed: 75,
  strong: 100
};

export function getStrengthLineMeterPercent(level: string): number {
  return strengthLineMeterPercentByLevel[level] ?? 0;
}
```

- [x] **Step 4: Replace inline `/ 7` arithmetic and expose semantic text**

Import `getStrengthLineMeterPercent`, use it for the nested meter width, and set the row button accessible label to `${line.label}, ${line.value}, ${line.level}`. Keep the visible number unchanged.

- [x] **Step 5: Run targeted verification and verify GREEN**

```bash
pnpm test apps/astrologer-web/src/features/numerology/model/numerologyResultPanelModel.test.ts
pnpm test apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx
pnpm --filter @elevenhouse/astrologer-web typecheck
pnpm --filter @elevenhouse/astrologer-web build
git diff --check
```

Expected: all commands PASS without warnings introduced by this change.

## Concrete Steps

Follow Task 1 red-green-refactor exactly. Before each edit, re-read all three owned files and their path-scoped diffs because the checkout is shared.

## Validation and Acceptance

- Automated: every approved level maps to the intended fill and unknown data fails closed.
- Frontend behavior: the numerology page renders without inline domain-threshold arithmetic and the button exposes label, raw count, and semantic level.
- Runtime/design: use already-running production and reference surfaces only; do not start services. Capture equivalent `Семейность = 3 / expressed` state when available.

## Idempotence and Recovery

The change is pure presentation logic and can be re-run safely. If a target file changes concurrently, stop applying the stale patch, re-read the combined file and adapt without reverting the other change.

## Artifacts and Notes

Computer Use produced live screenshot evidence for the selected `Семейность = 3 / expressed` state; no screenshot file was added to the repository. Existing `.design-qa` contents remain unowned and untouched.

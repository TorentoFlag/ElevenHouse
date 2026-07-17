# Numerology Compatibility Card Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one Numerology compatibility comparison card at a time expand
inline so its full explanation is readable, with repeat-click collapse and
native keyboard behavior.

**Architecture:** Keep the page-level `selectedSelector` as the sole controlled
state. A focused model helper maps comparison clicks to either the clicked
selector or the compatibility conclusion selector; the component reflects the
controlled state through `aria-expanded` and `data-expanded`, while CSS changes
only the selected row's truncation and height.

**Tech Stack:** React 19, TypeScript 6, CSS Modules, Vitest 4, Vite 8.

## Global Constraints

- Work in the existing shared checkout on `main`; do not create a branch,
  worktree or stash.
- Do not commit, push or stage files without a separate user command.
- Preserve all unowned scheduling, DB and Numerology action-error changes.
- Keep the change app-owned under `apps/astrologer-web`; do not add a shared
  design-system abstraction.
- Keep calculations, contracts, API, persistence, explanation copy, matrices,
  zones, conclusion and presentation overlay out of scope.
- Closed-card geometry and tokens remain unchanged; only the expanded state and
  visible focus treatment are added.
- Use the existing Chrome tab through Computer Use for Runtime E2E; do not
  start, stop or restart services.

---

## Purpose / Big Picture

On `/numerology` in compatibility mode, comparison explanations are present but
clipped to one line. After this plan, selecting a card reveals the whole
explanation inside that card. Selecting another card moves the disclosure to
that card; selecting the open card again returns selection to the compatibility
conclusion and collapses the list.

## Progress

- [x] 2026-07-17: User-reported state, code path and existing Chrome surface
  inspected.
- [x] 2026-07-17: Single-open accordion behavior and written design approved.
- [x] 2026-07-17: Task 1 implemented through red-green TDD and affected
  Numerology tests.
- [ ] 2026-07-17: Task 2 automated checks complete; Runtime E2E and Design
  Parity blocked by the blank existing Vite browser surface.

## Surprises & Discoveries

- The cards are already native `button` elements, but their clicks currently
  change only `selectedSelector`; compatibility mode does not render a separate
  detail panel for that selector.
- A compatibility conclusion selector already exists and is the default. It is
  therefore a stable collapsed sentinel without introducing nullable or local
  disclosure state.
- The checkout contains unrelated in-progress scheduling, DB and Numerology
  action-error work. None of those paths are owned by this plan.
- The first app typecheck was transiently blocked by an unowned timezone-schema
  export while that package was being rebuilt. A fresh retry passed after the
  concurrent package output appeared.
- Port `5174` remains listening and returns HTTP 200, but the existing Chrome
  tab renders no app DOM after navigation and reload. Project policy prevents
  restarting that long-running Vite process without direct user authority.

## Decision Log

- 2026-07-17, user: only one comparison card may be expanded at a time.
- 2026-07-17, user: approved controlled accordion approach.
- 2026-07-17, Codex: reuse `selectedSelector` and the conclusion selector rather
  than add component-local state, avoiding desynchronization with matrix
  selection and calculation changes.
- 2026-07-17, Codex: no new disclosure icon; active styling plus expanded
  content preserves the existing visual language without an unsupported
  reference deviation.

## Outcomes & Retrospective

The controlled selector transition, disclosure semantics, expanded wrapping and
focus-visible treatment are implemented in the owned Numerology files. The RED
model test failed for the expected missing module; after implementation, 2
focused files passed 5 tests, and the affected Numerology surface passed 17
files / 86 tests. Focused ESLint, app typecheck, app build, docs checks and diff
check passed.

Runtime E2E, keyboard exercise, responsive inspection and screenshot comparison
remain blocked because the already-running `localhost:5174` surface renders a
blank document in the existing Chrome tab. No service lifecycle action was
taken, and automated evidence is not being substituted for visual acceptance.

## Context and Orientation

- `CompatibilityWorkspace.tsx` owns the three comparison lists and can pass the
  compatibility conclusion selector to each list.
- `CompatibilityComparisonList.tsx` renders the native buttons and owns the
  `aria-expanded`/`data-expanded` presentation contract.
- `NumerologyComponents.module.css` currently applies unconditional nowrap,
  hidden overflow and ellipsis to each comparison heading.
- `CompatibilityWorkspace.test.tsx` proves rendered compatibility structure.
- A new focused model helper/test keeps the toggle transition out of JSX and
  proves open, close and switch behavior without a browser-only state machine.

## Interfaces and Dependencies

Create:

```ts
export function getCompatibilityComparisonSelection(
  currentSelector: string | null,
  comparisonSelector: string,
  collapsedSelector: string
): string;
```

Extend `CompatibilityComparisonList` props with:

```ts
readonly collapsedSelector: string;
```

The component computes `isExpanded` from
`selectedSelector === comparison.selector`, passes it to `aria-expanded` and
`data-expanded`, and calls the helper from the native button `onClick`.

## Plan of Work

### Task 1: Controlled comparison disclosure

**Files:**

- Create:
  `apps/astrologer-web/src/features/numerology/model/numerologyCompatibilityExpansionModel.ts`
- Create:
  `apps/astrologer-web/src/features/numerology/model/numerologyCompatibilityExpansionModel.test.ts`
- Modify:
  `apps/astrologer-web/src/features/numerology/components/CompatibilityComparisonList.tsx`
- Modify:
  `apps/astrologer-web/src/features/numerology/components/CompatibilityWorkspace.tsx`
- Modify:
  `apps/astrologer-web/src/features/numerology/components/CompatibilityWorkspace.test.tsx`
- Modify:
  `apps/astrologer-web/src/features/numerology/components/NumerologyComponents.module.css`

**Consumes:** The controlled `selectedSelector`, comparison selector and
`compatibility.conclusion.selector` already produced by the Numerology workspace
model.

**Produces:** `getCompatibilityComparisonSelection(...)`, controlled disclosure
markup and expanded/focus CSS states.

- [x] **Step 1: Write the failing model tests**

```ts
import { describe, expect, it } from "vitest";
import { getCompatibilityComparisonSelection } from "./numerologyCompatibilityExpansionModel";

describe("compatibility comparison expansion", () => {
  const conclusion = "compatibility:conclusion";
  const lifePath = "compatibility:key_numbers:lifePath";
  const birthday = "compatibility:key_numbers:birthday";

  it("opens a closed comparison", () => {
    expect(getCompatibilityComparisonSelection(conclusion, lifePath, conclusion)).toBe(lifePath);
  });

  it("collapses the open comparison back to the conclusion", () => {
    expect(getCompatibilityComparisonSelection(lifePath, lifePath, conclusion)).toBe(conclusion);
  });

  it("switches directly from one comparison to another", () => {
    expect(getCompatibilityComparisonSelection(lifePath, birthday, conclusion)).toBe(birthday);
  });
});
```

- [x] **Step 2: Run the focused test and confirm RED**

Run from `/Users/anton/Finext/ElevenHouse`:

```bash
pnpm --filter @elevenhouse/astrologer-web exec vitest run \
  src/features/numerology/model/numerologyCompatibilityExpansionModel.test.ts
```

Expected: FAIL because `numerologyCompatibilityExpansionModel` does not exist.

- [x] **Step 3: Add the minimal transition helper**

```ts
export function getCompatibilityComparisonSelection(
  currentSelector: string | null,
  comparisonSelector: string,
  collapsedSelector: string
): string {
  return currentSelector === comparisonSelector ? collapsedSelector : comparisonSelector;
}
```

- [x] **Step 4: Run the model test and confirm GREEN**

Run the Step 2 command again. Expected: three passing tests.

- [x] **Step 5: Add failing rendered-state assertions**

Extend `CompatibilityWorkspace.test.tsx` with a render using the life-path
comparison selector, then assert:

```ts
expect(markup.match(/aria-expanded="true"/g)).toHaveLength(1);
expect(markup.match(/aria-expanded="false"/g)).toHaveLength(2);
expect(markup).toContain('data-expanded="true"');
```

The existing default-conclusion render must assert there is no expanded card:

```ts
expect(markup).not.toContain('aria-expanded="true"');
```

- [x] **Step 6: Run component tests and confirm RED**

```bash
pnpm --filter @elevenhouse/astrologer-web exec vitest run \
  src/features/numerology/components/CompatibilityWorkspace.test.tsx
```

Expected: FAIL because comparison buttons do not yet expose controlled expanded
semantics.

- [x] **Step 7: Wire controlled disclosure markup**

In `CompatibilityComparisonList.tsx`, import the helper, add
`collapsedSelector`, compute `isExpanded` per comparison and render:

```tsx
<button
  aria-expanded={isExpanded}
  className={styles.comparisonRow}
  data-expanded={isExpanded ? "true" : undefined}
  data-selected={isExpanded ? "true" : undefined}
  onClick={() =>
    onSelect(
      getCompatibilityComparisonSelection(
        selectedSelector,
        comparison.selector,
        collapsedSelector
      )
    )
  }
  type="button"
>
```

In all three `CompatibilityWorkspace.tsx` list instances, pass:

```tsx
collapsedSelector={compatibility.conclusion.selector}
```

- [x] **Step 8: Add expanded and focus-visible CSS**

Keep the closed rule unchanged and add:

```css
.comparisonRow[data-expanded="true"] {
  align-items: start;
}

.comparisonRow[data-expanded="true"] .comparisonHeading,
.comparisonRow[data-expanded="true"] .comparisonHeading strong,
.comparisonRow[data-expanded="true"] .comparisonHeading small {
  overflow: visible;
  text-overflow: clip;
  white-space: normal;
  overflow-wrap: anywhere;
}

.comparisonRow:focus-visible {
  outline: 2px solid rgb(246 210 102 / 0.72);
  outline-offset: 2px;
}
```

- [x] **Step 9: Run the focused tests and confirm GREEN**

```bash
pnpm --filter @elevenhouse/astrologer-web exec vitest run \
  src/features/numerology/model/numerologyCompatibilityExpansionModel.test.ts \
  src/features/numerology/components/CompatibilityWorkspace.test.tsx
```

Expected: all focused tests pass with no warnings.

### Task 2: Affected-surface and runtime proof

**Files:**

- Modify: this plan's Progress and Outcomes sections with factual results.
- Create runtime evidence only under
  `.design-qa/numerology-compatibility-card-expansion/` when the browser state is
  available.

**Consumes:** Task 1 implementation and the already-running localhost surface.

**Produces:** fresh automated, type, build, accessibility, runtime and visual
evidence or an explicit blocker.

- [x] **Step 1: Run focused lint**

```bash
pnpm exec eslint \
  apps/astrologer-web/src/features/numerology/model/numerologyCompatibilityExpansionModel.ts \
  apps/astrologer-web/src/features/numerology/model/numerologyCompatibilityExpansionModel.test.ts \
  apps/astrologer-web/src/features/numerology/components/CompatibilityComparisonList.tsx \
  apps/astrologer-web/src/features/numerology/components/CompatibilityWorkspace.tsx \
  apps/astrologer-web/src/features/numerology/components/CompatibilityWorkspace.test.tsx
```

Expected: exit 0 with no lint errors.

- [x] **Step 2: Run app typecheck and build**

```bash
pnpm --filter @elevenhouse/astrologer-web typecheck
pnpm --filter @elevenhouse/astrologer-web build
```

Expected: both commands exit 0.

- [x] **Step 3: Run documentation and diff checks**

```bash
pnpm docs:check:test
pnpm docs:check
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 4: Exercise the existing Chrome tab — BLOCKED**

At `localhost:5174/numerology`, use the available compatibility result and
verify with Computer Use:

1. all comparison cards start collapsed;
2. clicking a card reveals its complete explanation inline;
3. clicking it again collapses it;
4. opening a second card closes the first;
5. Tab reaches a comparison button and Enter/Space toggles it;
6. focus is visible;
7. repeat at the current desktop viewport and a mobile-width responsive state
   if the existing browser surface permits it without changing process
   lifecycle;
8. no text clips or overflows the card.

Capture the closed and expanded states beside the user-reported reference under
`.design-qa/numerology-compatibility-card-expansion/`. If the saved result or
runtime is unavailable, record Runtime E2E and Design Parity as blocked rather
than substituting component tests.

- [x] **Step 5: Review owned diff and shared state**

```bash
git branch --show-current
git status --short
git diff --cached --name-status
git diff -- \
  apps/astrologer-web/src/features/numerology/model/numerologyCompatibilityExpansionModel.ts \
  apps/astrologer-web/src/features/numerology/model/numerologyCompatibilityExpansionModel.test.ts \
  apps/astrologer-web/src/features/numerology/components/CompatibilityComparisonList.tsx \
  apps/astrologer-web/src/features/numerology/components/CompatibilityWorkspace.tsx \
  apps/astrologer-web/src/features/numerology/components/CompatibilityWorkspace.test.tsx \
  apps/astrologer-web/src/features/numerology/components/NumerologyComponents.module.css \
  docs/superpowers/specs/2026-07-17-numerology-compatibility-card-expansion-design.md \
  docs/superpowers/plans/2026-07-17-numerology-compatibility-card-expansion.md
```

Confirm `main`, no owned staged entries, no unrelated diff in owned paths and no
silent fallback, fake state, oversized component or stale documentation.

## Concrete Steps

Execute Task 1 strictly red → green, then Task 2 in order. Before every coherent
edit group, re-read the complete target files and their current diffs. Do not
change process lifecycle or Git history.

## Validation and Acceptance

Acceptance requires focused model and component tests, ESLint, app typecheck,
app build, docs/diff checks, plus Runtime E2E and visual inspection in the
existing Chrome tab. Automated checks do not replace blocked browser evidence.

## Idempotence and Recovery

The selector transition is deterministic and safe to retry. All edits are
limited to new or explicitly owned files. If a target file changes concurrently,
stop the edit group, re-read its complete current content and adapt the patch;
never reset or overwrite the other change.

## Artifacts and Notes

- Design spec:
  `docs/superpowers/specs/2026-07-17-numerology-compatibility-card-expansion-design.md`
- Runtime evidence directory:
  `.design-qa/numerology-compatibility-card-expansion/`
- User-provided symptom screenshot:
  `/var/folders/wg/h1rz6b3965z0_7g93lc815lc0000gn/T/codex-clipboard-WUKAak.png`

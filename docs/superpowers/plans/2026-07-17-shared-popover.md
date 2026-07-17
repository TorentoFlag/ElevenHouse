# Shared Popover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable accessible `Popover` primitive and use it to close the Numerology calculations dropdown on outside pointer interaction.

**Architecture:** `packages/design-system` owns an anchored arbitrary-content disclosure with controlled/uncontrolled state, ARIA linkage, outside-pointer dismissal, Escape dismissal, and focus restoration. `astrologer-web` retains all calculation-specific content, callbacks, and visual styling. Existing `ActionMenu`, year-picker, comboboxes, and process lifecycle remain untouched.

**Tech Stack:** React 19, TypeScript 6, CSS, Vitest, Vite, pnpm.

## Global Constraints

- Work in the existing checkout on `main`; do not create a worktree or branch.
- Preserve all unowned shared-main edits and reread every target file plus its path diff immediately before editing.
- Do not commit, push, stage broad paths, start/stop services, or mutate external state; those actions are not authorized.
- Keep Numerology business state and content in `apps/astrologer-web`.
- Do not migrate other overlay consumers in this task.
- Preserve the current rendered geometry, colors, typography, borders, radii, shadow, z-index, and responsive presentation.
- Use behavioral TDD: observe each targeted test fail for the missing behavior before adding production code.

## Progress

- [x] 2026-07-17: shared Popover behavior test observed RED, then 6/6 GREEN after review hardening.
- [x] 2026-07-17: root export test observed RED, then shared packaging tests, typecheck and build reached GREEN.
- [x] 2026-07-17: Numerology composition test observed RED, then migrated menu test and affected 39-test surface reached GREEN.
- [x] 2026-07-17: astrologer-web ESLint, typecheck and production build passed.
- [ ] Runtime E2E and post-change visual comparison are blocked because Computer Use hangs while reading the existing Chrome tab; ports 5174 and 3002 are listening and no service lifecycle action was taken.
- [ ] A mounted component interaction test remains unavailable because the current Vitest setup has no DOM harness. Helper lifecycle, SSR composition and app composition are covered; actual effect/root wiring requires the blocked browser acceptance or a separately approved test-environment expansion.

## Surprises & Discoveries

- The current test environment has no browser DOM harness. The production document-listener lifecycle is therefore covered through the exact exported binding used by the component, while rendered outside-click/focus acceptance still requires the real browser.
- `vitest.config.ts` already contained an unowned Numerology Presentation alias; the Popover aliases were added without modifying that concurrent work.

## Decision Log

- 2026-07-17: use `pointerdown` rather than `click` so dismissal happens before the outside target's activation, matching the existing Numerology year-picker pattern.
- 2026-07-17: outside-pointer dismissal does not restore trigger focus; Escape dismissal does. This preserves the user's intended outside target focus while keeping keyboard recovery predictable.
- 2026-07-17: keep all calculation business callbacks and surface styles app-owned; only anchoring and interaction behavior live in the design system.
- 2026-07-17: code review moved outside `pointerdown` to document capture and Escape handling to the focused Popover root. This prevents propagation suppression and competing document-level Escape listeners across multiple Popovers.

## Outcomes & Retrospective

- Implemented the shared Popover package surface and migrated only the Numerology saved-calculation menu.
- Confirmed RED → GREEN for the new shared behavior, package export and app composition tests.
- Independent review found two interaction issues; both were fixed and re-reviewed with no remaining Critical implementation issue.
- After the concurrent Numerology Presentation edit settled, the fresh pre-commit repository gate passed with 403 test files and 1762 tests, 33 successful typecheck tasks, and 23 successful build tasks. Existing Vite chunk-size warnings remain non-blocking.
- Runtime and visual acceptance remain blocked by the unavailable Computer Use surface. The user-provided pre-change screenshot is stored at `.design-qa/shared-popover/reference-before.png`; no post-change screenshot is claimed.

---

## File Map

- Create `packages/design-system/src/components/Popover/Popover.tsx`: compound component, state, ARIA wiring, and dismissal binding.
- Create `packages/design-system/src/components/Popover/types.ts`: public props, alignment, and open-change reason types.
- Create `packages/design-system/src/components/Popover/Popover.css`: positioning-only shared classes.
- Create `packages/design-system/src/components/Popover/Popover.test.tsx`: server-render contract and dismissal binding tests.
- Create `packages/design-system/src/components/Popover/index.ts`: public component exports.
- Modify `packages/design-system/src/components/index.ts`: root component export.
- Modify `packages/design-system/src/index.test.ts`: root runtime export assertion.
- Modify `packages/design-system/package.json`: `Popover` and `Popover.css` subpath exports.
- Modify `vitest.config.ts`: source aliases for the two Popover subpaths while preserving the existing unowned Numerology Presentation alias.
- Modify `apps/astrologer-web/src/pages/numerology/NumerologyCalculationMenu.tsx`: replace native details/summary composition with Popover.
- Modify `apps/astrologer-web/src/pages/numerology/NumerologySavedWorkspace.module.css`: preserve button typography after replacing summary with a button.
- Modify `apps/astrologer-web/src/pages/numerology/NumerologySavedWorkspace.test.tsx`: assert Popover composition without weakening existing calculation behavior assertions.

---

### Task 1: Shared Popover behavior and packaging

**Files:**

- Create: `packages/design-system/src/components/Popover/Popover.test.tsx`
- Create: `packages/design-system/src/components/Popover/Popover.tsx`
- Create: `packages/design-system/src/components/Popover/Popover.css`
- Create: `packages/design-system/src/components/Popover/types.ts`
- Create: `packages/design-system/src/components/Popover/index.ts`
- Modify: `packages/design-system/src/components/index.ts`
- Modify: `packages/design-system/src/index.test.ts`
- Modify: `packages/design-system/package.json`
- Modify: `vitest.config.ts`

**Interfaces:**

- Produces: `Popover`, `Popover.Trigger`, `Popover.Content`.
- Produces: `PopoverAlign = "start" | "end"`.
- Produces: `PopoverOpenChangeReason = "trigger" | "outside-pointer" | "escape"`.
- Produces: `onOpenChange?: (open: boolean, reason: PopoverOpenChangeReason) => void`.
- Produces: `bindPopoverDismissal(documentTarget, root, onDismiss): () => void` for the component's capture-phase outside-pointer lifecycle.
- Produces internally: `handlePopoverEscape(event, trigger, onDismiss): boolean` for root-scoped Escape handling and focus restoration.

- [ ] **Step 1: Reread the shared targets and their live diffs**

Run:

```bash
sed -n '1,260p' packages/design-system/src/components/ActionMenu/ActionMenu.tsx
sed -n '1,220p' packages/design-system/src/components/index.ts
sed -n '1,220p' packages/design-system/src/index.test.ts
sed -n '1,240p' packages/design-system/package.json
sed -n '1,180p' vitest.config.ts
git diff -- packages/design-system/src/components/index.ts packages/design-system/src/index.test.ts packages/design-system/package.json vitest.config.ts
```

Expected: no conflicting edits in design-system targets; the existing `@elevenhouse/numerology-presentation` alias in `vitest.config.ts` remains unowned and must be preserved.

- [ ] **Step 2: Write the failing Popover behavior test**

Create `Popover.test.tsx` with tests that:

```tsx
const closedMarkup = renderToStaticMarkup(
  <Popover>
    <Popover.Trigger>Расчёты</Popover.Trigger>
    <Popover.Content role="group">Сохранённые расчёты</Popover.Content>
  </Popover>
);
expect(closedMarkup).toContain('aria-expanded="false"');
expect(closedMarkup).not.toContain("Сохранённые расчёты");

const openMarkup = renderToStaticMarkup(
  <Popover defaultOpen>
    <Popover.Trigger>Расчёты</Popover.Trigger>
    <Popover.Content align="start" role="group">Сохранённые расчёты</Popover.Content>
  </Popover>
);
const contentId = openMarkup.match(/aria-controls="([^"]+)"/)?.[1];
expect(contentId).toBeTruthy();
expect(openMarkup).toContain(`id="${contentId}"`);
expect(openMarkup).toContain('data-align="start"');
```

Use a fake document listener registry with `bindPopoverDismissal` to prove:

```ts
pointerDown({ target: insideTarget });
expect(onDismiss).not.toHaveBeenCalled();
pointerDown({ target: outsideTarget });
expect(onDismiss).toHaveBeenCalledWith("outside-pointer");
cleanup();
expect(documentTarget.addEventListener).toHaveBeenCalledWith("pointerdown", pointerDown, true);
expect(documentTarget.removeEventListener).toHaveBeenCalledWith("pointerdown", pointerDown, true);
```

Exercise `handlePopoverEscape` separately to prove Escape dismissal, event
prevention, stopped ancestor bubbling and focus restoration. Also assert
disabled trigger markup and that `Popover.css` defines root/content/start/end
selectors.

- [ ] **Step 3: Run the Popover test and observe RED**

Run:

```bash
pnpm exec vitest run packages/design-system/src/components/Popover/Popover.test.tsx
```

Expected: FAIL because `Popover.tsx`, `Popover.css`, and the exported API do not exist.

- [ ] **Step 4: Implement the minimal public types**

Create `types.ts` with:

```ts
import type { ComponentPropsWithoutRef, ReactNode } from "react";

export type PopoverAlign = "start" | "end";
export type PopoverOpenChangeReason = "trigger" | "outside-pointer" | "escape";

export type PopoverProps = Omit<ComponentPropsWithoutRef<"div">, "children"> & {
  readonly children: ReactNode;
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly onOpenChange?: (open: boolean, reason: PopoverOpenChangeReason) => void;
};

export type PopoverTriggerProps = ComponentPropsWithoutRef<"button">;
export type PopoverContentProps = Omit<ComponentPropsWithoutRef<"div">, "id"> & {
  readonly align?: PopoverAlign;
};
```

- [ ] **Step 5: Implement the minimal compound component and dismissal binding**

Create `Popover.tsx` with one context shared by the three public component functions. The root must resolve controlled state as `controlledOpen ?? internalOpen`, keep root/trigger refs and a `useId()` content id, and expose this exact context behavior:

```ts
type PopoverContextValue = {
  readonly contentId: string;
  readonly open: boolean;
  readonly requestOpenChange: (open: boolean, reason: PopoverOpenChangeReason) => void;
  readonly triggerRef: RefObject<HTMLButtonElement | null>;
};
```

The open-only effect binds against `root.ownerDocument`:

```ts
return bindPopoverDismissal(root.ownerDocument, root, (reason) => {
  requestOpenChange(false, reason);
});
```

`bindPopoverDismissal` must register `pointerdown` in capture phase, ignore
targets contained by the root, dismiss outside targets without focusing the
trigger, and remove the listener with the same capture option. The root
`onKeyDown` path must respect an already-prevented event; otherwise Escape calls
`preventDefault()`, `stopPropagation()`, dismisses only that root and then
focuses its trigger.

`Popover.Trigger` renders `type="button"` by default, `aria-expanded`, and `aria-controls`; it calls a consumer `onClick` first and toggles only when the event was not prevented and the button is not disabled. `Popover.Content` returns `null` while closed and otherwise renders the generated id, `data-align`, and ordinary consumer HTML/ARIA props.

Export the compound API with:

```ts
export const Popover = Object.assign(PopoverRoot, {
  Trigger: PopoverTrigger,
  Content: PopoverContent
});
```

- [ ] **Step 6: Add positioning-only CSS and local exports**

Create `Popover.css`:

```css
.ehPopover {
  position: relative;
  display: inline-flex;
}

.ehPopover__content {
  position: absolute;
  z-index: 30;
  top: calc(100% + 6px);
}

.ehPopover__content--start { left: 0; }
.ehPopover__content--end { right: 0; }
```

Create `index.ts`:

```ts
export { Popover, bindPopoverDismissal } from "./Popover.js";
export type {
  PopoverAlign,
  PopoverContentProps,
  PopoverOpenChangeReason,
  PopoverProps,
  PopoverTriggerProps
} from "./types.js";
```

- [ ] **Step 7: Run the Popover test and observe GREEN**

Run:

```bash
pnpm exec vitest run packages/design-system/src/components/Popover/Popover.test.tsx
```

Expected: PASS with outside/inside/Escape/cleanup assertions all executed.

- [ ] **Step 8: Write the failing root-export assertion**

Add to `packages/design-system/src/index.test.ts`:

```ts
expect(designSystem.Popover).toBeTypeOf("function");
```

Run:

```bash
pnpm exec vitest run packages/design-system/src/index.test.ts
```

Expected: FAIL because the component index does not export Popover yet.

- [ ] **Step 9: Wire package and test-resolution exports**

Add `export * from "./Popover/index.js";` to `packages/design-system/src/components/index.ts`.

Add these exact subpaths to `packages/design-system/package.json`:

```json
"./components/Popover": {
  "types": "./dist/components/Popover/index.d.ts",
  "import": "./dist/components/Popover/index.js"
},
"./components/Popover.css": "./src/components/Popover/Popover.css"
```

Add source aliases for `@elevenhouse/design-system/components/Popover` and `.css` to `vitest.config.ts`, adjacent to the existing design-system aliases, without altering the unowned Numerology Presentation alias.

- [ ] **Step 10: Verify shared packaging GREEN**

Run:

```bash
pnpm exec vitest run packages/design-system/src/components/Popover/Popover.test.tsx packages/design-system/src/index.test.ts
pnpm --filter @elevenhouse/design-system typecheck
pnpm --filter @elevenhouse/design-system build
```

Expected: all tests pass; typecheck and build exit 0.

---

### Task 2: Migrate the Numerology calculations dropdown

**Files:**

- Modify: `apps/astrologer-web/src/pages/numerology/NumerologySavedWorkspace.test.tsx`
- Modify: `apps/astrologer-web/src/pages/numerology/NumerologyCalculationMenu.tsx`
- Modify: `apps/astrologer-web/src/pages/numerology/NumerologySavedWorkspace.module.css`

**Interfaces:**

- Consumes: `Popover`, `Popover.Trigger`, `Popover.Content`, `Popover.css` from Task 1.
- Preserves: all existing `NumerologyCalculationMenuProps` callbacks and item rendering.

- [ ] **Step 1: Reread the Numerology targets and their live diffs**

Run:

```bash
sed -n '1,220p' apps/astrologer-web/src/pages/numerology/NumerologyCalculationMenu.tsx
sed -n '1,180p' apps/astrologer-web/src/pages/numerology/NumerologySavedWorkspace.module.css
sed -n '1,220p' apps/astrologer-web/src/pages/numerology/NumerologySavedWorkspace.test.tsx
git diff -- apps/astrologer-web/src/pages/numerology/NumerologyCalculationMenu.tsx apps/astrologer-web/src/pages/numerology/NumerologySavedWorkspace.module.css apps/astrologer-web/src/pages/numerology/NumerologySavedWorkspace.test.tsx
```

Expected: current callback/copy changes are preserved exactly; stop only if a new incompatible semantic edit appears.

- [ ] **Step 2: Write the failing Numerology composition test**

Import `Popover`, then extend the existing menu test:

```ts
const popover = findRequiredElementByType(view, Popover);
const content = findRequiredElementByType(view, Popover.Content);

expect(popover).toBeDefined();
expect(content.props.align).toBe("start");
expect(content.props.role).toBe("group");
expect(content.props["aria-labelledby"]).toBe("saved-calculations-title");
```

Keep all current selection/create/recalculate/delete callback assertions.

- [ ] **Step 3: Run the Numerology test and observe RED**

Run:

```bash
pnpm exec vitest run apps/astrologer-web/src/pages/numerology/NumerologySavedWorkspace.test.tsx
```

Expected: FAIL because the current component still renders native `<details>`.

- [ ] **Step 4: Replace details/summary with Popover composition**

Import the component and CSS:

```ts
import { Popover } from "@elevenhouse/design-system/components/Popover";
import "@elevenhouse/design-system/components/Popover.css";
```

Replace the component return value with this complete composition while keeping
the existing `formatUpdatedAt` helper unchanged:

```tsx
<Popover className={styles.calculationMenu}>
  <Popover.Trigger
    className={styles.calculationMenuTrigger}
    aria-label="Открыть список расчётов"
  >
    Расчёты
    <span className={styles.calculationCount}>{items.length}</span>
  </Popover.Trigger>
  <Popover.Content
    align="start"
    className={styles.calculationPopover}
    role="group"
    aria-labelledby="saved-calculations-title"
  >
    <div className={styles.calculationMenuHeader}>
      <strong id="saved-calculations-title">Сохранённые расчёты</strong>
      <button type="button" disabled={disabled} onClick={onCreate}>
        Новый расчёт
      </button>
    </div>
    <div className={styles.calculationList} role="list">
      {items.length > 0 ? (
        items.map((item) => (
          <div key={item.id} role="listitem">
            <button
              type="button"
              className={styles.calculationItem}
              aria-current={item.id === selectedCalculationId ? "true" : undefined}
              disabled={disabled}
              onClick={() => onSelect(item.calculation)}
            >
              <span className={styles.calculationItemTitle}>{item.title}</span>
              <span className={styles.calculationItemMeta}>
                {item.modeLabel} · {item.participantLabel} ·{" "}
                <time dateTime={item.updatedAt}>{formatUpdatedAt(item.updatedAt)}</time>
              </span>
            </button>
          </div>
        ))
      ) : (
        <p className={styles.calculationEmpty}>Сохранённых расчётов пока нет</p>
      )}
    </div>
    {selectedCalculationId ? (
      <div className={styles.calculationMenuActions}>
        <button type="button" disabled={disabled} onClick={onRecalculate}>
          Пересчитать
        </button>
        <button
          type="button"
          className={styles.calculationArchiveAction}
          disabled={disabled}
          onClick={onArchive}
        >
          Удалить расчёт
        </button>
      </div>
    ) : null}
  </Popover.Content>
</Popover>
```

Do not pass `disabled` to the trigger: current busy behavior allows opening the dropdown while disabling only its business actions.

- [ ] **Step 5: Preserve exact trigger typography**

Remove the obsolete `::-webkit-details-marker` rule and add `font-family: inherit;` to `.calculationMenuTrigger`. Do not alter any other dimensions or visual tokens.

- [ ] **Step 6: Run the Numerology test and observe GREEN**

Run:

```bash
pnpm exec vitest run apps/astrologer-web/src/pages/numerology/NumerologySavedWorkspace.test.tsx
```

Expected: PASS, including all pre-existing callback assertions and new Popover composition assertions.

- [ ] **Step 7: Verify the affected Numerology component surface**

Run:

```bash
pnpm exec vitest run apps/astrologer-web/src/pages/numerology/NumerologySavedWorkspace.test.tsx apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx
pnpm exec eslint packages/design-system/src/components/Popover apps/astrologer-web/src/pages/numerology/NumerologyCalculationMenu.tsx apps/astrologer-web/src/pages/numerology/NumerologySavedWorkspace.test.tsx
pnpm --filter @elevenhouse/astrologer-web typecheck
pnpm --filter @elevenhouse/astrologer-web build
```

Expected: tests, lint, typecheck, and build exit 0. If an unowned current edit fails a broader command, record the exact unrelated failure instead of modifying that work.

---

### Task 3: Runtime and design-parity evidence

**Files:**

- Create or update only task-specific artifacts under `.design-qa/shared-popover/` if the existing browser surface is available.

**Interfaces:**

- Consumes: the completed Popover and migrated Numerology menu.
- Produces: interaction, focus, screenshot, geometry, console, and network evidence.

- [ ] **Step 1: Check existing runtime availability without lifecycle changes**

Run read-only port checks from `docs/development/commands.md`, then inspect the user's existing Chrome tab through Computer Use. Do not launch, stop, restart, or switch service ports.

Expected: an existing authenticated Numerology route is available, or Runtime E2E is marked blocked with the exact missing surface/service.

- [ ] **Step 2: Exercise the required interaction matrix**

At the current desktop viewport:

1. open `Расчёты` with the trigger;
2. click inside the header/list and verify it remains open;
3. click outside the Popover root and verify it closes;
4. reopen, press Escape, verify it closes and focus returns to the trigger;
5. reopen and activate the trigger again to verify explicit toggle closure;
6. verify enabled/disabled calculation actions retain their current behavior.

- [ ] **Step 3: Capture design and runtime evidence**

Capture the open production state and record width, offset, padding, typography, colors, border, radius, shadow, z-index, and overflow. Compare against the pre-change screenshot/current approved production state. Inspect console and network for unexpected errors; this local state-only interaction should create no new request.

Expected: no visible geometry/token delta and no unexpected console/network activity.

- [ ] **Step 4: Run fresh final verification**

Run:

```bash
pnpm exec vitest run packages/design-system/src/components/Popover/Popover.test.tsx packages/design-system/src/index.test.ts apps/astrologer-web/src/pages/numerology/NumerologySavedWorkspace.test.tsx apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx
pnpm --filter @elevenhouse/design-system typecheck
pnpm --filter @elevenhouse/design-system build
pnpm --filter @elevenhouse/astrologer-web typecheck
pnpm --filter @elevenhouse/astrologer-web build
git diff --check -- packages/design-system apps/astrologer-web/src/pages/numerology docs/superpowers/specs/2026-07-17-shared-popover-design.md docs/superpowers/plans/2026-07-17-shared-popover.md vitest.config.ts
git status --short
```

Expected: targeted tests/typechecks/builds pass, diff check is clean, and final status separates owned Popover changes from all unowned shared-main work.

- [ ] **Step 5: Report without committing**

Report implemented files, exact fresh commands/results, browser artifacts or blocker, skipped checks/residual risk, and unowned changes noticed but not touched. Do not stage or commit without a separate explicit request.

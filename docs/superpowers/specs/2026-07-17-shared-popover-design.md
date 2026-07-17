# Shared Popover Design

**Status:** approved by the user on 2026-07-17; implementation not started

## Outcome

Add a reusable anchored `Popover` primitive to `@elevenhouse/design-system`
and use it for the Numerology saved-calculations dropdown. The dropdown must
close on an outside pointer interaction while preserving its current visual
geometry and app-owned calculation workflow.

## Scope

In scope:

- a shared arbitrary-content `Popover` component;
- trigger toggle, outside-pointer dismissal and Escape dismissal;
- focus restoration to the trigger after Escape;
- stable trigger/content ARIA linkage;
- bottom placement with start/end alignment;
- migration of `NumerologyCalculationMenu` from native `<details>` to the new
  primitive;
- automated interaction and packaging coverage plus browser verification of
  the affected Numerology state.

Out of scope:

- changing calculation list content, actions or business state;
- changing the approved dropdown appearance;
- migrating `ActionMenu`, `NumerologyYearPicker`, comboboxes or other existing
  overlays in the same change;
- portal rendering, viewport collision avoidance or arbitrary floating
  geometry;
- introducing `menu`, `listbox` or `select` semantics into the generic
  primitive.

## Architecture

The reusable primitive lives in:

```text
packages/design-system/src/components/Popover/
  Popover.tsx
  Popover.css
  Popover.test.tsx
  types.ts
  index.ts
```

It is exported from the design-system component index and package exports.
Numerology keeps its calculation-specific composition and styling in
`apps/astrologer-web/src/pages/numerology/`.

The component is named `Popover`, not `Dropdown`: it provides an anchored
arbitrary-content disclosure. Consumers remain responsible for choosing the
correct content semantics, such as dialog, menu or listbox.

## Component contract

The public composition is:

```tsx
<Popover defaultOpen={false}>
  <Popover.Trigger className={styles.calculationMenuTrigger}>
    Расчёты
  </Popover.Trigger>
  <Popover.Content
    align="start"
    className={styles.calculationPopover}
    role="group"
    aria-labelledby="saved-calculations-title"
  >
    {/* app-owned content */}
  </Popover.Content>
</Popover>
```

`Popover` supports uncontrolled state through `defaultOpen` and controlled
state through `open` plus `onOpenChange`. `Popover.Trigger` renders a native
button and owns `aria-expanded` and `aria-controls`. `Popover.Content` renders
only while open and accepts ordinary HTML role/ARIA attributes without
inventing semantics for the consumer.

The primitive supplies only anchoring classes and state attributes. The
consumer supplies surface-specific width, spacing, colors, borders, radii,
shadow and content layout, preserving the exact Numerology visual contract.

## Interaction behavior

- Activating the trigger toggles the popover.
- Pointer interaction inside the root leaves it open.
- Pointer interaction outside the root closes it through a capture-phase
  document listener, even when the outside control stops event propagation.
- Escape is handled at the focused Popover root, closes only that Popover,
  stops ancestor bubble handling and restores focus to the trigger.
- Outside-pointer dismissal does not steal focus back from the clicked target.
- The outside-pointer document listener exists only while the popover is open
  and is removed with matching capture options on close and unmount.
- Opening one popover does not introduce global business state or affect other
  overlays.

Clicks on Numerology actions keep their existing callback behavior. This task
does not add automatic close-after-action behavior because the requested bug is
specifically outside-click dismissal.

## Error and edge handling

- A disabled trigger cannot open the popover.
- Controlled mode reports requested state changes through `onOpenChange` and
  does not silently mutate consumer state.
- The implementation uses the root element's `ownerDocument`, so listeners are
  bound to the correct document and are safe for tests or embedded documents.
- Server rendering starts from the supplied controlled/default state and does
  not access `document` during render.

## Testing and evidence

Behavioral TDD covers:

1. closed trigger accessibility and packaging exports;
2. trigger opening and closing;
3. inside pointer interaction remaining open;
4. outside pointer interaction closing;
5. Escape dismissal and focus restoration;
6. listener cleanup;
7. disabled trigger behavior;
8. controlled-state notifications;
9. Numerology composition retaining its saved items and actions.

Verification expands from targeted Popover and Numerology tests to
design-system and astrologer-web typecheck/build. Runtime acceptance uses the
existing Chrome tab and current services without changing process lifecycle:
open the calculations popover, click inside, click outside, reopen with the
trigger, dismiss with Escape, verify focus, and inspect console/network. The
open-state screenshot and computed geometry are compared with the current
approved production state; no visual delta is expected.

If the required browser surface or existing service is unavailable, automated
verification may complete, but runtime/design acceptance remains explicitly
blocked.

## Owned paths

- `packages/design-system/src/components/Popover/**`
- `packages/design-system/src/components/index.ts`
- `packages/design-system/package.json`
- `vitest.config.ts` only if the new subpath needs a test alias
- `apps/astrologer-web/src/pages/numerology/NumerologyCalculationMenu.tsx`
- `apps/astrologer-web/src/pages/numerology/NumerologySavedWorkspace.module.css`
- relevant Numerology component tests
- this specification and the later implementation plan

All pre-existing shared-main changes are unowned and must be preserved. Before
each edit, the implementation rereads the current target file and its path
diff. No commit, push, process lifecycle change or external write is authorized
by this design approval.

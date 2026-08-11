# Task 4 Report: Builder Frame, Palette, and Inspector

## Scope and Sources

- Outcome: align the `/flows` builder frame, palette, inspector, and run history with the Task 4 visual contract without changing production commands, authorization, CAS handling, runtime availability, or node kinds.
- Product/architecture source: `AGENTS.md`, current Flows contracts and UI code.
- Visual source: `http://localhost:8000/ElevenHouse.html`, Flows reference builder, `ElevenHouseDesign/app/flow-builder.jsx`, and Task 4 brief.
- Owned paths: the six Task 4 source/test/CSS paths below plus this report.
- Unowned path preserved: `docs/superpowers/specs/2026-08-11-astro-diary-design.md`.

## Implemented

- Kept normal saved, unsaved, and read-only status inside the named builder `<header role="group">`; the compact status is a live `role="status"` announcement. The legacy separate normal-layout status row/class is not rendered.
- Kept unsaved-exit, mutation, revision-conflict, validation, and server-error rows in document flow.
- Rendered compact palette rows with a 28 px categorical icon, title, and subtitle. Existing disabled rules are unchanged.
- Reused `getFlowNodeVisual` for palette and inspector icon/category metadata; no node kind or production contract changed.
- Retuned the existing three-column builder and translucent panel styling: a border-box 60 px header with 14 px gap, 244 px palette, 340 px inspector, and `rgba(13, 12, 32, 0.6)` panel backgrounds.
- Recomposed the existing palette DOM without changing node data or callbacks: the aside has no blanket padding, its heading/hint form a 62 px rhythm, and the scrollable groups body has 12 px side padding. At desktop 1440 px, palette rows target 209 by 51 px; they use a 5 px vertical gap, 11 px radius, and 12.5 px title.

## Behavioral TDD Evidence

1. RED, before implementation:

   ```bash
   pnpm exec vitest run \
     apps/astrologer-web/src/features/flows/ui/FlowBuilder.test.tsx \
     apps/astrologer-web/src/features/flows/ui/FlowBuilderInspector.test.tsx \
     apps/astrologer-web/src/features/flows/ui/FlowRunHistoryPanel.test.tsx \
     --config vitest.config.ts
   ```

   Result: 2 expected failures. The builder header lacked the accessible compact-status semantics, and palette rows lacked categorical icon/title/subtitle markup.

2. GREEN, after implementation:

   ```bash
   pnpm exec vitest run \
     apps/astrologer-web/src/features/flows/ui/FlowBuilder.test.tsx \
     apps/astrologer-web/src/features/flows/ui/FlowBuilderInspector.test.tsx \
     apps/astrologer-web/src/features/flows/ui/FlowRunHistoryPanel.test.tsx \
     --config vitest.config.ts
   pnpm --filter @elevenhouse/astrologer-web typecheck
   git diff --check
   ```

   Result: 3 test files / 25 tests passed; astrologer-web typecheck passed; `git diff --check` passed.

3. Review fix RED, before the accessibility correction:

   ```bash
   pnpm --filter @elevenhouse/astrologer-web exec vitest run src/features/flows/ui/FlowBuilder.test.tsx
   ```

   Result: 3 expected failures out of 20 tests. The named header still exposed `banner` instead of `group`, and saved, unsaved-after-edit, and published read-only status had no `role="status"` live region.

4. Review fix GREEN, after the correction:

   ```bash
   pnpm exec vitest run \
     apps/astrologer-web/src/features/flows/ui/FlowBuilder.test.tsx \
     apps/astrologer-web/src/features/flows/ui/FlowBuilderInspector.test.tsx \
     apps/astrologer-web/src/features/flows/ui/FlowRunHistoryPanel.test.tsx \
     --config vitest.config.ts
   pnpm --filter @elevenhouse/astrologer-web typecheck
   git diff --check
   ```

   Result: 3 test files / 27 tests passed; astrologer-web typecheck passed; `git diff --check` passed. The expanded builder tests assert saved, actual unsaved edit, published read-only, conflict/validation/mutation alert separation, and disabled palette actions for both no source and non-editable active-version states.

## Visual Evidence

- Reference inspected: `http://localhost:8000/ElevenHouse.html` at desktop `1440x1000`; opened `Воронки` and the `Авто-разбор в записи` builder state.
- Reference composition verified against `ElevenHouseDesign/app/flow-builder.jsx`: 60 px subheader, 14 px header gap, 244 px palette, canvas, and 340 px inspector.
- Authenticated production `/flows` is available in the controller browser context. The implementer’s isolated DevTools context redirects `http://localhost:5174/flows` to `/auth`; that is an isolation-specific limitation, not an overall browser-acceptance blocker.

## Blocked and Residual Risk

- No overall browser-acceptance blocker: the controller browser has authenticated production access. The isolated implementer tab remains unauthenticated and redirects to `/auth`, so it cannot independently repeat the controller's network-backed builder checks.
- Not run: repository-wide `pnpm verify`; Task 4 affects only the focused astrologer-web UI paths, and the brief requires the focused suites plus typecheck.
- No mocks, fake data, AI Flow generation, consent flow, node kinds, commands, authorization, CAS behavior, or runtime states were introduced or changed.

## Commit

- `feat(flows): align builder frame and panels`

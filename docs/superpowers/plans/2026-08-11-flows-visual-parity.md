# Flows Visual Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the complete astrologer `/flows` route measurably match the ElevenHouse reference on desktop and mobile without changing Flow business contracts or server behavior.

**Architecture:** Keep `FlowsPageView` and the current production Flow components as the composition and behavior boundaries. Extend the existing visual model, share one compact graph-preview component between desktop and mobile, and isolate canvas viewport mathematics in one pure tested module; all styling remains page-scoped in `FlowsPage.module.css`.

**Tech Stack:** React 19, TypeScript 6, CSS Modules, Vitest, Testing Library, `@elevenhouse/contracts`, `@elevenhouse/design-system`, Chrome DevTools MCP.

## Global Constraints

- Reference visual truth is `http://localhost:8000/ElevenHouse.html` in the exact Flow state being compared.
- Production data, Flow contracts, CAS, publication, enrollment, authorization, runtime history, and failure states remain authoritative.
- Do not add fake metrics, mock fallbacks, AI Flow generation, backend changes, DB migrations, or global app-shell styling.
- Desktop evidence viewport is `1440x900`; mobile evidence viewport is `390x844`.
- Use real network-backed production state for browser acceptance.
- Keep card activation and card navigation as separate accessible controls.
- Published graphs remain immutable; pan, zoom, fit, selection, and inspection may remain interactive.
- Before each source edit, re-read the target file and its current diff because the checkout is shared.
- Stage and commit only exact owned files after checking the shared index.

---

## File Structure

### New files

- `apps/astrologer-web/src/features/flows/ui/FlowGraphPreview.tsx`: shared semantic graph preview for desktop and mobile gallery cards.
- `apps/astrologer-web/src/features/flows/model/flowCanvasViewport.ts`: pure viewport clamp, pan, zoom-at-point, and fit calculations.
- `apps/astrologer-web/src/features/flows/model/flowCanvasViewport.test.ts`: unit tests for viewport mathematics.

### Existing files to modify

- `apps/astrologer-web/src/features/flows/ui/flowsVisualModel.ts`: exhaustive node-kind visual metadata alongside existing gallery presentation data.
- `apps/astrologer-web/src/features/flows/ui/flowsVisualModel.test.ts`: full supported-kind mapping coverage.
- `apps/astrologer-web/src/features/flows/ui/FlowGallery.tsx`: reference card hierarchy with real lifecycle data.
- `apps/astrologer-web/src/features/flows/ui/FlowGallery.test.tsx`: preview, navigation, and switch behavior.
- `apps/astrologer-web/src/features/flows/ui/FlowsMobileList.tsx`: reference mobile card composition with shared graph preview.
- `apps/astrologer-web/src/features/flows/ui/FlowsMobileList.test.tsx`: mobile preview and command separation.
- `apps/astrologer-web/src/features/flows/ui/FlowCreateDialog.tsx`: only markup hooks needed for measured reference styling.
- `apps/astrologer-web/src/features/flows/ui/FlowCreateDialog.test.tsx`: real-template and unsupported-AI assertions.
- `apps/astrologer-web/src/features/flows/ui/FlowBuilder.tsx`: single-row header, compact real status, viewport persistence wiring.
- `apps/astrologer-web/src/features/flows/ui/FlowBuilder.test.tsx`: header status, read-only behavior, and viewport command tests.
- `apps/astrologer-web/src/features/flows/ui/FlowNodePalette.tsx`: compact icon/title/subtitle palette items.
- `apps/astrologer-web/src/features/flows/ui/FlowBuilderCanvas.tsx`: transformed viewport, controls, panning, and node dragging.
- `apps/astrologer-web/src/features/flows/ui/FlowBuilderCanvas.test.tsx`: interaction and immutability tests.
- `apps/astrologer-web/src/features/flows/ui/FlowBuilderInspector.tsx`: categorical icon treatment and compact production facts.
- `apps/astrologer-web/src/features/flows/ui/FlowRunHistoryPanel.tsx`: markup hooks for compact inspector integration if existing hooks are insufficient.
- `apps/astrologer-web/src/features/flows/ui/FlowMobileDagProjection.module.css`: mobile builder visual parity.
- `apps/astrologer-web/src/pages/flows/FlowsPage.module.css`: complete page-scoped desktop/mobile visual implementation.
- `apps/astrologer-web/src/pages/flows/FlowsPage.styles.test.ts`: CSS contract checks for stable geometry and responsive boundaries.
- `apps/astrologer-web/src/pages/flows/FlowsPageView.test.tsx`: integrated gallery/builder state assertions where component tests cannot cover composition.

---

### Task 1: Exhaustive Node Visuals and Shared Graph Preview

**Files:**
- Create: `apps/astrologer-web/src/features/flows/ui/FlowGraphPreview.tsx`
- Modify: `apps/astrologer-web/src/features/flows/ui/flowsVisualModel.ts`
- Test: `apps/astrologer-web/src/features/flows/ui/flowsVisualModel.test.ts`
- Test: `apps/astrologer-web/src/features/flows/ui/FlowGallery.test.tsx`

**Interfaces:**
- Produces: `FlowVisualTone = "trigger" | "communication" | "chartAi" | "logic" | "human" | "result" | "error"`.
- Produces: `getFlowNodeVisual(kind: FlowNodeKindV2, locale: FlowDisplayLocale): { iconName; label; tone }` with an exhaustive `Record<FlowNodeKindV2, ...>` implementation.
- Produces: `FlowGraphPreview({ nodeKinds, locale, classNames, maxVisibleNodes? })` for both gallery layouts.

- [ ] **Step 1: Add failing exhaustive visual-model tests**

Add a table containing every current `FlowNodeKindV2` and assert the exact tone and localized label. Retain the existing assertion that no conversion or completion metric is fabricated.

```ts
const expectedTones = {
  booking_confirmed: "trigger",
  manual_client: "trigger",
  birth_data_available: "logic",
  natal_chart_request: "chartAi",
  natal_chart_ai_draft: "chartAi",
  send_message: "communication",
  astrologer_work_item: "human",
  astrologer_approval: "human",
  completed: "result",
  suppressed: "result",
  failed: "error"
} as const satisfies Record<FlowNodeKindV2, FlowVisualTone>;
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
pnpm exec vitest run \
  apps/astrologer-web/src/features/flows/ui/flowsVisualModel.test.ts \
  apps/astrologer-web/src/features/flows/ui/FlowGallery.test.tsx \
  --config vitest.config.ts
```

Expected: failure because `FlowVisualTone`, `getFlowNodeVisual`, and `FlowGraphPreview` do not exist.

- [ ] **Step 3: Implement the exhaustive mapping and shared preview**

Move the current duplicated icon and localized node-label maps out of `FlowGallery.tsx` into `flowsVisualModel.ts`. Build `FlowGraphPreview` with semantic titles, `data-tone`, 26 px visual nodes, connectors between visible nodes, and a compact `+N` overflow indicator. Keep icon names constrained to `Icon` props.

- [ ] **Step 4: Run focused tests and typecheck**

```bash
pnpm exec vitest run \
  apps/astrologer-web/src/features/flows/ui/flowsVisualModel.test.ts \
  apps/astrologer-web/src/features/flows/ui/FlowGallery.test.tsx \
  --config vitest.config.ts
pnpm --filter @elevenhouse/astrologer-web typecheck
```

Expected: all commands exit `0`.

- [ ] **Step 5: Commit the visual model boundary**

```bash
git add -- \
  apps/astrologer-web/src/features/flows/ui/FlowGraphPreview.tsx \
  apps/astrologer-web/src/features/flows/ui/flowsVisualModel.ts \
  apps/astrologer-web/src/features/flows/ui/flowsVisualModel.test.ts \
  apps/astrologer-web/src/features/flows/ui/FlowGallery.test.tsx
git commit -m "refactor(flows): centralize graph preview visuals"
```

### Task 2: Desktop and Mobile Gallery Parity

**Files:**
- Modify: `apps/astrologer-web/src/features/flows/ui/FlowGallery.tsx`
- Modify: `apps/astrologer-web/src/features/flows/ui/FlowsMobileList.tsx`
- Test: `apps/astrologer-web/src/features/flows/ui/FlowGallery.test.tsx`
- Test: `apps/astrologer-web/src/features/flows/ui/FlowsMobileList.test.tsx`
- Modify: `apps/astrologer-web/src/pages/flows/FlowsPage.module.css`
- Test: `apps/astrologer-web/src/pages/flows/FlowsPage.styles.test.ts`

**Interfaces:**
- Consumes: `FlowGraphPreview` and `getFlowNodeVisual` from Task 1.
- Preserves: `onOpenFlow` and `onAutomationAction` signatures without nested buttons.
- Produces: the same visual hierarchy for desktop and mobile cards, with server-backed labels in every slot.

- [ ] **Step 1: Add failing gallery behavior and structure tests**

Assert that desktop and mobile cards both render graph previews, that clicking the open surface invokes only `onOpenFlow`, and that clicking the switch invokes only `onAutomationAction`.

```ts
fireEvent.click(screen.getByRole("button", { name: "Open flow: Подготовка консультации" }));
expect(onOpenFlow).toHaveBeenCalledWith(flow.id);
expect(onAutomationAction).not.toHaveBeenCalled();

fireEvent.click(screen.getByRole("switch", { name: /automation/i }));
expect(onAutomationAction).toHaveBeenCalledOnce();
expect(onOpenFlow).toHaveBeenCalledOnce();
```

- [ ] **Step 2: Run gallery tests and verify RED**

```bash
pnpm exec vitest run \
  apps/astrologer-web/src/features/flows/ui/FlowGallery.test.tsx \
  apps/astrologer-web/src/features/flows/ui/FlowsMobileList.test.tsx \
  apps/astrologer-web/src/pages/flows/FlowsPage.styles.test.ts \
  --config vitest.config.ts
```

Expected: mobile preview and the new structural/style hooks are absent.

- [ ] **Step 3: Recompose cards without changing their commands**

Use a shared preview header, real title/status rows, compact real facts, and a labeled activation pill. Keep the desktop grid at three columns with 16 px gaps. Match these measured desktop values: 60 px gallery header, 64 px preview, 26 px graph nodes, 14 x 2 px connectors, 14 px 16 px body padding, approximately 211 px card height, 20 px card radius, and reference shadows.

For `390x844`, match the reference compact header and card sequence while retaining the production bottom navigation and timezone warning. Use stable mobile card width `calc(100% - 20px)` with 10 px side margins, 16 px radius, and at least 44 px switch hit area.

- [ ] **Step 4: Run gallery tests, typecheck, and build**

```bash
pnpm exec vitest run \
  apps/astrologer-web/src/features/flows/ui/FlowGallery.test.tsx \
  apps/astrologer-web/src/features/flows/ui/FlowsMobileList.test.tsx \
  apps/astrologer-web/src/pages/flows/FlowsPage.styles.test.ts \
  --config vitest.config.ts
pnpm --filter @elevenhouse/astrologer-web typecheck
pnpm --filter @elevenhouse/astrologer-web build
```

Expected: all commands exit `0`.

- [ ] **Step 5: Commit gallery parity**

```bash
git add -- \
  apps/astrologer-web/src/features/flows/ui/FlowGallery.tsx \
  apps/astrologer-web/src/features/flows/ui/FlowGallery.test.tsx \
  apps/astrologer-web/src/features/flows/ui/FlowsMobileList.tsx \
  apps/astrologer-web/src/features/flows/ui/FlowsMobileList.test.tsx \
  apps/astrologer-web/src/pages/flows/FlowsPage.module.css \
  apps/astrologer-web/src/pages/flows/FlowsPage.styles.test.ts
git commit -m "feat(flows): match gallery reference composition"
```

### Task 3: Create Dialog and Route-Owned States

**Files:**
- Modify: `apps/astrologer-web/src/features/flows/ui/FlowCreateDialog.tsx`
- Test: `apps/astrologer-web/src/features/flows/ui/FlowCreateDialog.test.tsx`
- Modify: `apps/astrologer-web/src/pages/flows/FlowsPage.module.css`
- Test: `apps/astrologer-web/src/pages/flows/FlowsPageView.test.tsx`

**Interfaces:**
- Preserves: template eligibility, required product selection, loading, retry, blank creation, focus trap, and focus restoration.
- Excludes: the reference AI prompt because no production capability exists.

- [ ] **Step 1: Add failing dialog state tests**

Assert that available templates remain commands, unavailable templates expose the real blocker, product-required templates cannot submit without an eligible product, Escape closes the modal, and no AI generation input or command is present.

```ts
expect(screen.queryByRole("textbox", { name: /AI|нейросет/i })).toBeNull();
expect(screen.getByRole("button", { name: /Подготовка консультации/ })).toBeEnabled();
expect(screen.getByText(/Нет активных услуг/)).toBeTruthy();
```

- [ ] **Step 2: Run dialog and composition tests and verify RED**

```bash
pnpm exec vitest run \
  apps/astrologer-web/src/features/flows/ui/FlowCreateDialog.test.tsx \
  apps/astrologer-web/src/pages/flows/FlowsPageView.test.tsx \
  --config vitest.config.ts
```

Expected: the new visual structure hooks or assertions fail while existing product behavior remains green.

- [ ] **Step 3: Add only the markup hooks needed by the reference layout**

Keep the current dialog logic. Match a desktop width of 720 px, maximum viewport height of 86%, 26 px content padding, 20 px title, two-column template grid with 12 px gaps, reference backdrop blur, and mobile single-column layout. Style loading, requested-template, unavailable, product-selection, and retry states using the same spacing system.

- [ ] **Step 4: Run focused tests and accessibility audit tests**

```bash
pnpm exec vitest run \
  apps/astrologer-web/src/features/flows/ui/FlowCreateDialog.test.tsx \
  apps/astrologer-web/src/pages/flows/FlowsPageView.test.tsx \
  --config vitest.config.ts
pnpm --filter @elevenhouse/astrologer-web typecheck
```

Expected: all commands exit `0`.

- [ ] **Step 5: Commit dialog parity**

```bash
git add -- \
  apps/astrologer-web/src/features/flows/ui/FlowCreateDialog.tsx \
  apps/astrologer-web/src/features/flows/ui/FlowCreateDialog.test.tsx \
  apps/astrologer-web/src/pages/flows/FlowsPage.module.css \
  apps/astrologer-web/src/pages/flows/FlowsPageView.test.tsx
git commit -m "feat(flows): align create dialog with reference"
```

### Task 4: Builder Frame, Palette, and Inspector

**Files:**
- Modify: `apps/astrologer-web/src/features/flows/ui/FlowBuilder.tsx`
- Test: `apps/astrologer-web/src/features/flows/ui/FlowBuilder.test.tsx`
- Modify: `apps/astrologer-web/src/features/flows/ui/FlowNodePalette.tsx`
- Modify: `apps/astrologer-web/src/features/flows/ui/FlowBuilderInspector.tsx`
- Modify: `apps/astrologer-web/src/features/flows/ui/FlowRunHistoryPanel.tsx`
- Modify: `apps/astrologer-web/src/pages/flows/FlowsPage.module.css`

**Interfaces:**
- Consumes: `getFlowNodeVisual` from Task 1.
- Preserves: all save, publish, create-next-version, manual-run, validation, CAS-conflict, and node-edit callbacks.
- Produces: one 60 px normal header; actionable error and conflict rows remain separate.

- [ ] **Step 1: Add failing builder frame tests**

Assert that saved, unsaved, and published read-only status is rendered inside the builder header; the old normal-layout status row is absent; conflict and validation alerts remain separate; palette items retain their disabled rules and expose icon/title/subtitle structure.

```ts
expect(screen.getByRole("banner", { name: "Flow editor header" })).toHaveTextContent(
  "Published"
);
expect(screen.queryByTestId("builder-save-state-row")).toBeNull();
expect(screen.getByRole("button", { name: /Add node: Send message/ })).toBeDisabled();
```

- [ ] **Step 2: Run builder tests and verify RED**

```bash
pnpm exec vitest run \
  apps/astrologer-web/src/features/flows/ui/FlowBuilder.test.tsx \
  apps/astrologer-web/src/features/flows/ui/FlowBuilderInspector.test.tsx \
  apps/astrologer-web/src/features/flows/ui/FlowRunHistoryPanel.test.tsx \
  --config vitest.config.ts
```

Expected: header semantics and compact palette markup are absent.

- [ ] **Step 3: Implement the compact frame without changing commands**

Move normal saved/read-only copy into a compact header status. Keep mutation, validation, conflict, and unsaved-exit rows in document flow. Match the measured 60 px header, 14 px gap, 244 px palette, 340 px inspector, reference translucent panel backgrounds, and body height `calc(100dvh - app-header - 60px)` in normal state.

Render palette rows with a 28 px categorical icon, 12.5 px title, 11 px subtitle, 9 px 10 px padding, 11 px radius, and 5 px vertical item gap. Use the same category metadata in inspector headers. Restyle run history into the inspector rhythm without hiding runtime errors or server states.

- [ ] **Step 4: Run focused tests and typecheck**

```bash
pnpm exec vitest run \
  apps/astrologer-web/src/features/flows/ui/FlowBuilder.test.tsx \
  apps/astrologer-web/src/features/flows/ui/FlowBuilderInspector.test.tsx \
  apps/astrologer-web/src/features/flows/ui/FlowRunHistoryPanel.test.tsx \
  --config vitest.config.ts
pnpm --filter @elevenhouse/astrologer-web typecheck
```

Expected: all commands exit `0`.

- [ ] **Step 5: Commit builder framing**

```bash
git add -- \
  apps/astrologer-web/src/features/flows/ui/FlowBuilder.tsx \
  apps/astrologer-web/src/features/flows/ui/FlowBuilder.test.tsx \
  apps/astrologer-web/src/features/flows/ui/FlowNodePalette.tsx \
  apps/astrologer-web/src/features/flows/ui/FlowBuilderInspector.tsx \
  apps/astrologer-web/src/features/flows/ui/FlowRunHistoryPanel.tsx \
  apps/astrologer-web/src/pages/flows/FlowsPage.module.css
git commit -m "feat(flows): align builder frame and panels"
```

### Task 5: Tested Canvas Viewport Mathematics

**Files:**
- Create: `apps/astrologer-web/src/features/flows/model/flowCanvasViewport.ts`
- Create: `apps/astrologer-web/src/features/flows/model/flowCanvasViewport.test.ts`

**Interfaces:**
- Produces: `FLOW_CANVAS_MIN_ZOOM = 0.35` and `FLOW_CANVAS_MAX_ZOOM = 1.6`.
- Produces: `clampFlowCanvasZoom(zoom: number): number`.
- Produces: `panFlowCanvasViewport(viewport, delta): FlowPresentationV1["viewport"]`.
- Produces: `zoomFlowCanvasAtPoint(viewport, nextZoom, point): FlowPresentationV1["viewport"]` preserving the graph point under the cursor.
- Produces: `fitFlowCanvasViewport({ container, bounds, padding }): FlowPresentationV1["viewport"]`.

- [ ] **Step 1: Write failing pure viewport tests**

Cover min/max clamp, pan deltas, cursor-anchored zoom, fit centering, and zero-size container fallback.

```ts
expect(clampFlowCanvasZoom(0.1)).toBe(0.35);
expect(clampFlowCanvasZoom(2)).toBe(1.6);
expect(panFlowCanvasViewport({ x: 10, y: 20, zoom: 1 }, { x: 5, y: -4 })).toEqual({
  x: 15,
  y: 16,
  zoom: 1
});
```

- [ ] **Step 2: Run the model test and verify RED**

```bash
pnpm exec vitest run \
  apps/astrologer-web/src/features/flows/model/flowCanvasViewport.test.ts \
  --config vitest.config.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement pure finite-number-safe calculations**

Reject no input and add no policy layer. Normalize only non-finite numeric results back to `{ x: 0, y: 0, zoom: 1 }` because transforms cannot render them. Fit uses actual node bounds plus the supplied padding and clamps the resulting zoom.

- [ ] **Step 4: Run model tests and typecheck**

```bash
pnpm exec vitest run \
  apps/astrologer-web/src/features/flows/model/flowCanvasViewport.test.ts \
  --config vitest.config.ts
pnpm --filter @elevenhouse/astrologer-web typecheck
```

Expected: all commands exit `0`.

- [ ] **Step 5: Commit viewport mathematics**

```bash
git add -- \
  apps/astrologer-web/src/features/flows/model/flowCanvasViewport.ts \
  apps/astrologer-web/src/features/flows/model/flowCanvasViewport.test.ts
git commit -m "feat(flows): add tested canvas viewport model"
```

### Task 6: Canvas Pan, Zoom, Fit, and Draft Node Dragging

**Files:**
- Modify: `apps/astrologer-web/src/features/flows/ui/FlowBuilderCanvas.tsx`
- Test: `apps/astrologer-web/src/features/flows/ui/FlowBuilderCanvas.test.tsx`
- Modify: `apps/astrologer-web/src/features/flows/ui/FlowBuilder.tsx`
- Test: `apps/astrologer-web/src/features/flows/ui/FlowBuilder.test.tsx`
- Modify: `apps/astrologer-web/src/pages/flows/FlowsPage.module.css`

**Interfaces:**
- Consumes: viewport functions from Task 5.
- Adds to `FlowBuilderCanvasProps`: `onChangeViewport?: (viewport: FlowPresentationV1["viewport"]) => void`.
- Preserves: `onMoveNode(nodeId, position)` as the only node-position mutation command.
- Published behavior: local viewport may change, but `onChangeViewport` and `onMoveNode` are never called when `editable` is false.

- [ ] **Step 1: Add failing canvas interaction tests**

Mock `getBoundingClientRect` with stable dimensions. Assert zoom button updates the transform, fit centers all nodes, pointer drag calls `onMoveNode` only for editable graphs, and published graph pan/zoom never invokes persistence callbacks.

```ts
fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
expect(screen.getByTestId("flow-canvas-viewport").style.transform).toContain("scale(");

fireEvent.pointerDown(node, { pointerId: 1, clientX: 100, clientY: 100 });
fireEvent.pointerMove(node, { pointerId: 1, clientX: 140, clientY: 120 });
fireEvent.pointerUp(node, { pointerId: 1, clientX: 140, clientY: 120 });
expect(onMoveNode).toHaveBeenCalled();
```

- [ ] **Step 2: Run canvas and builder tests and verify RED**

```bash
pnpm exec vitest run \
  apps/astrologer-web/src/features/flows/ui/FlowBuilderCanvas.test.tsx \
  apps/astrologer-web/src/features/flows/ui/FlowBuilder.test.tsx \
  --config vitest.config.ts
```

Expected: viewport controls, transform hook, and pointer dragging are absent.

- [ ] **Step 3: Implement the bounded viewport controller**

Render one transformed inner viewport containing edges and nodes. Use Pointer Events with pointer capture for pan and editable node drag. Wheel zoom must call `preventDefault` only over the canvas. Provide minus, percentage, plus, and fit controls with localized accessible names. Use local viewport state for immediate interaction; call `onChangeViewport` at interaction completion only for editable drafts. Wire that callback in `FlowBuilder` to update `draftPresentation.viewport` and mark the draft dirty.

Use the reference 13.2 px dot grid at the measured desktop state, bottom-left controls, hidden canvas overflow, 12 px node radius, categorical top accent, and selected-node focus ring. Keep accessible edge descriptions outside the transformed visual layer.

- [ ] **Step 4: Run focused tests, typecheck, and build**

```bash
pnpm exec vitest run \
  apps/astrologer-web/src/features/flows/model/flowCanvasViewport.test.ts \
  apps/astrologer-web/src/features/flows/ui/FlowBuilderCanvas.test.tsx \
  apps/astrologer-web/src/features/flows/ui/FlowBuilder.test.tsx \
  --config vitest.config.ts
pnpm --filter @elevenhouse/astrologer-web typecheck
pnpm --filter @elevenhouse/astrologer-web build
```

Expected: all commands exit `0`.

- [ ] **Step 5: Commit canvas interaction parity**

```bash
git add -- \
  apps/astrologer-web/src/features/flows/ui/FlowBuilderCanvas.tsx \
  apps/astrologer-web/src/features/flows/ui/FlowBuilderCanvas.test.tsx \
  apps/astrologer-web/src/features/flows/ui/FlowBuilder.tsx \
  apps/astrologer-web/src/features/flows/ui/FlowBuilder.test.tsx \
  apps/astrologer-web/src/pages/flows/FlowsPage.module.css
git commit -m "feat(flows): add reference canvas interactions"
```

### Task 7: Mobile Builder, Responsive States, and Dialog Integration

**Files:**
- Modify: `apps/astrologer-web/src/features/flows/ui/FlowMobileDagProjection.module.css`
- Test: `apps/astrologer-web/src/features/flows/ui/FlowMobileDagProjection.test.tsx`
- Modify: `apps/astrologer-web/src/pages/flows/FlowsPage.module.css`
- Test: `apps/astrologer-web/src/pages/flows/FlowsPage.styles.test.ts`
- Test: `apps/astrologer-web/src/pages/flows/FlowsPageView.test.tsx`

**Interfaces:**
- Preserves: the existing mobile DAG projection and shared palette/inspector modal content.
- Produces: stable layouts for loading, empty, timezone warning, activation review, pause confirmation, validation, conflict, and runtime-history states.

- [ ] **Step 1: Add failing responsive structure tests**

Assert that mobile builder renders explicit add/configure commands, opens the shared palette and inspector in modal sheets, keeps runtime history reachable, and does not render the desktop canvas.

```ts
expect(screen.queryByLabelText("Flow graph")).toBeNull();
fireEvent.click(screen.getByRole("button", { name: "Add step" }));
expect(screen.getByRole("dialog", { name: "Add step" })).toBeTruthy();
```

- [ ] **Step 2: Run mobile and style tests and verify RED**

```bash
pnpm exec vitest run \
  apps/astrologer-web/src/features/flows/ui/FlowMobileDagProjection.test.tsx \
  apps/astrologer-web/src/pages/flows/FlowsPage.styles.test.ts \
  apps/astrologer-web/src/pages/flows/FlowsPageView.test.tsx \
  --config vitest.config.ts
```

Expected: new responsive hooks or exact modal-state assertions fail.

- [ ] **Step 3: Complete page-scoped responsive styling**

At `max-width: 720px`, remove desktop-only builder columns, retain 44 px touch targets, prevent horizontal text overflow, and match reference card and toolbar density. Style production-only warnings and errors with the same surface, radius, typography, and spacing family without hiding their content. Ensure modal sheets fit `390x844` without controls under the bottom navigation.

- [ ] **Step 4: Run the complete affected frontend Flow suite**

```bash
pnpm exec vitest run \
  apps/astrologer-web/src/features/flows \
  apps/astrologer-web/src/pages/flows \
  --config vitest.config.ts
pnpm --filter @elevenhouse/astrologer-web typecheck
pnpm --filter @elevenhouse/astrologer-web build
```

Expected: all commands exit `0`.

- [ ] **Step 5: Commit responsive parity**

```bash
git add -- \
  apps/astrologer-web/src/features/flows/ui/FlowMobileDagProjection.module.css \
  apps/astrologer-web/src/features/flows/ui/FlowMobileDagProjection.test.tsx \
  apps/astrologer-web/src/pages/flows/FlowsPage.module.css \
  apps/astrologer-web/src/pages/flows/FlowsPage.styles.test.ts \
  apps/astrologer-web/src/pages/flows/FlowsPageView.test.tsx
git commit -m "feat(flows): finish responsive visual parity"
```

### Task 8: Browser Measurement Loop and Final Verification

**Files:**
- Modify only files from Tasks 1-7 when browser evidence identifies a concrete mismatch.

**Interfaces:**
- Consumes: the complete network-backed `/flows` route.
- Produces: screenshot, computed-style, interaction, console, and network evidence for the requested states.

- [ ] **Step 1: Verify local targets before interaction**

```bash
curl -fsS http://localhost:8000/ElevenHouse.html >/dev/null
curl -fsS http://localhost:5174/flows >/dev/null
curl -fsS http://localhost:3002/health >/dev/null
```

Expected: all commands exit `0`. Reuse the already running services; do not restart a healthy process.

- [ ] **Step 2: Authenticate and capture matching desktop states**

Use Chrome DevTools MCP at `1440x900`. Authenticate production with the local test account, open the reference Flow gallery and matching production gallery, then capture gallery, create dialog, published builder, draft builder with selected node, runtime history, and timezone warning.

- [ ] **Step 3: Compare computed styles element by element**

For each visible root, header, button, card, graph node, connector, chip, switch, modal, palette item, canvas node, control, inspector section, and run row, record bounding box plus computed padding, gap, font, color, background, border, radius, shadow, overflow, and z-index. Fix page-scoped mismatches and rerun the affected test before continuing.

- [ ] **Step 4: Capture matching mobile states**

Use `390x844` mobile/touch emulation. Compare gallery, create dialog, mobile DAG, palette sheet, inspector sheet, and runtime history. Verify no text overlap, clipped commands, hidden modal actions, or horizontal page scroll.

- [ ] **Step 5: Verify interactions and browser health**

Exercise card open, activation review without confirming an unintended mutation, create-dialog close/focus restore, builder selection, pan, zoom, fit, draft node drag, mobile sheets, and keyboard focus order. Inspect console and network requests; unresolved errors fail acceptance.

- [ ] **Step 6: Run final automated gates**

```bash
pnpm exec vitest run \
  apps/astrologer-web/src/features/flows \
  apps/astrologer-web/src/pages/flows \
  --config vitest.config.ts
pnpm --filter @elevenhouse/astrologer-web typecheck
pnpm --filter @elevenhouse/astrologer-web build
pnpm lint
```

Expected: all commands exit `0`.

- [ ] **Step 7: Run GitNexus change detection and commit final measured corrections**

Run `detect_changes(scope: "all")`, review direct callers and the `FlowsPage` process, then stage only exact Flow UI paths.

```bash
git diff --check
git status --short
git commit -m "fix(flows): close measured visual parity gaps"
```

Skip the final commit when the measurement loop produced no additional diff.

---

## Plan Self-Review

- Every spec surface maps to a task: gallery and mobile in Tasks 1-2, create dialog in Task 3, builder frame/palette/inspector/history in Task 4, canvas in Tasks 5-6, responsive states in Task 7, and computed browser evidence in Task 8.
- No task changes backend contracts, DB schema, workers, authorization, enrollment semantics, or global shell styles.
- The only new behavior model is pure viewport mathematics; graph and lifecycle behavior continue through existing callbacks and contracts.
- The shared graph preview removes real duplication between desktop and mobile.
- Tests target observable behavior; CSS assertions are secondary to computed-style browser evidence.

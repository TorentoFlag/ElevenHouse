# Flows Product Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. ElevenHouse repository policy
> overrides generic worktree/feature-branch guidance: execute in the existing
> checkout on `main`, preserve concurrent changes, and do not commit without
> separate user authority.

**Goal:** Turn the existing Flows foundation into an honest production
astrologer-side section: real `/flows` UI, template-based draft editing,
runtime history, approval queue and internal automation primitives without
unsafe external auto-send.

**Architecture:** Flows is a domain orchestration layer above CRM, products,
orders, booking, chart calculations, AI, messaging, notifications and
analytics. Flow definitions remain versioned and immutable at publication time;
runtime execution records are stored separately as events, runs, step runs,
approvals, suppressions and delivery attempts. UI reads real API state and must
not invent business progress, fake conversions or browser-local automation.

**Tech Stack:** TypeScript 6, Zod contracts, NestJS, Drizzle/PostgreSQL, Vitest,
React 19, Vite 8, TanStack Query, CSS Modules, Browser/Chrome visual QA.

## Global Constraints

- Work only in the current ElevenHouse checkout on `main`.
- Preserve unrelated dirty files and untracked work; stage only owned paths
  after explicit commit authority.
- Do not start, stop, restart or kill local services without direct user
  authority.
- Do not run destructive `db:reset` without explicit local DB authority and
  confirmed local host/port.
- Product label is `Воронки`; internal/contracts/API naming is `flows`.
- Use `/flows` as the production route unless a separate product decision
  requires a `/funnels` compatibility redirect.
- Do not implement external `auto_send` in this plan.
- Do not route messages around Messaging/Notifications modules.
- Do not route payments around Products/Orders/Finance/Payment use cases.
- Do not route bookings around Booking/Availability use cases.
- Do not calculate astrology, numerology, matrix or Human Design inside Flows;
  call the existing calculation domain/workers through explicit ports.
- Every runtime side effect must be idempotent, auditable and owner-scoped.
- External delivery requires owner relationship, channel consent, quiet hours,
  frequency caps, provider capability and delivery-attempt records.
- Live video consultation flows must pause or create a handoff; they must not
  auto-book, auto-charge or auto-send final consultation content.
- Visual implementation must follow the exact `ElevenHouseDesign` reference
  state after mapping it through approved production business logic.

---

## Current Evidence

- Existing completed plan:
  `docs/superpowers/plans/2026-07-26-flows-foundation.md`.
- Existing completed plan:
  `docs/superpowers/plans/2026-07-26-flows-persistence-api.md`.
- Product research:
  `docs/superpowers/specs/2026-07-26-flows-automation-product-research.md`.
- Current contracts/domain/API/DB foundation:
  - `packages/contracts/src/flows.ts`
  - `packages/domain/src/flows/*`
  - `packages/db/src/schema/flows/*`
  - `packages/db/src/adapters/flows/*`
  - `apps/astrologer-api/src/modules/flows/*`
- Current in-progress frontend artifact is untracked:
  `apps/astrologer-web/src/features/flows/*`.
- Current `apps/astrologer-web/src/router.tsx` has no `/flows` route.
- Design reference used for visual scope:
  `http://localhost:8000/ElevenHouse.html`
  - desktop gallery: four flow cards, total counters, create button;
  - desktop builder: top bar, palette, canvas, inspector, test-run control;
  - mobile flows: vertical cards, stats, toggles, open scheme action;
  - mobile dashboard: `Задачи из воронок` cross-surface tasks.

## Product Model

Flows are not a marketing discovery funnel. They are practice automation for a
closed astrologer CRM:

- capture lead or order context;
- request missing birth/profile data;
- create calculation jobs through existing calculation surfaces;
- create AI drafts and astrologer briefs;
- create manual tasks and handoffs;
- request payment or offer slots through existing modules;
- deliver async materials only after approval and delivery gates;
- record why every step ran, waited, required approval, skipped or failed.

First useful production behaviors:

- template gallery and draft builder;
- publish/version validation;
- dry-run simulation with no external effects;
- manual/internal runs for safe actions;
- approval inbox and dashboard/inbox/client signals;
- later manual approve/send, still without `auto_send`.

## Non-Goals

- No automatic outbound messages in the first runtime release.
- No real provider sends without Messaging/Notifications delivery gates.
- No AstroCalendar direct "send now" shortcut.
- No fake conversion, revenue or run metrics.
- No cross-promo astrologer discovery or shared client audience.
- No marketplace-style template browsing beyond platform-owned templates.

## File Structure

### Canonical Docs

- Modify: `docs/architecture/design-reference-inventory.md`
- Modify: `docs/architecture/backend-modules.md`
- Modify: `docs/api/api-boundaries.md`
- Modify: `docs/superpowers/plans/2026-07-28-flows-product-runtime.md`

### Contracts

- Modify: `packages/contracts/src/flows.ts`
- Modify: `packages/contracts/src/flows.test.ts`

### Domain

- Modify: `packages/domain/src/flows/flow-store.ts`
- Modify: `packages/domain/src/flows/flow-use-cases.ts`
- Modify: `packages/domain/src/flows/flow-run-state.ts`
- Create: `packages/domain/src/flows/flow-runtime-store.ts`
- Create: `packages/domain/src/flows/flow-runtime-use-cases.ts`
- Create: `packages/domain/src/flows/flow-eligibility.ts`
- Create: `packages/domain/src/flows/flow-runtime-use-cases.test.ts`
- Create: `packages/domain/src/flows/flow-eligibility.test.ts`
- Modify: `packages/domain/src/flows/index.ts`

### Database

- Modify: `packages/db/src/schema/flows/flows-values.ts`
- Create: `packages/db/src/schema/flows/flow-runtime.schema.ts`
- Modify: `packages/db/src/schema/flows/index.ts`
- Modify: `packages/db/src/schema/flows/flows.schema.test.ts`
- Create: `packages/db/src/adapters/flows/drizzle-flow-runtime-store.ts`
- Create: `packages/db/src/adapters/flows/drizzle-flow-runtime-store.test.ts`
- Modify: `packages/db/src/adapters/flows/index.ts`
- Modify: `packages/db/drizzle/0000_sticky_rictor.sql`
- Modify: `packages/db/drizzle/meta/0000_snapshot.json`

### Astrologer API

- Modify: `apps/astrologer-api/src/modules/flows/flows.controller.ts`
- Create: `apps/astrologer-api/src/modules/flows/flow-runs.controller.ts`
- Create: `apps/astrologer-api/src/modules/flows/flow-approvals.controller.ts`
- Modify: `apps/astrologer-api/src/modules/flows/flows.service.ts`
- Modify: `apps/astrologer-api/src/modules/flows/flows.module.ts`
- Modify: `apps/astrologer-api/src/modules/flows/flows.tokens.ts`
- Modify: `apps/astrologer-api/src/modules/flows/flows.service.test.ts`
- Modify: `apps/astrologer-api/src/modules/flows/flows.e2e.test.ts`

### Astrologer Web Feature

- Own or replace current untracked files under
  `apps/astrologer-web/src/features/flows/`.
- Modify/Create:
  - `apps/astrologer-web/src/features/flows/api/*`
  - `apps/astrologer-web/src/features/flows/model/*`
  - `apps/astrologer-web/src/features/flows/ui/FlowGallery.tsx`
  - `apps/astrologer-web/src/features/flows/ui/FlowGallery.test.tsx`
  - `apps/astrologer-web/src/features/flows/ui/FlowBuilder.tsx`
  - `apps/astrologer-web/src/features/flows/ui/FlowBuilder.test.tsx`
  - `apps/astrologer-web/src/features/flows/ui/FlowRuntimePanel.tsx`
  - `apps/astrologer-web/src/features/flows/ui/FlowRuntimePanel.test.tsx`
  - `apps/astrologer-web/src/features/flows/ui/FlowApprovalQueue.tsx`
  - `apps/astrologer-web/src/features/flows/ui/FlowApprovalQueue.test.tsx`
  - `apps/astrologer-web/src/features/flows/ui/FlowsMobileList.tsx`
  - `apps/astrologer-web/src/features/flows/ui/FlowsMobileList.test.tsx`
  - `apps/astrologer-web/src/features/flows/ui/flowsVisualModel.ts`
  - `apps/astrologer-web/src/features/flows/ui/flowsVisualModel.test.ts`

### Astrologer Web Page

- Create: `apps/astrologer-web/src/pages/flows/FlowsPage.tsx`
- Create: `apps/astrologer-web/src/pages/flows/FlowsPageView.tsx`
- Create: `apps/astrologer-web/src/pages/flows/FlowsPage.module.css`
- Create: `apps/astrologer-web/src/pages/flows/FlowsPage.test.tsx`
- Create: `apps/astrologer-web/src/pages/flows/FlowsPageView.test.tsx`
- Create: `apps/astrologer-web/src/pages/flows/FlowsRoute.test.tsx`
- Modify: `apps/astrologer-web/src/router.tsx`

### Cross-Surface Signals

- Modify: `apps/astrologer-web/src/pages/dashboard/DashboardPage.tsx`
- Modify: `apps/astrologer-web/src/pages/dashboard/DashboardPage.module.css`
- Modify: `apps/astrologer-web/src/pages/dashboard/DashboardPage.test.tsx`
- Modify: `apps/astrologer-web/src/pages/inbox/InboxPage.tsx`
- Modify: `apps/astrologer-web/src/pages/inbox/InboxPageView.tsx`
- Modify: `apps/astrologer-web/src/pages/inbox/InboxPage.test.tsx`
- Modify: `apps/astrologer-web/src/pages/astro-calendar/AstroCalendarPageView.tsx`
- Modify: `apps/astrologer-web/src/pages/astro-calendar/AstroCalendarPageView.test.tsx`

## Interfaces

### Contract Additions

Produce these schemas and types in `packages/contracts/src/flows.ts`:

```ts
export const flowRuntimeEventSourceSchema = z.enum([
  "crm",
  "product",
  "order",
  "booking",
  "message",
  "chart",
  "astro_calendar",
  "manual"
]);

export const flowRuntimeEventSchema = z.object({
  id: uuidSchema,
  ownerUserId: uuidSchema,
  source: flowRuntimeEventSourceSchema,
  sourceEventId: z.string().trim().min(1).max(180),
  dedupeKey: z.string().trim().min(1).max(240),
  subjectType: z.enum(["client", "segment", "order", "booking", "global_event", "manual"]),
  subjectId: z.string().trim().min(1).max(180),
  occurredAt: instantSchema,
  payload: recordSchema.default({})
}).strict();

export const simulateFlowRunRequestSchema = z.object({
  source: flowRuntimeEventSourceSchema,
  subjectType: z.enum(["client", "segment", "order", "booking", "global_event", "manual"]),
  subjectId: z.string().trim().min(1).max(180),
  occurredAt: instantSchema,
  timeZone: z.string().trim().min(1).max(120),
  payload: recordSchema.default({})
}).strict();
```

Also produce DTOs for:

- `ListFlowRunsQuery`
- `ListFlowRunsResponse`
- `FlowRunResponse`
- `FlowStepRunResponse`
- `ListFlowApprovalsQuery`
- `ListFlowApprovalsResponse`
- `DecideFlowApprovalRequest`
- `DecideFlowApprovalResponse`
- `SimulateFlowRunResponse`

### Domain Runtime Port

Create this port in
`packages/domain/src/flows/flow-runtime-store.ts`:

```ts
export type FlowRuntimeStore = {
  createEvent(input: CreateFlowRuntimeEventInput): Promise<FlowRuntimeEventRecord>;
  findEventByDedupeKey(input: FindFlowRuntimeEventByDedupeKeyInput): Promise<FlowRuntimeEventRecord | null>;
  createRun(input: CreateFlowRunRecordInput): Promise<FlowRunRecord>;
  createStepRun(input: CreateFlowStepRunRecordInput): Promise<FlowStepRunRecord>;
  listRunsByOwner(input: ListFlowRunsByOwnerInput): Promise<FlowRunListResult>;
  listApprovalsByOwner(input: ListFlowApprovalsByOwnerInput): Promise<FlowApprovalListResult>;
  createApproval(input: CreateFlowApprovalRecordInput): Promise<FlowApprovalRecord>;
  decideApproval(input: DecideFlowApprovalRecordInput): Promise<FlowApprovalRecord | null>;
};
```

### API Endpoints

Add these endpoints after runtime contracts exist:

```text
POST /flows/:flowId/simulate
POST /flows/:flowId/manual-runs
GET  /flows/:flowId/runs
GET  /flow-runs/:runId
POST /flow-runs/:runId/cancel
GET  /flow-approvals
POST /flow-approvals/:approvalId/decision
```

All mutating endpoints require `@RequireCsrf()`. All endpoints require
`AstrologerSessionAuthGuard` and owner scoping through
`currentAstrologerAccount.account.id`.

---

## Plan Of Work

### Task 1: Canonical Truth Sync

**Files:**

- Modify: `docs/architecture/design-reference-inventory.md`
- Modify: `docs/architecture/backend-modules.md`
- Modify: `docs/api/api-boundaries.md`
- Modify: `docs/superpowers/plans/2026-07-28-flows-product-runtime.md`

**Interfaces:**

- Consumes current implemented state from contracts/domain/db/API and design
  reference.
- Produces a single durable map for route naming, module ownership, API state
  and deferred runtime scope.

- [x] **Step 1: Verify current source state**

Run:

```bash
git status --short --branch
rg -n "flows|flow-templates|funnels|Automation/funnels" docs/architecture docs/api apps packages
```

Expected: branch is `main`; flow foundation paths exist; unrelated dirty files
are not edited by this task.

- [x] **Step 2: Update design inventory**

Change the Automation/funnels row to record:

```markdown
Current implementation: contracts/domain/db/API foundation exists for flows,
including templates, draft CRUD and immutable publish. Production UI route,
runtime execution, approvals, events and delivery attempts are still missing.
Route decision: product label "Воронки"; internal/API naming "flows"; target
production route "/flows".
```

- [x] **Step 3: Update backend modules docs**

Add `flows` to `astrologer-api` module ownership with this boundary:

```markdown
Flows owns automation definitions, versions, runtime runs and approvals.
It orchestrates module use cases through explicit ports/jobs and must not
implement payment, booking, messaging delivery or chart calculation logic
inside controllers or app-local scripts.
```

- [x] **Step 4: Update API boundaries**

Document current shipped endpoints and future runtime endpoints separately:

```text
Current:
GET /flow-templates
GET /flows
POST /flows
GET /flows/:flowId
PATCH /flows/:flowId/draft
POST /flows/:flowId/publish

Planned runtime:
POST /flows/:flowId/simulate
POST /flows/:flowId/manual-runs
GET /flows/:flowId/runs
GET /flow-runs/:runId
POST /flow-runs/:runId/cancel
GET /flow-approvals
POST /flow-approvals/:approvalId/decision
```

- [x] **Step 5: Verify docs**

Run:

```bash
git diff -- docs/architecture/design-reference-inventory.md docs/architecture/backend-modules.md docs/api/api-boundaries.md docs/superpowers/plans/2026-07-28-flows-product-runtime.md
git diff --check -- docs/architecture/design-reference-inventory.md docs/architecture/backend-modules.md docs/api/api-boundaries.md docs/superpowers/plans/2026-07-28-flows-product-runtime.md
```

Expected: only flow-related documentation changed; whitespace check passes.

### Task 2: Frontend Route And Page State Model

**Files:**

- Own or replace: `apps/astrologer-web/src/features/flows/*`
- Create: `apps/astrologer-web/src/pages/flows/FlowsPage.tsx`
- Create: `apps/astrologer-web/src/pages/flows/FlowsPageView.tsx`
- Create: `apps/astrologer-web/src/pages/flows/FlowsPage.module.css`
- Create: `apps/astrologer-web/src/pages/flows/FlowsPage.test.tsx`
- Create: `apps/astrologer-web/src/pages/flows/FlowsPageView.test.tsx`
- Create: `apps/astrologer-web/src/pages/flows/FlowsRoute.test.tsx`
- Modify: `apps/astrologer-web/src/router.tsx`

**Interfaces:**

- Consumes:
  - `useFlowListQuery(query)`
  - `useFlowTemplatesQuery()`
  - `useCreateFlowMutation()`
  - `useUpdateFlowDraftMutation()`
  - `usePublishFlowMutation()`
- Produces:
  - `/flows` route under `RequireCurrentAccount`
  - `FlowsPageView` props with explicit loading/error/empty/success states

- [ ] **Step 1: Re-read untracked flow feature files**

Run:

```bash
find apps/astrologer-web/src/features/flows -type f -maxdepth 4 -print | sort
git diff -- apps/astrologer-web/src/features/flows apps/astrologer-web/src/router.tsx
```

Expected: identify whether current untracked files can be owned as part of this
task; do not delete unrelated work.

- [ ] **Step 2: Write failing route test**

Create `apps/astrologer-web/src/pages/flows/FlowsRoute.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { astrologerRoutes } from "../../router";

describe("flows route", () => {
  it("registers /flows inside the authenticated astrologer app", () => {
    const authenticated = astrologerRoutes.find((route) => "children" in route && route.children);
    const layout = authenticated?.children?.[0]?.children?.[0];

    expect(layout?.children?.some((route) => route.path === "/flows")).toBe(true);
  });
});
```

Run:

```bash
pnpm test apps/astrologer-web/src/pages/flows/FlowsRoute.test.tsx
```

Expected: FAIL because `/flows` is not registered.

- [ ] **Step 3: Add route and page shell**

Add the route:

```tsx
import { FlowsPage } from "./pages/flows/FlowsPage";

{
  path: "/flows",
  element: <FlowsPage />
}
```

Create `FlowsPage.tsx` with data loading and document title:

```tsx
export function FlowsPage() {
  useDocumentTitle("Воронки");
  const flowsQuery = useFlowListQuery({ status: "all", limit: 50, offset: 0 });
  const templatesQuery = useFlowTemplatesQuery();

  return (
    <FlowsPageView
      flows={flowsQuery.data?.flows ?? []}
      templates={templatesQuery.data?.templates ?? []}
      isLoading={flowsQuery.isLoading || templatesQuery.isLoading}
      isError={flowsQuery.isError || templatesQuery.isError}
    />
  );
}
```

- [ ] **Step 4: Write page state tests**

`FlowsPageView.test.tsx` must assert:

- loading state says `Загружаем воронки`;
- error state says `Не удалось загрузить воронки`;
- empty state says `Создайте первую воронку`;
- success state renders flow names from API data;
- no fake conversion/revenue text appears when runtime metrics are absent.

Run:

```bash
pnpm test apps/astrologer-web/src/pages/flows/FlowsPageView.test.tsx
```

Expected: FAIL before implementing `FlowsPageView`.

- [ ] **Step 5: Implement minimal page view**

Implement page states with production copy only. Do not show reference demo
stats unless they come from API data.

- [ ] **Step 6: Verify route and page**

Run:

```bash
pnpm test apps/astrologer-web/src/pages/flows/FlowsRoute.test.tsx apps/astrologer-web/src/pages/flows/FlowsPageView.test.tsx apps/astrologer-web/src/features/flows/api/flowsApi.test.ts apps/astrologer-web/src/features/flows/model/flowsQueryOptions.test.ts apps/astrologer-web/src/features/flows/model/flowDisplay.test.ts
```

Expected: PASS.

### Task 3: Reference-Faithful Flow Gallery

**Files:**

- Create: `apps/astrologer-web/src/features/flows/ui/FlowGallery.tsx`
- Create: `apps/astrologer-web/src/features/flows/ui/FlowGallery.test.tsx`
- Create: `apps/astrologer-web/src/features/flows/ui/FlowsMobileList.tsx`
- Create: `apps/astrologer-web/src/features/flows/ui/FlowsMobileList.test.tsx`
- Create: `apps/astrologer-web/src/features/flows/ui/flowsVisualModel.ts`
- Create: `apps/astrologer-web/src/features/flows/ui/flowsVisualModel.test.ts`
- Modify: `apps/astrologer-web/src/pages/flows/FlowsPageView.tsx`
- Modify: `apps/astrologer-web/src/pages/flows/FlowsPage.module.css`

**Interfaces:**

- Consumes: `FlowResponse`, `FlowTemplate`, `FlowGraphSummary`.
- Produces:
  - `buildFlowGalleryCard(flow): FlowGalleryCardModel`
  - `buildFlowTemplateCard(template): FlowTemplateCardModel`
  - desktop gallery matching reference layout language;
  - mobile list matching reference hierarchy.

- [ ] **Step 1: Write visual-model tests**

Test:

```ts
expect(buildFlowGalleryCard(flow).statusLabel).toBe("Черновик");
expect(buildFlowGalleryCard(flow).metrics).toEqual({
  activeRuns: null,
  waitingApprovals: null,
  completedRuns: null,
  conversionRate: null
});
expect(buildFlowGalleryCard(flow).automationStateLabel).toBe("Автоматизация не запущена");
```

Run:

```bash
pnpm test apps/astrologer-web/src/features/flows/ui/flowsVisualModel.test.ts
```

Expected: FAIL because model does not exist.

- [ ] **Step 2: Implement visual model**

Map current API data honestly:

```ts
export type FlowRuntimeMetricValue = number | null;

export type FlowGalleryCardModel = {
  id: string;
  title: string;
  statusLabel: string;
  approvalModeLabel: string;
  triggerTitle: string | null;
  pathPreview: readonly string[];
  metrics: {
    activeRuns: FlowRuntimeMetricValue;
    waitingApprovals: FlowRuntimeMetricValue;
    completedRuns: FlowRuntimeMetricValue;
    conversionRate: FlowRuntimeMetricValue;
  };
  automationStateLabel: string;
};
```

- [ ] **Step 3: Write component tests**

`FlowGallery.test.tsx` must assert:

- title `Воронки` is visible;
- create button label `Новая воронка` is visible;
- flow card title and path preview are visible;
- missing metrics render `-`, not reference demo numbers;
- active toggle is disabled until activate/pause API exists.

`FlowsMobileList.test.tsx` must assert:

- mobile heading `Воронки` is visible;
- `Открыть схему` action is visible;
- metric labels do not overflow by relying on fixed labels and short values.

- [ ] **Step 4: Implement gallery components**

Use CSS Modules with stable dimensions:

```css
.galleryGrid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
}

.flowCard {
  min-height: 205px;
  border-radius: 20px;
  overflow: hidden;
}
```

Keep the reference visual hierarchy: dark surface, compact top controls, node
chain preview, clear status/approval chips and restrained gold primary button.

- [ ] **Step 5: Verify components**

Run:

```bash
pnpm test apps/astrologer-web/src/features/flows/ui/flowsVisualModel.test.ts apps/astrologer-web/src/features/flows/ui/FlowGallery.test.tsx apps/astrologer-web/src/features/flows/ui/FlowsMobileList.test.tsx apps/astrologer-web/src/pages/flows/FlowsPageView.test.tsx
```

Expected: PASS.

### Task 4: Builder Shell With Draft Editing

**Files:**

- Create: `apps/astrologer-web/src/features/flows/ui/FlowBuilder.tsx`
- Create: `apps/astrologer-web/src/features/flows/ui/FlowBuilder.test.tsx`
- Create: `apps/astrologer-web/src/features/flows/ui/FlowBuilderCanvas.tsx`
- Create: `apps/astrologer-web/src/features/flows/ui/FlowBuilderCanvas.test.tsx`
- Create: `apps/astrologer-web/src/features/flows/ui/FlowBuilderInspector.tsx`
- Create: `apps/astrologer-web/src/features/flows/ui/FlowBuilderInspector.test.tsx`
- Create: `apps/astrologer-web/src/features/flows/model/flowDraftEditor.ts`
- Create: `apps/astrologer-web/src/features/flows/model/flowDraftEditor.test.ts`
- Modify: `apps/astrologer-web/src/pages/flows/FlowsPage.tsx`
- Modify: `apps/astrologer-web/src/pages/flows/FlowsPageView.tsx`

**Interfaces:**

- Consumes:
  - `FlowGraph`
  - `updateFlowDraftMutationOptions`
  - `publishFlowMutationOptions`
- Produces:
  - selected flow state;
  - draft node selection;
  - publish action;
  - disabled test-run button until runtime API exists.

- [ ] **Step 1: Write draft-editor tests**

Test:

```ts
const renamed = renameFlowNode(graph, "ai_interpretation", "AI-черновик");
expect(renamed.nodes.find((node) => node.id === "ai_interpretation")?.title).toBe("AI-черновик");
expect(() => renameFlowNode(graph, "missing", "x")).toThrow("FLOW_NODE_NOT_FOUND");
```

Run:

```bash
pnpm test apps/astrologer-web/src/features/flows/model/flowDraftEditor.test.ts
```

Expected: FAIL before editor model exists.

- [ ] **Step 2: Implement pure draft editor helpers**

Implement only pure graph edits needed by the shell:

```ts
export function renameFlowNode(graph: FlowGraph, nodeId: string, title: string): FlowGraph;
export function updateFlowNodeConfig(graph: FlowGraph, nodeId: string, config: Record<string, unknown>): FlowGraph;
export function moveFlowNode(graph: FlowGraph, nodeId: string, position: FlowNodePosition): FlowGraph;
```

- [ ] **Step 3: Write builder component tests**

`FlowBuilder.test.tsx` must assert:

- `Все воронки` back action is visible;
- selected flow name is visible;
- palette categories include `Триггеры`, `Действия`, `AI-узлы`, `Логика`,
  `Человек`;
- `Тестовый прогон` is disabled with reason until simulation endpoint exists;
- `Опубликовать` calls the publish handler;
- selected node details appear in inspector.

- [ ] **Step 4: Implement builder shell**

Build three stable columns:

```tsx
<section className={styles.builder}>
  <FlowBuilderPalette />
  <FlowBuilderCanvas graph={flow.draftGraph} selectedNodeId={selectedNodeId} />
  <FlowBuilderInspector selectedNode={selectedNode} />
</section>
```

Do not implement drag/drop if it cannot be verified in this slice. Node
selection, draft editing and publish are enough for this phase.

- [ ] **Step 5: Verify builder**

Run:

```bash
pnpm test apps/astrologer-web/src/features/flows/model/flowDraftEditor.test.ts apps/astrologer-web/src/features/flows/ui/FlowBuilder.test.tsx apps/astrologer-web/src/features/flows/ui/FlowBuilderCanvas.test.tsx apps/astrologer-web/src/features/flows/ui/FlowBuilderInspector.test.tsx
```

Expected: PASS.

### Task 5: Runtime Contracts And Database Spine

**Files:**

- Modify: `packages/contracts/src/flows.ts`
- Modify: `packages/contracts/src/flows.test.ts`
- Modify: `packages/db/src/schema/flows/flows-values.ts`
- Create: `packages/db/src/schema/flows/flow-runtime.schema.ts`
- Modify: `packages/db/src/schema/flows/index.ts`
- Modify: `packages/db/src/schema/flows/flows.schema.test.ts`
- Modify: `packages/db/drizzle/0000_sticky_rictor.sql`
- Modify: `packages/db/drizzle/meta/0000_snapshot.json`

**Interfaces:**

- Produces tables:
  - `flow_runtime_events`
  - `flow_runs`
  - `flow_step_runs`
  - `flow_approvals`
  - `flow_delivery_attempts`
  - `flow_suppressions`

- [ ] **Step 1: Write failing contract tests**

Add tests proving:

- runtime event requires `dedupeKey`;
- simulate request parses manual event payload;
- approval decision only accepts `approved`, `rejected`, `snoozed`;
- list responses cap arrays at 100.

Run:

```bash
pnpm test packages/contracts/src/flows.test.ts
```

Expected: FAIL before schemas exist.

- [ ] **Step 2: Implement runtime contract schemas**

Add DTOs listed in the Interfaces section. Keep `auto_send` as an enum value,
but do not add an activation path for it.

- [ ] **Step 3: Write failing DB schema tests**

Extend `flows.schema.test.ts` to assert baseline SQL contains:

```sql
CREATE TABLE "flow_runtime_events"
CREATE TABLE "flow_runs"
CREATE TABLE "flow_step_runs"
CREATE TABLE "flow_approvals"
CREATE TABLE "flow_delivery_attempts"
CREATE TABLE "flow_suppressions"
```

Also assert:

- unique `(owner_user_id, dedupe_key)` on runtime events;
- run references immutable `flow_versions`;
- step run references `flow_runs`;
- approvals reference `flow_runs`;
- delivery attempt has `idempotency_key`.

- [ ] **Step 4: Implement Drizzle schema**

Use `ownerUserId` on every runtime table for owner-scoped queries. Store
snapshots and provider payloads as `jsonb`. Use explicit enum/check values from
`flows-values.ts`.

- [ ] **Step 5: Update baseline migration**

Regenerate or manually reconcile the local baseline according to
`docs/development/commands.md`. Do not include unrelated schema drift. If local
DB reset authority is missing, update only source/schema tests and mark reset
acceptance blocked.

- [ ] **Step 6: Verify contracts and schema**

Run:

```bash
pnpm test packages/contracts/src/flows.test.ts packages/db/src/schema/flows/flows.schema.test.ts
git diff --check -- packages/contracts/src/flows.ts packages/contracts/src/flows.test.ts packages/db/src/schema/flows packages/db/drizzle/0000_sticky_rictor.sql packages/db/drizzle/meta/0000_snapshot.json
```

Expected: PASS and no unrelated migration content.

### Task 6: Runtime Domain And Store Adapter

**Files:**

- Create: `packages/domain/src/flows/flow-runtime-store.ts`
- Create: `packages/domain/src/flows/flow-runtime-use-cases.ts`
- Create: `packages/domain/src/flows/flow-runtime-use-cases.test.ts`
- Create: `packages/domain/src/flows/flow-eligibility.ts`
- Create: `packages/domain/src/flows/flow-eligibility.test.ts`
- Modify: `packages/domain/src/flows/index.ts`
- Create: `packages/db/src/adapters/flows/drizzle-flow-runtime-store.ts`
- Create: `packages/db/src/adapters/flows/drizzle-flow-runtime-store.test.ts`
- Modify: `packages/db/src/adapters/flows/index.ts`

**Interfaces:**

- Consumes:
  - `FlowStore`
  - `FlowRuntimeStore`
  - `FlowRunSnapshot`
  - published `FlowVersion`
- Produces:
  - `simulateFlowRun(input)`
  - `createManualFlowRun(input)`
  - `listFlowRuns(input)`
  - `listFlowApprovals(input)`
  - `decideFlowApproval(input)`

- [x] **Step 1: Write eligibility tests**

Test these decisions:

```ts
expect(checkFlowRunEligibility(inputWithoutPublishedVersion).allowed).toBe(false);
expect(checkFlowRunEligibility(inputWithoutPublishedVersion).reason).toBe("FLOW_NOT_PUBLISHED");
expect(checkFlowRunEligibility(inputWithMissingOwnerRelationship).reason).toBe("OWNER_RELATIONSHIP_REQUIRED");
expect(checkFlowRunEligibility(inputWithQuietHoursHold).reason).toBe("QUIET_HOURS_HOLD");
```

Run:

```bash
pnpm test packages/domain/src/flows/flow-eligibility.test.ts
```

Expected: FAIL before eligibility code exists.

- [x] **Step 2: Implement eligibility**

Create:

```ts
export type FlowEligibilityResult =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: FlowSuppressionReason };

export function checkFlowRunEligibility(input: FlowEligibilityInput): FlowEligibilityResult;
```

Reasons must include:

```ts
"FLOW_NOT_PUBLISHED" |
"FLOW_NOT_ACTIVE" |
"OWNER_RELATIONSHIP_REQUIRED" |
"CHANNEL_CONSENT_REQUIRED" |
"QUIET_HOURS_HOLD" |
"FREQUENCY_CAP_HOLD" |
"PLAN_LIMIT_REACHED" |
"AUTO_SEND_DISABLED"
```

- [x] **Step 3: Write runtime use-case tests**

Test:

- `simulateFlowRun` creates no DB side effect and returns planned steps;
- `createManualFlowRun` stores runtime event once per `dedupeKey`;
- duplicate manual event returns existing run or deterministic duplicate
  result;
- AI/message nodes in `manual_approve` mode create pending approvals;
- action nodes in `auto_internal` mode can complete only if operation is
  internal-safe.

- [x] **Step 4: Implement runtime use cases**

Keep execution bounded:

```ts
export async function simulateFlowRun(input: SimulateFlowRunInput): Promise<SimulateFlowRunResult>;
export async function createManualFlowRun(input: CreateManualFlowRunInput): Promise<CreateManualFlowRunResult>;
export async function listFlowRuns(input: ListFlowRunsInput): Promise<FlowRunListResult>;
export async function listFlowApprovals(input: ListFlowApprovalsInput): Promise<FlowApprovalListResult>;
export async function decideFlowApproval(input: DecideFlowApprovalInput): Promise<FlowApprovalRecord | null>;
```

Do not call providers, workers, payment, booking or messaging from this first
runtime domain task.

- [x] **Step 5: Write adapter tests**

`drizzle-flow-runtime-store.test.ts` must prove:

- insert event with duplicate dedupe key is handled deterministically;
- list runs filters by `ownerUserId`;
- approvals cannot be decided across owners;
- delivery attempts require idempotency key before future provider calls.

- [x] **Step 6: Implement adapter**

Use Drizzle schema only. No app imports. Keep mapping functions local and
tested.

- [x] **Step 7: Verify runtime domain and adapter**

Run:

```bash
pnpm test packages/domain/src/flows/flow-eligibility.test.ts packages/domain/src/flows/flow-runtime-use-cases.test.ts packages/db/src/adapters/flows/drizzle-flow-runtime-store.test.ts
```

Expected: PASS.

### Task 7: Runtime API Endpoints

**Files:**

- Modify: `apps/astrologer-api/src/modules/flows/flows.controller.ts`
- Create: `apps/astrologer-api/src/modules/flows/flow-runs.controller.ts`
- Create: `apps/astrologer-api/src/modules/flows/flow-approvals.controller.ts`
- Modify: `apps/astrologer-api/src/modules/flows/flows.service.ts`
- Modify: `apps/astrologer-api/src/modules/flows/flows.module.ts`
- Modify: `apps/astrologer-api/src/modules/flows/flows.tokens.ts`
- Modify: `apps/astrologer-api/src/modules/flows/flows.service.test.ts`
- Modify: `apps/astrologer-api/src/modules/flows/flows.e2e.test.ts`

**Interfaces:**

- Consumes runtime domain use cases and `FlowRuntimeStore`.
- Produces authenticated, owner-scoped runtime API endpoints.

- [x] **Step 1: Write service tests**

Test:

- unauthenticated session maps to auth error through existing guard boundary;
- invalid simulate body maps to `FLOW_INVALID_REQUEST`;
- simulate returns no persisted run;
- manual run requires CSRF;
- approval decision requires CSRF;
- not-owned run/approval returns `FLOW_NOT_FOUND`.

- [x] **Step 2: Implement service methods**

Add methods:

```ts
simulateFlow(flowId: string, body: unknown, request: AstrologerSessionRequest)
createManualRun(flowId: string, body: unknown, request: AstrologerSessionRequest)
listFlowRuns(flowId: string, query: unknown, request: AstrologerSessionRequest)
getFlowRun(runId: string, request: AstrologerSessionRequest)
cancelFlowRun(runId: string, request: AstrologerSessionRequest)
listFlowApprovals(query: unknown, request: AstrologerSessionRequest)
decideFlowApproval(approvalId: string, body: unknown, request: AstrologerSessionRequest)
```

- [x] **Step 3: Add controller routes**

Keep flow-owned routes in `FlowsController`:

```ts
@Post(":flowId/simulate")
@RequireCsrf()

@Post(":flowId/manual-runs")
@RequireCsrf()

@Get(":flowId/runs")
```

Create a thin `FlowRunsController` with `@Controller("flow-runs")`:

```ts
@Get(":runId")

@Post(":runId/cancel")
@RequireCsrf()
```

Create a thin `FlowApprovalsController` with `@Controller("flow-approvals")`:

```ts
@Get()

@Post(":approvalId/decision")
@RequireCsrf()
```

Register all three controllers in `FlowsModule`. Do not create a separate app
module unless ownership boundaries change.

- [x] **Step 4: Write e2e tests**

`flows.e2e.test.ts` must prove:

- missing CSRF on simulate/manual run/approval decision returns `403`;
- valid simulate returns `200` with planned step list and no persisted run;
- manual run returns `201` and readback appears in `GET /flows/:flowId/runs`;
- approval list returns only current owner approvals.

- [x] **Step 5: Verify API**

Run:

```bash
pnpm test apps/astrologer-api/src/modules/flows/flows.service.test.ts apps/astrologer-api/src/modules/flows/flows.e2e.test.ts
```

Expected: PASS.

### Task 8: Runtime UI Panels And Approval Queue

**Files:**

- Modify/Create: `apps/astrologer-web/src/features/flows/api/*`
- Modify/Create: `apps/astrologer-web/src/features/flows/model/*`
- Create: `apps/astrologer-web/src/features/flows/ui/FlowRuntimePanel.tsx`
- Create: `apps/astrologer-web/src/features/flows/ui/FlowRuntimePanel.test.tsx`
- Create: `apps/astrologer-web/src/features/flows/ui/FlowApprovalQueue.tsx`
- Create: `apps/astrologer-web/src/features/flows/ui/FlowApprovalQueue.test.tsx`
- Modify: `apps/astrologer-web/src/features/flows/ui/FlowBuilder.tsx`
- Modify: `apps/astrologer-web/src/pages/flows/FlowsPage.tsx`

**Interfaces:**

- Consumes runtime API endpoints from Task 7.
- Produces:
  - enabled `Тестовый прогон` button for simulation;
  - run history panel;
  - pending approvals panel;
  - approve/reject/snooze actions.

- [x] **Step 1: Write API wrapper tests**

Add tests proving:

- `simulateFlowRun` posts to `/flows/:flowId/simulate` with CSRF;
- `createManualFlowRun` posts to `/flows/:flowId/manual-runs` with CSRF;
- `listFlowRuns` parses response;
- `listFlowApprovals` parses response;
- `decideFlowApproval` posts decision with CSRF.

- [x] **Step 2: Implement API wrappers and query options**

Use existing `features/flows/api` and `model` naming patterns. Invalidate
`flowsQueryKeys.all()` after manual run or approval decision.

- [x] **Step 3: Write runtime panel tests**

Assert:

- simulation result renders planned steps;
- persisted run history renders status labels;
- failed/suppressed steps show reason text;
- empty run history says `Запусков пока нет`.

- [x] **Step 4: Write approval queue tests**

Assert:

- pending approval title and preview render;
- approve/reject/snooze buttons call handlers;
- approved/rejected items do not appear in pending-only mode;
- queue does not expose provider-send success without API confirmation.

- [x] **Step 5: Implement runtime UI**

Integrate runtime panels into the builder inspector/right column. Keep visual
language close to reference, but copy must distinguish:

```text
Тестовый прогон
Ожидает подтверждения
Автоматизация не запущена
Нет запусков
```

- [x] **Step 6: Verify runtime UI**

Run:

```bash
pnpm test apps/astrologer-web/src/features/flows/api/flowsApi.test.ts apps/astrologer-web/src/features/flows/model/flowsQueryOptions.test.ts apps/astrologer-web/src/features/flows/ui/FlowRuntimePanel.test.tsx apps/astrologer-web/src/features/flows/ui/FlowApprovalQueue.test.tsx apps/astrologer-web/src/features/flows/ui/FlowBuilder.test.tsx
```

Expected: PASS.

### Task 9: Cross-Surface Signals

**Files:**

- Modify: `apps/astrologer-web/src/pages/dashboard/DashboardPage.tsx`
- Modify: `apps/astrologer-web/src/pages/dashboard/DashboardPage.module.css`
- Modify: `apps/astrologer-web/src/pages/dashboard/DashboardPage.test.tsx`
- Modify: `apps/astrologer-web/src/pages/inbox/InboxPage.tsx`
- Modify: `apps/astrologer-web/src/pages/inbox/InboxPageView.tsx`
- Modify: `apps/astrologer-web/src/pages/inbox/InboxPage.test.tsx`
- Modify: `apps/astrologer-web/src/pages/astro-calendar/AstroCalendarPageView.tsx`
- Modify: `apps/astrologer-web/src/pages/astro-calendar/AstroCalendarPageView.test.tsx`

**Interfaces:**

- Consumes flow approvals/run summaries from Task 8 query layer.
- Produces:
  - dashboard tasks from pending approvals and handoffs;
  - inbox in-flow context marker;
  - AstroCalendar handoff action to start a flow setup path, not direct send.

- [x] **Step 1: Write dashboard tests**

Assert:

- pending flow approvals render under `Задачи из воронок`;
- each task links to `/flows`;
- no task claims a message was sent.

- [x] **Step 2: Implement dashboard flow task section**

Use real pending approval/run summary data only. If API has no data, hide the
section or show an honest empty state.

- [x] **Step 3: Write inbox tests**

Assert:

- conversation with active run context shows flow name and current step;
- conversation without run context does not show a fake badge.

- [x] **Step 4: Implement inbox flow context**

Add the marker only from API/read-model data. Do not infer it from local route
state.

- [x] **Step 5: Write AstroCalendar handoff tests**

Update current disabled automation tests so the production behavior is:

- before runtime route is available: disabled with production-contour reason;
- after runtime handoff API exists: button opens flow setup/handoff;
- button never sends a message directly.

- [x] **Step 6: Implement AstroCalendar handoff**

Wire the action to flow setup context:

```ts
type AstroCalendarFlowDraftContext = {
  source: "astro_calendar";
  eventId: string;
  suggestedTemplateKey: string;
  clientId?: string;
};
```

The action must create or prefill a flow draft. It must not enqueue outbound
delivery.

- [ ] **Step 7: Verify cross-surface signals**

Run:

```bash
pnpm test apps/astrologer-web/src/pages/dashboard/DashboardPage.test.tsx apps/astrologer-web/src/pages/inbox/InboxPage.test.tsx apps/astrologer-web/src/pages/astro-calendar/AstroCalendarPageView.test.tsx
```

Expected: PASS.

### Task 10: Browser And Reference Verification

**Files:**

- No source files unless visual bugs are found.
- Create artifacts only under `.design-qa/flows-product-runtime-2026-07-28/`
  when browser evidence is captured.

**Interfaces:**

- Consumes real network-backed local app and design reference.
- Produces visual/runtime evidence for desktop and mobile states.

- [x] **Step 1: Confirm services, do not start them without authority**

Run:

```bash
lsof -nP -iTCP:8000 -sTCP:LISTEN
lsof -nP -iTCP:5173 -sTCP:LISTEN
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

Expected: report blockers for any missing required service. Do not choose a new
port or start a service without direct user authority.

- [x] **Step 2: Capture reference states**

Use Chrome/Browser on:

```text
http://localhost:8000/ElevenHouse.html
```

Capture:

- desktop gallery;
- desktop builder;
- mobile flows;
- mobile dashboard `Задачи из воронок`.

- [x] **Step 3: Capture production states**

Status: captured for authenticated desktop and mobile `/flows` after explicit
user authority to reconcile the local database with `pnpm db:reset`.
`flow_approvals` and the other flow runtime tables exist in local database
`elevenhouse`; approvals list reads return `200`.

Use the local app route:

```text
/flows
```

Capture:

- loading;
- empty;
- template gallery;
- existing draft list;
- selected builder;
- validation error;
- simulation result if Task 8 is implemented;
- pending approvals if Task 8 is implemented;
- mobile width 390 px.

- [x] **Step 4: Compare metrics and computed styles**

For reference and production, record:

- main column widths;
- card width/height;
- grid gaps;
- button dimensions;
- typography sizes/weights;
- border radius;
- colors;
- overflow and focus states.

- [x] **Step 5: Fix visual and runtime issues**

Resolved Task 10 runtime/visible issues:

- newly published builder state now reflects the publish response instead of
  keeping a stale draft badge;
- sidebar copy includes the `Воронки`/`Flows` navigation item and marks `/flows`
  active;
- builder inspector controls have stable `id`/`name` attributes, removing the
  fresh Chrome form warning.

Known residual production-product limitation: flow activation/start controls are
still disabled, so simulation of the published local flow returns the honest
`FLOW_NOT_ACTIVE` plan rather than pretending automation is live.

- [x] **Step 6: Run affected verification**

Run:

```bash
pnpm test packages/contracts/src/flows.test.ts packages/domain/src/flows/flow-validation.test.ts packages/domain/src/flows/flow-use-cases.test.ts packages/domain/src/flows/flow-run-state.test.ts packages/domain/src/flows/flow-templates.test.ts packages/domain/src/flows/flow-eligibility.test.ts packages/domain/src/flows/flow-runtime-use-cases.test.ts packages/db/src/schema/flows/flows.schema.test.ts packages/db/src/adapters/flows/drizzle-flow-store.test.ts packages/db/src/adapters/flows/drizzle-flow-runtime-store.test.ts apps/astrologer-api/src/modules/flows/flows.service.test.ts apps/astrologer-api/src/modules/flows/flows.e2e.test.ts apps/astrologer-web/src/pages/flows/FlowsRoute.test.tsx apps/astrologer-web/src/pages/flows/FlowsPageView.test.tsx apps/astrologer-web/src/features/flows/api/flowsApi.test.ts apps/astrologer-web/src/features/flows/model/flowsQueryOptions.test.ts apps/astrologer-web/src/features/flows/model/flowDisplay.test.ts apps/astrologer-web/src/features/flows/ui/flowsVisualModel.test.ts apps/astrologer-web/src/features/flows/ui/FlowGallery.test.tsx apps/astrologer-web/src/features/flows/ui/FlowsMobileList.test.tsx apps/astrologer-web/src/features/flows/ui/FlowBuilder.test.tsx apps/astrologer-web/src/features/flows/ui/FlowRuntimePanel.test.tsx apps/astrologer-web/src/features/flows/ui/FlowApprovalQueue.test.tsx apps/astrologer-web/src/pages/dashboard/DashboardPage.test.tsx apps/astrologer-web/src/pages/inbox/InboxPage.test.tsx apps/astrologer-web/src/pages/astro-calendar/AstroCalendarPageView.test.tsx
git diff --check -- docs/superpowers/plans/2026-07-28-flows-product-runtime.md docs/architecture/design-reference-inventory.md docs/architecture/backend-modules.md docs/api/api-boundaries.md packages/contracts/src/flows.ts packages/domain/src/flows packages/db/src/schema/flows packages/db/src/adapters/flows apps/astrologer-api/src/modules/flows apps/astrologer-web/src/features/flows apps/astrologer-web/src/pages/flows apps/astrologer-web/src/router.tsx apps/astrologer-web/src/pages/dashboard apps/astrologer-web/src/pages/inbox apps/astrologer-web/src/pages/astro-calendar
```

Expected: all targeted tests pass; diff check passes.

### Task 11: Flow Activation And Pause

**Files:**

- Modify: `packages/domain/src/flows/flow-store.ts`
- Modify: `packages/domain/src/flows/flow-use-cases.ts`
- Modify: `packages/db/src/adapters/flows/drizzle-flow-store.ts`
- Modify: `apps/astrologer-api/src/modules/flows/flows.controller.ts`
- Modify: `apps/astrologer-api/src/modules/flows/flows.service.ts`
- Create: `apps/astrologer-web/src/features/flows/api/activateFlow.ts`
- Create: `apps/astrologer-web/src/features/flows/api/pauseFlow.ts`
- Create: `apps/astrologer-web/src/features/flows/model/useActivateFlowMutation.ts`
- Create: `apps/astrologer-web/src/features/flows/model/usePauseFlowMutation.ts`
- Modify: `apps/astrologer-web/src/features/flows/model/flowsQueryOptions.ts`
- Modify: `apps/astrologer-web/src/features/flows/ui/FlowGallery.tsx`
- Modify: `apps/astrologer-web/src/features/flows/ui/FlowsMobileList.tsx`
- Modify: `apps/astrologer-web/src/pages/flows/FlowsPage.tsx`
- Modify: `apps/astrologer-web/src/pages/flows/FlowsPageView.tsx`

**Interfaces:**

- Consumes published flow versions and current owner-scoped flow status.
- Produces explicit status transitions:
  - `published` or `paused` -> `active`;
  - `active` -> `paused`.
- Does not produce provider sends, queued outbound messages or `auto_send`.

- [x] **Step 1: Add status command tests**

Cover:

- published flow activation requires a published version;
- pause requires an active flow;
- archived/draft flows fail closed;
- store transitions are owner-scoped and constrained to allowed source
  statuses;
- API commands are CSRF-protected;
- UI switches call activate/pause mutations instead of changing browser-local
  state.

- [x] **Step 2: Implement domain and DB transitions**

Use an atomic `transitionStatus` store method with owner, flow id and allowed
source statuses in the update predicate.

- [x] **Step 3: Implement API and frontend wiring**

Expose:

```text
POST /flows/:flowId/activate
POST /flows/:flowId/pause
```

Wire gallery/mobile switches to TanStack Query mutations and invalidate the
flows query after success.

- [x] **Step 4: Capture browser activation evidence**

Status: captured through the existing authenticated Chrome session on
`http://localhost:5174/flows`. No process was started, stopped, restarted or
killed in this task.

Verified:

- published flow switch sends `POST /api/flows/:id/activate`;
- active flow switch sends `POST /api/flows/:id/pause`;
- simulation/manual internal run no longer returns `FLOW_NOT_ACTIVE` after
  activation;
- manual internal run creates an auditable run on the safe internal
  `manual_trigger` step and does not create external sends.

- [x] **Step 5: Run affected verification**

Run:

```bash
pnpm test packages/contracts/src/flows.test.ts packages/domain/src/flows/flow-validation.test.ts packages/domain/src/flows/flow-use-cases.test.ts packages/domain/src/flows/flow-run-state.test.ts packages/domain/src/flows/flow-templates.test.ts packages/domain/src/flows/flow-eligibility.test.ts packages/domain/src/flows/flow-runtime-use-cases.test.ts packages/db/src/schema/flows/flows.schema.test.ts packages/db/src/adapters/flows/drizzle-flow-store.test.ts packages/db/src/adapters/flows/drizzle-flow-runtime-store.test.ts apps/astrologer-api/src/modules/flows/flows.service.test.ts apps/astrologer-api/src/modules/flows/flows.e2e.test.ts apps/astrologer-web/src/features/flows/api/flowsApi.test.ts apps/astrologer-web/src/features/flows/model/flowsQueryOptions.test.ts apps/astrologer-web/src/features/flows/model/flowDisplay.test.ts apps/astrologer-web/src/features/flows/ui/flowsVisualModel.test.ts apps/astrologer-web/src/features/flows/ui/FlowGallery.test.tsx apps/astrologer-web/src/features/flows/ui/FlowsMobileList.test.tsx apps/astrologer-web/src/pages/flows/FlowsPage.test.tsx apps/astrologer-web/src/pages/flows/FlowsPageView.test.tsx apps/astrologer-web/src/features/flows/ui/FlowBuilder.test.tsx apps/astrologer-web/src/features/flows/ui/FlowRuntimePanel.test.tsx apps/astrologer-web/src/features/flows/ui/FlowApprovalQueue.test.tsx
pnpm --filter @elevenhouse/domain typecheck && pnpm --filter @elevenhouse/db typecheck && pnpm --filter @elevenhouse/astrologer-api typecheck && pnpm --filter @elevenhouse/astrologer-web typecheck
```

Expected: targeted tests and typechecks pass.

### Task 12: Runtime Event Dispatch And First Internal Adapter

**Files:**

- Modify: `packages/domain/src/flows/flow-store.ts`
- Modify: `packages/domain/src/flows/flow-runtime-use-cases.ts`
- Modify: `packages/db/src/adapters/flows/drizzle-flow-store.ts`
- Modify: `apps/astrologer-api/src/modules/flows/flows.service.ts`
- Modify: `apps/astrologer-api/src/modules/flows/flows.module.ts`
- Modify: `apps/astrologer-api/src/modules/bookings/bookings.service.ts`
- Modify: `apps/astrologer-api/src/modules/bookings/bookings.module.ts`

**Interfaces:**

- Consumes normalized module events:
  - `ownerUserId`;
  - `triggerKind`;
  - `source` and `sourceEventId`;
  - subject identity, occurrence time, time zone and payload.
- Produces runtime events/runs for every active owner flow whose immutable
  published graph trigger matches `triggerKind`.
- Does not produce external delivery, provider sends or `auto_send`.

- [x] **Step 1: Add dispatch use-case tests**

Cover:

- event dispatch loads active flows by trigger kind;
- only matching active owner flows are run;
- per-flow dedupe keys are deterministic;
- runtime execution reuses the existing eligibility, suppression and run
  creation path.

- [x] **Step 2: Add DB trigger lookup**

Implement `FlowStore.listActiveByTriggerKind`:

- owner-scoped;
- status `active` only;
- bounded active-flow read;
- trigger kind read from `flow_versions.graph`, not mutable `flows.draft_graph`.

- [x] **Step 3: Add service adapter seam**

Expose `FlowsService.dispatchRuntimeEvent` for sibling app modules. This is not
a public HTTP endpoint.

- [x] **Step 4: Wire the first internal producer**

Manual booking creation dispatches:

```text
triggerKind: booking_confirmed
source: booking
sourceEventId: booking:<bookingId>:confirmed
subjectType: booking
subjectId: <bookingId>
```

Booking idempotency replays dispatch the same deterministic event so runtime
dedupe can recover from a previous post-booking dispatch failure.

- [x] **Step 5: Run affected verification**

Run:

```bash
pnpm test packages/domain/src/flows/flow-runtime-use-cases.test.ts packages/db/src/adapters/flows/drizzle-flow-store.test.ts apps/astrologer-api/src/modules/flows/flows.service.test.ts apps/astrologer-api/src/modules/bookings/bookings.service.test.ts apps/astrologer-api/src/modules/bookings/bookings.e2e.test.ts
pnpm --filter @elevenhouse/domain typecheck && pnpm --filter @elevenhouse/domain build && pnpm --filter @elevenhouse/db typecheck && pnpm --filter @elevenhouse/astrologer-api typecheck
```

Expected: targeted tests and typechecks pass.

## Execution Order

Implement in this order:

1. Task 1: canonical truth sync.
2. Tasks 2-4: visible `/flows` foundation from real draft/template API.
3. Tasks 5-7: runtime persistence/domain/API.
4. Task 8: runtime UI panels and approvals.
5. Task 9: dashboard/inbox/AstroCalendar signals.
6. Task 10: browser/reference verification.
7. Task 11: activation/pause and browser activation evidence.
8. Task 12: runtime event dispatch and first internal producer adapter.

Do not begin external messaging delivery until this plan is complete and a
separate delivery-safety plan is approved.

## Acceptance Criteria

- `/flows` exists in `astrologer-web` and is reachable only inside the
  authenticated astrologer app.
- Gallery and builder match the design reference visual language while showing
  only real API-backed business state.
- Templates can create drafts; drafts can be selected, edited and published.
- Simulation can run without side effects.
- Manual/internal runtime creates auditable runs and step runs.
- Pending approvals are persisted, listed and decidable.
- Dashboard/inbox/AstroCalendar show flow context only from real read models.
- No external auto-send is implemented or enabled.
- All mutation endpoints are owner-scoped and CSRF-protected.
- Targeted tests and browser/reference evidence are recorded before claiming
  visible completion.

## Deferred Follow-Up Plan

Create a separate plan only after this one lands:

- Messaging-safe delivery attempts through Messaging/Notifications.
- Channel-specific consent and opt-out UX.
- Quiet-hours scheduler and frequency-cap reconciliation.
- Provider retry/backoff policy.
- Payment offer and booking-slot execution nodes.
- Controlled `auto_send` rollout with plan limits and audit reporting.

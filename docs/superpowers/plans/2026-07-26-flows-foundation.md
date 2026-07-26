# Flows Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. ElevenHouse repository policy
> overrides generic worktree/feature-branch guidance: execute in the existing
> checkout on `main`, preserve concurrent changes, and do not commit without
> separate user authority.

**Goal:** Build the first production Flows foundation so astrologers can store,
validate, publish and simulate safe automation definitions without fake
external sends.

**Architecture:** Shared contracts define a versioned flow graph and run state
machine. Domain code validates graph semantics, snapshots trigger context and
advances internal run states without importing DB or app modules. Persistence,
API, worker execution, UI builder and AstroCalendar handoff are layered on top
in later tasks.

**Tech Stack:** TypeScript 6, Zod-backed contracts, Vitest, NestJS,
Drizzle/PostgreSQL, BullMQ/Redis, React 19, Vite 8.

## Global Constraints

- Work only in the current ElevenHouse checkout on `main`.
- Preserve unowned dirty files and stage only flow-owned paths.
- Follow red-green-refactor for every behavior.
- Do not start, stop, restart or kill services without direct user authority.
- Do not implement external auto-send in this slice.
- Do not create browser-local automation state as production truth.
- Do not route outbound messages around Messaging/Notifications.
- Keep `FlowVersion` immutable once published.
- Every future side effect must be idempotent and auditable.
- Owner/client relationship, consent, quiet hours, frequency caps and provider
  capability gates are required before any future external delivery.

---

## Purpose / Big Picture

The first user-visible outcome is not a complete canvas builder yet. It is a
real foundation behind the future `/flows` surface: contracts, validation,
templates, state transitions and simulation primitives that can later drive
API, DB, worker and UI without replacing them with fake frontend state.

## Progress

- 2026-07-26: Product/business research created in
  `docs/superpowers/specs/2026-07-26-flows-automation-product-research.md`.
- 2026-07-26: First implementation scope selected: contracts and domain
  foundation, no auto-send and no visible builder parity in this slice.
- 2026-07-26: Flow contracts, graph validation, run state machine and first
  built-in templates implemented with targeted tests.

## Surprises & Discoveries

- `packages/domain` did not previously depend on `@elevenhouse/contracts`.
  Flows uses contracts as the shared API/domain boundary, so `domain` now has a
  workspace dependency and the lockfile records it.
- `domain build` must run after `contracts build`; running both in parallel can
  race while `contracts/dist` is being cleaned and rebuilt.

## Decision Log

- 2026-07-26: Select `draft_only`, `manual_approve` and `auto_internal` as
  supported approval modes; keep `auto_send` as a known future enum value but
  invalid for activation until delivery gates exist.
- 2026-07-26: Store executable behavior against immutable `FlowVersion` ids, not
  mutable draft graphs.
- 2026-07-26: Make templates domain-safe and astrology-aware, but do not
  execute any external send in the foundation slice.

## File Structure

### Contracts

- Create: `packages/contracts/src/flows.ts`
- Create: `packages/contracts/src/flows.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/index.test.ts`

### Domain

- Create: `packages/domain/src/flows/flow-validation.ts`
- Create: `packages/domain/src/flows/flow-validation.test.ts`
- Create: `packages/domain/src/flows/flow-run-state.ts`
- Create: `packages/domain/src/flows/flow-run-state.test.ts`
- Create: `packages/domain/src/flows/flow-templates.ts`
- Create: `packages/domain/src/flows/flow-templates.test.ts`
- Create: `packages/domain/src/flows/index.ts`
- Modify: `packages/domain/src/index.ts`

### Documentation

- Modify: `docs/superpowers/plans/2026-07-26-flows-foundation.md`
- Optional after code lands: canonical API/product docs, only if the
  implemented surface changes durable public contracts.

## Interfaces And Dependencies

Contracts produce:

- `flowNodeCategorySchema`
- `flowTriggerKindSchema`
- `flowActionKindSchema`
- `flowConditionKindSchema`
- `flowApprovalModeSchema`
- `flowStatusSchema`
- `flowRunStatusSchema`
- `flowStepRunStatusSchema`
- `flowGraphSchema`
- `flowDraftSchema`
- `flowVersionSchema`
- `flowRunSnapshotSchema`
- `flowRunSchema`
- `flowApprovalSchema`
- `flowTemplateSchema`

Domain produces:

- `validateFlowGraph(graph: FlowGraph): FlowValidationResult`
- `assertFlowGraphPublishable(graph: FlowGraph): FlowGraph`
- `createFlowRunSnapshot(input: FlowRunSnapshotInput): FlowRunSnapshot`
- `advanceFlowRunStatus(input: FlowRunTransitionInput): FlowRunTransitionResult`
- `getBuiltInFlowTemplates(): FlowTemplate[]`

Dependency direction:

```text
packages/domain -> packages/contracts
packages/contracts -> zod only
apps/* -> packages/domain, packages/contracts
packages/db -> packages/domain, packages/contracts
```

## Plan Of Work

### Task 1: Flow Contract Schemas

**Files:**

- Create: `packages/contracts/src/flows.test.ts`
- Create: `packages/contracts/src/flows.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/index.test.ts`

**Interfaces:**

- Produces all flow DTO schemas and inferred TypeScript types listed above.

- [x] **Step 1: Write failing contract tests**

Test these behaviors:

- a valid graph requires one trigger node;
- duplicate node ids are rejected;
- edges must reference existing nodes;
- `auto_send` is accepted as a schema value but marked by policy later, not
  hidden from contracts;
- flow templates parse with deterministic keys.

Run:

```bash
pnpm test packages/contracts/src/flows.test.ts
```

Expected: FAIL because `packages/contracts/src/flows.ts` does not exist.

- [x] **Step 2: Implement minimal contract schemas**

Add the schemas with strict object shapes, discriminated node categories and
typed enums for statuses, node operations and approval modes.

- [x] **Step 3: Export contracts**

Update `packages/contracts/src/index.ts` and `index.test.ts` so `flows` is part
of the package public API.

- [x] **Step 4: Verify contracts**

Run:

```bash
pnpm test packages/contracts/src/flows.test.ts packages/contracts/src/index.test.ts
```

Expected: PASS.

### Task 2: Domain Graph Validation

**Files:**

- Create: `packages/domain/src/flows/flow-validation.test.ts`
- Create: `packages/domain/src/flows/flow-validation.ts`
- Create: `packages/domain/src/flows/index.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**

- Consumes: `FlowGraph`.
- Produces:
  - `FlowValidationIssue`
  - `FlowValidationResult`
  - `validateFlowGraph(graph)`
  - `assertFlowGraphPublishable(graph)`

- [x] **Step 1: Write failing validation tests**

Test these behaviors:

- a publishable graph has exactly one trigger and every nonterminal node is
  reachable from it;
- duplicate node ids return a deterministic issue;
- missing edge endpoints return deterministic issues;
- outbound `send_message` with `auto_send` returns a blocking issue in this
  first slice.

Run:

```bash
pnpm test packages/domain/src/flows/flow-validation.test.ts
```

Expected: FAIL because validation code is missing.

- [x] **Step 2: Implement validation**

Implement pure TypeScript validation with no DB/app imports.

- [x] **Step 3: Verify validation**

Run:

```bash
pnpm test packages/domain/src/flows/flow-validation.test.ts
```

Expected: PASS.

### Task 3: Domain Run State Machine

**Files:**

- Create: `packages/domain/src/flows/flow-run-state.test.ts`
- Create: `packages/domain/src/flows/flow-run-state.ts`

**Interfaces:**

- Consumes: `FlowRunStatus`, `FlowStepRunStatus`, `FlowRunSnapshot`.
- Produces:
  - `createFlowRunSnapshot(input)`
  - `advanceFlowRunStatus(input)`

- [x] **Step 1: Write failing state-machine tests**

Test these behaviors:

- snapshot keeps source event, subject, timezone, consent and channel state;
- valid transitions include `pending -> running -> waiting`;
- approval step moves run to `approval_required`;
- skipped/suppressed/failed terminal states cannot return to running;
- completed run cannot be mutated by later draft graph changes.

Run:

```bash
pnpm test packages/domain/src/flows/flow-run-state.test.ts
```

Expected: FAIL because state-machine code is missing.

- [x] **Step 2: Implement state machine**

Implement pure deterministic transition helpers and reject invalid transitions
with typed reasons.

- [x] **Step 3: Verify state machine**

Run:

```bash
pnpm test packages/domain/src/flows/flow-run-state.test.ts
```

Expected: PASS.

### Task 4: Built-In Flow Templates

**Files:**

- Create: `packages/domain/src/flows/flow-templates.test.ts`
- Create: `packages/domain/src/flows/flow-templates.ts`

**Interfaces:**

- Produces:
  - `getBuiltInFlowTemplates(): FlowTemplate[]`

- [x] **Step 1: Write failing template tests**

Test these built-in templates:

- `session-prep`;
- `async-recorded-reading`;
- `lead-magnet-upsell`;
- `sleeping-client-reactivation`;
- `post-session-follow-up`.

Each template must parse through `flowTemplateSchema`, contain exactly one
trigger and avoid `auto_send`.

Run:

```bash
pnpm test packages/domain/src/flows/flow-templates.test.ts
```

Expected: FAIL because templates are missing.

- [x] **Step 2: Implement template factory**

Create deterministic template objects that match the research document and use
safe approval modes.

- [x] **Step 3: Verify templates**

Run:

```bash
pnpm test packages/domain/src/flows/flow-templates.test.ts
```

Expected: PASS.

### Task 5: Documentation And Verification

**Files:**

- Modify: `docs/superpowers/plans/2026-07-26-flows-foundation.md`

**Interfaces:**

- Produces updated progress, discoveries and outcome notes.

- [x] **Step 1: Run targeted verification**

Run:

```bash
pnpm test packages/contracts/src/flows.test.ts packages/contracts/src/index.test.ts packages/domain/src/flows/flow-validation.test.ts packages/domain/src/flows/flow-run-state.test.ts packages/domain/src/flows/flow-templates.test.ts
```

Expected: PASS.

- [x] **Step 2: Run format diff check**

Run:

```bash
git diff --check -- docs/superpowers/plans/2026-07-26-flows-foundation.md packages/contracts/src/flows.ts packages/contracts/src/flows.test.ts packages/contracts/src/index.ts packages/contracts/src/index.test.ts packages/domain/src/flows packages/domain/src/index.ts
```

Expected: PASS with no output.

- [x] **Step 3: Update this plan**

Mark completed tasks and record any residual risk.

## Validation And Acceptance

Acceptance for this slice:

- flow contracts parse safe graph, version, run, approval and template payloads;
- domain validation rejects invalid graphs and first-slice unsafe auto-send;
- domain run state machine has explicit invalid-transition errors;
- five built-in templates are deterministic and publishable;
- contracts/domain tests pass;
- no external sends, worker jobs, DB migrations or visible UI completion are
  claimed from this slice.

Runtime/browser acceptance is intentionally not applicable to this foundation
slice because it does not create a visible production route.

## Idempotence And Recovery

- All code in this slice is pure contract/domain logic, so reruns are safe.
- Later DB/API tasks must use immutable `FlowVersion` ids and idempotency keys
  for run creation and delivery attempts.
- If tests expose an existing unrelated failure outside flow-owned files,
  record it and keep the targeted flow proof separate.

## Artifacts And Notes

- Research: `docs/superpowers/specs/2026-07-26-flows-automation-product-research.md`
- Plan: `docs/superpowers/plans/2026-07-26-flows-foundation.md`

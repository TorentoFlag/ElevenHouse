# Flows Persistence And API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. ElevenHouse repository policy
> overrides generic worktree/feature-branch guidance: execute in the existing
> checkout on `main`, preserve concurrent changes, and do not commit without
> separate user authority.

**Goal:** Add the first persisted astrologer-side Flows API so draft flows can
be created, listed, edited and published from validated templates/graphs.

**Architecture:** Contracts define API DTOs. Domain exposes pure use cases and
a `FlowStore` port. `packages/db` owns Drizzle tables and a store adapter.
`astrologer-api` composes the store into a `flows` module with authenticated,
owner-scoped, CSRF-protected mutations.

**Tech Stack:** TypeScript 6, Zod contracts, NestJS, Drizzle ORM, PostgreSQL,
Vitest.

## Global Constraints

- Work only in the current ElevenHouse checkout on `main`.
- Preserve unrelated dirty files and stage only flow-owned paths.
- Use TDD for contracts, domain, schema/adapter and API service behavior.
- No external auto-send, worker execution, approvals queue execution or visible
  `/flows` UI in this slice.
- Flow publication must use immutable `FlowVersion` records.
- Mutating API routes require CSRF.
- Domain must not import DB or app code.
- DB schema lives under `packages/db/src/schema/flows/`.
- Do not run destructive `db:reset` without explicit local DB authority.

---

## Progress

- 2026-07-26: Foundation contracts/domain committed in
  `1b74b0a feat: add flows foundation contracts`.
- 2026-07-26: Persistence/API slice started. Scope is CRUD/publish/template
  list only.

## Surprises & Discoveries

- Current checkout has unrelated finance/payment dirty work. Flow-owned edits
  must avoid broad staging and must not regenerate a migration that captures
  unrelated schema drift.

## Decision Log

- 2026-07-26: Defer manual run/simulation endpoint to the execution-runtime
  slice. Persistence/API foundation should land first.
- 2026-07-26: Use owner-scoped `FlowStore` domain port and DB adapter rather
  than app-local persistence logic.

## Owned Paths

- `packages/contracts/src/flows.ts`
- `packages/contracts/src/flows.test.ts`
- `packages/domain/src/flows/*`
- `packages/domain/src/index.ts`
- `packages/db/src/schema/flows/*`
- `packages/db/src/schema/index.ts`
- `packages/db/src/adapters/flows/*`
- `packages/db/src/adapters/index.ts`
- `apps/astrologer-api/src/modules/flows/*`
- `apps/astrologer-api/src/app.module.ts`
- `docs/superpowers/plans/2026-07-26-flows-persistence-api.md`

## Plan Of Work

### Task 1: API Contracts

- [x] Add create/update/list/publish request and response schemas to
  `packages/contracts/src/flows.ts`.
- [x] Tests prove draft creation parses, list response parses, and invalid graph
  payloads remain rejected.

### Task 2: Domain Flow Use Cases

- [x] Add `FlowStore` port and use cases:
  - `createFlowDraft`
  - `listFlows`
  - `getFlow`
  - `updateFlowDraft`
  - `publishFlow`
- [x] Tests prove owner scoping inputs, publish validation and immutable version
  creation.

### Task 3: DB Schema And Adapter

- [x] Add Drizzle tables:
  - `flows`
  - `flow_versions`
- [x] Add schema test for exports/indexes/checks/baseline text.
- [x] Add adapter tests for create/list/update/publish behavior with a fake Drizzle
  chain first, and integration later when migration/reset is safe.

### Task 4: Astrologer API Module

- [x] Add `FlowsModule`, controller, service and token.
- [x] Routes:
  - `GET /flow-templates`
  - `GET /flows`
  - `POST /flows`
  - `GET /flows/:flowId`
  - `PATCH /flows/:flowId/draft`
  - `POST /flows/:flowId/publish`
- [x] Tests prove service mapping, auth session requirement, HTTP error mapping and
  route-level CSRF metadata for durable mutations.

### Task 5: Verification

- [x] Run targeted tests for contracts/domain/db/api.
- [x] Run typecheck/build for affected packages/apps where feasible.
- [x] Run `git diff --check` on flow-owned paths.
- [x] Do not claim DB migration/reset acceptance if blocked by unrelated dirty DB
  work or missing explicit reset authority.

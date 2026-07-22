# Chart Engine Transits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. ElevenHouse repository policy overrides generic worktree/feature-branch guidance: execute in the existing checkout on `main`, preserve concurrent changes, and do not commit without separate user authority.

**Goal:** Add the first production `transit` method to Chart Engine as a
single-moment dual-wheel calculation for owner-scoped CRM clients.

**Architecture:** `astrologer-api` hydrates the CRM client's natal birth data,
resolves a deterministic transit snapshot, creates an idempotent chart job and
exposes generic job/result reads. `chart-worker` dispatches by job method and
calls the private Python `apps/chart-engine` provider. The frontend enables the
existing "Транзиты" tab only after the canonical result and API flow exist.

**Tech Stack:** TypeScript 6, NestJS, Drizzle ORM, PostgreSQL, BullMQ/Redis,
Zod-backed contracts, React 19, Vite 8, TanStack Query 5, Python 3.10+,
FastAPI, Pydantic, Uvicorn, Kerykeion 5.12.x, Vitest, pytest.

## Global Constraints

- Work only in the current ElevenHouse checkout on `main`.
- Preserve all unowned modifications and stage only transits-owned paths.
- Follow red-green-refactor for each behavior.
- Do not start, stop, restart or kill services without direct user authority.
- Do not expose technical queue wording in frontend copy.
- Do not store raw Kerykeion JSON, provider SVG, client names, phone numbers,
  CRM notes, frontend layout coordinates or style metadata in canonical chart
  results.
- Keep private birth input snapshots separate from renderable chart results.
- State-changing chart routes must use `astrologer-api` CSRF route metadata.
- Controllers must not publish directly to Redis/BullMQ.
- The first transit slice is a single moment; range transit calendars are out
  of scope.
- Transit location initially defaults to natal location/timezone.
- Transit PDF export remains disabled until a separate renderer/source exists.

---

## Purpose / Big Picture

The user-visible outcome is that `/chart-engine` can move from the natal-only
state toward real transits. The first implementation must produce a saved
canonical `transit` result with enough render data for a dual wheel and tables:
natal points/houses, transit points/houses, transit-to-natal aspects, warnings,
provider metadata, calculation settings and a deterministic transit snapshot.

## Progress

- 2026-07-22: Docs synchronized for completed natal/PDF state in commit
  `eb6caef docs: sync chart engine roadmap`.
- 2026-07-22: Transits design approved by the user as the next method.
- 2026-07-22: Provider spike confirmed Kerykeion exposes
  `ChartDataFactory.create_transit_chart_data`.
- 2026-07-22: Implemented first single-moment transit slice across contracts,
  Python provider, chart-engine client, chart-worker, domain, DB method values,
  astrologer API and `/chart-engine` frontend mode.
- 2026-07-22: Kept chart PDF source/renderer explicitly natal-only; transit PDF
  remains deferred by product decision.
- 2026-07-22: Targeted automated verification is green; runtime browser/design
  acceptance is still required before claiming visual completion.

## Surprises & Discoveries

- `chart_calculation_jobs.method` is already present, but current generated
  check values only allow `natal`. Transits require schema value and migration
  baseline changes.
- `ChartDataFactory.create_transit_chart_data` returns a single-moment
  `DualChartDataModel`; `TransitsTimeRangeFactory` is a better fit for later
  AstroCalendar/range work.

## Decision Log

- 2026-07-22: Select single-moment `transit` result for `/chart-engine`;
  defer transit ranges to AstroCalendar.
- 2026-07-22: Default transit location/timezone to natal location/timezone for
  the first slice; relocate controls are deferred.
- 2026-07-22: Keep chart PDF natal-only until a transit PDF renderer/source is
  implemented.

## File Structure

### Contracts and Domain

- Modify: `packages/contracts/src/charts.ts`
- Modify: `packages/contracts/src/charts.test.ts`
- Modify: `packages/domain/src/charts/chart-types.ts`
- Modify: `packages/domain/src/charts/chart-use-cases.ts`

### Provider

- Modify: `apps/chart-engine/src/chart_engine/schemas.py`
- Modify: `apps/chart-engine/src/chart_engine/kerykeion_adapter.py`
- Modify: `apps/chart-engine/src/chart_engine/main.py`
- Modify: `apps/chart-engine/tests/test_natal_contract.py`
- Create: `apps/chart-engine/tests/test_transit_contract.py`

### Worker and Client

- Modify: `packages/chart-engine-client/src/chart-engine-client.ts`
- Modify: `packages/chart-engine-client/src/chart-engine-client.test.ts`
- Modify: `apps/chart-worker/src/chart-jobs.processor.ts`
- Modify: `apps/chart-worker/src/chart-jobs.processor.test.ts`
- Modify: `apps/chart-worker/src/chart-jobs.queue.ts`
- Modify: `apps/chart-worker/src/chart-jobs.queue.test.ts`

### Persistence and API

- Modify: `packages/db/src/schema/calculations/calculation-values.ts`
- Modify: `packages/db/src/schema/calculations/calculations.schema.test.ts`
- Modify: `packages/db/src/adapters/charts/drizzle-chart-calculation-job-store.ts`
- Modify: `packages/db/src/adapters/charts/drizzle-chart-calculation-job-store.integration.ts`
- Modify: `apps/astrologer-api/src/modules/charts/charts.controller.ts`
- Modify: `apps/astrologer-api/src/modules/charts/charts.service.ts`
- Modify: `apps/astrologer-api/src/modules/charts/charts.e2e.test.ts`

### Frontend

- Modify: `apps/astrologer-web/src/features/charts/api/chartsApi.ts`
- Modify: `apps/astrologer-web/src/features/charts/model/chartEngineState.ts`
- Modify: `apps/astrologer-web/src/features/charts/model/chartDisplay.ts`
- Modify: `apps/astrologer-web/src/features/charts/model/chartInterpretations.ts`
- Modify: `apps/astrologer-web/src/features/charts/components/ChartWheel.tsx`
- Modify: `apps/astrologer-web/src/features/charts/components/ChartTables.tsx`
- Modify: `apps/astrologer-web/src/features/charts/components/ChartEnginePage.tsx`
- Modify: `apps/astrologer-web/src/features/charts/components/ChartEnginePage.test.tsx`
- Modify: `apps/astrologer-web/src/pages/chart-engine/useChartEngineController.ts`
- Modify: `apps/astrologer-web/src/pages/chart-engine/useChartEngineController.test.ts`

### Documentation

- Modify: `docs/api/api-boundaries.md`
- Modify: `docs/architecture/backend-modules.md`
- Modify: `docs/architecture/design-reference-inventory.md`

## Plan of Work

### Task 1: Canonical Transit Contract

**Files:**
- Modify: `packages/contracts/src/charts.ts`
- Modify: `packages/contracts/src/charts.test.ts`

**Interfaces:**
- Produces: `chartTransitCalculationRequestSchema`,
  `chartTransitJobCreateRequestSchema`,
  `storedChartTransitCalculationPayloadSchema`,
  `storedChartCalculationPayloadSchema` as a discriminated union by `method`.

- [x] **Step 1: Write failing contract tests**

Run: `pnpm test packages/contracts/src/charts.test.ts`
Expected: FAIL because `transit` schemas and union payload are missing.

- [x] **Step 2: Implement minimal schemas**

Add transit snapshot, transit point/result/aspect schemas and keep natal payload
compatibility.

- [x] **Step 3: Verify contracts**

Run: `pnpm test packages/contracts/src/charts.test.ts`
Expected: PASS.

### Task 2: Python Provider Transit Endpoint

**Files:**
- Modify: `apps/chart-engine/src/chart_engine/schemas.py`
- Modify: `apps/chart-engine/src/chart_engine/kerykeion_adapter.py`
- Modify: `apps/chart-engine/src/chart_engine/main.py`
- Create: `apps/chart-engine/tests/test_transit_contract.py`

**Interfaces:**
- Consumes: contract-equivalent request with `method = "transit"`.
- Produces: `POST /v1/transits` returning canonical transit JSON.

- [x] **Step 1: Write failing pytest**

Run: `cd apps/chart-engine && .venv/bin/python -m pytest tests/test_transit_contract.py`
Expected: FAIL because `/v1/transits` is missing.

- [x] **Step 2: Implement provider mapping**

Create natal and transit subjects from snapshots, call
`ChartDataFactory.create_transit_chart_data`, map transit points/houses and map
aspects where one owner is natal and the other is transit.

- [x] **Step 3: Verify provider**

Run: `cd apps/chart-engine && .venv/bin/python -m pytest tests/test_transit_contract.py tests/test_natal_contract.py`
Expected: PASS.

### Task 3: Worker and Persistence Dispatch

**Files:**
- Modify: `packages/domain/src/charts/chart-types.ts`
- Modify: `packages/domain/src/charts/chart-use-cases.ts`
- Modify: `packages/chart-engine-client/src/chart-engine-client.ts`
- Modify: `packages/chart-engine-client/src/chart-engine-client.test.ts`
- Modify: `apps/chart-worker/src/chart-jobs.processor.ts`
- Modify: `apps/chart-worker/src/chart-jobs.processor.test.ts`
- Modify: `packages/db/src/adapters/charts/drizzle-chart-calculation-job-store.ts`

**Interfaces:**
- Produces: generic chart job creation for `natal | transit` and worker dispatch
  to `calculateNatal` or `calculateTransit`.

- [x] **Step 1: Write failing worker/client/domain tests**

Run: `pnpm test packages/chart-engine-client/src/chart-engine-client.test.ts apps/chart-worker/src/chart-jobs.processor.test.ts`
Expected: FAIL because transit dispatch is missing.

- [x] **Step 2: Implement method-aware dispatch and result validation**

Keep BullMQ payload `{ jobId }`; reload the method from DB; call the matching
provider method; persist `calculation_records.method_code = job.method`.

- [x] **Step 3: Verify worker/client/domain**

Run: `pnpm test packages/chart-engine-client/src/chart-engine-client.test.ts apps/chart-worker/src/chart-jobs.processor.test.ts`
Expected: PASS.

### Task 4: DB Values and API Route

**Files:**
- Modify: `packages/db/src/schema/calculations/calculation-values.ts`
- Modify: `packages/db/src/schema/calculations/calculations.schema.test.ts`
- Modify: `apps/astrologer-api/src/modules/charts/charts.controller.ts`
- Modify: `apps/astrologer-api/src/modules/charts/charts.service.ts`
- Modify: `apps/astrologer-api/src/modules/charts/charts.e2e.test.ts`

**Interfaces:**
- Produces: `POST /charts/transits/jobs` with CSRF and deterministic fingerprint.

- [x] **Step 1: Write failing API/schema tests**

Run: `pnpm test packages/db/src/schema/calculations/calculations.schema.test.ts apps/astrologer-api/src/modules/charts/charts.e2e.test.ts`
Expected: FAIL because `transit` is not an allowed method and route is absent.

- [x] **Step 2: Implement DB/API**

Allow `transit`, create the route, hydrate CRM birth data, resolve the transit
snapshot, and include method/settings/input/transit snapshot in the fingerprint.

- [ ] **Step 3: Regenerate/reset DB only after checking local DB authority**

Run: `pnpm db:generate`. Run `pnpm db:reset` only after verifying it targets the
local development DB.

- [x] **Step 4: Verify API/schema**

Run: `pnpm test packages/db/src/schema/calculations/calculations.schema.test.ts apps/astrologer-api/src/modules/charts/charts.e2e.test.ts`
Expected: PASS.

### Task 5: Frontend Transit Mode

**Files:**
- Modify: `apps/astrologer-web/src/features/charts/api/chartsApi.ts`
- Modify: `apps/astrologer-web/src/features/charts/model/chartEngineState.ts`
- Modify: `apps/astrologer-web/src/features/charts/model/chartDisplay.ts`
- Modify: `apps/astrologer-web/src/features/charts/model/chartInterpretations.ts`
- Modify: `apps/astrologer-web/src/features/charts/components/ChartWheel.tsx`
- Modify: `apps/astrologer-web/src/features/charts/components/ChartTables.tsx`
- Modify: `apps/astrologer-web/src/features/charts/components/ChartEnginePage.tsx`
- Modify: `apps/astrologer-web/src/pages/chart-engine/useChartEngineController.ts`

**Interfaces:**
- Consumes: saved `transit` result and `POST /charts/transits/jobs`.
- Produces: enabled "Транзиты" tab with dual-wheel state and tables.

- [ ] **Step 1: Capture reference state**

Use `ElevenHouseDesign/app/engine*.jsx` and browser screenshots for the transit
mode state before UI edits.

Status: deferred in this automated slice. Existing chart reference states were
used for visual language, but fresh browser comparison remains required before
visual acceptance.

- [x] **Step 2: Write failing frontend tests**

Run: `pnpm test apps/astrologer-web/src/features/charts/components/ChartEnginePage.test.tsx apps/astrologer-web/src/pages/chart-engine/useChartEngineController.test.ts`
Expected: FAIL because transits are disabled.

- [x] **Step 3: Implement UI**

Add mode state, transit date/time controls, transit API mutation, dual-wheel
rendering, transit tables, Dictionary code mapping and disabled PDF state.

- [x] **Step 4: Verify frontend**

Run: `pnpm test apps/astrologer-web/src/features/charts/components/ChartEnginePage.test.tsx apps/astrologer-web/src/pages/chart-engine/useChartEngineController.test.ts`
Expected: PASS.

### Task 6: Runtime and Browser Proof

**Files:**
- Evidence: `.design-qa/chart-engine-transits-2026-07-22/`

**Interfaces:**
- Consumes: real local API, chart-worker, chart-engine, DB, Redis and
  authenticated astrologer session.
- Produces: proof that a real transit calculation can be created, read,
  rendered and reloaded.

- [x] **Step 1: Run affected automated surface**

Run contract, provider, worker, API, frontend targeted tests and typechecks.

- [ ] **Step 2: Exercise real flow**

Open `/chart-engine`, select a client, switch to "Транзиты", calculate, reload,
inspect network/console and capture screenshots.

- [ ] **Step 3: Review docs and diff**

Run: `pnpm docs:check:test`, `pnpm docs:check`, `git diff --check`.

## Validation and Acceptance

- Contracts validate natal and transit payloads independently.
- Provider returns non-empty natal points, transit points and transit-to-natal
  aspects.
- Worker stores `calculation_records.method_code = "transit"`.
- API route is authenticated, CSRF-protected, owner scoped and idempotent.
- UI no longer shows "Транзиты" as a dead disabled tab after backend support
  exists.
- PDF remains disabled for transit with explicit copy until renderer exists.
- Browser proof covers calculate, reload, stale state after birth-data/settings
  change, console and network.

## Outcomes & Retrospective

Implemented in the first slice:

- `transit` contracts and stored result envelope as a discriminated union with
  natal and transit result branches.
- Private chart-engine `/v1/transits` endpoint backed by Kerykeion single-moment
  dual chart data.
- Method-aware chart job domain, DB adapter, worker dispatch and chart-engine
  HTTP client.
- Astrologer API route `POST /charts/transits/jobs` with CSRF and CRM birth-data
  hydration.
- `/chart-engine` transit mode, transit date/time controls, dual-wheel transit
  markers/aspects, transit tables, Dictionary lookup codes and stale-state
  detection.
- Chart PDF source/renderer narrowed to natal payloads, keeping transit PDF
  disabled until a separate PDF contract exists.

Remaining:

- Local DB reset/baseline reconciliation must be completed with verified local
  database authority before claiming DB migration acceptance.
- Runtime browser proof and visual parity screenshots are still required.

## Idempotence and Recovery

- Replaying the same owner/client/settings/transit snapshot returns the active
  job or existing result.
- Retrying worker jobs reloads by `jobId`; queue payload remains `{ jobId }`.
- Provider permanent validation errors mark the job failed with safe messages.
- Recalculation invalidates current artifacts for the affected method.
- DB reset is local-only and follows the existing baseline policy.

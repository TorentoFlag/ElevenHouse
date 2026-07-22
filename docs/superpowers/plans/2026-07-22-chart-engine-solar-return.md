# Chart Engine Solar Return Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. ElevenHouse repository policy overrides generic worktree/feature-branch guidance: execute in the existing checkout on `main`, preserve concurrent changes, and do not commit without separate user authority.

**Goal:** Add the first production `solar_return` method to Chart Engine as a dual natal + solar-return wheel for owner-scoped CRM clients.

**Architecture:** `astrologer-api` hydrates the CRM client's birth data, validates a target year, creates an idempotent chart job and exposes generic job/result reads. `chart-worker` dispatches `solar_return` jobs to the private Python `apps/chart-engine` provider, which uses Kerykeion `PlanetaryReturnFactory` plus `ChartDataFactory.create_return_chart_data`. The frontend enables a real `Соляр` mode only after canonical result, API flow and browser proof exist.

**Tech Stack:** TypeScript 6, NestJS, Drizzle ORM, PostgreSQL, BullMQ/Redis, Zod-backed contracts, React 19, Vite 8, TanStack Query 5, Python 3.10+, FastAPI, Pydantic, Uvicorn, Kerykeion 5.12.x, Vitest, pytest.

## Global Constraints

- Work only in the current ElevenHouse checkout on `main`.
- Preserve all unowned modifications and stage only solar-return-owned paths.
- Follow red-green-refactor for each behavior.
- Do not expose queue wording in frontend copy.
- Do not store raw Kerykeion JSON, provider SVG, client names, phone numbers, CRM notes, frontend layout coordinates or style metadata in canonical chart results.
- Keep private birth input snapshots separate from renderable chart results.
- State-changing chart routes must use `astrologer-api` CSRF route metadata.
- Controllers must not publish directly to Redis/BullMQ.
- The first solar-return slice uses natal location/timezone; relocated return controls are out of scope.
- Solar-return PDF export remains disabled until a separate renderer/source exists.

---

## Progress

- 2026-07-22: User approved first slice as `натал внутри + соляр снаружи`, target year explicit, natal location/timezone, PDF/AI disabled.

## Task 1: Contracts And DB Method Value

**Files:**
- Modify: `packages/contracts/src/charts.ts`
- Modify: `packages/contracts/src/charts.test.ts`
- Modify: `packages/db/src/schema/calculations/calculation-values.ts`
- Modify: `packages/db/src/schema/calculations/calculations.schema.test.ts`
- Modify: `packages/db/drizzle/0000_sticky_rictor.sql`
- Modify: `packages/db/drizzle/meta/0000_snapshot.json`

**Interfaces:**
- Consumes: existing `chartTransitSnapshotSchema`, `chartTransitAspectSchema`, `chartRenderResultSchema`, `storedChartCalculationPayloadSchema`.
- Produces: `chartSolarReturnJobCreateRequestSchema`, `chartSolarReturnCalculationRequestSchema`, `storedChartSolarReturnCalculationPayloadSchema`, method value `solar_return`.

- [ ] Write failing Zod tests that `solar_return` validates `year`, stores `solarReturnSnapshot.resolvedAt`, and remains a discriminated union member.
- [ ] Run `pnpm test packages/contracts/src/charts.test.ts packages/db/src/schema/calculations/calculations.schema.test.ts`; expected failure because schemas and DB method value are missing.
- [ ] Add `solar_return` schemas and method constraints.
- [ ] Re-run the same tests; expected pass.
- [ ] Run `git diff --check`.
- [ ] Commit exact owned files with `feat: add solar return chart contracts`.

## Task 2: Python Provider Endpoint

**Files:**
- Modify: `apps/chart-engine/src/chart_engine/schemas.py`
- Modify: `apps/chart-engine/src/chart_engine/kerykeion_adapter.py`
- Modify: `apps/chart-engine/src/chart_engine/main.py`
- Create: `apps/chart-engine/tests/test_solar_return_contract.py`

**Interfaces:**
- Consumes: request shape from Task 1.
- Produces: `POST /v1/solar-return` returning `StoredChartSolarReturnCalculationPayload`.

- [ ] Write failing pytest for `/v1/solar-return` with natal input and `year = 2026`.
- [ ] Run `cd apps/chart-engine && .venv/bin/python -m pytest tests/test_solar_return_contract.py`; expected 404 or schema failure.
- [ ] Implement provider mapping through `PlanetaryReturnFactory(..., online=False)` and `ChartDataFactory.create_return_chart_data(natal_subject, return_subject)`.
- [ ] Reuse existing point/house/aspect/distribution mappers; return `solarReturnSnapshot.resolvedAt` from provider local datetime.
- [ ] Re-run solar-return, natal, transit and synastry provider tests; expected pass.
- [ ] Commit exact owned files with `feat: add solar return provider`.

## Task 3: Client And Worker Dispatch

**Files:**
- Modify: `packages/chart-engine-client/src/chart-engine-client.ts`
- Modify: `packages/chart-engine-client/src/chart-engine-client.test.ts`
- Modify: `apps/chart-worker/src/chart-jobs.processor.ts`
- Modify: `apps/chart-worker/src/chart-jobs.processor.test.ts`

**Interfaces:**
- Consumes: `ChartSolarReturnCalculationRequest`, `StoredChartSolarReturnCalculationPayload`.
- Produces: `calculateSolarReturn(payload)` and worker dispatch for method `solar_return`.

- [ ] Write failing client and worker tests for `/v1/solar-return` dispatch.
- [ ] Run `pnpm test packages/chart-engine-client/src/chart-engine-client.test.ts apps/chart-worker/src/chart-jobs.processor.test.ts`; expected failure.
- [ ] Implement typed client method and worker branch.
- [ ] Re-run tests; expected pass.
- [ ] Commit exact owned files with `feat: dispatch solar return chart jobs`.

## Task 4: Astrologer API Job Creation

**Files:**
- Modify: `apps/astrologer-api/src/modules/charts/charts.controller.ts`
- Modify: `apps/astrologer-api/src/modules/charts/charts.service.ts`
- Modify: `apps/astrologer-api/src/modules/charts/charts.service.test.ts`
- Modify: `apps/astrologer-api/src/modules/charts/charts.e2e.test.ts`
- Modify if needed: `packages/db/src/adapters/charts/drizzle-chart-calculation-job-store.ts`

**Interfaces:**
- Consumes: `chartSolarReturnJobCreateRequestSchema`.
- Produces: `POST /charts/solar-return/jobs`.

- [ ] Write failing service/e2e tests for owner-scoped client, `year` validation, missing birth data, CSRF and idempotent existing result reuse.
- [ ] Run `pnpm test apps/astrologer-api/src/modules/charts/charts.service.test.ts apps/astrologer-api/src/modules/charts/charts.e2e.test.ts`; expected failure.
- [ ] Add controller route, service request parsing, fingerprint, snapshots and stable errors.
- [ ] Re-run tests; expected pass.
- [ ] Run `pnpm --filter @elevenhouse/astrologer-api build`.
- [ ] Commit exact owned files with `feat: expose solar return chart jobs`.

## Task 5: Frontend Mode, State And Dictionary

**Files:**
- Modify: `apps/astrologer-web/src/features/charts/api/chartsApi.ts`
- Modify: `apps/astrologer-web/src/features/charts/api/chartsApi.test.ts`
- Modify: `apps/astrologer-web/src/features/charts/model/chartEngineState.ts`
- Modify: `apps/astrologer-web/src/features/charts/model/chartEngineState.test.ts`
- Modify: `apps/astrologer-web/src/features/charts/model/chartDisplay.ts`
- Modify: `apps/astrologer-web/src/features/charts/model/chartInterpretations.ts`
- Modify: `apps/astrologer-web/src/features/charts/model/chartInterpretations.test.ts`
- Modify: `apps/astrologer-web/src/features/charts/components/ChartEnginePage.tsx`
- Modify: `apps/astrologer-web/src/features/charts/components/ChartEnginePage.test.tsx`
- Modify: `apps/astrologer-web/src/features/charts/components/ChartWheel.tsx`
- Modify: `apps/astrologer-web/src/features/charts/components/ChartTables.tsx`
- Modify: `apps/astrologer-web/src/pages/chart-engine/useChartEngineController.ts`
- Modify: `apps/astrologer-web/src/pages/chart-engine/useChartEngineController.test.ts`

**Interfaces:**
- Consumes: API route from Task 4 and `StoredChartSolarReturnCalculationPayload`.
- Produces: `/chart-engine` `Соляр` mode with year control, stale detection, dual-wheel render and Dictionary `solar_return.*` anchors.

- [ ] Write failing API/model/component/controller tests for solar-return mode, invalid year, stale after year change, reload restore and Dictionary codes.
- [ ] Run targeted frontend tests; expected failure.
- [ ] Implement API helper, controller mode, year state, UI labels, result display, wheel/table reuse and Dictionary anchors.
- [ ] Re-run targeted frontend tests; expected pass.
- [ ] Run `pnpm --filter @elevenhouse/astrologer-web build`.
- [ ] Commit exact owned files with `feat: wire chart solar return frontend`.

## Task 6: Runtime Browser Proof And Docs Sync

**Files:**
- Modify: `docs/product/roadmap.md`
- Modify: `docs/architecture/design-reference-inventory.md`
- Modify: `docs/superpowers/specs/2026-07-22-chart-engine-solar-return-design.md`
- Modify: `docs/superpowers/plans/2026-07-22-chart-engine-solar-return.md`

**Interfaces:**
- Consumes: completed Tasks 1-5.
- Produces: evidence that a real solar-return calculation works through browser/network.

- [ ] Verify local DB method constraint includes `solar_return`; if local DB drift exists, update local-only constraint after confirming host/database.
- [ ] Rebuild/restart only services that are stale, under the user's process authority.
- [ ] In browser, open `/chart-engine`, select CRM client, switch to `Соляр`, choose year, calculate, verify job/result/dictionary network calls, reload URL and check console.
- [ ] Run affected automated checks plus docs checks.
- [ ] Update roadmap/inventory/spec progress with exact evidence and deferred contours.
- [ ] Commit docs/evidence sync with `docs: sync chart solar return status`.

## Final Verification

- `pnpm test packages/contracts/src/charts.test.ts packages/db/src/schema/calculations/calculations.schema.test.ts`
- `cd apps/chart-engine && .venv/bin/python -m pytest tests/test_natal_contract.py tests/test_transit_contract.py tests/test_synastry_contract.py tests/test_solar_return_contract.py`
- `pnpm test packages/chart-engine-client/src/chart-engine-client.test.ts apps/chart-worker/src/chart-jobs.processor.test.ts apps/astrologer-api/src/modules/charts/charts.service.test.ts apps/astrologer-api/src/modules/charts/charts.e2e.test.ts`
- `pnpm test apps/astrologer-web/src/features/charts/api/chartsApi.test.ts apps/astrologer-web/src/features/charts/model/chartEngineState.test.ts apps/astrologer-web/src/features/charts/model/chartInterpretations.test.ts apps/astrologer-web/src/pages/chart-engine/useChartEngineController.test.ts apps/astrologer-web/src/features/charts/components/ChartEnginePage.test.tsx`
- `pnpm --filter @elevenhouse/astrologer-api build`
- `pnpm --filter @elevenhouse/chart-worker build`
- `pnpm --filter @elevenhouse/astrologer-web build`
- `pnpm docs:check:test`
- `pnpm docs:check`
- `git diff --check`
- Real browser proof on `/chart-engine` with authenticated astrologer and network-backed `POST /api/charts/solar-return/jobs`.

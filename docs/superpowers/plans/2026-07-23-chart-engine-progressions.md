# Chart Engine Progressions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first production progressions slice to `/chart-engine`: secondary progressed chart jobs, provider calculation, persisted result, frontend mode and browser proof.

**Architecture:** Extend the existing chart method contour instead of adding a parallel path. The method code is `progression`; contracts define the result union, `astrologer-api` creates owner-scoped async jobs, `chart-worker` calls `apps/chart-engine`, and `astrologer-web` renders the persisted result as a dual wheel with Dictionary-backed interpretations.

**Tech Stack:** TypeScript, Zod contracts, NestJS, Drizzle/PostgreSQL, BullMQ worker, Python FastAPI, Kerykeion, React, TanStack Query, Vitest, Pytest, Chrome DevTools.

## Global Constraints

- Work in the existing checkout on `main`; do not create/switch branch, stash, reset or use a worktree.
- Preserve unowned dirty/untracked files; stage exact owned paths only.
- No production code without a failing test first.
- Progressions first slice means secondary progressions only.
- Persisted method code is `progression`.
- API route is `POST /api/charts/progressions/jobs`.
- Chart-engine route is `POST /v1/progressions`.
- PDF remains disabled for progressions.
- Missing Dictionary interpretations must be visible and must offer the existing create-entry link.

---

### Task 1: Contracts And DB Method Value

**Files:**
- Modify: `packages/contracts/src/charts.ts`
- Modify: `packages/contracts/src/charts.test.ts`
- Modify: `packages/domain/src/charts/chart-types.ts`
- Modify: `packages/db/src/schema/calculations/calculation-values.ts`
- Modify: `packages/db/drizzle/0000_sticky_rictor.sql`
- Modify: `packages/db/drizzle/meta/0000_snapshot.json`

**Interfaces:**
- Produces: `chartProgressionJobCreateRequestSchema`, `chartProgressionCalculationRequestSchema`, `storedChartProgressionCalculationPayloadSchema`, `StoredChartProgressionCalculationPayload`.
- Produces: `ChartCalculationMethod = "natal" | "transit" | "synastry" | "solar_return" | "progression"`.

- [ ] **Step 1: Write failing contract tests**

Add tests to `packages/contracts/src/charts.test.ts`:

```ts
it("parses secondary progression job requests", () => {
  const payload = chartProgressionJobCreateRequestSchema.parse({
    clientId: "22222222-2222-4222-8222-222222222222",
    targetDate: "2026-07-23",
    settings: validSettings
  });

  expect(payload.targetDate).toBe("2026-07-23");
});

it("parses stored secondary progression chart results", () => {
  const payload = storedChartCalculationPayloadSchema.parse({
    schemaVersion: "chart-result.v1",
    method: "progression",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: validSettings,
    inputSnapshot: validInputSnapshot,
    progressionSnapshot: {
      targetDate: "2026-07-23",
      progressionType: "secondary",
      calculationBasis: {
        symbolicDate: "1990-08-20",
        ageDays: 36,
        dayForYearRatio: 1
      }
    },
    result: {
      natal: validRenderResult(),
      progressed: validRenderResult(),
      aspectsToNatal: [
        {
          progressedPoint: "moon",
          natalPoint: "sun",
          type: "trine",
          angle: 120,
          orb: 1.2,
          applying: true,
          strength: 0.76
        }
      ],
      warnings: []
    }
  });

  expect(payload.method).toBe("progression");
  if (payload.method !== "progression") throw new Error("expected progression payload");
  expect(payload.result.progressed.points.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run contract tests and verify failure**

Run: `pnpm test packages/contracts/src/charts.test.ts`
Expected: FAIL because progression schemas are not exported/defined.

- [ ] **Step 3: Implement minimal contracts**

In `packages/contracts/src/charts.ts`, add request/result schemas matching the design spec and include `storedChartProgressionCalculationPayloadSchema` in `storedChartCalculationPayloadSchema`.

- [ ] **Step 4: Extend domain and DB method values**

Add `"progression"` to `ChartCalculationMethod`, `chartCalculationJobMethodValues`, the baseline SQL check and the snapshot enum/check metadata.

- [ ] **Step 5: Run contract and domain/db targeted checks**

Run:

```bash
pnpm test packages/contracts/src/charts.test.ts
pnpm test packages/domain/src/charts/chart-use-cases.test.ts
pnpm test packages/db/src/adapters/charts/drizzle-chart-calculation-job-store.integration.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/charts.ts packages/contracts/src/charts.test.ts packages/domain/src/charts/chart-types.ts packages/db/src/schema/calculations/calculation-values.ts packages/db/drizzle/0000_sticky_rictor.sql packages/db/drizzle/meta/0000_snapshot.json
git commit -m "feat: add chart progression contracts"
```

### Task 2: Astrologer API Progression Jobs

**Files:**
- Modify: `apps/astrologer-api/src/modules/charts/charts.service.ts`
- Modify: `apps/astrologer-api/src/modules/charts/charts.controller.ts`
- Modify: `apps/astrologer-api/src/modules/charts/charts.service.test.ts`
- Modify: `apps/astrologer-api/src/modules/charts/charts.e2e.test.ts`

**Interfaces:**
- Consumes: `chartProgressionJobCreateRequestSchema`.
- Produces: `ChartsService.createProgressionJob(body, request)`.
- Produces: `POST /charts/progressions/jobs`.

- [ ] **Step 1: Write failing service test**

Add a test that calls `createProgressionJob` with `{ clientId, targetDate, settings }` and expects the command store to receive:

```ts
{
  method: "progression",
  inputSnapshot: {
    inputSnapshot: expect.objectContaining({ birthDate: "1990-07-15" }),
    progressionSnapshot: {
      targetDate: "2026-07-23",
      progressionType: "secondary"
    }
  }
}
```

- [ ] **Step 2: Run service test and verify failure**

Run: `pnpm test apps/astrologer-api/src/modules/charts/charts.service.test.ts`
Expected: FAIL because `createProgressionJob` does not exist.

- [ ] **Step 3: Implement service method**

Parse the contract, resolve owner user id, resolve owner-scoped client, assert birth data readiness, create a fingerprint with `method: "progression"`, and call `createChartJobAndRequestCalculation`.

- [ ] **Step 4: Write and run e2e route test**

Add e2e coverage for:

```text
POST /charts/progressions/jobs
```

Expected response is `201` with `{ status: "calculating", jobId }` for authenticated CSRF request, and `403` without valid auth/CSRF following existing chart tests.

- [ ] **Step 5: Run API checks**

Run:

```bash
pnpm test apps/astrologer-api/src/modules/charts/charts.service.test.ts
pnpm test apps/astrologer-api/src/modules/charts/charts.e2e.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/astrologer-api/src/modules/charts/charts.service.ts apps/astrologer-api/src/modules/charts/charts.controller.ts apps/astrologer-api/src/modules/charts/charts.service.test.ts apps/astrologer-api/src/modules/charts/charts.e2e.test.ts
git commit -m "feat: expose chart progression jobs"
```

### Task 3: Chart Engine Provider And Client

**Files:**
- Modify: `apps/chart-engine/src/chart_engine/schemas.py`
- Modify: `apps/chart-engine/src/chart_engine/kerykeion_adapter.py`
- Modify: `apps/chart-engine/src/chart_engine/main.py`
- Create: `apps/chart-engine/tests/test_progression_contract.py`
- Modify: `packages/chart-engine-client/src/chart-engine-client.ts`
- Modify: `packages/chart-engine-client/src/chart-engine-client.test.ts`

**Interfaces:**
- Produces: FastAPI `POST /v1/progressions`.
- Produces: `ChartEngineHttpClient.calculateProgression(payload)`.

- [ ] **Step 1: Write failing Python provider test**

Create `apps/chart-engine/tests/test_progression_contract.py` with a request for Maria-style birth data and target date `2026-07-23`. Assert:

```py
assert response.status_code == 200
data = response.json()
assert data["method"] == "progression"
assert data["progressionSnapshot"]["progressionType"] == "secondary"
assert data["result"]["progressed"]["points"]
assert "symbolicDate" in data["progressionSnapshot"]["calculationBasis"]
```

- [ ] **Step 2: Run Python test and verify failure**

Run: `cd apps/chart-engine && .venv/bin/pytest tests/test_progression_contract.py`
Expected: FAIL with 404 for `/v1/progressions` or missing schema.

- [ ] **Step 3: Implement Python schemas and adapter**

Add progression request/result models. Implement `calculate_progression` by creating the natal subject and progressed subject from `birthDate + ageDaysAtTargetDate` calendar days. Use existing `_map_render_result` and cross-chart aspect mapping pattern. Return `StoredChartProgressionCalculationPayload`.

- [ ] **Step 4: Add FastAPI route**

Add `POST /v1/progressions` in `apps/chart-engine/src/chart_engine/main.py`.

- [ ] **Step 5: Write failing client test**

In `packages/chart-engine-client/src/chart-engine-client.test.ts`, assert `calculateProgression` posts to `/v1/progressions` and validates `storedChartProgressionCalculationPayloadSchema`.

- [ ] **Step 6: Implement client method**

Add imports for progression schemas/types and implement `calculateProgression` following `calculateSolarReturn`.

- [ ] **Step 7: Run provider/client checks**

Run:

```bash
cd apps/chart-engine && .venv/bin/pytest tests/test_progression_contract.py
pnpm test packages/chart-engine-client/src/chart-engine-client.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/chart-engine/src/chart_engine/schemas.py apps/chart-engine/src/chart_engine/kerykeion_adapter.py apps/chart-engine/src/chart_engine/main.py apps/chart-engine/tests/test_progression_contract.py packages/chart-engine-client/src/chart-engine-client.ts packages/chart-engine-client/src/chart-engine-client.test.ts
git commit -m "feat: add chart progression provider"
```

### Task 4: Worker Dispatch And Persistence Summary

**Files:**
- Modify: `apps/chart-worker/src/chart-jobs.processor.ts`
- Modify: `apps/chart-worker/src/chart-jobs.processor.test.ts`
- Modify: `packages/db/src/adapters/charts/drizzle-chart-calculation-job-store.ts`

**Interfaces:**
- Consumes: `ChartEngineClient.calculateProgression`.
- Produces: progression result summaries in calculation records.

- [ ] **Step 1: Write failing worker test**

Add a progression job fixture and expect `processChartCalculationJob` to call `engine.calculateProgression` and persist a `method: "progression"` result.

- [ ] **Step 2: Run worker test and verify failure**

Run: `pnpm test apps/chart-worker/src/chart-jobs.processor.test.ts`
Expected: FAIL because worker rejects unsupported method.

- [ ] **Step 3: Implement worker dispatch**

Add `chartProgressionCalculationRequestSchema` parsing and route `claim.method === "progression"` to `engine.calculateProgression`.

- [ ] **Step 4: Write failing DB summary test if current tests cover summaries**

If the integration test asserts summaries, add expected keys:

```ts
progressedPointCount
progressionAspectCount
targetDate
symbolicDate
```

- [ ] **Step 5: Implement DB summary/title**

Add `Progression chart` title and progression summary branch.

- [ ] **Step 6: Run checks**

Run:

```bash
pnpm test apps/chart-worker/src/chart-jobs.processor.test.ts
pnpm test packages/db/src/adapters/charts/drizzle-chart-calculation-job-store.integration.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/chart-worker/src/chart-jobs.processor.ts apps/chart-worker/src/chart-jobs.processor.test.ts packages/db/src/adapters/charts/drizzle-chart-calculation-job-store.ts
git commit -m "feat: dispatch chart progression jobs"
```

### Task 5: Frontend API, State And Rendering

**Files:**
- Modify: `apps/astrologer-web/src/features/charts/api/chartsApi.ts`
- Modify: `apps/astrologer-web/src/features/charts/api/chartsApi.test.ts`
- Modify: `apps/astrologer-web/src/features/charts/model/chartDisplay.ts`
- Modify: `apps/astrologer-web/src/features/charts/model/chartDisplay.test.ts`
- Modify: `apps/astrologer-web/src/features/charts/model/chartEngineState.ts`
- Modify: `apps/astrologer-web/src/features/charts/model/chartEngineState.test.ts`
- Modify: `apps/astrologer-web/src/features/charts/model/chartInterpretations.ts`
- Modify: `apps/astrologer-web/src/features/charts/model/chartInterpretations.test.ts`
- Modify: `apps/astrologer-web/src/features/charts/components/ChartWheel.tsx`
- Modify: `apps/astrologer-web/src/features/charts/components/ChartTables.tsx`
- Modify: `apps/astrologer-web/src/features/charts/components/ChartEnginePage.tsx`
- Modify: `apps/astrologer-web/src/features/charts/components/ChartEnginePage.test.tsx`
- Modify: `apps/astrologer-web/src/pages/chart-engine/useChartEngineController.ts`
- Modify: `apps/astrologer-web/src/pages/chart-engine/useChartEngineController.test.ts`

**Interfaces:**
- Produces: enabled `ChartEngineMode = "progression"`.
- Produces: `createProgressionChartJob({ clientId, targetDate, settings })`.

- [ ] **Step 1: Write failing frontend API/controller tests**

Assert `createProgressionChartJob` posts to `/charts/progressions/jobs`; assert restored progression result sets `mode: "progression"` and `progressionTargetDate`.

- [ ] **Step 2: Run frontend tests and verify failure**

Run:

```bash
pnpm test apps/astrologer-web/src/features/charts/api/chartsApi.test.ts apps/astrologer-web/src/pages/chart-engine/useChartEngineController.test.ts
```

Expected: FAIL because progression API/mode are missing.

- [ ] **Step 3: Implement frontend API and controller state**

Add target date state, mutation, submit handler, restore logic, URL behavior and stale logic for progressions.

- [ ] **Step 4: Write failing UI/model tests**

Assert `Прогрессии` is enabled, date input is visible, action button says `Рассчитать прогрессии`, and result labels mention progressed points/aspects.

- [ ] **Step 5: Implement UI/model rendering**

Map primary chart to natal, overlay chart to progressed, tables to progressed data, and interpretation codes to `progression.*`.

- [ ] **Step 6: Run frontend checks**

Run:

```bash
pnpm test apps/astrologer-web/src/features/charts/components/ChartEnginePage.test.tsx
pnpm test apps/astrologer-web/src/features/charts/model/chartDisplay.test.ts apps/astrologer-web/src/features/charts/model/chartEngineState.test.ts apps/astrologer-web/src/features/charts/model/chartInterpretations.test.ts
pnpm test apps/astrologer-web/src/pages/chart-engine/useChartEngineController.test.ts
pnpm --filter @elevenhouse/astrologer-web build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/astrologer-web/src/features/charts/api/chartsApi.ts apps/astrologer-web/src/features/charts/api/chartsApi.test.ts apps/astrologer-web/src/features/charts/model/chartDisplay.ts apps/astrologer-web/src/features/charts/model/chartDisplay.test.ts apps/astrologer-web/src/features/charts/model/chartEngineState.ts apps/astrologer-web/src/features/charts/model/chartEngineState.test.ts apps/astrologer-web/src/features/charts/model/chartInterpretations.ts apps/astrologer-web/src/features/charts/model/chartInterpretations.test.ts apps/astrologer-web/src/features/charts/components/ChartWheel.tsx apps/astrologer-web/src/features/charts/components/ChartTables.tsx apps/astrologer-web/src/features/charts/components/ChartEnginePage.tsx apps/astrologer-web/src/features/charts/components/ChartEnginePage.test.tsx apps/astrologer-web/src/pages/chart-engine/useChartEngineController.ts apps/astrologer-web/src/pages/chart-engine/useChartEngineController.test.ts
git commit -m "feat: wire chart progressions frontend"
```

### Task 6: Docs, Runtime Proof And Final Commit

**Files:**
- Modify: `docs/product/roadmap.md`
- Modify: `docs/architecture/design-reference-inventory.md`
- Optional create: `.design-qa/chart-engine-progressions-2026-07-23/notes.md`

**Interfaces:**
- Produces: current docs reflecting progressions first slice.
- Produces: browser proof evidence.

- [ ] **Step 1: Update docs after implementation**

Mark progressions first slice complete in roadmap and inventory only after runtime proof passes.

- [ ] **Step 2: Run affected automated checks**

Run:

```bash
pnpm test packages/contracts/src/charts.test.ts
pnpm test apps/astrologer-api/src/modules/charts/charts.service.test.ts apps/astrologer-api/src/modules/charts/charts.e2e.test.ts
pnpm test apps/chart-worker/src/chart-jobs.processor.test.ts
cd apps/chart-engine && .venv/bin/pytest tests/test_progression_contract.py
pnpm test apps/astrologer-web/src/features/charts/components/ChartEnginePage.test.tsx apps/astrologer-web/src/pages/chart-engine/useChartEngineController.test.ts
pnpm --filter @elevenhouse/astrologer-web build
git diff --check
```

Expected: PASS, except build may retain the existing Vite chunk-size warning.

- [ ] **Step 3: Runtime browser proof**

Use the running local stack. In `/chart-engine`, select Maria Ivanova, switch to `Прогрессии`, set a target date, calculate, wait for the job, reload, and verify:

```text
POST /api/charts/progressions/jobs
GET /api/charts/jobs/:jobId
GET /api/charts/calculations/:calculationId
```

Expected: clean console, successful network, persisted result restores `Прогрессии`, right panel visible, no horizontal overflow.

- [ ] **Step 4: Commit docs/evidence**

```bash
git add docs/product/roadmap.md docs/architecture/design-reference-inventory.md .design-qa/chart-engine-progressions-2026-07-23/notes.md
git commit -m "docs: sync chart progressions status"
```

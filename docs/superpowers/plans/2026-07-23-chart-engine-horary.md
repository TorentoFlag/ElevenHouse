# Chart Engine Horary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first production horary slice to `/chart-engine`: client-scoped horary jobs, question-moment provider calculation, persisted result, frontend mode, Dictionary anchors and browser proof.

**Architecture:** Extend the existing chart method contour instead of adding a parallel path. The persisted method code is `horary`; contracts define a private `questionSnapshot`, `astrologer-api` creates owner-scoped async jobs without requiring birth data, `chart-worker` calls `apps/chart-engine`, and `astrologer-web` renders the result as a single wheel with horary-specific Dictionary lookup codes.

**Tech Stack:** TypeScript, Zod contracts, NestJS, Drizzle/PostgreSQL, BullMQ worker, Python FastAPI, Kerykeion, React, TanStack Query, Vitest, Pytest, Chrome DevTools.

## Global Constraints

- Work in the existing checkout on `main`; do not create/switch branch, stash, reset or use a worktree.
- Preserve unowned dirty/untracked files; stage exact owned paths only.
- No production code without a failing test first.
- Horary first slice means a chart for one focused question moment and location.
- Persisted method code is `horary`.
- API route is `POST /api/charts/horary/jobs`.
- Chart-engine route is `POST /v1/horary`.
- The backend must not require or read client birth data for horary calculation.
- `questionSnapshot` is private calculation input and must stay separate from render data.
- PDF remains disabled for horary.
- Missing Dictionary interpretations must be visible and must offer the existing create-entry link.
- No automated horary verdict, significator logic, timing prediction, AI answer or fake placeholder interpretation.

---

### Task 1: Contracts And DB Method Value

**Files:**
- Modify: `packages/contracts/src/charts.ts`
- Modify: `packages/contracts/src/charts.test.ts`
- Modify: `packages/domain/src/charts/chart-types.ts`
- Modify: `packages/db/src/schema/calculations/calculation-values.ts`
- Modify: `packages/db/src/schema/calculations/calculations.schema.test.ts`
- Modify: `packages/db/drizzle/0000_sticky_rictor.sql`
- Modify: `packages/db/drizzle/meta/0000_snapshot.json`

**Interfaces:**
- Produces: `chartHoraryQuestionSnapshotSchema`.
- Produces: `chartHoraryJobCreateRequestSchema`.
- Produces: `chartHoraryCalculationRequestSchema`.
- Produces: `storedChartHoraryCalculationPayloadSchema`.
- Produces: `ChartHoraryQuestionSnapshot`, `ChartHoraryJobCreateRequest`, `ChartHoraryCalculationRequest`, `StoredChartHoraryCalculationPayload`.
- Produces: `ChartCalculationMethod` including `"horary"`.

- [ ] **Step 1: Write failing contract tests**

Add imports and tests to `packages/contracts/src/charts.test.ts`:

```ts
it("parses horary job requests with question snapshot", () => {
  const payload = chartHoraryJobCreateRequestSchema.parse({
    clientId: "22222222-2222-4222-8222-222222222222",
    question: {
      question: "Стоит ли принимать предложение?",
      category: "career",
      date: "2026-07-23",
      time: "14:30",
      timezone: "Europe/Moscow",
      latitude: 55.7558,
      longitude: 37.6173
    },
    settings: validSettings
  });

  expect(payload.question.question).toBe("Стоит ли принимать предложение?");
  expect(payload.question.category).toBe("career");
});

it("rejects horary job requests without question text", () => {
  expect(() =>
    chartHoraryJobCreateRequestSchema.parse({
      clientId: "22222222-2222-4222-8222-222222222222",
      question: {
        question: "",
        category: "career",
        date: "2026-07-23",
        time: "14:30",
        timezone: "Europe/Moscow",
        latitude: 55.7558,
        longitude: 37.6173
      },
      settings: validSettings
    })
  ).toThrow();
});

it("parses stored horary chart results", () => {
  const payload = storedChartCalculationPayloadSchema.parse({
    schemaVersion: "chart-result.v1",
    method: "horary",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: validSettings,
    questionSnapshot: {
      question: "Стоит ли принимать предложение?",
      category: "career",
      date: "2026-07-23",
      time: "14:30",
      timezone: "Europe/Moscow",
      latitude: 55.7558,
      longitude: 37.6173
    },
    result: validRenderResult()
  });

  expect(payload.method).toBe("horary");
  if (payload.method !== "horary") throw new Error("expected horary payload");
  expect(payload.questionSnapshot.question).toContain("предложение");
});
```

- [ ] **Step 2: Run contract tests and verify failure**

Run: `pnpm test packages/contracts/src/charts.test.ts`

Expected: FAIL because horary schemas are not exported/defined.

- [ ] **Step 3: Implement minimal contracts**

In `packages/contracts/src/charts.ts`, add:

```ts
export const chartHoraryQuestionCategorySchema = z.enum([
  "relationship",
  "career",
  "money",
  "home",
  "health",
  "travel",
  "other"
]);

export const chartHoraryQuestionSnapshotSchema = z
  .object({
    question: z.string().trim().min(1).max(500),
    category: chartHoraryQuestionCategorySchema.optional().default("other"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    timezone: z.string().trim().min(1).max(100),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180)
  })
  .strict();
export type ChartHoraryQuestionSnapshot = z.infer<typeof chartHoraryQuestionSnapshotSchema>;
```

Add `chartHoraryJobCreateRequestSchema`, `chartHoraryCalculationRequestSchema`, and
`storedChartHoraryCalculationPayloadSchema`, then include the stored schema in
`storedChartCalculationPayloadSchema`.

- [ ] **Step 4: Extend domain and DB method values**

Add `"horary"` to:

```ts
export type ChartCalculationMethod =
  | "natal"
  | "transit"
  | "synastry"
  | "composite"
  | "solar_return"
  | "progression"
  | "horary";
```

Add `"horary"` to `chartCalculationJobMethodValues`, the baseline SQL CHECK in
`packages/db/drizzle/0000_sticky_rictor.sql`, and the snapshot metadata in
`packages/db/drizzle/meta/0000_snapshot.json`.

- [ ] **Step 5: Run targeted checks**

Run:

```bash
pnpm test packages/contracts/src/charts.test.ts
pnpm test packages/domain/src/charts/chart-use-cases.test.ts
pnpm test packages/db/src/schema/calculations/calculations.schema.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/charts.ts packages/contracts/src/charts.test.ts packages/domain/src/charts/chart-types.ts packages/db/src/schema/calculations/calculation-values.ts packages/db/src/schema/calculations/calculations.schema.test.ts packages/db/drizzle/0000_sticky_rictor.sql packages/db/drizzle/meta/0000_snapshot.json
git commit -m "feat: add chart horary contracts"
```

### Task 2: Astrologer API Horary Jobs

**Files:**
- Modify: `apps/astrologer-api/src/modules/charts/charts.service.ts`
- Modify: `apps/astrologer-api/src/modules/charts/charts.controller.ts`
- Modify: `apps/astrologer-api/src/modules/charts/charts.service.test.ts`
- Modify: `apps/astrologer-api/src/modules/charts/charts.e2e.test.ts`

**Interfaces:**
- Consumes: `chartHoraryJobCreateRequestSchema`.
- Produces: `ChartsService.createHoraryJob(body, request)`.
- Produces: `POST /charts/horary/jobs`.

- [ ] **Step 1: Write failing service test**

Add a test that calls `createHoraryJob` with `{ clientId, question, settings }` and expects
the command store to receive:

```ts
{
  method: "horary",
  ownerUserId,
  clientId,
  inputSnapshot: {
    questionSnapshot: {
      question: "Стоит ли принимать предложение?",
      category: "career",
      date: "2026-07-23",
      time: "14:30",
      timezone: "Europe/Moscow",
      latitude: 55.7558,
      longitude: 37.6173
    }
  },
  settingsSnapshot: settings()
}
```

The test fixture must provide an owner-scoped client without `birthData` and still pass
after implementation.

- [ ] **Step 2: Run service test and verify failure**

Run: `pnpm test apps/astrologer-api/src/modules/charts/charts.service.test.ts`

Expected: FAIL because `createHoraryJob` does not exist.

- [ ] **Step 3: Implement service method**

Parse `chartHoraryJobCreateRequestSchema`, require the astrologer session, check
`clientStore.getAstrologerClient({ astrologerUserId: ownerUserId, clientUserId })`, but do
not call `assertChartBirthDataReady`. Build the fingerprint with:

```ts
sha256CanonicalJson({
  schemaVersion: "chart-request.v1",
  providerVersion,
  method: "horary",
  clientId: parsedBody.clientId,
  inputSnapshot: { questionSnapshot: parsedBody.question } as CanonicalJson,
  settings: parsedBody.settings as CanonicalJson
});
```

- [ ] **Step 4: Add controller route**

Add:

```ts
@Post("horary/jobs")
@RequireCsrf()
createHoraryJob(@Body() body: unknown, @Req() request: AstrologerSessionRequest) {
  return this.service.createHoraryJob(body, request);
}
```

- [ ] **Step 5: Write and run e2e route test**

Add e2e coverage for:

```text
POST /charts/horary/jobs
```

Expected response is `201` with `{ status: "calculating", jobId }` for authenticated CSRF
request. Add a negative case proving missing question text returns `400`.

- [ ] **Step 6: Run API checks**

Run:

```bash
pnpm test apps/astrologer-api/src/modules/charts/charts.service.test.ts
pnpm test apps/astrologer-api/src/modules/charts/charts.e2e.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/astrologer-api/src/modules/charts/charts.service.ts apps/astrologer-api/src/modules/charts/charts.controller.ts apps/astrologer-api/src/modules/charts/charts.service.test.ts apps/astrologer-api/src/modules/charts/charts.e2e.test.ts
git commit -m "feat: expose chart horary jobs"
```

### Task 3: Chart Engine Provider And HTTP Client

**Files:**
- Modify: `apps/chart-engine/src/chart_engine/schemas.py`
- Modify: `apps/chart-engine/src/chart_engine/kerykeion_adapter.py`
- Modify: `apps/chart-engine/src/chart_engine/main.py`
- Create: `apps/chart-engine/tests/test_horary_contract.py`
- Modify: `packages/chart-engine-client/src/chart-engine-client.ts`
- Modify: `packages/chart-engine-client/src/chart-engine-client.test.ts`

**Interfaces:**
- Produces: FastAPI `POST /v1/horary`.
- Produces: `calculate_horary(request: HoraryRequest) -> StoredChartHoraryCalculationPayload`.
- Produces: `ChartEngineHttpClient.calculateHorary(payload)`.

- [ ] **Step 1: Write failing Python provider test**

Create `apps/chart-engine/tests/test_horary_contract.py`:

```py
from fastapi.testclient import TestClient

from chart_engine.main import app


def test_calculates_horary_single_wheel_result():
    client = TestClient(app)
    response = client.post(
        "/v1/horary",
        json={
            "schemaVersion": "chart-request.v1",
            "method": "horary",
            "settings": {
                "zodiac": "tropical",
                "houseSystem": "regiomontanus",
                "nodeType": "true",
                "aspectPreset": "major",
                "orbMultiplier": 1
            },
            "questionSnapshot": {
                "question": "Стоит ли принимать предложение?",
                "category": "career",
                "date": "2026-07-23",
                "time": "14:30",
                "timezone": "Europe/Moscow",
                "latitude": 55.7558,
                "longitude": 37.6173
            }
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["method"] == "horary"
    assert data["questionSnapshot"]["category"] == "career"
    assert data["result"]["points"]
    assert data["result"]["houses"]
```

- [ ] **Step 2: Run Python test and verify failure**

Run: `cd apps/chart-engine && .venv/bin/pytest tests/test_horary_contract.py`

Expected: FAIL with 404 for `/v1/horary` or missing schema.

- [ ] **Step 3: Implement Python schemas and adapter**

Add `HoraryQuestionSnapshot`, `HoraryRequest`, and
`StoredChartHoraryCalculationPayload`. Implement `calculate_horary` by creating one subject:

```py
subject = _create_subject(
    name="horary",
    date=request.questionSnapshot.date,
    time=request.questionSnapshot.time,
    timezone=request.questionSnapshot.timezone,
    latitude=request.questionSnapshot.latitude,
    longitude=request.questionSnapshot.longitude,
    house_system=request.settings.houseSystem,
    active_points=active_points,
)
```

Return `StoredChartHoraryCalculationPayload` with `_map_render_result(...)`.

- [ ] **Step 4: Add FastAPI route**

Add `POST /v1/horary` in `apps/chart-engine/src/chart_engine/main.py` with
`response_model=StoredChartHoraryCalculationPayload`.

- [ ] **Step 5: Write failing client test**

In `packages/chart-engine-client/src/chart-engine-client.test.ts`, assert
`calculateHorary` posts to `/v1/horary` and validates
`storedChartHoraryCalculationPayloadSchema`.

- [ ] **Step 6: Implement client method**

Add imports for horary schemas/types and implement `calculateHorary` following
`calculateProgression`.

- [ ] **Step 7: Run provider/client checks**

Run:

```bash
cd apps/chart-engine && .venv/bin/pytest tests/test_horary_contract.py
pnpm test packages/chart-engine-client/src/chart-engine-client.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/chart-engine/src/chart_engine/schemas.py apps/chart-engine/src/chart_engine/kerykeion_adapter.py apps/chart-engine/src/chart_engine/main.py apps/chart-engine/tests/test_horary_contract.py packages/chart-engine-client/src/chart-engine-client.ts packages/chart-engine-client/src/chart-engine-client.test.ts
git commit -m "feat: add chart horary provider"
```

### Task 4: Worker Dispatch And Persistence Summary

**Files:**
- Modify: `apps/chart-worker/src/chart-jobs.processor.ts`
- Modify: `apps/chart-worker/src/chart-jobs.processor.test.ts`
- Modify: `packages/db/src/adapters/charts/drizzle-chart-calculation-job-store.ts`
- Modify: `packages/db/src/adapters/charts/drizzle-chart-calculation-job-store.integration.ts`

**Interfaces:**
- Consumes: `ChartEngineClient.calculateHorary`.
- Produces: persisted `calculationRecords.methodCode = "horary"`.
- Produces: `calculationRecords.title = "Horary chart"`.
- Produces: result summary `{ question, category, date, time, timezone }`.

- [ ] **Step 1: Write failing worker dispatch test**

Add a horary job fixture and assert the processor calls:

```ts
calculateHorary({
  schemaVersion: "chart-request.v1",
  method: "horary",
  settings,
  questionSnapshot: horaryJob.inputSnapshot.questionSnapshot
});
```

- [ ] **Step 2: Run worker test and verify failure**

Run: `pnpm test apps/chart-worker/src/chart-jobs.processor.test.ts`

Expected: FAIL because `horary` dispatch is unsupported.

- [ ] **Step 3: Implement worker dispatch**

Add `horaryJobInputSnapshotSchema` using `chartHoraryCalculationRequestSchema.pick({ questionSnapshot: true })`.
Add `calculateHorary` to `ChartEngineClient`, then branch on `claim.method === "horary"`.

- [ ] **Step 4: Write failing DB integration test**

Add coverage that a completed horary job creates a chart calculation with:

```ts
expect(calculation?.methodCode).toBe("horary");
expect(calculation?.title).toBe("Horary chart");
expect(calculation?.resultSummary).toMatchObject({
  question: "Стоит ли принимать предложение?",
  category: "career"
});
```

- [ ] **Step 5: Implement DB title and summary**

Add `horary` to `buildChartCalculationTitle` and `buildChartResultSummary`.

- [ ] **Step 6: Run worker/DB checks**

Run:

```bash
pnpm test apps/chart-worker/src/chart-jobs.processor.test.ts
pnpm test packages/db/src/adapters/charts/drizzle-chart-calculation-job-store.integration.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/chart-worker/src/chart-jobs.processor.ts apps/chart-worker/src/chart-jobs.processor.test.ts packages/db/src/adapters/charts/drizzle-chart-calculation-job-store.ts packages/db/src/adapters/charts/drizzle-chart-calculation-job-store.integration.ts
git commit -m "feat: dispatch chart horary jobs"
```

### Task 5: Frontend API, State Matrix And Mode Controls

**Files:**
- Modify: `apps/astrologer-web/src/features/charts/api/chartsApi.ts`
- Modify: `apps/astrologer-web/src/features/charts/api/chartsApi.test.ts`
- Modify: `apps/astrologer-web/src/features/charts/model/chartEngineState.ts`
- Modify: `apps/astrologer-web/src/features/charts/model/chartEngineState.test.ts`
- Modify: `apps/astrologer-web/src/features/charts/components/ChartEnginePage.tsx`
- Modify: `apps/astrologer-web/src/features/charts/components/ChartEnginePage.module.css`
- Modify: `apps/astrologer-web/src/pages/ChartEngineRoute.tsx`

**Interfaces:**
- Produces: `createHoraryChartJob(input)`.
- Produces: frontend mode `"horary"`.
- Produces: state staleness based on `questionSnapshot`.

- [ ] **Step 1: Write failing API test**

Assert `createHoraryChartJob` posts to `/charts/horary/jobs` with:

```ts
{
  clientId,
  question: {
    question: "Стоит ли принимать предложение?",
    category: "career",
    date: "2026-07-23",
    time: "14:30",
    timezone: "Europe/Moscow",
    latitude: 55.7558,
    longitude: 37.6173
  },
  settings
}
```

- [ ] **Step 2: Write failing state tests**

Add tests proving:

```ts
expect(isChartResultStale(horaryResult(), birthDataWithoutTime(), settings, "horary", undefined, undefined, undefined, undefined, question)).toBe(false);
expect(isChartResultStale(horaryResult(), birthDataWithoutTime(), settings, "horary", undefined, undefined, undefined, undefined, changedQuestion)).toBe(true);
```

The test must prove horary does not become stale just because the client birth data is incomplete.

- [ ] **Step 3: Implement API and state model**

Add `createHoraryChartJob`. Extend `isChartResultStale` with a final optional
`horaryQuestionSnapshot` parameter and compare it to `result.questionSnapshot` when
`result.method === "horary"`.

- [ ] **Step 4: Add UI controls**

Enable a `Хорар` mode tab. Add compact inputs for question, category, date and time near the
existing transit/progression controls. Prefill date/time from the current local time and
prefill timezone/coordinates from selected client birth data only when available; otherwise
default timezone to `Intl.DateTimeFormat().resolvedOptions().timeZone` and block calculation
until latitude/longitude are supplied by the UI.

- [ ] **Step 5: Wire calculation action**

When `activeMode === "horary"`, call `createHoraryChartJob` with the active question snapshot.
Do not call natal job creation and do not require birth-data readiness for `canCalculate`.

- [ ] **Step 6: Run frontend targeted checks**

Run:

```bash
pnpm test apps/astrologer-web/src/features/charts/api/chartsApi.test.ts
pnpm test apps/astrologer-web/src/features/charts/model/chartEngineState.test.ts
pnpm test apps/astrologer-web/src/features/charts/components/ChartEnginePage.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/astrologer-web/src/features/charts/api/chartsApi.ts apps/astrologer-web/src/features/charts/api/chartsApi.test.ts apps/astrologer-web/src/features/charts/model/chartEngineState.ts apps/astrologer-web/src/features/charts/model/chartEngineState.test.ts apps/astrologer-web/src/features/charts/components/ChartEnginePage.tsx apps/astrologer-web/src/features/charts/components/ChartEnginePage.module.css apps/astrologer-web/src/pages/ChartEngineRoute.tsx
git commit -m "feat: add chart horary frontend mode"
```

### Task 6: Frontend Rendering, Tables And Dictionary Anchors

**Files:**
- Modify: `apps/astrologer-web/src/features/charts/model/chartDisplay.ts`
- Modify: `apps/astrologer-web/src/features/charts/model/chartInterpretations.ts`
- Modify: `apps/astrologer-web/src/features/charts/model/chartInterpretations.test.ts`
- Modify: `apps/astrologer-web/src/features/charts/components/ChartWheel.tsx`
- Modify: `apps/astrologer-web/src/features/charts/components/ChartEnginePage.tsx`

**Interfaces:**
- Consumes: `StoredChartHoraryCalculationPayload`.
- Produces: `horary.*` Dictionary anchors.

- [ ] **Step 1: Write failing interpretation test**

Add a horary result fixture and assert:

```ts
expect(getChartInterpretationLookupCodes(buildChartInterpretationAnchors(horaryResult()))).toEqual(
  expect.arrayContaining([
    "horary.sun.cancer",
    "horary.sun.house.11",
    "horary.house.1",
    "horary.aspect.sun.square.moon",
    "horary.question.career"
  ])
);
expect(getChartInterpretationLookupCodes(buildChartInterpretationAnchors(horaryResult()))).not.toContain("natal.sun.cancer");
```

- [ ] **Step 2: Run interpretation test and verify failure**

Run: `pnpm test apps/astrologer-web/src/features/charts/model/chartInterpretations.test.ts`

Expected: FAIL because horary anchors are not implemented.

- [ ] **Step 3: Implement display helpers**

Update chart display helpers so `getPrimaryChartRenderResult` returns `result.result` for
`method === "horary"`, and right-side labels can show `Планеты хорара`, `Аспекты`,
`Дома`, `Трактовки`.

- [ ] **Step 4: Implement horary anchors**

Add `buildHoraryAnchors(result)` mirroring composite/child single-wheel anchors with the
`horary.*` code family plus `horary.question.<category>`.

- [ ] **Step 5: Run rendering/model checks**

Run:

```bash
pnpm test apps/astrologer-web/src/features/charts/model/chartInterpretations.test.ts
pnpm test apps/astrologer-web/src/features/charts/components/ChartWheel.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/astrologer-web/src/features/charts/model/chartDisplay.ts apps/astrologer-web/src/features/charts/model/chartInterpretations.ts apps/astrologer-web/src/features/charts/model/chartInterpretations.test.ts apps/astrologer-web/src/features/charts/components/ChartWheel.tsx apps/astrologer-web/src/features/charts/components/ChartEnginePage.tsx
git commit -m "feat: add chart horary rendering"
```

### Task 7: Documentation And Runtime Proof

**Files:**
- Modify: `docs/product/roadmap.md`
- Modify: `docs/architecture/design-reference-inventory.md`
- Create: `.design-qa/chart-engine-horary-2026-07-23/README.md`

**Interfaces:**
- Consumes: implemented horary API/UI.
- Produces: acceptance evidence.

- [ ] **Step 1: Update docs only after tests pass**

Mark the horary first slice complete in `docs/product/roadmap.md` and update the Chart engine row
in `docs/architecture/design-reference-inventory.md` to say horary is implemented and
astrocartography remains missing.

- [ ] **Step 2: Verify services are available without changing lifecycle**

Run read-only checks:

```bash
lsof -nP -iTCP:5174 -sTCP:LISTEN
lsof -nP -iTCP:3002 -sTCP:LISTEN
lsof -nP -iTCP:3012 -sTCP:LISTEN
lsof -nP -iTCP:8012 -sTCP:LISTEN
curl -sS http://localhost:3002/health
curl -sS http://localhost:3012/ready
curl -sS http://localhost:8012/ready
```

Expected: all listeners and readiness endpoints are present. If any required service is absent,
browser acceptance is blocked until the user authorizes process lifecycle changes.

- [ ] **Step 3: Run affected automated checks**

Run:

```bash
pnpm test packages/contracts/src/charts.test.ts
pnpm test apps/astrologer-api/src/modules/charts/charts.service.test.ts
pnpm test apps/chart-worker/src/chart-jobs.processor.test.ts
cd apps/chart-engine && .venv/bin/pytest tests/test_horary_contract.py
pnpm test packages/chart-engine-client/src/chart-engine-client.test.ts
pnpm test apps/astrologer-web/src/features/charts/model/chartEngineState.test.ts
pnpm test apps/astrologer-web/src/features/charts/model/chartInterpretations.test.ts
pnpm test apps/astrologer-web/src/features/charts/components/ChartEnginePage.test.tsx
pnpm lint --filter @elevenhouse/astrologer-web
```

Expected: targeted tests pass. If full lint still fails because of unrelated existing Human Design
unused-vars errors, document the exact untouched failures.

- [ ] **Step 4: Browser proof**

Using the available browser surface, open:

```text
http://localhost:5174/chart-engine?mode=horary
```

Verify:

- authenticated profile APIs return `200`;
- `Хорар` mode is enabled;
- question/date/time controls render without clipping;
- calculation sends `POST /api/charts/horary/jobs`;
- polling and result fetch succeed;
- wheel/tables render single-wheel horary result;
- `Трактовки` tab requests or displays `horary.*` Dictionary anchors and honest missing-entry cards;
- PDF is disabled with horary-specific tooltip;
- reload restores `mode=horary`;
- console has no runtime errors.

- [ ] **Step 5: Save evidence**

Create `.design-qa/chart-engine-horary-2026-07-23/README.md` with:

```md
# Chart Engine Horary Browser Proof

- Date: 2026-07-23
- Route: http://localhost:5174/chart-engine?mode=horary
- Scenario: select CRM client, enter horary question, calculate, inspect result, open interpretations, reload.
- Network: expected identity/profile/client/chart job/job polling/calculation/dictionary calls returned 2xx.
- Console: no runtime errors observed.
- PDF: disabled for horary.
- Notes: [fill with exact screenshots/observations from the run]
```

- [ ] **Step 6: Commit**

```bash
git add docs/product/roadmap.md docs/architecture/design-reference-inventory.md .design-qa/chart-engine-horary-2026-07-23/README.md
git commit -m "docs: record chart horary acceptance"
```

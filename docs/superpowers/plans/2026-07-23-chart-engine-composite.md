# Chart Engine Composite First Slice

## Purpose / Big Picture

Add the first production Composite chart slice to `/chart-engine`.

An authenticated astrologer selects two owner-scoped CRM clients and calculates
one synthetic relationship chart. Composite is not a second dual wheel and not
synastry score: it is a single chart built from the participants' midpoint
composite subject and rendered through the existing chart wheel, tables and
Dictionary-backed interpretation surface.

Observable outcome:

- `/chart-engine` exposes `Композит` as an enabled method.
- The request contains only `clientId`, `partnerClientId` and settings; birth
  data is resolved server-side from CRM.
- `POST /api/charts/composite/jobs` creates or reuses an owner-scoped async job.
- `chart-worker` dispatches `method: "composite"` to `apps/chart-engine`.
- `apps/chart-engine` returns `chart-result.v1` with `method: "composite"`,
  private input snapshots and `result: ChartRenderResult`.
- The frontend restores a saved composite calculation URL, renders a single
  relationship wheel/table set and looks up only `composite.*` Dictionary codes.
- PDF remains visibly disabled until a separate renderer/source/checksum contour
  exists.

## Progress

- [x] 2026-07-23: Accepted the five-method chart-engine matrix before starting
      Composite.
- [x] 2026-07-23: Research and repo contour started after commit
      `862dbe6 docs: record chart engine acceptance`.
- [x] Contracts and method enum.
- [x] Provider endpoint and chart-engine-client.
- [x] API job route and DB/worker dispatch.
- [x] Frontend mode, state matrix and Dictionary anchors.
- [x] 2026-07-23: Browser proof passed after rebuilding/restarting stale local
      chart runtimes: `POST /api/charts/composite/jobs` returned `201`, job
      polling returned `200`, calculation result returned `200`, and reload
      restored the saved composite chart URL.
- [x] 2026-07-23: Docs/status sync after runtime evidence.

## Surprises & Discoveries

- The installed local Kerykeion package exposes `CompositeSubjectFactory` and
  `ChartDataFactory.create_composite_chart_data`, so Composite can use provider
  semantics instead of browser or TypeScript midpoint arithmetic.
- The existing chart UI already has reusable single-chart render behavior via
  natal. Composite should reuse that rendering shape, with relationship labels
  and partner selector borrowed from synastry.
- `pnpm db:generate` created an incremental `0001_sticky_rictor.sql` because
  the Drizzle snapshot still reflected the previous method check. Per DB
  policy, the generated incremental file was removed and
  `meta/0000_snapshot.json` was updated to match the rebuilt baseline.
- Local PostgreSQL had the old `chart_calculation_jobs_method_check`; local
  `db:reset` was required and run against `postgresql://localhost:5432/elevenhouse`.
- The existing local `astrologer-api` and `chart-worker` processes were running
  from old `dist/main.js` output. Browser proof first exposed
  `POST /api/charts/composite/jobs` as `404`; rebuilding
  `@elevenhouse/astrologer-api...` and `@elevenhouse/chart-worker...` and
  restarting the chart runtime changed the unauthenticated direct route check to
  `401`, then the authenticated browser flow succeeded.

## Decision Log

- 2026-07-23: First slice method code is `composite`.
  Reason: user supplied chart-method table treats Composite as a separate chart
  type after Synastry and Progressions; current five enabled methods are now
  acceptance-matrix verified.
- 2026-07-23: First slice result shape is one `ChartRenderResult`.
  Reason: Composite is a synthetic relationship chart, not a primary/partner
  overlay. Reusing `ChartRenderResult` keeps wheel/tables/dictionary behavior
  deterministic and avoids a parallel render contract.
- 2026-07-23: Composite uses the same two-CRM-client server-side input boundary
  as Synastry.
  Reason: `/chart-engine` must not accept browser-supplied birth data or manual
  public subjects in this slice.
- 2026-07-23: PDF stays disabled for Composite.
  Reason: non-natal PDF needs separate source, renderer and checksum policy.

## Research

Question: Does ElevenHouse need to implement Composite midpoint math itself, or
can the private Python provider produce a structured composite subject/result?

Access date: 2026-07-23.

Sources:

- https://github.com/g-battaglia/kerykeion - upstream README says Kerykeion
  computes/render birth, synastry, transit and composite charts. The Composite
  example creates two offline `AstrologicalSubjectFactory` subjects, builds
  `CompositeSubjectFactory(first, second)`, calls
  `get_midpoint_composite_subject_model()` and passes it to
  `ChartDataFactory.create_composite_chart_data(...)`.
- https://kerykeion.net/python-library - product/library page lists composite
  among supported calculations and states the library works offline when
  longitude, latitude and timezone are provided.
- Local bounded spike:
  `cd apps/chart-engine && .venv/bin/python - <<'PY' ... PY`
  confirmed `CompositeSubjectFactory` exists and
  `ChartDataFactory.create_composite_chart_data` is available in the installed
  environment.

Findings:

- Sourced fact: Kerykeion has a first-class midpoint composite subject factory.
- Repository evidence: existing natal/synastry/return/progression provider code
  already maps Kerykeion subjects through `_map_render_result` into
  `ChartRenderResult`.
- Inference: the safest v1 implementation is to create primary and partner
  subjects with existing `_create_subject`, construct the midpoint composite
  subject in Python, then map it as a single `ChartRenderResult`.

Options:

1. Provider-backed `CompositeSubjectFactory` single chart.
   - Pros: uses upstream chart semantics, fits private provider boundary, keeps
     frontend free of domain arithmetic.
   - Cons: requires adding another provider endpoint and contracts.
2. TypeScript/browser midpoint calculation from two persisted natal results.
   - Rejected: violates the established no-browser-domain-arithmetic pattern
     and risks divergent astrology semantics.
3. Treat Composite as a Synastry visual mode only.
   - Rejected: product table defines Composite as a separate synthetic chart,
     not two people side by side.

Recommendation: option 1.

User decisions required: none for v1; boundaries determine the slice.

## Context and Orientation

Current related files:

- Contracts: `packages/contracts/src/charts.ts`,
  `packages/contracts/src/charts.test.ts`.
- Domain: `packages/domain/src/charts/chart-types.ts`,
  `packages/domain/src/charts/chart-use-cases.ts`.
- DB: `packages/db/src/schema/calculations/calculation-values.ts`,
  `packages/db/src/adapters/charts/drizzle-chart-calculation-job-store.ts`.
- API: `apps/astrologer-api/src/modules/charts/charts.controller.ts`,
  `apps/astrologer-api/src/modules/charts/charts.service.ts`.
- Worker/client: `apps/chart-worker/src/chart-jobs.processor.ts`,
  `packages/chart-engine-client/src/chart-engine-client.ts`.
- Provider: `apps/chart-engine/src/chart_engine/schemas.py`,
  `apps/chart-engine/src/chart_engine/kerykeion_adapter.py`,
  `apps/chart-engine/src/chart_engine/main.py`.
- Frontend: `apps/astrologer-web/src/pages/chart-engine/useChartEngineController.ts`,
  `apps/astrologer-web/src/features/charts/api/chartsApi.ts`,
  `apps/astrologer-web/src/features/charts/components/ChartEnginePage.tsx`,
  `apps/astrologer-web/src/features/charts/components/ChartWheel.tsx`,
  `apps/astrologer-web/src/features/charts/components/ChartTables.tsx`,
  `apps/astrologer-web/src/features/charts/model/chartInterpretations.ts`.

## Interfaces and Dependencies

Proposed shared contract additions:

```ts
chartCompositeJobCreateRequestSchema = {
  clientId: uuid,
  partnerClientId: uuid,
  settings: chartSettingsSchema
};

chartCompositeCalculationRequestSchema = {
  schemaVersion: "chart-request.v1",
  method: "composite",
  settings,
  inputSnapshot,
  partnerInputSnapshot,
  relationshipSnapshot
};

storedChartCompositeCalculationPayloadSchema = {
  schemaVersion: "chart-result.v1",
  method: "composite",
  provider,
  settings,
  inputSnapshot,
  partnerInputSnapshot,
  relationshipSnapshot,
  result: chartRenderResultSchema
};
```

Dependency direction stays unchanged:

```text
astrologer-web -> contracts/API client
astrologer-api -> contracts + domain use case/store ports
chart-worker -> contracts + chart-engine-client
chart-engine-client -> contracts
apps/chart-engine -> Python pydantic schemas/provider
packages/db -> Drizzle schema/adapters
```

## Plan of Work

1. Contracts and DB/domain enum.
   - Add `composite` request/result schemas, method union and tests.
   - Add DB method value/check expectations and domain method type.
2. Provider and chart-engine-client.
   - Add FastAPI `/v1/composite` and Python contract test.
   - Implement provider through `CompositeSubjectFactory`.
   - Add client method validation and tests.
3. API and worker.
   - Add `POST /charts/composite/jobs`.
   - Resolve both CRM clients server-side, forbid same client, create
     `relationshipSnapshot`, fingerprint and async job.
   - Dispatch worker claims to `calculateComposite`.
4. Frontend.
   - Add `composite` mode, partner selector, create mutation, restore/stale URL
     state, single-wheel render and `composite.*` Dictionary anchors.
   - PDF disabled with explicit copy.
5. Runtime proof and docs.
   - Exercise browser flow with real owner session and local services.
   - Update roadmap/inventory only after runtime proof.

## Concrete Steps

Working directory:

```bash
/Users/anton/Finext/ElevenHouse
```

Targeted checks as slices land:

```bash
pnpm test packages/contracts/src/charts.test.ts
pnpm test packages/domain/src/charts
pnpm test packages/db/src/schema/calculations/calculations.schema.test.ts
INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration packages/db/src/adapters/charts/drizzle-chart-calculation-job-store.integration.ts
cd apps/chart-engine && .venv/bin/pytest tests/test_composite_contract.py
pnpm test packages/chart-engine-client/src/chart-engine-client.test.ts apps/chart-worker/src/chart-jobs.processor.test.ts
pnpm test apps/astrologer-api/src/modules/charts/charts.service.test.ts apps/astrologer-api/src/modules/charts/charts.e2e.test.ts
pnpm test apps/astrologer-web/src/features/charts apps/astrologer-web/src/pages/chart-engine
pnpm --filter @elevenhouse/astrologer-web typecheck
```

Runtime proof after implementation:

```text
http://localhost:5174/chart-engine
select client -> Composite -> select partner -> calculate -> job polling ->
calculation result -> reload restore -> Dictionary tab -> console/network check
```

Observed runtime proof:

- Local dev data: one astrologer session and two owner-scoped CRM clients with
  complete birth data in `postgresql://localhost:5432/elevenhouse`.
- Route/state:
  `http://localhost:5174/chart-engine?clientId=ba3e415c-963f-4693-9073-02f653ebb2e7&partnerClientId=6060313b-1a1a-414a-9037-4e2fec60ce04`.
- Browser network before rebuilding stale runtimes:
  `POST /api/charts/composite/jobs [404]`.
- Browser network after rebuild/restart:
  `POST /api/charts/composite/jobs [201]`,
  `GET /api/charts/jobs/2b3d195c-8752-458f-865f-cbc7a91a688a [200]`,
  `GET /api/charts/calculations/a1fcbcf9-0f54-4265-ab7c-cef030263fb8 [200]`.
- Reload proof:
  `/chart-engine?...&calculationId=a1fcbcf9-0f54-4265-ab7c-cef030263fb8`
  restored `КОМПОЗИТ`, `Актуальная карта`, primary/partner selectors, wheel,
  summary and planet table; reload network used only `GET identity/profile`,
  `GET clients/:id` and `GET charts/calculations/:id`.
- Console after reload had no application errors; only Vite connection and
  React DevTools development info were present.
- DB persistence check: latest `chart_calculation_jobs` composite row
  `2b3d195c-8752-458f-865f-cbc7a91a688a` had `status = 'succeeded'`,
  provider `kerykeion`, schema version `chart-result.v1` and
  result calculation `a1fcbcf9-0f54-4265-ab7c-cef030263fb8`.

## Validation and Acceptance

Composite is accepted only when:

- contracts reject browser-supplied birth data;
- API rejects same-client composite;
- job persistence and worker dispatch use `method: "composite"`;
- provider returns complete points, houses, aspects, distributions and warnings;
- frontend can calculate, restore and render the single synthetic chart;
- Dictionary lookup contains only codes derived from the current composite
  result;
- PDF is explicitly disabled, not hidden as broken;
- runtime browser/network proof passes.

## Idempotence and Recovery

- No DB reset unless a later schema migration requires local reset through the
  database runbook.
- No new process lifecycle changes unless required services are down and the
  user has allowed process management.
- Reuse existing job fingerprinting to avoid duplicate equivalent jobs.
- Keep old `.design-qa/*` artifacts and unrelated concurrent changes untouched.

## Artifacts and Notes

- Browser/runtime evidence should go under
  `.design-qa/chart-engine-composite-2026-07-23/` if screenshots or notes are
  captured.
- Durable product status goes to roadmap/inventory only after runtime proof.

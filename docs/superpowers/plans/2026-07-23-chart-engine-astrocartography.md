# Chart Engine Astrocartography Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first production astrocartography slice to `/chart-engine`: owner-scoped CRM client job creation, worker/provider calculation, canonical result payload, and a map-based RU UI with Dictionary-backed line interpretations.

**Architecture:** Astrocartography remains in the existing chart calculation contour: `astrologer-web` calls `astrologer-api`, API snapshots owner-scoped birth data, `chart-worker` dispatches to private `apps/chart-engine`, and the Python provider returns canonical `chart-result.v1`. Frontend renders provider line geometry and Dictionary lookup state; it does not calculate astrological line positions in the browser.

**Tech Stack:** TypeScript/Zod contracts, NestJS `astrologer-api`, domain chart job store, BullMQ chart worker, Python FastAPI chart-engine, Kerykeion 5.12.9 plus `pyswisseph`/Swiss Ephemeris, React/Vite chart-engine page.

## Global Constraints

- Work in the existing checkout on `main`; do not create a branch/worktree or alter shared index broadly.
- No browser-supplied birth data: API resolves input from owner-scoped CRM client birth data.
- No fake astrocartography: line geometry comes from the Python provider using Swiss Ephemeris primitives.
- First slice includes planetary angular lines only: `sun`, `moon`, `mercury`, `venus`, `mars`, `jupiter`, `saturn`, `uranus`, `neptune`, `pluto` across `mc`, `ic`, `asc`, `dsc`.
- First slice excludes relocation charts, city scoring, crossings interpretation, public/client publishing, AI readings, PDF export, and exact high-latitude polar curves.
- Dictionary interpretation anchors use deterministic codes like `astrocartography.sun.mc`; missing entries are shown honestly with create links.
- Visual language follows `ElevenHouseDesign/app/engine*.jsx` and Chart Engine inventory row; astrocartography is map visualization rather than a wheel.
- Accessed research date: 2026-07-23.

---

## Research

Question:
Which provider path can support a credible first astrocartography slice without introducing fake frontend calculations?

Decision affected:
Whether to use Kerykeion only, Swiss Ephemeris directly, or defer astrocartography.

Accessed: 2026-07-23

### Sources

- [Kerykeion GitHub](https://github.com/g-battaglia/kerykeion) — official project overview lists planetary/house positions, aspects and SVG chart types including natal, synastry, transit and composite.
- [Kerykeion docs](https://kerykeion.net/python-library/docs/v5) — official docs for current Python library capabilities used by the existing chart-engine.
- [Swiss Ephemeris programming interface](https://www.astro.com/swisseph/swephprg.htm) — official programmer interface and licensing note for the lower-level calculation library.
- [Swiss Ephemeris docs](https://www.astro.com/swisseph/swisseph.htm) — official docs include sidereal time, Ascendant, MC and houses functions.
- [pyswisseph PyPI](https://pypi.org/project/pyswisseph/) — Python extension to AstroDienst Swiss Ephemeris.

### Findings

- Sourced fact: Kerykeion is suitable for natal positions and existing wheel/result calculation, but its documented chart types do not expose a dedicated astrocartography API.
- Sourced fact: Swiss Ephemeris exposes the primitives needed for angular lines: planetary positions, sidereal time, Ascendant, MC and houses.
- Repository evidence: `apps/chart-engine/.venv` has `swisseph` 2.10.03; bounded spike confirmed `julday`, `sidtime`, `calc_ut` and `houses_ex`.
- Inference: MC/IC lines can be derived from planetary right ascension and Greenwich sidereal time; ASC/DSC can be sampled by longitude using `houses_ex` and bisection over latitude.

### Options

1. Defer astrocartography until a dedicated library is added. Lowest calculation risk, but blocks the chart-method roadmap and leaves the design mode missing.
2. Build a thin deterministic provider over current `pyswisseph` primitives. Fits existing Python provider boundary and keeps frontend math-free, but the first slice should explicitly limit scope to angular planetary lines.
3. Draw approximate/static map lines in React. Fast, but violates production integrity because UI would imply calculated astrocartography without provider authority.

### Recommendation

Use option 2. It fits the current worker/provider architecture, relies on the same Swiss Ephemeris stack already installed for chart calculations, and keeps the visible map honest by rendering typed line geometry returned from the provider.

### Rejected alternatives

- Kerykeion-only implementation: rejected because official capability surface does not expose astrocartography.
- Frontend-only line drawing: rejected because ElevenHouse chart math must stay in backend/provider code.
- Full relocation/city scoring now: rejected as new product scope beyond the requested method expansion.

### User decisions

None for this first slice; the scope is determined by the approved chart-method roadmap and current production boundaries.

## Progress

- [x] 2026-07-23: Intake completed on `main`; tracked worktree clean, old `.design-qa/*` untracked artifacts remain unowned.
- [x] 2026-07-23: Research completed; selected provider-derived planetary angular lines.
- [x] 2026-07-23: Contracts and method values added for `astrocartography`; `pnpm test packages/contracts/src/charts.test.ts` passed.
- [x] 2026-07-23: Client, worker and astrologer-api job route added; targeted client/worker/API tests passed.
- [x] 2026-07-23: Python FastAPI provider endpoint added; focused `pytest` astrocartography contract test passed.
- [x] 2026-07-24: Frontend map UI, empty state, RU labels, disabled PDF and Dictionary-backed `astrocartography.*` interpretations added.
- [x] 2026-07-24: Runtime browser proof completed with authenticated `/chart-engine?mode=astrocartography&clientId=11111111-1111-4111-8111-111111111101`; first stale local chart-engine process produced expected failed/retry state, then new provider process completed a retry with 40 rendered map lines.
- [x] 2026-07-24: Roadmap, design inventory and this living plan synced.

## Context and Orientation

Production Chart Engine already supports natal, transit, synastry, composite, solar return, progression, child chart UI reuse, and horary. The missing inventory item is astrocartography. Existing method expansion pattern:

- `packages/contracts/src/charts.ts` owns request/result schemas.
- `packages/domain/src/charts/chart-types.ts` and `packages/db/src/schema/calculations/calculation-values.ts` own method enums.
- `apps/astrologer-api/src/modules/charts/*` owns owner-scoped job creation.
- `apps/chart-worker/src/chart-jobs.processor.ts` dispatches stored jobs to the private provider.
- `packages/chart-engine-client/src/chart-engine-client.ts` wraps provider HTTP endpoints.
- `apps/chart-engine/src/chart_engine/*` owns FastAPI schemas and Kerykeion/Swiss calculations.
- `apps/astrologer-web/src/pages/chart-engine` and `apps/astrologer-web/src/features/charts` own visible composition.

## Interfaces and Dependencies

New method:

```ts
type ChartCalculationMethod = "astrocartography";
```

Request schema:

```ts
{
  schemaVersion: "chart-request.v1";
  method: "astrocartography";
  settings: ChartSettings;
  inputSnapshot: ChartInputSnapshot;
}
```

Job create request:

```ts
{
  clientId: string;
  settings: ChartSettings;
}
```

Result schema:

```ts
{
  schemaVersion: "chart-result.v1";
  method: "astrocartography";
  provider: ChartProviderMetadata;
  settings: ChartSettings;
  inputSnapshot: ChartInputSnapshot;
  result: {
    lines: Array<{
      id: string;
      point: string;
      angle: "asc" | "dsc" | "mc" | "ic";
      label: string;
      path: Array<{ latitude: number; longitude: number }>;
    }>;
    warnings: ChartWarning[];
  };
}
```

Provider endpoint:

```http
POST /v1/astrocartography
```

Frontend mode id:

```ts
"astrocartography";
```

Dictionary anchors:

```ts
astrocartography.<point>.<angle>
```

## Plan of Work

### Task 1: Shared Contracts and Method Values

**Files:**

- Modify: `packages/contracts/src/charts.ts`
- Modify: `packages/contracts/src/charts.test.ts`
- Modify: `packages/domain/src/charts/chart-types.ts`
- Modify: `packages/db/src/schema/calculations/calculation-values.ts`

**Interfaces:**

- Produces `chartAstrocartographyJobCreateRequestSchema`, `chartAstrocartographyCalculationRequestSchema`, `chartAstrocartographyRenderResultSchema`, `storedChartAstrocartographyCalculationPayloadSchema`, and exported types.
- Extends stored calculation discriminated union and method values.

- [ ] Write failing contract tests that parse an astrocartography job request, reject browser birth-data fields, and parse a stored result containing one Sun MC line.
- [ ] Run `pnpm test packages/contracts/src/charts.test.ts` and confirm failure due to missing exports/schemas.
- [ ] Add schemas/types and method enum values.
- [ ] Run `pnpm test packages/contracts/src/charts.test.ts` and confirm pass.

### Task 2: Chart Engine Client and Worker Dispatch

**Files:**

- Modify: `packages/chart-engine-client/src/chart-engine-client.ts`
- Modify: `packages/chart-engine-client/src/chart-engine-client.test.ts`
- Modify: `apps/chart-worker/src/chart-jobs.processor.ts`
- Modify: `apps/chart-worker/src/chart-jobs.processor.test.ts`

**Interfaces:**

- Consumes contract schemas from Task 1.
- Produces `calculateAstrocartography(payload)` and worker dispatch for method `astrocartography`.

- [ ] Write failing client test for `POST /v1/astrocartography` and invalid JSON permanent error.
- [ ] Write failing worker test that dispatches an `astrocartography` job with only `inputSnapshot` and settings.
- [ ] Run targeted tests and confirm failures.
- [ ] Implement client method, worker type, snapshot parser, and dispatch branch.
- [ ] Run targeted tests and confirm pass.

### Task 3: Astrologer API Job Creation

**Files:**

- Modify: `apps/astrologer-api/src/modules/charts/charts.controller.ts`
- Modify: `apps/astrologer-api/src/modules/charts/charts.service.ts`
- Modify: `apps/astrologer-api/src/modules/charts/charts.service.test.ts`
- Modify: `apps/astrologer-api/src/modules/charts/charts.e2e.test.ts`

**Interfaces:**

- Consumes `chartAstrocartographyJobCreateRequestSchema`.
- Produces `POST /charts/astrocartography/jobs`.

- [ ] Write failing service/e2e tests that owner-scoped CRM client birth data is snapshotted, browser birth data is rejected, and existing result reuse returns the stored typed result.
- [ ] Run the targeted astrologer-api chart tests and confirm failure.
- [ ] Add controller route and service method using `assertChartBirthDataReady`.
- [ ] Run targeted tests and confirm pass.

### Task 4: Python Provider

**Files:**

- Modify: `apps/chart-engine/src/chart_engine/schemas.py`
- Modify: `apps/chart-engine/src/chart_engine/main.py`
- Modify: `apps/chart-engine/src/chart_engine/kerykeion_adapter.py`
- Add or modify: provider tests under `apps/chart-engine/tests` if present, otherwise add focused tests in the existing chart-engine test location.

**Interfaces:**

- Consumes `AstrocartographyRequest`.
- Produces `StoredChartAstrocartographyCalculationPayload`.

- [ ] Write failing Python provider tests for deterministic output: 40 lines for 10 planets x 4 angles, each path has longitude/latitude points within bounds, MC/IC lines are meridian paths.
- [ ] Run the focused Python test and confirm failure.
- [ ] Implement helper functions for Julian day, right ascension, MC/IC meridians, ASC/DSC sampled curves using `swisseph.houses_ex`.
- [ ] Include warning `ASTROCARTOGRAPHY_POLAR_REGIONS_OMITTED` when ASC/DSC sampling omits polar latitudes.
- [ ] Run focused Python tests and confirm pass.

### Task 5: Frontend API, State, Map Visualization and Interpretations

**Files:**

- Modify: `apps/astrologer-web/src/features/charts/api/chartsApi.ts`
- Modify: `apps/astrologer-web/src/features/charts/api/chartsApi.test.ts`
- Modify: `apps/astrologer-web/src/pages/chart-engine/useChartEngineController.ts`
- Modify: `apps/astrologer-web/src/pages/chart-engine/useChartEngineController.test.ts`
- Modify: `apps/astrologer-web/src/features/charts/model/chartEngineState.ts`
- Modify: `apps/astrologer-web/src/features/charts/model/chartEngineState.test.ts`
- Modify: `apps/astrologer-web/src/features/charts/model/chartInterpretations.ts`
- Modify: `apps/astrologer-web/src/features/charts/model/chartInterpretations.test.ts`
- Modify: `apps/astrologer-web/src/features/charts/components/ChartEnginePage.tsx`
- Modify: `apps/astrologer-web/src/features/charts/components/ChartEnginePage.module.css`
- Add: `apps/astrologer-web/src/features/charts/components/AstrocartographyMap.tsx`
- Add: `apps/astrologer-web/src/features/charts/components/AstrocartographyMap.test.tsx`

**Interfaces:**

- Consumes stored astrocartography payload.
- Produces visible `Астрокартография` mode, calculate/recalculate flow, map lines, right-panel line list and Dictionary-backed interpretations.

- [ ] Write failing frontend tests for API path, mode persistence, calculate action payload, disabled PDF, map render, and interpretation codes.
- [ ] Run targeted frontend tests and confirm failure.
- [x] Implement API/controller/model support.
- [x] Add `AstrocartographyMap` SVG renderer using provider path coordinates and current Chart Engine visual tokens.
- [x] Add right-panel line list and Dictionary interpretation section with missing-entry create links.
- [x] Add empty astrocartography mode state that renders the map shell, not the natal wheel/tables.
- [x] Run targeted frontend tests and confirm pass.

### Task 6: Runtime E2E, Design Evidence and Docs

**Files:**

- Modify: `docs/product/roadmap.md`
- Modify: `docs/architecture/design-reference-inventory.md`
- Add: `.design-qa/chart-engine-astrocartography-2026-07-23/*`

**Interfaces:**

- Produces evidence that the production route works through real API/worker/provider and visually follows Chart Engine language.

- [x] Read-only check listeners for frontend/API/chart-engine/chart-worker.
- [x] If authorized and services are stale, restart only the needed local services.
- [x] Drive authenticated `/chart-engine?mode=astrocartography&clientId=11111111-1111-4111-8111-111111111101`.
- [x] Calculate astrocartography, poll job/result, inspect console/network, and capture desktop screenshot through Chrome DevTools.
- [x] Update inventory/roadmap from missing to first-slice implemented with explicit exclusions.
- [ ] Run `git diff --check`, targeted test suite, docs checks if docs changed, and self-review.

## Validation and Acceptance

- `pnpm test packages/contracts/src/charts.test.ts`
- `pnpm test packages/chart-engine-client/src/chart-engine-client.test.ts`
- `pnpm test apps/chart-worker/src/chart-jobs.processor.test.ts`
- `pnpm test apps/astrologer-api/src/modules/charts/charts.service.test.ts apps/astrologer-api/src/modules/charts/charts.e2e.test.ts`
- Focused chart-engine Python tests.
- `pnpm test apps/astrologer-web/src/features/charts/... apps/astrologer-web/src/pages/chart-engine/...`
- Runtime browser proof with authenticated astrologer, real CRM client, network-backed job, clean console, and screenshot evidence from Chrome DevTools.
- `pnpm docs:check:test && pnpm docs:check` after docs updates.

## Idempotence and Recovery

- Re-running `POST /charts/astrocartography/jobs` with identical client/settings reuses existing result through the existing chart job fingerprint mechanism.
- Worker permanent provider schema failures mark the job failed with `provider_invalid_result`; transient HTTP errors retry through existing worker behavior.
- No DB reset or destructive local service command is required for schema-only method value changes unless the database enum baseline/migration proves otherwise.
- If local runtime services are unavailable and process authority is not current, automated checks can continue but runtime/browser acceptance remains blocked.

## Artifacts and Notes

- Research sources are listed above with access date 2026-07-23.
- Existing untracked `.design-qa/*` artifacts were present before this task and are unowned.
- Runtime note: after local `db:reset`, a stale `apps/chart-engine` process on port `8012` returned `CHART_ENGINE_HTTP_404` for the new provider route. The failed job remained as expected evidence of retry/failure state. Restarting only chart-engine exposed `/v1/astrocartography`; browser retry created job `5a65617a-e943-4829-b153-392f21f4b423`, persisted calculation `7ae25912-ec2c-4aaf-bfd9-777ed230edf7`, rendered 40 lines and loaded Dictionary codes with honest missing-entry create actions.

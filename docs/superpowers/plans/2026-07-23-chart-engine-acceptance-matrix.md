# Chart Engine Acceptance Matrix

This is a living execution and evidence document for `/chart-engine` method
acceptance. It records current repo evidence, fresh verification commands and
runtime/browser proof for the chart methods already exposed in production code.

## Purpose / Big Picture

Make the chart-engine roadmap honest before starting the next method. The
screen should be treated as accepted only when each enabled method has:

- shared contracts and schemas;
- owner-scoped API job route;
- DB/job method support and result persistence;
- chart-worker dispatch to the private provider;
- private `apps/chart-engine` endpoint;
- frontend mode, controls, state matrix and reload restore;
- Dictionary lookup codes scoped to the current result;
- PDF state that is either working for the method or explicitly disabled;
- automated evidence and real browser/network evidence.

## Progress

- 2026-07-23 14:56 MSK: Baseline captured on `main`; index was empty.
- 2026-07-23 14:56 MSK: Current code inspection found `natal`, `transit`,
  `synastry`, `solar_return` and `progression` present across contracts,
  API routes, chart-worker dispatch, chart-engine client/provider endpoints and
  frontend modes.
- 2026-07-23 14:56 MSK: Runtime inventory found Docker infra and
  `astrologer-web` up; `astrologer-api`, `chart-worker` and `chart-engine` were
  not listening and need to be started for browser proof.
- 2026-07-23 14:57 MSK: Targeted automated checks passed for chart contracts,
  domain readiness/use cases, `astrologer-api`, DB job persistence,
  `chart-worker`, chart-engine client, Python provider contracts and
  `astrologer-web` chart UI/controller/model tests.
- 2026-07-23 15:02 MSK: Runtime browser proof passed for natal, transit,
  synastry, solar-return and progression on
  `http://localhost:5174/chart-engine` with authenticated astrologer state,
  real API requests, job polling, result restore and Dictionary lookup.
- 2026-07-23 15:09 MSK: Browser proof exposed invalid rounded minutes
  (`29°60'`) in progression point display. Added a regression test and fixed
  visible position formatting to carry `29°59.94'` to `0°00'` of the next sign
  across the chart UI.
- 2026-07-23 15:13 MSK: Fixed non-synastry URL cleanup so `partnerClientId`
  is removed when the chart mode is natal, transit, solar-return or
  progression.
- 2026-07-23 15:15 MSK: Fixed mode-switch URL state so `calculationId` is also
  cleared when moving to another chart method, keeping the URL aligned with the
  "ready to calculate" screen state.

## Surprises & Discoveries

- Some older method specs still contain stale "Repository Context" sections
  saying later methods are absent. Current production code is ahead of those
  notes.
- `docs/architecture/design-reference-inventory.md` already claims first
  slices for natal, transits, synastry, solar-return and progressions are ready,
  with PDF intentionally natal-only.
- Browser proof initially showed that non-synastry modes preserved
  `partnerClientId` in the URL after leaving synastry. This was fixed in the
  URL state helper and verified in browser by switching from progression to
  solar-return.
- The same browser proof showed `calculationId` could remain in the URL after a
  method switch even when the screen had already moved to "ready to calculate".
  Mode changes now clear the local job/result state and write a URL without the
  stale calculation id.

## Decision Log

- 2026-07-23: Do not start composite until the existing enabled methods are
  verified as a matrix. Reason: a new method would increase surface area before
  proving the current five-method runtime.
- 2026-07-23: Treat PDF as accepted only for natal in this matrix. Non-natal PDF
  must stay visibly disabled until a separate renderer/source/checksum contour
  exists.

## Context and Orientation

Primary production surface:

- `apps/astrologer-web/src/pages/chart-engine/useChartEngineController.ts`
- `apps/astrologer-web/src/features/charts/components/ChartEnginePage.tsx`
- `apps/astrologer-web/src/features/charts/components/ChartWheel.tsx`
- `apps/astrologer-web/src/features/charts/components/ChartTables.tsx`

Backend and async contour:

- `packages/contracts/src/charts.ts`
- `packages/domain/src/charts`
- `packages/db/src/schema/calculations`
- `packages/db/src/adapters/charts/drizzle-chart-calculation-job-store.ts`
- `apps/astrologer-api/src/modules/charts`
- `apps/chart-worker/src/chart-jobs.processor.ts`
- `packages/chart-engine-client/src/chart-engine-client.ts`
- `apps/chart-engine/src/chart_engine`

Visual truth:

- `ElevenHouseDesign/app/engine*.jsx`
- `ElevenHouseDesign/app/wheel.jsx`
- `ElevenHouseDesign/app/astro-store.jsx`

## Acceptance Matrix

| Method | Contract/API/worker/provider | Frontend state | Dictionary | PDF | Fresh automated evidence | Fresh runtime/browser evidence | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Natal | Present: `natal/jobs`, worker `calculateNatal`, `/v1/natal` | Present: base mode, wheel/tables/rail/settings/state matrix | `natal.*` from result | Enabled through natal PDF contour | Passed 2026-07-23 14:57 MSK | Passed 2026-07-23 15:02 MSK: selected client, `POST /api/charts/natal/jobs` 201, job 200, calculation 200, PDF 200, reload restore | Accepted for current natal scope |
| Transit | Present: `transits/jobs`, worker `calculateTransit`, `/v1/transits` | Present: `Транзиты`, transit date/time, dual wheel | `transit.*` from result | Disabled intentionally | Passed 2026-07-23 14:57 MSK | Passed 2026-07-23 15:02 MSK: `POST /api/charts/transits/jobs` 201, job 200, calculation 200, result UI restored | Accepted for first transit slice |
| Synastry | Present: `synastry/jobs`, worker `calculateSynastry`, `/v1/synastry` | Present: partner selector, relationship dual wheel | `synastry.*` from result | Disabled intentionally | Passed 2026-07-23 14:57 MSK | Passed 2026-07-23 15:02 MSK: selected partner, `POST /api/charts/synastry/jobs` 201, job 200, calculation 200, partner UI restored | Accepted for first synastry slice |
| Solar return | Present: `solar-return/jobs`, worker `calculateSolarReturn`, `/v1/solar-return` | Present: target year, natal plus solar wheel | `solar_return.*` from result | Disabled intentionally | Passed 2026-07-23 14:57 MSK; URL cleanup fixed 2026-07-23 15:13-15:15 MSK | Passed 2026-07-23 15:02 MSK: `POST /api/charts/solar-return/jobs` 201, job 200, calculation 200, result UI restored; URL cleanup passed 2026-07-23 15:13-15:15 MSK | Accepted for first solar-return slice |
| Progression | Present: `progressions/jobs`, worker `calculateProgression`, `/v1/progressions` | Present: target date, natal plus progressed wheel | `progression.*` from result | Disabled intentionally | Passed 2026-07-23 14:57 MSK; display regression and URL cleanup fixed 2026-07-23 15:09-15:15 MSK | Passed 2026-07-23 15:09 MSK: `POST /api/charts/progressions/jobs` 201, job 200, calculation 200, reload restore, Dictionary lookup 200/304, no console errors, `29°60'` absent after fix | Accepted for first progression slice |

## Out Of Scope

- Composite, child-chart interpretation mode, horary and astrocartography.
- Public/client-web chart access.
- AI-generated chart interpretations.
- PDF for non-natal methods.
- New visual redesign of chart wheel/rails/tables.

## Plan of Work

1. Run targeted automated evidence for contracts, API service/e2e, DB method
   persistence, chart-engine-client, chart-worker and chart-engine provider.
2. Run frontend model/component/controller checks for mode controls, state
   matrix, Dictionary and PDF disabled/enabled behavior.
3. Build app/runtime packages through workspace-aware builds.
4. Start only missing local chart services on standard ports after read-only
   inventory.
5. Execute authenticated browser proof on `http://localhost:5174/chart-engine`
   for each method: select client, calculate, observe job/result network, reload
   restore, Dictionary tab, PDF state and console.
6. Update this matrix with exact command results, runtime observations and gaps.

## Concrete Steps

Working directory:

```bash
/Users/anton/Finext/ElevenHouse
```

Targeted automated checks:

```bash
pnpm test packages/contracts/src/charts.test.ts
pnpm test packages/domain/src/charts
pnpm test apps/astrologer-api/src/modules/charts/charts.service.test.ts apps/astrologer-api/src/modules/charts/charts.e2e.test.ts
pnpm test apps/chart-worker/src/chart-jobs.processor.test.ts packages/chart-engine-client/src/chart-engine-client.test.ts
cd apps/chart-engine && .venv/bin/pytest tests/test_natal_contract.py tests/test_transit_contract.py tests/test_synastry_contract.py tests/test_solar_return_contract.py tests/test_progression_contract.py
pnpm test apps/astrologer-web/src/features/charts apps/astrologer-web/src/pages/chart-engine
pnpm --filter @elevenhouse/astrologer-api... build
pnpm --filter @elevenhouse/chart-worker... build
pnpm --filter @elevenhouse/astrologer-web typecheck
```

Automated evidence, 2026-07-23 14:57 MSK:

- `pnpm test packages/contracts/src/charts.test.ts`: 1 file, 23 tests passed.
- `pnpm test packages/domain/src/charts`: 2 files, 8 tests passed.
- `pnpm test apps/astrologer-api/src/modules/charts/charts.service.test.ts apps/astrologer-api/src/modules/charts/charts.e2e.test.ts`: 2 files, 17 tests passed.
- `INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration packages/db/src/adapters/charts/drizzle-chart-calculation-job-store.integration.ts`: 1 file, 6 tests passed against local `postgresql://localhost:5432/elevenhouse`.
- `pnpm test apps/chart-worker/src/chart-jobs.processor.test.ts packages/chart-engine-client/src/chart-engine-client.test.ts`: 2 files, 20 tests passed.
- `cd apps/chart-engine && .venv/bin/pytest tests/test_natal_contract.py tests/test_transit_contract.py tests/test_synastry_contract.py tests/test_solar_return_contract.py tests/test_progression_contract.py`: 6 tests passed.
- `pnpm test apps/astrologer-web/src/features/charts apps/astrologer-web/src/pages/chart-engine`: 9 files, 80 tests passed.
- `pnpm --filter @elevenhouse/astrologer-api... build`: passed.
- `pnpm --filter @elevenhouse/chart-worker... build`: passed.
- `pnpm --filter @elevenhouse/astrologer-web typecheck`: passed.

Frontend display regression evidence, 2026-07-23 15:09 MSK:

- `pnpm test apps/astrologer-web/src/features/charts/model/chartDisplay.test.ts`:
  first failed with received `Козерог 29°60'`, then passed after the fix
  with 3 tests passed.
- `pnpm test apps/astrologer-web/src/pages/chart-engine/useChartEngineController.test.ts`:
  first failed because progression URL state preserved `partnerClientId`; then
  failed because the mode-change URL helper did not exist; then passed after
  mode-aware URL cleanup with 15 tests passed.
- `pnpm test apps/astrologer-web/src/features/charts apps/astrologer-web/src/pages/chart-engine`:
  9 files, 83 tests passed.
- `pnpm --filter @elevenhouse/astrologer-web typecheck`: passed.

Runtime/browser evidence, 2026-07-23 15:02-15:09 MSK:

- Services ready: `GET http://localhost:3002/health` returned
  `{"service":"astrologer-api","status":"ok"}`, `GET /ready` for
  chart-worker returned all dependencies ready, and
  `GET http://localhost:8012/ready` returned chart-engine ready.
- Browser URL:
  `http://localhost:5174/chart-engine?clientId=31000000-0000-4000-8000-000000000002&partnerClientId=31000000-0000-4000-8000-000000000001&calculationId=f66f915a-07f1-4351-a1d1-4fd826a7662c`.
- Reload restored progression result from
  `GET /api/charts/calculations/f66f915a-07f1-4351-a1d1-4fd826a7662c` 200.
- Dictionary tab requested
  `GET /api/dictionary/entries/by-codes?...progression.*...` 200/304 and
  showed honest missing-entry cards with "Создать трактовку" links.
- Progression planet table after fix showed North Node `♉︎0°00' R` and South
  Node `♏︎0°00' R`; `document.body.innerText.includes("29°60'")` returned
  `false`.
- Switching from the progression URL containing `partnerClientId` to
  solar-return first removed `partnerClientId`; after the follow-up fix, mode
  changes also clear the stale `calculationId`.
- Console `error`, `warn` and `issue` filters returned no messages.

Runtime services:

```bash
curl -fsS http://localhost:5174/
curl -fsS http://localhost:3002/health
curl -fsS http://localhost:3012/ready
curl -fsS http://localhost:8012/ready
```

Known follow-up:

- None for the five enabled methods in this matrix.

## Validation and Acceptance

Acceptance is not complete until this document records both automated and
runtime/browser evidence. If a service or authenticated browser surface is
unavailable, the corresponding row stays blocked instead of being inferred from
unit tests.

## Idempotence and Recovery

- Do not reset DB for this matrix unless a later explicit destructive DB task
  requires it.
- Do not stop or restart already healthy services. Start only missing services
  after read-only listener checks.
- Keep unowned Human Design changes unstaged and untouched.

## Artifacts and Notes

- Runtime/browser screenshots and logs should be stored under
  `.design-qa/chart-engine-acceptance-2026-07-23/`.
- This matrix is an execution artifact. Durable status changes should be folded
  back into canonical architecture/product docs after verification.

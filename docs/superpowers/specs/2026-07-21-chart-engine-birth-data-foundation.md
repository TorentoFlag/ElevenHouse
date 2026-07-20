# Chart Engine Birth Data Foundation ExecPlan

Date: 2026-07-21
Status: in progress

## Outcome

Unlock the first natal chart flow when a selected CRM client is missing required
birth data. The astrologer must be able to save the missing birth data through
the authenticated astrologer workspace and then calculate the natal chart
without leaving the chart engine surface.

## Scope

- Add an owner-scoped astrologer API mutation for a related client's birth
  data.
- Reuse existing shared client birth-data contracts and domain normalization.
- Require CSRF on the state-changing route.
- Add frontend API and chart-engine UI for editing the selected client's birth
  data when calculation readiness fails.
- Keep calculation execution unchanged: `astrologer-api` creates jobs,
  `chart-worker` calls `apps/chart-engine`, and the UI hides technical queue
  wording.

## Out of scope

- Full `/clients` CRM page implementation.
- Geocoding/autocomplete for place input.
- DST ambiguity detection automation.
- Transits, solars, synastry, progressions, AstroCalendar.
- Public/client-facing chart sharing.

## Current evidence

- `packages/contracts/src/clients.ts` already validates birth date, time,
  precision, IANA timezone, DST occurrence, and coordinates.
- `packages/domain/src/clients/client-use-cases.ts` already normalizes and
  validates `ClientBirthDataInput`.
- `ClientStore.upsertClientBirthData` already exists.
- `apps/astrologer-api/src/modules/clients` currently exposes read-only list
  and detail routes.
- `apps/astrologer-web/src/pages/chart-engine/useChartEngineController.ts`
  blocks calculation when required birth data is missing.
- `ElevenHouseDesign/app/engine.jsx` uses the chart engine as the subject
  picker + calculation workspace; production logic may deviate from fake design
  data but should preserve dark surface, compact controls, and inline workflow
  language.

## Decisions

- Route shape: `PUT /clients/:clientUserId/birth-data`.
- Security: cookie-auth route plus `@RequireCsrf()`.
- Authorization: service must first load the client through
  `getAstrologerClient({ astrologerUserId, clientUserId })`; unrelated clients
  return 404 and are never upserted.
- Source: astrologer-entered updates are stored as `source: "manual"`.
- Response: return `AstrologerClientResponse` for the updated client so the UI
  can refresh the selected option without a second manual selection.
- Frontend UX: no "queue" wording. Missing data is shown as a compact inline
  panel in the left rail, with save/retry states and production validation.

## Plan

1. Add failing backend service/e2e tests for owner-scoped birth-data update and
   CSRF.
2. Implement controller/service mutation using existing contracts/domain/store.
3. Add frontend API wrapper and focused tests.
4. Add chart-engine birth-data form/component tests.
5. Wire controller state: save birth data, invalidate clients queries, update
   selected client, keep calculate disabled until required fields are present.
6. Run targeted tests, typecheck, broad verify, local smoke/browser evidence.
7. Commit owned changes, no push.

## Validation log

- `pnpm exec vitest run apps/astrologer-api/src/modules/clients/clients.service.test.ts apps/astrologer-api/src/modules/clients/clients.e2e.test.ts`
  - passed, 10 tests.
- `pnpm exec vitest run apps/astrologer-web/src/features/clients/api/clientsApi.test.ts`
  - passed, 1 test.
- `pnpm exec vitest run apps/astrologer-web/src/features/charts/components/ChartEnginePage.test.tsx`
  - passed, 3 tests.
- `pnpm exec vitest run apps/astrologer-web/src/features/clients/api/clientsApi.test.ts apps/astrologer-web/src/features/charts/components/ChartEnginePage.test.tsx apps/astrologer-web/src/pages/chart-engine/ChartEngineRoute.test.tsx`
  - passed, 5 tests.
- `pnpm --filter @elevenhouse/astrologer-api typecheck && pnpm --filter @elevenhouse/astrologer-web typecheck`
  - passed.
- `pnpm verify`
  - passed: lint, typecheck, 429 test files / 1854 tests, build.
- Browser/CDP on `http://localhost:5174/chart-engine`
  - selected a local CRM client with missing birth time/timezone/coordinates.
  - saw inline "Заполните данные рождения" rail form and disabled
    "Рассчитать" button.
  - saved birth data; network showed `PUT /api/clients/:clientUserId/birth-data`
    returning 200 with `source: "manual"`.
  - after save, form disappeared and "Рассчитать" became enabled.
  - clicked "Рассчитать"; network showed `POST /api/charts/natal/jobs`
    returning 201 with `status: "succeeded"` and Kerykeion/Swiss Ephemeris
    canonical result.
  - console errors/warnings: none after cold reload and calculation. A
    transient Vite Fast Refresh hook-order error appeared before cold reload
    because the already-open tab had hot-loaded a new hook; it did not
    reproduce after reload.

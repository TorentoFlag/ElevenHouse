# Chart Engine Solar Return Design

Date: 2026-07-22
Status: first slice implemented and browser-verified
Scope: first production solar-return slice for `/chart-engine`, after natal,
single-moment transits and two-client synastry.

Verified scenario used authenticated `/chart-engine`, client
`22222222-2222-4222-8222-222222222222`, year `2026`,
`POST /api/charts/solar-return/jobs`, job polling, result read
`791a324e-8977-4915-a1a3-089f01258bcc`, reload restore and Dictionary lookup.

> This document is an implementation design artifact. Durable decisions must be
> reflected in canonical product, architecture, API and testing docs as the
> implementation lands.

## 1. Purpose

Add `solar_return` as the next chart-engine method. An authenticated astrologer
can select an owner-scoped CRM client, choose a target year, calculate the solar
return moment and view a dual-wheel result: natal chart inside, solar-return
chart outside, and return-to-natal aspects.

The feature is complete only when solar return is backed by shared contracts,
`astrologer-api`, domain persistence, DB method constraints, `chart-worker`, the
private Python chart-engine provider, Dictionary interpretation codes,
frontend state and real browser evidence. A visible enabled "Соляр" mode without
this contour is not complete.

## 2. Locked Product Decisions

- The first solar-return slice uses an existing CRM client linked to the
  authenticated astrologer.
- The user confirmed the first visual mode as `натал внутри + соляр снаружи`.
- The target year is explicit. The frontend defaults it to the current year but
  the stored request snapshot must contain the exact selected year.
- The first slice casts the return for the natal birth location and timezone.
  Relocated solar return is a future control because it needs a deliberate
  location workflow and trust copy.
- `birthTimePrecision = unknown` blocks solar return because houses and angles
  become unreliable.
- `birthTimePrecision = approximate` can calculate but must surface a warning.
- Private birth input and return calculation inputs stay separate from render
  data. Render data contains only points, houses, aspects, distributions,
  warnings, provider metadata and the resolved return moment needed by the UI.
- Dictionary interpretations are looked up only by deterministic
  `solar_return.*` codes derived from the stored result.
- Missing Dictionary entries are shown honestly with a create-interpretation
  affordance.
- PDF export, public sharing and AI-generated annual interpretation remain
  disabled until separate production contours exist.

## 3. Explicitly Out Of Scope

- Lunar return and other planetary returns.
- Relocated return location controls.
- Date-range transit calendar around the return.
- Solar return PDF export.
- AI annual forecast text.
- Public/client-facing solar return sharing.
- Editing birth data inside `/chart-engine`.

## 4. Research

Question: should the first solar-return slice be a single return wheel or a
dual natal + return wheel, and which Kerykeion boundary should calculate it?

Decision affected: canonical result shape, provider adapter and frontend
rendering model.

Accessed: 2026-07-22.

### Sources

- https://kerykeion.net/python-library/docs/v5 - official Kerykeion v5 docs;
  lists structured chart data for natal, synastry, transit, composite and return
  charts, and forecasting with solar/lunar returns.
- https://kerykeion.net/python-library/docs/v5/planetary_return_factory -
  official `PlanetaryReturnFactory` docs; it calculates the exact moment when
  a planet returns to its natal position, supports `"Solar"` and `"Lunar"`,
  and accepts return-location coordinates/timezone.
- https://kerykeion.net/python-library/docs/v5/chart_data_factory - official
  `ChartDataFactory` docs; it exposes `create_return_chart_data(natal_subject,
  return_subject)` for dual-wheel return charts and
  `create_single_wheel_return_chart_data(return_subject)` for return-only
  charts.

### Findings

- Sourced fact: Kerykeion supports solar and lunar returns through
  `PlanetaryReturnFactory`.
- Sourced fact: Kerykeion supports both dual return chart data and single-wheel
  return chart data through `ChartDataFactory`.
- Repository evidence: `/chart-engine` already renders dual-wheel transit and
  synastry overlays from canonical JSON without provider SVG.
- Inference: the first ElevenHouse solar-return slice should use dual-wheel
  return data because the user-provided method table says solar is often
  compared with natal, and because the existing chart UI is optimized for
  natal-base overlays.

### Options

1. Dual natal + solar-return result. Benefits: matches the approved first
   visual mode, reuses transit/synastry wheel and table patterns, keeps the
   annual reading grounded in natal comparison. Selected.
2. Single solar-return wheel only. Benefits: smaller payload and simpler UI.
   Risks: loses the natal comparison that astrologers expect and underuses
   existing dual-wheel infrastructure. Rejected for first slice.
3. Frontend-only solar-return moment over `/v1/positions`. Benefits: smaller
   backend addition. Risks: duplicates provider orchestration in React,
   weakens idempotent persistence and cannot produce complete house/aspect
   result. Rejected.

## 5. Contract Shape

```ts
type ChartSolarReturnJobCreateRequest = {
  clientId: string;
  year: number;
  settings: ChartSettings;
};

type StoredChartSolarReturnCalculationPayload = {
  schemaVersion: "chart-result.v1";
  method: "solar_return";
  provider: ChartProviderMetadata;
  settings: ChartSettings;
  inputSnapshot: ChartInputSnapshot;
  solarReturnSnapshot: {
    year: number;
    returnType: "solar";
    location: {
      timezone: string;
      latitude: number;
      longitude: number;
    };
    resolvedAt: string;
  };
  result: {
    natal: ChartRenderResult;
    solarReturn: ChartRenderResult;
    aspectsToNatal: ChartTransitAspect[];
    warnings: ChartWarning[];
  };
};
```

The canonical result deliberately excludes CRM names, phones, emails, notes,
frontend geometry and provider SVG.

## 6. API And Persistence

- `POST /charts/solar-return/jobs` requires CSRF and astrologer session auth.
- `clientId` must resolve through `ClientStore.getAstrologerClient` for the
  authenticated astrologer.
- The API rejects `year` outside `1900..2100` with a stable validation error.
- The request fingerprint includes schema version, provider version, method,
  client id, input snapshot, target year, return location and settings.
- DB method values add `solar_return`.
- Completed `calculation_records.method_code` is written from the job method.
- Existing generic job/result reads remain method-agnostic and owner-scoped.

## 7. Frontend State

- `/chart-engine` adds a real `Соляр` mode after backend contracts exist.
- The first UI shows the primary CRM client selector plus a compact year input.
- The state matrix must include: no client, missing birth data, unknown time,
  approximate time warning, invalid year, calculating, failed/retry, stale after
  birth data/settings/year change, already calculated and reload.
- The result view labels the outer chart as `Соляр`, not transit.
- Dictionary tab filters entries to codes from the current solar-return result
  only.

## 8. Dictionary Codes

First slice lookup codes:

- existing natal position anchors from the natal side of the stored result,
  such as `sun_cancer`, `sun_house_11`, `house_1` and base aspect codes;
- solar-to-natal aspect anchors as
  `solar_return.<solarReturnPoint>.<aspect>.<natalPoint>`, for example
  `solar_return.sun.conjunction.sun`;
- no year-level interpretation entry in the first slice.

Missing entries use the existing honest missing-entry pattern with a
create-interpretation affordance.

## 9. Validation And Acceptance

Automated:

- contracts tests for request/result validation and private snapshot separation;
- Python provider pytest for `/v1/solar-return`;
- chart-engine-client tests for endpoint parsing and invalid result failure;
- chart-worker dispatch tests;
- astrologer-api service/e2e tests for owner scoping, year validation, missing
  birth data and existing-result reuse;
- frontend model/component tests for mode selection, year state, stale
  detection, reload restore and Dictionary filtering.

Runtime/browser:

- authenticated astrologer selects a CRM client;
- switches to `Соляр`;
- calculates a target year;
- verifies `POST /api/charts/solar-return/jobs`, job polling and result read;
- changes year/settings and sees stale state;
- recalculates;
- reloads result URL and stays in solar-return mode with the same year context;
- checks console/network and desktop/mobile layout.

Design parity:

- use `ElevenHouseDesign/app/engine*.jsx`, `engine-wheel.jsx`,
  `engine-modes.jsx`, `engine-tables.jsx` and `wheel.jsx` for wheel, rails,
  toolbar, tables and disabled/active state language;
- capture reference and production screenshots before claiming visible parity.

Verified evidence on 2026-07-22:

- Automated checks passed: contracts/db schema, chart-engine provider pytest,
  chart-engine-client/worker, astrologer-api service/e2e, frontend model/page
  tests and affected builds during the implementation sequence.
- Browser proof passed on `http://localhost:5174/chart-engine` after restarting
  the local worker with `CHART_ENGINE_BASE_URL=http://127.0.0.1:8011`.
- Network evidence included `POST /api/charts/solar-return/jobs` -> `201`, job
  polling -> `200`, `GET /api/charts/calculations/791a324e-8977-4915-a1a3-089f01258bcc`
  -> `200`, and Dictionary `entries/by-codes` containing `solar_return.*`.
- UI evidence after reload: mode `СОЛЯР`, year `2026`, status
  `Соляр рассчитан`, `Планеты соляра`, `Солярные аспекты к наталу`, and missing
  solar-return Dictionary entries with `Создать трактовку` links.
- Console after the final reload had only Vite/React development messages and
  no errors or DevTools issues.

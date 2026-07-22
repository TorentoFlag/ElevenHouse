# Chart Engine Transits Design

Date: 2026-07-22
Status: approved product and architecture design; implementation in progress
Scope: first production transits slice for `/chart-engine`, built after the
natal chart surface became the canonical base method

> This document is an implementation design artifact. Durable decisions must be
> reflected in canonical product, architecture, API and testing docs as the
> implementation lands.

## 1. Purpose

Add `transit` as the next chart-engine method. An authenticated astrologer can
select an existing CRM client, calculate a transit chart for a concrete transit
date/time, and view a dual-wheel result: natal chart inside, transit planets
outside, and transit-to-natal aspects.

The feature is complete only when transits are backed by shared contracts,
`astrologer-api`, domain persistence, the chart worker, the private Python
chart-engine provider, Dictionary interpretation codes, frontend state, and
browser/design evidence. A visible enabled "Транзиты" mode without backend
contracts is explicitly not complete.

## 2. Locked Product Decisions

- Natal remains the base method and prerequisite for transits.
- The first transit slice calculates for an existing owner-scoped CRM client,
  not arbitrary manual subjects.
- `birthTimePrecision = unknown` blocks transits because the inner natal chart
  is not reliable.
- `birthTimePrecision = approximate` can calculate with the same visible
  warning as natal.
- The first transit chart is a single moment, not a date-range calendar.
- The API must store a deterministic transit snapshot. The frontend may default
  to "now", but the persisted request carries the resolved date/time/timezone
  and coordinates.
- Initial transit location defaults to the natal location/timezone. A later
  relocation/location selector is a separate product decision.
- The frontend still renders the wheel and tables from ElevenHouse canonical
  JSON; provider SVG is not the product UI.
- Dictionary interpretations are looked up by deterministic transit codes.
  Missing entries are shown honestly with a create-interpretation affordance.
- PDF export for transits is not enabled in this first slice unless a separate
  PDF renderer/source is implemented and verified.

## 3. Explicitly Out Of Scope

- AstroCalendar and transit date-range feeds.
- Solar/lunar returns, synastry, composite, progressions, directions, horary
  and astrocartography.
- Manual birth subjects outside CRM clients.
- Relocated transit location controls.
- AI-generated transit interpretations.
- Public/client-facing transit sharing.
- Transit PDF export in the first implementation slice.

## 4. Repository Context

- Current `packages/contracts/src/charts.ts` stores `method = "natal"` only for
  `storedChartCalculationPayloadSchema`.
- Current `apps/astrologer-api/src/modules/charts/charts.controller.ts` exposes
  `POST /charts/natal/jobs`, generic job/result reads and natal recalculation.
- Current `packages/domain/src/charts/chart-types.ts` has
  `ChartCalculationMethod = "natal"`.
- Current `packages/db/src/schema/calculations/calculation-values.ts` limits
  `chart_calculation_jobs.method` to `natal`.
- Current `packages/db/src/adapters/charts/drizzle-chart-calculation-job-store.ts`
  persists completed chart records as `methodCode = "natal"` and validates
  worker results with the natal-only schema.
- Current `apps/chart-worker/src/chart-jobs.processor.ts` always sends
  `/v1/natal`.
- Current `apps/chart-engine/src/chart_engine/main.py` exposes `/v1/natal` and
  `/v1/positions`.
- Current `/chart-engine` UI already has disabled "Транзиты" mode and can
  reuse most natal visual primitives, but it cannot be enabled until the result
  contract and backend flow exist.
- `docs/architecture/design-reference-inventory.md` maps chart engine visual
  truth to `ElevenHouseDesign/app/engine*.jsx`, `wheel.jsx` and
  `astro-store.jsx`.

## 5. Research

Question: should the first transit slice use single-moment dual-chart data or
range transit moments?

Decision affected: provider adapter, canonical result shape, UI mode, future
AstroCalendar separation.

Accessed: 2026-07-22.

### Sources

- https://kerykeion.net/python-library/docs/v5 - official Kerykeion v5 docs
  list chart data for natal, synastry, transit, composite and return charts,
  and separate forecasting factories.
- https://kerykeion.net/python-library/docs/v5/transits_time_range_factory -
  official docs for range transits over days/weeks/months.
- Local provider spike with installed Kerykeion 5.12.x:
  `ChartDataFactory.create_transit_chart_data(natal_subject, transit_subject)`
  returns a `DualChartDataModel` with subjects, aspects, house comparison and
  distributions.

### Findings

- Sourced fact: Kerykeion exposes `ChartDataFactory.create_transit_chart_data`
  for a single natal subject plus transit subject.
- Sourced fact: Kerykeion `TransitsTimeRangeFactory` calculates transit
  moments over a period by comparing one natal chart to ephemeris data points.
- Repository evidence: ElevenHouse first screen state is a chart wheel/table
  method, while AstroCalendar is a deferred calendar/read-model surface.
- Inference: `/chart-engine` transits should start with single-moment dual
  chart data. Range transit moments belong to a later AstroCalendar or forecast
  timeline slice.

### Options

1. Single-moment transit chart through `create_transit_chart_data`.
   Benefits: matches `/chart-engine` dual-wheel UI, reuses current async job
   flow, keeps saved result deterministic. Selected.
2. Date-range transit moments through `TransitsTimeRangeFactory`.
   Benefits: useful for forecasts and calendars. Risks: wrong first surface,
   larger result volume, different UX and persistence semantics. Deferred.
3. Frontend-only transit positions from `/v1/positions`.
   Benefits: fast. Risks: browser-owned astrology state, no persistence,
   incomplete aspects and no Dictionary/PDF path. Rejected.

### Recommendation

Implement a new canonical `transit` chart method. Keep the existing
`chart-result.v1` envelope but make it a discriminated union by method:
`natal` keeps the existing result shape; `transit` stores the natal snapshot,
the resolved transit snapshot, natal render data, transit render data and
transit-to-natal aspects. The worker dispatches by job method and writes the
completed `calculation_records.method_code` from the job method.

### User Decisions

- Transits are the next chart-engine method after natal.
- First scope is single-moment dual-wheel transits, not AstroCalendar.

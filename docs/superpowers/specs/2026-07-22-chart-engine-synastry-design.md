# Chart Engine Synastry Design

Date: 2026-07-22
Status: design for next implementation slice
Scope: first production synastry slice for `/chart-engine`, after the natal and
single-moment transit slices

> This document is an implementation design artifact. Durable decisions must be
> reflected in canonical product, architecture, API and testing docs as the
> implementation lands.

## 1. Purpose

Add `synastry` as the next chart-engine method. An authenticated astrologer can
select a primary CRM client and a second owner-scoped CRM client, calculate a
relationship chart, and view a dual-wheel result: the first person's chart as
the base, the second person's points overlaid, and aspects between the two
charts.

The feature is complete only when synastry is backed by shared contracts,
`astrologer-api`, domain persistence, DB method constraints, `chart-worker`, the
private Python chart-engine provider, Dictionary interpretation codes,
frontend state, and real browser evidence. A visible enabled "Синастрия" or
"Ещё" option without this contour is not complete.

## 2. Locked Product Decisions

- The first synastry slice uses two existing CRM clients linked to the
  authenticated astrologer. Manual anonymous subjects are out of scope.
- The primary client is the current `/chart-engine` selected client. The second
  client is selected through a dedicated partner selector.
- Both birth-data snapshots are private calculation input. Render data contains
  only chart points, houses, aspects, distributions, warnings and derived
  relationship analysis needed by the screen.
- `birthTimePrecision = unknown` blocks synastry for either participant because
  houses and angles become unreliable.
- `birthTimePrecision = approximate` can calculate but must surface a warning
  naming which participant has approximate time.
- The first UI reads the result as a relationship workspace, not a compatibility
  verdict. A provider relationship score may be stored as a summary, but it
  must not replace the aspect/house evidence.
- Dictionary interpretations are looked up only by deterministic synastry
  codes derived from the stored result.
- Missing Dictionary entries are shown honestly with a create-interpretation
  affordance; no generated or placeholder text is substituted.
- PDF export for synastry remains disabled until a separate source/renderer and
  checksum invalidation path exist.

## 3. Explicitly Out Of Scope

- Composite chart midpoint calculations.
- Public/client-facing relationship sharing.
- AI-generated compatibility text.
- Relationship scoring as the only or primary reading surface.
- Manual subjects outside CRM.
- Multi-person/group compatibility.
- Synastry PDF export in the first implementation slice.
- Editing either client's birth data inside the synastry selector. Existing CRM
  birth-data editing remains the source workflow.

## 4. Repository Context

- `packages/contracts/src/charts.ts` currently supports `natal`, `transit` and
  `planetary_positions`; synastry is absent from request and result unions.
- `packages/domain/src/charts/chart-types.ts` currently limits
  `ChartCalculationMethod` to `natal | transit`.
- `apps/astrologer-api/src/modules/charts/charts.controller.ts` exposes natal
  and transit job creation plus generic job/result reads.
- `apps/chart-worker/src/chart-jobs.processor.ts` dispatches by method for
  natal and transit provider calls.
- `apps/chart-engine/src/chart_engine/main.py` exposes `/v1/natal`,
  `/v1/transits` and `/v1/positions`.
- `apps/astrologer-web/src/pages/chart-engine/useChartEngineController.ts`
  restores result mode from persisted natal/transit calculation payloads.
- `apps/astrologer-web/src/features/charts/components/ChartWheel.tsx` already
  supports a second point ring for transits and can be generalized for
  relationship overlays.
- `docs/architecture/design-reference-inventory.md` maps chart engine visual
  truth to `ElevenHouseDesign/app/engine*.jsx`, `wheel.jsx` and
  `astro-store.jsx`.

## 5. Research

Question: should the first relationship method be synastry, composite, or a
provider relationship-score screen?

Decision affected: chart method order, canonical result shape, provider
adapter, Dictionary code strategy and first UI state.

Accessed: 2026-07-22.

### Sources

- https://kerykeion.net/python-library - official Kerykeion page; lists natal,
  synastry, transit, composite and return calculations, dual-chart aspects with
  orb controls, and synastry extras such as relationship score and house
  overlays.
- https://kerykeion.net/python-library/docs/v5 - official v5 docs; lists
  `ChartDataFactory` for natal, synastry, transit, composite and return charts,
  and separate analysis factories for relationship score and house comparison.
- https://kerykeion.net/content/examples/synastry-chart - official example;
  creates two `AstrologicalSubjectFactory` subjects and calls
  `ChartDataFactory.create_synastry_chart_data(first, second)`.
- https://kerykeion.net/content/examples/house-comparison - official example;
  describes bidirectional house overlays and notes that house comparison is used
  by synastry chart data.
- https://kerykeion.net/content/examples/relationship-score - official example;
  relationship score evaluates synastry aspects and returns score, description,
  destiny-sign status, aspects and score breakdown.

### Findings

- Sourced fact: Kerykeion v5 has a first-class synastry chart data factory for
  two subjects.
- Sourced fact: Kerykeion exposes bidirectional house overlay analysis for
  where each person's planets and cusps fall in the other person's houses.
- Sourced fact: Kerykeion relationship score is a provider analysis over
  synastry aspects, not a replacement for chart data.
- Repository evidence: ElevenHouse chart UI is wheel/table/interpretation-first,
  and the already implemented transit slice stores canonical JSON rather than
  provider SVG.
- Inference: Synastry should be implemented before composite because the product
  table supplied by the user defines synastry as the two-person dual-wheel
  method, while composite is a separate synthetic relationship chart.

### Options

1. Synastry dual-wheel result with optional relationship summary.
   Benefits: matches user-provided chart-method table, fits current dual-wheel
   UI, keeps result explainable through aspects and house overlays. Selected.
2. Composite chart first.
   Benefits: simpler one-wheel render after provider midpoint calculation.
   Risks: wrong method order, different product meaning, would not satisfy the
   requested "two people: planets of one and the other, aspects between them".
   Rejected for this slice.
3. Relationship score screen first.
   Benefits: compact result. Risks: looks like a verdict, hides the astrological
   evidence, under-serves wheel/table/reference needs. Rejected as primary
   surface; allowed only as secondary summary if the provider exposes stable
   structured data.

### Recommendation

Implement a canonical `synastry` method in `chart-result.v1` as a
discriminated union member. The payload should store:

- `inputSnapshot`: primary client private birth-data snapshot;
- `partnerInputSnapshot`: partner client private birth-data snapshot;
- `relationshipSnapshot`: primary/partner client ids and stable participant
  roles, with no names or contact data;
- `result.primary`: first person's render result;
- `result.partner`: second person's render result;
- `result.aspectsBetween`: aspects where each side is explicitly marked
  `primaryPoint` and `partnerPoint`;
- `result.houseOverlays`: bidirectional projected-house data for points and
  house cusps;
- `result.relationshipScore`: optional provider-derived numeric/label summary
  with structured breakdown when available;
- `result.warnings`: participant-aware warnings.

Use `/charts/synastry/jobs` in `astrologer-api`, `method = "synastry"` in
domain/DB/worker, and `/v1/synastry` in the private Python provider. The
frontend should keep the current mode controls disabled until the full result,
API and browser flow are implemented; when enabled, the "Ещё" menu can expose
`Синастрия` as a real method selection.

### User Decisions

- The user confirmed the chart-method table that includes Synastry as a
  double-wheel relationship chart after Natal/Transits.
- No further product decision is required for the first slice if it stays
  limited to two owner-scoped CRM clients and no public sharing/PDF/AI.

## 6. Contract Shape

```ts
type ChartSynastryJobCreateRequest = {
  clientId: string;
  partnerClientId: string;
  settings: ChartSettings;
};

type StoredChartSynastryCalculationPayload = {
  schemaVersion: "chart-result.v1";
  method: "synastry";
  provider: ChartProviderMetadata;
  settings: ChartSettings;
  inputSnapshot: ChartInputSnapshot;
  partnerInputSnapshot: ChartInputSnapshot;
  relationshipSnapshot: {
    primaryClientId: string;
    partnerClientId: string;
  };
  result: {
    primary: ChartRenderResult;
    partner: ChartRenderResult;
    aspectsBetween: ChartSynastryAspect[];
    houseOverlays: ChartSynastryHouseOverlay[];
    relationshipScore?: ChartSynastryRelationshipScore;
    warnings: ChartWarning[];
  };
};
```

The canonical result deliberately excludes CRM names, phones, emails, notes,
relationship labels and frontend geometry. The API can hydrate display names
from CRM reads for UI context; the persisted calculation result remains
private deterministic chart data.

## 7. API And Persistence

- `POST /charts/synastry/jobs` requires CSRF and astrologer session auth.
- Both `clientId` and `partnerClientId` must resolve through
  `ClientStore.getAstrologerClient` for the authenticated astrologer.
- The API rejects equal client ids with `CHART_SYNASTRY_PARTNER_REQUIRED`.
- The request fingerprint includes schema version, provider version, method,
  primary client id, partner client id, both input snapshots and settings.
- DB method values add `synastry`.
- Completed `calculation_records.method_code` is written from the job method.
- Existing generic job/result reads remain method-agnostic and owner-scoped.

## 8. Frontend State

- Initial enabling can live under the existing `Ещё` control as a real
  `Синастрия` option once backend contracts exist.
- The state matrix must include: no primary client, no partner client, same
  client selected twice, missing primary birth data, missing partner birth data,
  approximate time for either participant, calculating, failed/retry, stale
  after either client birth data/settings change, already calculated/reload.
- The result view reuses chart wheel and table primitives but labels data as
  `Клиент` and `Партнёр`, not natal/transit.
- Dictionary tab filters entries to codes from the current synastry result only.

## 9. Dictionary Codes

First slice lookup codes:

- `synastry.aspect.<primaryPoint>.<aspect>.<partnerPoint>`
- `synastry.overlay.primary.<point>.partner_house.<houseNumber>`
- `synastry.overlay.partner.<point>.primary_house.<houseNumber>`
- `synastry.score.<scoreBand>` only if relationship score is present

Missing entries use the existing honest missing-entry pattern with a
create-interpretation affordance.

## 10. Validation And Acceptance

Automated:

- contracts tests for synastry request/result validation and private snapshot
  separation;
- Python provider pytest for `/v1/synastry`;
- chart-engine-client tests for endpoint parsing and invalid result failure;
- chart-worker dispatch tests;
- astrologer-api service/e2e tests for owner scoping, same-client rejection,
  missing birth data and existing-result reuse;
- frontend model/component tests for mode selection, partner states, stale
  detection, reload restore and Dictionary filtering.

Runtime/browser:

- authenticated astrologer selects a primary CRM client;
- selects a second owner-scoped CRM client;
- calculates synastry;
- verifies `POST /api/charts/synastry/jobs`, job polling and result read;
- changes either participant birth data or settings and sees stale state;
- recalculates;
- reloads result URL and stays in synastry mode with the same partner context;
- checks console/network and desktop/mobile layout.

Design parity:

- use `ElevenHouseDesign/app/engine*.jsx`, `engine-wheel.jsx`,
  `engine-modes.jsx`, `engine-tables.jsx` and `wheel.jsx` for wheel, rails,
  toolbar, tables and disabled/active state language;
- capture reference and production screenshots before claiming visible parity.

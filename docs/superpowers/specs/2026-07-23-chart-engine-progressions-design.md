# Chart Engine Progressions Design

## Outcome

Enable the first production slice of `/chart-engine` progressions for astrologers:
secondary progressed chart calculation for one CRM client, rendered as a dual wheel
against the natal chart, persisted as a private chart calculation, and restored from
the URL like natal, transits, synastry and solar return.

## Scope

In scope:

- Secondary progressions only, using the day-for-year model.
- One primary CRM client with owner-scoped birth data.
- Explicit target date control named "Дата прогрессии".
- `chart-result.v1` payload with `natal`, `progressed`, `aspectsToNatal` and warnings.
- `astrologer-api -> chart job -> chart-worker -> apps/chart-engine` calculation flow.
- Frontend `Прогрессии` mode enablement, state matrix, RU labels, dual-wheel rendering and tables.
- Dictionary lookup codes under `progression.*`; missing entries stay honest and link to creation.
- PDF stays disabled for progressions.

Out of scope:

- Solar arc, converse, tertiary/minor progressions, composite charts, horary and astrocartography.
- Public/client-web chart access.
- AI interpretation generation.
- Native Kerykeion progression factory adoption, unless it exists in the installed local API during implementation.
- Reworking natal/transit/synastry/solar visual language.

## Product Behavior

The astrologer selects a client, switches to `Прогрессии`, chooses a target date and clicks
`Рассчитать прогрессии`. The UI must send only IDs, target date and settings; birth data is
resolved by `astrologer-api`. If a current calculation already exists for the same client,
birth snapshot, target date, settings and provider version, the API may return the existing
result immediately. Otherwise it creates a private async job.

After calculation the screen shows the natal chart as the base chart and the progressed chart
as the overlay. The right panel exposes progressed points and progressed-to-natal aspects.
Changing birth data, settings or the progression date marks the result stale and requires
recalculation.

## Architecture

Contracts add `progression` as a chart calculation method and introduce:

- `chartProgressionJobCreateRequestSchema`
- `chartProgressionSnapshotSchema`
- `chartProgressionCalculationRequestSchema`
- `chartProgressionAspectSchema`
- `chartProgressionRenderResultSchema`
- `storedChartProgressionCalculationPayloadSchema`

The persisted method is `progression`. The API route is:

```text
POST /api/charts/progressions/jobs
```

`ChartsService.createProgressionJob` resolves the owner-scoped client birth data, builds an
input snapshot with `progressionSnapshot.targetDate`, fingerprints it, and calls
`createChartJobAndRequestCalculation({ method: "progression" })`.

`chart-worker` dispatches `method === "progression"` to `ChartEngineHttpClient.calculateProgression`.

`apps/chart-engine` exposes:

```text
POST /v1/progressions
```

The provider builds two subjects:

- natal subject from birth data;
- progressed subject from the symbolic date `birthDate + ageInDaysAtTargetDate`.

The first slice computes the symbolic progressed date in UTC calendar days. It preserves the
natal birthplace/timezone for houses and angles. The result must expose `calculationBasis` so
the UI and future audits can see the actual symbolic date and day-for-year rule.

## Data Contract

Progression result shape:

```ts
{
  schemaVersion: "chart-result.v1";
  method: "progression";
  provider: ChartProviderMetadata;
  settings: ChartSettings;
  inputSnapshot: ChartInputSnapshot;
  progressionSnapshot: {
    targetDate: "YYYY-MM-DD";
    progressionType: "secondary";
    calculationBasis: {
      symbolicDate: "YYYY-MM-DD";
      ageDays: number;
      dayForYearRatio: 1;
    };
  };
  result: {
    natal: ChartRenderResult;
    progressed: ChartRenderResult;
    aspectsToNatal: ChartProgressionAspect[];
    warnings: ChartWarning[];
  };
}
```

`ChartProgressionAspect` uses explicit names:

```ts
{
  progressedPoint: string;
  natalPoint: string;
  type: string;
  angle: number;
  orb: number;
  applying?: boolean | null;
  strength?: number | null;
}
```

## UI Design

Keep the existing chart engine visual language. The top mode pill `Прогрессии` becomes enabled.
For progression mode the toolbar shows one compact date input:

```text
Дата прогрессии [YYYY-MM-DD]
```

The wheel uses the existing dual-wheel presentation. The left rail continues to summarize the
primary/natal chart. The right panel labels:

- `Планеты прогрессии`
- `Аспекты к наталу`
- houses and interpretations use the same tabs, with progression-specific copy where the result
  provides progressed data.

No new decorative UI or marketing sections are introduced.

## Dictionary

Lookup must be deterministic from the result:

- `progression.point.<point>.<sign>`
- `progression.point_house.<point>.<house>`
- `progression.aspect_to_natal.<progressedPoint>.<aspect>.<natalPoint>`

If an entry is missing, the panel must say that the interpretation is absent and offer the
existing create-entry link. It must not invent fallback text.

## Research

Question: how to implement the first progressions slice with current provider support.
Decision affected: provider calculation model and result contract.
Accessed: 2026-07-23.

Sources:

- https://github.com/g-battaglia/kerykeion — repository README states Kerykeion computes birth,
  synastry, transit, return and composite chart data; local installed API exposes no progression
  factory.
- https://kerykeion.net/content/learn-astrology/secondary-progressions-introduction — Kerykeion
  learn content describes secondary progressions as the day-for-year symbolic model.
- https://www.freeastroapi.com/docs/western/secondary-progressions — reference API pattern makes
  `target_date` explicit and returns a progressed chart with natal reference data.

Repository evidence:

- `packages/contracts/src/charts.ts` already uses a discriminated `chart-result.v1` union.
- `apps/astrologer-api/src/modules/charts/charts.service.ts` has the reusable async job pattern.
- `apps/chart-worker/src/chart-jobs.processor.ts` dispatches by method.
- `apps/chart-engine/src/chart_engine/kerykeion_adapter.py` already creates transit/return dual
  chart data from two subjects.

Options:

1. Implement secondary progressions on top of existing subject creation and dual-chart aspect
   mapping. This keeps the full production contour moving and records the calculation basis.
2. Wait for a native local Kerykeion progressions factory. This blocks product progress and the
   installed API does not currently expose that factory.
3. Enable a frontend-only progressions mock. This violates production integrity and is rejected.

Recommendation: option 1. The calculation rule is explicit, testable, persisted and auditable.

## Acceptance

- Contract tests parse a valid `progression` request and stored result.
- API service tests create a `progression` job with owner-scoped birth data and target date.
- API e2e exposes CSRF-protected `POST /charts/progressions/jobs`.
- Worker tests dispatch `progression` jobs to `calculateProgression`.
- Chart-engine tests return progressed points and progressed-to-natal aspects.
- Frontend tests enable `Прогрессии`, submit target date, restore mode from a loaded result and
  mark stale after target date change.
- Browser proof on `/chart-engine` shows a real network-backed progression result, clean console,
  expected network calls and no horizontal clipping.

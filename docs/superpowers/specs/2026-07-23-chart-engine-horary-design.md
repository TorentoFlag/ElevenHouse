# Chart Engine Horary Design

## Outcome

Enable the first production slice of `/chart-engine` horary charts for astrologers:
one CRM-scoped horary calculation, rendered as a single wheel for the exact question
moment and location, persisted as a private chart calculation, and restored like the
existing chart-engine methods.

## Scope

In scope:

- One horary chart for a focused question.
- One owner-scoped CRM client as the workspace/history context.
- Question text, category, moment date, moment time, timezone, latitude and longitude.
- A separate private `questionSnapshot`; no client birth data is used for calculation.
- `chart-result.v1` payload with single-wheel render data: points, houses, aspects,
  distributions and warnings.
- `astrologer-api -> chart job -> chart-worker -> apps/chart-engine` calculation flow.
- Frontend `Хорар` mode enablement, state matrix, RU labels, single-wheel rendering,
  tables and Dictionary-backed interpretations.
- Dictionary lookup codes under `horary.*`; missing entries stay honest and link to
  creation.
- PDF stays disabled for horary.

Out of scope:

- Automated horary judgment, yes/no verdicts, perfection logic, significator
  selection, dignities, receptions, planetary hours, void Moon, antiscia, fixed stars,
  timing prediction or AI-generated answer.
- Anonymous/non-client horary storage.
- Public/client-web sharing.
- PDF/export.
- Astrocartography, natal, transits, progressions, synastry, composite or child-chart
  changes except shared chart-engine helpers needed to add the method.

## Product Behavior

The astrologer selects a CRM client, switches to `Хорар`, writes the question and
sets the question moment and place. The UI must send only the client id, question
snapshot and settings. The backend resolves ownership for the client, but does not
read or require the client's birth data for horary calculation.

If a current calculation already exists for the same owner, client, question snapshot,
settings and provider version, the API may return the existing result immediately.
Otherwise it creates a private async chart job. Changing the question text, category,
moment, location or settings marks the result stale and requires recalculation.

The result screen shows a single wheel for the question moment. The right panel exposes
planets, aspects, houses and Dictionary interpretations. The UI must not display a
deterministic "answer" unless a future horary analysis contract supplies one.

## Architecture

Contracts add `horary` as a chart calculation method and introduce:

- `chartHoraryQuestionSnapshotSchema`
- `chartHoraryJobCreateRequestSchema`
- `chartHoraryCalculationRequestSchema`
- `storedChartHoraryCalculationPayloadSchema`

The persisted method is `horary`. The API route is:

```text
POST /api/charts/horary/jobs
```

`ChartsService.createHoraryJob` validates the owner-scoped CRM client, normalizes the
question snapshot, fingerprints it, and calls:

```ts
createChartJobAndRequestCalculation({ method: "horary" })
```

`chart-worker` dispatches `method === "horary"` to
`ChartEngineHttpClient.calculateHorary`.

`apps/chart-engine` exposes:

```text
POST /v1/horary
```

The provider builds one subject from the question snapshot and reuses the existing
single-wheel render mapping. This is mathematically a chart for a moment/place, but the
stored method and private input semantics remain horary-specific.

## Data Contract

Horary request snapshot:

```ts
{
  question: string;
  category?: "relationship" | "career" | "money" | "home" | "health" | "travel" | "other";
  date: "YYYY-MM-DD";
  time: "HH:mm";
  timezone: string;
  latitude: number;
  longitude: number;
}
```

Horary result shape:

```ts
{
  schemaVersion: "chart-result.v1";
  method: "horary";
  provider: ChartProviderMetadata;
  settings: ChartSettings;
  questionSnapshot: ChartHoraryQuestionSnapshot;
  result: ChartRenderResult;
}
```

`questionSnapshot` is private calculation input. Render data stays separate and contains
only astronomical chart data needed by the wheel, tables and interpretation anchors.

## UI Design

Keep the existing chart-engine visual language. The top mode pill `Хорар` becomes
enabled near the other method modes. For horary mode the toolbar/input area shows compact
controls:

```text
Вопрос [text]
Категория [select]
Дата [YYYY-MM-DD]  Время [HH:mm]  TZ/место [existing compact fields or defaults]
```

First slice defaults may use the selected client's known timezone and coordinates only as
prefill values for the question place; once submitted they are stored in
`questionSnapshot`. The UI copy must make clear that the calculation is for the question
moment, not for the client's birth data.

State copy:

- Empty/current: `Готово к хорару` / `Введите вопрос и момент, чтобы построить карту вопроса.`
- Calculating: `Рассчитываем хорар` / `Строим карту на момент вопроса.`
- Success: `Хорар рассчитан` / `Карта построена на момент вопроса; автоматический ответ не подключён.`
- Stale: `Хорар изменён` / `Вопрос, момент, место или настройки изменились. Пересчитайте карту.`
- PDF tooltip: `PDF для хорара будет отдельным контуром.`

No fake queue wording, no browser-only result state and no generated verdict.

## Dictionary

Lookup must be deterministic from the result:

```text
horary.<point>.<sign>
horary.<point>.house.<houseNumber>
horary.house.<houseNumber>
horary.aspect.<pointA>.<aspectType>.<pointB>
horary.question.<category>
```

If an entry is missing, the panel must say that the interpretation is absent and offer
the existing create-entry link. It must not fall back to `natal.*` text or invent a
placeholder interpretation.

## Research

Question: how to model a horary first slice with the current chart provider.
Decision affected: provider calculation model, result contract and UI input state.
Accessed: 2026-07-23.

Sources:

- https://kerykeion.net/python-library/docs/v5 - Kerykeion documents high-precision
  planetary/house calculations, aspects, natal, synastry, transits and returns.
- https://github.com/g-battaglia/kerykeion - repository overview lists birth,
  synastry, transit and composite chart support, with no separate horary endpoint in
  the visible API summary.
- https://kerykeion.net/content/learn-astrology/horary-introduction - horary is framed
  around a genuine question and a chart cast for the question moment; interpretation
  involves significators, Moon condition and house rulerships.
- https://kerykeion.net/content/learn-astrology/category/specialized-branches/horary/technique
  - richer horary techniques include receptions, void Moon, perfection and other
  rules; these are not part of the first calculation slice.

Repository evidence:

- `packages/contracts/src/charts.ts` uses a discriminated `chart-result.v1` union.
- `packages/domain/src/charts/chart-types.ts` has a single method union used by jobs.
- `packages/db/src/schema/calculations/chart-calculation-jobs.schema.ts` requires a
  non-null `client_id` and a method CHECK list.
- `apps/astrologer-api/src/modules/charts/charts.service.ts` contains the reusable
  owner-scoped async job pattern.
- `apps/chart-worker/src/chart-jobs.processor.ts` dispatches by method.
- `apps/chart-engine/src/chart_engine/kerykeion_adapter.py` already has reusable
  single-wheel render mapping from one subject.

Options:

1. Add `horary` as a new client-scoped chart method with `questionSnapshot` and reuse
   the single-wheel provider path. This keeps product semantics correct and preserves
   auditability.
2. Reuse `method: "natal"` with the question moment mapped into `birthDate/birthTime`.
   This is rejected because it stores false private input semantics and would make UI,
   Dictionary and future analysis contracts ambiguous.
3. Add non-client horary calculations immediately. This is rejected for the first slice
   because the current chart job table requires `client_id`; changing that storage model
   is a broader calculation-workspace decision.

Recommendation: option 1.

## Acceptance

- Contract tests parse a valid `horary` request and stored result and reject missing
  question snapshot fields.
- DB schema/migration includes `horary` in the chart job method CHECK.
- API service tests create a `horary` job without requiring client birth data.
- API e2e exposes CSRF-protected `POST /charts/horary/jobs`.
- Worker tests dispatch `horary` jobs to `calculateHorary`.
- Chart-engine tests return single-wheel horary render data from `POST /v1/horary`.
- Frontend tests enable `Хорар`, submit question snapshot, restore mode/result and mark
  stale after question snapshot changes.
- Dictionary tests prove `horary.*` anchors are generated and no `natal.*` fallback is
  used.
- Browser proof on `/chart-engine` shows a real network-backed horary result, clean
  console, expected network calls, reload restore and disabled PDF.

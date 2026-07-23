# Chart Engine Child Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `Детская` to `/chart-engine` as a child-safe interpretation mode backed by canonical natal calculations.

**Architecture:** `Детская` is a frontend view/interpretation mode, not a new provider calculation method. It calls the existing natal job endpoint, accepts/restores natal `chart-result.v1`, renders the existing single wheel/tables and switches Dictionary lookup anchors from adult natal codes to `child.*`.

**Tech Stack:** React + Vite, TypeScript, TanStack Query, shared `@elevenhouse/contracts`, Vitest, local browser proof through existing `astrologer-web`, `astrologer-api`, `chart-worker` and Python `chart-engine` services.

## Global Constraints

- Work in the existing shared checkout on `main`; do not create worktrees or branches.
- Do not add a Python provider endpoint, DB `method = "child"` or new calculation payload schema.
- Do not use browser-supplied birth data; calculation remains CRM-backed through `POST /charts/natal/jobs`.
- Keep persisted calculation `method: "natal"` distinct from frontend mode `child_chart`.
- Dictionary lookup must use only `child.*` codes in child mode; no fallback to adult `natal.*` entries.
- PDF remains visibly disabled for `Детская`.
- Copy must avoid medical, psychological, diagnostic, deterministic and fatalistic claims.
- Preserve existing `.design-qa/*` untracked evidence directories unless a task explicitly creates new evidence.

---

## File Structure

- Modify `apps/astrologer-web/src/features/charts/components/ChartEnginePage.tsx`: add `child_chart` mode, mode tab, natal-result display mapping, child copy, PDF title and calculate dispatch to natal.
- Modify `apps/astrologer-web/src/features/charts/components/ChartEnginePage.test.tsx`: verify child tab, natal-backed calculation action, PDF disabled state and child interpretation UI.
- Modify `apps/astrologer-web/src/features/charts/components/ChartTables.tsx`: accept `interpretationMode`, pass it to the anchor builder and change interpretation panel kicker/AI copy for child mode.
- Modify `apps/astrologer-web/src/features/charts/model/chartInterpretations.ts`: add `ChartInterpretationMode = "default" | "child"` and child-specific point/house/aspect anchors.
- Modify `apps/astrologer-web/src/features/charts/model/chartInterpretations.test.ts`: prove child anchors emit `child.*` and do not emit adult natal codes.
- Modify `apps/astrologer-web/src/pages/chart-engine/useChartEngineController.ts`: restore/read/write `mode=child_chart`, call natal job while preserving child URL state and stale behavior.
- Modify `apps/astrologer-web/src/pages/chart-engine/useChartEngineController.test.ts`: prove URL restore/mode-change/search semantics and natal endpoint usage for child mode.
- Modify `docs/product/roadmap.md` and `docs/architecture/design-reference-inventory.md`: mark child-chart first slice after browser proof.

## Task 1: Child Interpretation Anchors

**Files:**

- Modify: `apps/astrologer-web/src/features/charts/model/chartInterpretations.ts`
- Modify: `apps/astrologer-web/src/features/charts/model/chartInterpretations.test.ts`

**Interfaces:**

- Produces: `export type ChartInterpretationMode = "default" | "child"`.
- Produces: `buildChartInterpretationAnchors(result, { mode: "child" })`.
- Later tasks pass `{ mode: activeMode === "child_chart" ? "child" : "default" }`.

- [x] **Step 1: Write the failing child-anchor test**

Add this test to `apps/astrologer-web/src/features/charts/model/chartInterpretations.test.ts`:

```ts
it("derives child-specific dictionary anchors from natal result without natal fallback", () => {
  const anchors = buildChartInterpretationAnchors(chartResult(), { mode: "child" });

  expect(getChartInterpretationLookupCodes(anchors)).toEqual(
    expect.arrayContaining([
      "child.sun.cancer",
      "child.sun.house.11",
      "child.house.1",
      "child.aspect.sun.square.moon"
    ])
  );
  expect(getChartInterpretationLookupCodes(anchors)).not.toContain("sun_cancer");
  expect(getChartInterpretationLookupCodes(anchors)).not.toContain("sun_house_11");
  expect(anchors.map((anchor) => `${anchor.code}:${anchor.categoryCode}:${anchor.meta}`)).toEqual(
    expect.arrayContaining([
      "child.sun.cancer:planets_in_signs:Детская карта · планета в знаке",
      "child.sun.house.11:planets_in_houses:Детская карта · планета в доме",
      "child.house.1:house_meanings:Детская карта · значение дома",
      "child.aspect.sun.square.moon:planet_aspects:Детская карта · аспект"
    ])
  );
});
```

- [x] **Step 2: Run the failing test**

Run:

```bash
pnpm test apps/astrologer-web/src/features/charts/model/chartInterpretations.test.ts
```

Expected: FAIL because `buildChartInterpretationAnchors` does not accept the second argument and emits adult natal codes.

- [x] **Step 3: Implement child anchor mode**

In `chartInterpretations.ts`, change the exported function signature:

```ts
export type ChartInterpretationMode = "default" | "child";

export function buildChartInterpretationAnchors(
  result: StoredChartCalculationPayload,
  options: { readonly mode?: ChartInterpretationMode } = {}
): readonly ChartInterpretationAnchor[] {
  const synastryResult = getSynastryChartResult(result);
  if (synastryResult) return buildSynastryAnchors(synastryResult);
  if (result.method === "composite") return buildCompositeAnchors(result);
  if (options.mode === "child" && result.method === "natal") return buildChildAnchors(result);
  // existing default logic stays below
}
```

Add child helpers near the composite helpers, reusing existing formatting and ordering:

```ts
function buildChildAnchors(result: StoredChartCalculationPayload): readonly ChartInterpretationAnchor[] {
  const renderResult = getPrimaryChartRenderResult(result);
  const pointsById = new Map(renderResult.points.map((point) => [point.id, point]));

  return [
    ...buildChildPointAnchors(renderResult.points),
    ...buildChildHouseAnchors(result),
    ...buildChildAspectAnchors(renderResult.aspects, pointsById)
  ];
}
```

Implement the child helpers as copies of composite helpers with prefix `child`, ids `child-*` and meta labels `Детская карта · ...`. Keep the ordered aspect pair logic and `maxPlanetAspectAnchors`.

- [x] **Step 4: Verify child anchor test passes**

Run:

```bash
pnpm test apps/astrologer-web/src/features/charts/model/chartInterpretations.test.ts
```

Expected: PASS.

## Task 2: Child Mode In Chart UI

**Files:**

- Modify: `apps/astrologer-web/src/features/charts/components/ChartEnginePage.tsx`
- Modify: `apps/astrologer-web/src/features/charts/components/ChartEnginePage.test.tsx`

**Interfaces:**

- Consumes: `ChartInterpretationMode` and `ChartTables interpretationMode`.
- Produces: `ChartEngineMode` includes `"child_chart"`.
- Produces: `getExpectedResultMethodForMode(mode)` returning `"natal"` for `"child_chart"`.

- [x] **Step 1: Write failing component tests**

Add tests to `ChartEnginePage.test.tsx`:

```tsx
it("renders child chart mode as natal-backed and calls natal calculation", async () => {
  const user = userEvent.setup();
  const onCreateNatalJob = vi.fn();

  render(
    <ChartEnginePage
      selectedClient={clientOption()}
      jobState="idle"
      result={null}
      errorMessage={null}
      isBusy={false}
      settings={settings()}
      onSettingsChange={vi.fn()}
      onCreateNatalJob={onCreateNatalJob}
    />
  );

  await user.click(screen.getByRole("button", { name: "Детская" }));

  expect(screen.getByText("Детская карта")).toBeInTheDocument();
  expect(screen.getByText(/трактовки откроются в мягком детском режиме/i)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Рассчитать детскую/i }));
  expect(onCreateNatalJob).toHaveBeenCalledTimes(1);
});

it("shows natal result in child mode and keeps PDF disabled", async () => {
  const user = userEvent.setup();

  render(
    <ChartEnginePage
      selectedClient={clientOption()}
      mode="child_chart"
      jobState="succeeded"
      result={chartResult()}
      errorMessage={null}
      isBusy={false}
      settings={settings()}
      onSettingsChange={vi.fn()}
      onCreateNatalJob={vi.fn()}
      pdfDisabled={false}
    />
  );

  expect(screen.getByText("Детская карта рассчитана")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "PDF" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Трактовки" }));
  expect(await screen.findByText(/Детская карта · планета в знаке/i)).toBeInTheDocument();
});
```

- [x] **Step 2: Run the failing component tests**

Run:

```bash
pnpm test apps/astrologer-web/src/features/charts/components/ChartEnginePage.test.tsx
```

Expected: FAIL because `Детская` mode and child interpretation props are missing.

- [x] **Step 3: Implement child mode UI**

In `ChartEnginePage.tsx`:

- add `"child_chart"` to `ChartEngineMode`;
- add a `Детская` mode button near `Натал`;
- introduce `const expectedResultMethod = getExpectedResultMethodForMode(activeMode);`;
- change `displayResult` method comparison to `result?.method !== expectedResultMethod`;
- pass `interpretationMode={activeMode === "child_chart" ? "child" : "default"}` to `ChartTables`;
- make `runChartCalculationAction` call `onCreateNatalJob()` for `child_chart`;
- keep `PDF` disabled when `activeMode !== "natal"`;
- add child copy branches to `getModeTitle`, `getCalculatingLabel`, `getEmptyResultLabel`, `getSucceededLabel`, `getChartViewState` and `StatusCard`.

Use these exact copy values:

```ts
if (mode === "child_chart") return "Детская карта";
if (mode === "child_chart") return "Рассчитываем детскую карту";
if (mode === "child_chart") return "Готово к расчёту детской карты";
if (mode === "child_chart") return "Детская карта рассчитана";
```

For ready detail/action:

```ts
"Натал ребёнка будет рассчитан из CRM birth data, а трактовки откроются в мягком детском режиме."
"Рассчитать детскую"
```

For success detail:

```ts
"Расчёт использует натальные положения; трактовки адаптированы для родительского чтения."
```

- [x] **Step 4: Verify component tests pass**

Run:

```bash
pnpm test apps/astrologer-web/src/features/charts/components/ChartEnginePage.test.tsx
```

Expected: PASS.

## Task 3: ChartTables Interpretation Mode

**Files:**

- Modify: `apps/astrologer-web/src/features/charts/components/ChartTables.tsx`
- Modify: `apps/astrologer-web/src/features/charts/components/ChartEnginePage.test.tsx`

**Interfaces:**

- Consumes: `ChartInterpretationMode` from `chartInterpretations.ts`.
- Produces: `ChartTablesProps.interpretationMode?: ChartInterpretationMode`.

- [x] **Step 1: Write failing Dictionary lookup expectation**

In the child component test from Task 2, extend the mocked dictionary request expectation:

```ts
expect(get).toHaveBeenCalledWith(
  "/dictionary/entries/by-codes?locale=ru&codes=child.sun.cancer%2Cchild.sun.house.11%2Cchild.moon.aries%2Cchild.moon.house.8%2Cchild.pluto.scorpio%2Cchild.pluto.house.7%2Cchild.house.1%2Cchild.house.7%2Cchild.aspect.sun.square.moon%2Cchild.aspect.moon.trine.pluto"
);
```

If the fixture contains aspect-signature anchors from adult mode, update the expected list to match the actual child anchors from Task 1, but every code must start with `child.`.

- [x] **Step 2: Run the failing test**

Run:

```bash
pnpm test apps/astrologer-web/src/features/charts/components/ChartEnginePage.test.tsx
```

Expected: FAIL until `ChartTables` passes child mode into the anchor builder.

- [x] **Step 3: Implement `interpretationMode` in ChartTables**

In `ChartTables.tsx`, update imports and props:

```ts
import {
  buildChartInterpretationAnchors,
  getChartInterpretationLookupCodes,
  type ChartInterpretationAnchor,
  type ChartInterpretationAnchorGroup,
  type ChartInterpretationMode
} from "../model/chartInterpretations";

export type ChartTablesProps = {
  readonly interpretationMode?: ChartInterpretationMode;
  // existing props
};
```

Pass it through:

```tsx
<InterpretationSummary interpretationMode={interpretationMode ?? "default"} locale={locale} result={result} />
```

Build anchors with:

```ts
const anchors = useMemo(
  () => buildChartInterpretationAnchors(result, { mode: interpretationMode }),
  [interpretationMode, result]
);
```

Set child panel kicker:

```tsx
<div className={styles.interpretationKicker}>
  {interpretationMode === "child"
    ? "Детские трактовки · библиотека"
    : "Опорные положения · библиотека"}
</div>
```

Set child AI header first line:

```tsx
<span>{interpretationMode === "child" ? "AI-трактовка · детская карта" : "AI-трактовка · натальная карта"}</span>
```

- [x] **Step 4: Verify component tests pass**

Run:

```bash
pnpm test apps/astrologer-web/src/features/charts/components/ChartEnginePage.test.tsx
```

Expected: PASS.

## Task 4: Controller URL Restore And Natal Job Reuse

**Files:**

- Modify: `apps/astrologer-web/src/pages/chart-engine/useChartEngineController.ts`
- Modify: `apps/astrologer-web/src/pages/chart-engine/useChartEngineController.test.ts`

**Interfaces:**

- Consumes: `ChartEngineMode = "child_chart"`.
- Produces: child mode URL state through `mode=child_chart`.
- Produces: `restoreChartEngineViewState(result, { mode: "child_chart" })` or equivalent read-state path that returns child mode for natal results when URL asks for it.

- [x] **Step 1: Write failing controller tests**

Add tests to `useChartEngineController.test.ts`:

```ts
it("keeps child chart mode in URL while clearing partner id", () => {
  expect(
    buildChartEngineSearch("?panel=interpretations&partnerClientId=old", {
      mode: "child_chart",
      clientId,
      partnerClientId: "55555555-5555-4555-8555-555555555555",
      calculationId
    })
  ).toBe(`?panel=interpretations&clientId=${clientId}&calculationId=${calculationId}&mode=child_chart`);
});

it("reads child chart mode from URL state", () => {
  expect(readChartEngineUrlState(`?clientId=${clientId}&calculationId=${calculationId}&mode=child_chart`)).toEqual({
    mode: "child_chart",
    clientId,
    calculationId,
    partnerClientId: null
  });
});

it("restores child chart view mode for natal saved result when URL asks for child mode", () => {
  expect(restoreChartEngineViewState(natalResult(), { mode: "child_chart" })).toEqual({
    mode: "child_chart",
    settings: settings()
  });
});
```

If `restoreChartEngineViewState` has no options parameter yet, add it in this task.

- [x] **Step 2: Run failing controller tests**

Run:

```bash
pnpm test apps/astrologer-web/src/pages/chart-engine/useChartEngineController.test.ts
```

Expected: FAIL because URL mode is not read/written and restore always maps natal to `natal`.

- [x] **Step 3: Implement URL mode state**

In `useChartEngineController.ts`:

- parse `mode` in `readChartEngineUrlState`;
- accept only known `ChartEngineMode` values;
- include `mode=child_chart` in `buildChartEngineSearch` when state mode is child;
- continue dropping `partnerClientId` unless mode is `synastry` or `composite`;
- initialize `const [mode, setMode] = useState<ChartEngineMode>(initialUrlState.mode ?? "natal");`;
- when a loaded result is natal and `initialUrlState.mode === "child_chart"`, restore child mode.

Implement a helper:

```ts
function getValidChartEngineMode(value: string | null): ChartEngineMode | undefined {
  if (
    value === "natal" ||
    value === "child_chart" ||
    value === "transit" ||
    value === "progression" ||
    value === "synastry" ||
    value === "composite" ||
    value === "solar_return"
  ) {
    return value;
  }
  return undefined;
}
```

- [x] **Step 4: Preserve child URL state on natal calculation success**

When `mode === "child_chart"` and `onCreateNatalJob` succeeds, `writeChartEngineUrlState` must write `mode: "child_chart"`, not `mode: "natal"`. The calculation request still calls `createNatalChartJob`.

Use the existing `calculationMutation` variables or add a child-specific wrapper so success handlers know the requested view mode.

- [x] **Step 5: Verify controller tests pass**

Run:

```bash
pnpm test apps/astrologer-web/src/pages/chart-engine/useChartEngineController.test.ts
```

Expected: PASS.

## Task 5: API Boundary Test For No New Provider Method

**Files:**

- Modify: `apps/astrologer-web/src/features/charts/api/chartsApi.test.ts`

**Interfaces:**

- Consumes: existing `createNatalChartJob`.
- Produces: explicit regression test that child mode has no API function and uses natal endpoint via controller/component tests.

- [x] **Step 1: Add no-child-endpoint regression test**

Add to `chartsApi.test.ts`:

```ts
it("does not expose a child chart job endpoint because child chart reuses natal calculations", () => {
  expect(Object.keys({ createNatalChartJob })).toEqual(["createNatalChartJob"]);
  expect(createNatalChartJob.name).toBe("createNatalChartJob");
});
```

This test is intentionally small; the endpoint proof lives in controller/component tests that click `Детская` and assert `onCreateNatalJob`.

- [x] **Step 2: Run charts API tests**

Run:

```bash
pnpm test apps/astrologer-web/src/features/charts/api/chartsApi.test.ts
```

Expected: PASS.

## Task 6: Docs Status After Browser Proof

**Files:**

- Modify after runtime evidence: `docs/product/roadmap.md`
- Modify after runtime evidence: `docs/architecture/design-reference-inventory.md`
- Create: `.design-qa/chart-engine-child-chart-2026-07-23/notes.md` only if browser evidence notes are useful for final reporting.

**Interfaces:**

- Consumes browser proof from Task 7.
- Produces docs that mark child chart as a first slice and state that it is natal-backed.

- [x] **Step 1: Leave docs pending until runtime proof**

Do not edit roadmap/inventory before browser proof. The plan requires evidence first.

- [x] **Step 2: After browser proof, update roadmap**

In `docs/product/roadmap.md`, move `child-chart interpretation mode` from the remaining methods sentence into a checked first-slice bullet:

```md
- [x] Chart Engine child chart first slice: owner-scoped CRM client, natal-backed
      calculation result, `/chart-engine` `Детская` view mode, soft
      parent-facing copy, child-specific `child.*` Dictionary anchors, honest
      missing-entry creation affordances and authenticated browser
      calculate/reload evidence. Child-chart PDF/export, AI child text and
      client delivery remain separate future contours.
```

- [x] **Step 3: After browser proof, update design-reference inventory**

In the Chart engine row, replace `composite/child-chart interpretation mode/horary/astrocartography missing` with text that says `horary/astrocartography missing` and add a note that child chart is a natal-backed interpretation mode using `child.*` Dictionary anchors.

- [x] **Step 4: Run docs checks**

Run:

```bash
pnpm docs:check:test && pnpm docs:check
```

Expected: PASS.

## Task 7: Runtime Browser Proof And Final Commit

**Files:**

- Uses: all modified source files.
- May create: `.design-qa/chart-engine-child-chart-2026-07-23/notes.md`.

**Interfaces:**

- Consumes: running `astrologer-web` on `5174`, `astrologer-api` on `3002`, `chart-worker` on `3012`, `chart-engine` on `8012`.
- Produces: authenticated browser evidence that child mode calculates through natal and restores `mode=child_chart`.

- [x] **Step 1: Run full targeted verification**

Run:

```bash
pnpm test apps/astrologer-web/src/features/charts/model/chartInterpretations.test.ts apps/astrologer-web/src/features/charts/components/ChartEnginePage.test.tsx apps/astrologer-web/src/pages/chart-engine/useChartEngineController.test.ts apps/astrologer-web/src/features/charts/api/chartsApi.test.ts
pnpm --filter @elevenhouse/astrologer-web typecheck
git diff --check
```

Expected: all commands PASS.

- [x] **Step 2: Rebuild stale local runtime if source changed**

Run:

```bash
pnpm --filter @elevenhouse/astrologer-api... build
pnpm --filter @elevenhouse/chart-worker... build
```

Expected: both builds PASS. This keeps existing `dist/main.js` runtime aligned if browser proof needs API/worker, even though child mode reuses natal endpoints.

- [x] **Step 3: Check runtime readiness**

Run:

```bash
curl -fsS http://localhost:3002/health
curl -fsS http://localhost:3012/ready
curl -fsS http://localhost:8012/ready
curl -fsS http://localhost:5174/ >/dev/null
```

Expected: all commands exit 0; worker readiness includes `chartEngine.status = "ready"`.

- [x] **Step 4: Browser scenario**

In authenticated Chrome at `http://localhost:5174/chart-engine`:

1. Select a CRM client with complete birth data.
2. Click `Детская`.
3. Click `Рассчитать детскую`.
4. Wait for the chart to show `Актуальная карта` and `Детская карта рассчитана`.
5. Open `Трактовки`.
6. Confirm missing-entry links/search use `child.*` codes.
7. Reload the page.
8. Confirm URL preserves `mode=child_chart`, result restores, console has no app errors and network includes only expected identity/profile/client/calculation reads after reload.

- [x] **Step 5: Update docs with evidence**

Complete Task 6 docs updates with the observed route, calculation id and network summary.

- [x] **Step 6: Final verification**

Run:

```bash
pnpm test apps/astrologer-web/src/features/charts/model/chartInterpretations.test.ts apps/astrologer-web/src/features/charts/components/ChartEnginePage.test.tsx apps/astrologer-web/src/pages/chart-engine/useChartEngineController.test.ts apps/astrologer-web/src/features/charts/api/chartsApi.test.ts
pnpm --filter @elevenhouse/astrologer-web typecheck
pnpm docs:check:test && pnpm docs:check
git diff --check
```

Expected: all commands PASS.

- [x] **Step 7: Commit exact owned paths**

Stage only source/docs/evidence files owned by this plan:

```bash
git add apps/astrologer-web/src/features/charts/components/ChartEnginePage.tsx \
  apps/astrologer-web/src/features/charts/components/ChartEnginePage.test.tsx \
  apps/astrologer-web/src/features/charts/components/ChartTables.tsx \
  apps/astrologer-web/src/features/charts/model/chartInterpretations.ts \
  apps/astrologer-web/src/features/charts/model/chartInterpretations.test.ts \
  apps/astrologer-web/src/pages/chart-engine/useChartEngineController.ts \
  apps/astrologer-web/src/pages/chart-engine/useChartEngineController.test.ts \
  apps/astrologer-web/src/features/charts/api/chartsApi.test.ts \
  docs/product/roadmap.md \
  docs/architecture/design-reference-inventory.md \
  docs/superpowers/plans/2026-07-23-chart-engine-child-chart.md
git diff --cached --check
git commit -m "feat: add child chart mode"
```

Expected: commit succeeds without staging unrelated `.design-qa/*` directories.

## Self-Review

Spec coverage:

- Visible `Детская` mode: Task 2.
- Natal-backed calculation with no new provider method: Tasks 2, 4 and 5.
- `child.*` Dictionary anchors without fallback: Tasks 1 and 3.
- State matrix copy and PDF disabled state: Task 2.
- URL restore preserving view mode separately from result method: Task 4.
- Runtime browser proof: Task 7.
- Docs after evidence: Task 6.

Placeholder scan: no `TBD`, `TODO`, “implement later” or undefined external function names are present.

Type consistency: `child_chart` is the frontend `ChartEngineMode`; `child` is the `ChartInterpretationMode`; persisted calculations remain `method: "natal"`.

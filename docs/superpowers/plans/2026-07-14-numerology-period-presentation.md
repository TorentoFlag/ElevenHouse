# Numerology Period And Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit server-calculated personal-year previews and complete, accessible individual and compatibility presentation modes to the existing Numerology workspace.

**Architecture:** Keep arithmetic in the existing domain/contracts/API path. Add a focused frontend period model for request projection and stale-response protection, wire it through the page controller, and render the typed workspace model through page-specific picker and presentation components. Reuse the design-system `Modal` for focus containment, Escape handling, scroll lock, and focus restoration.

**Tech Stack:** React 19, TypeScript 6, TanStack Query 5, Vitest 4, CSS Modules, ElevenHouse design system, shared contracts.

## Global Constraints

- Work directly in `main`, as explicitly requested by the user.
- Keep one `pythagorean` engine; no method/result versioning or setup modal.
- No client-side numerology arithmetic or fallback period values.
- Year selection is preview-only and never saves, recalculates, or links data.
- Valid years are integers from `1000` through `9999`.
- Explicit previews request `personalYear` and `personalMonths`, never `personalDay`.
- Hidden-period and compatibility previews retain UI selection but send the contract-required `{ kind: "current_year" }` value.
- Compatibility presentation renders both participants, pair number, all `5 + 9 + 8` comparisons, four zones, four count groups, and the conclusion.
- Strength-line values remain raw counts, never 1-10 scores.
- Reuse `@elevenhouse/design-system/components/Modal`; do not implement another focus trap.
- Do not change local service lifecycle without a new explicit user command.
- Every production behavior follows RED-GREEN-REFACTOR.

---

### Task 1: Explicit Period Request Model

**Files:**

- Create: `apps/astrologer-web/src/features/numerology/model/numerologyPeriodModel.ts`
- Create: `apps/astrologer-web/src/features/numerology/model/numerologyPeriodModel.test.ts`
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyFormModel.ts`
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyFormModel.test.ts`

**Interfaces:**

- Produces `NumerologyPeriodSelection`, `parseNumerologyYearDraft`, `toNumerologyPreviewPeriodRequest`, and `createLatestPreviewGuard`.
- Changes `toPreviewNumerologyRequest(state, periodRequest?)` to accept a validated preview-only override while keeping the existing default.

- [ ] **Step 1: Write failing period-model tests**

```ts
it.each(["", "999", "10000", "2026.5", "abcd"])("rejects %s", (draft) => {
  expect(parseNumerologyYearDraft(draft).value).toBeNull();
});

it("requests year and months without a day", () => {
  expect(
    toNumerologyPreviewPeriodRequest("individual", {
      selectedYear: 2027,
      isVisible: true
    })
  ).toEqual({
    kind: "explicit",
    personalYear: { year: 2027 },
    personalMonths: { year: 2027 }
  });
});

it("uses neutral period for compatibility and hidden period", () => {
  expect(
    toNumerologyPreviewPeriodRequest("compatibility", {
      selectedYear: 2027,
      isVisible: true
    })
  ).toEqual({ kind: "current_year" });
  expect(
    toNumerologyPreviewPeriodRequest("individual", {
      selectedYear: 2027,
      isVisible: false
    })
  ).toEqual({ kind: "current_year" });
});

it("invalidates older preview identities", () => {
  const guard = createLatestPreviewGuard();
  const first = guard.begin();
  const second = guard.begin();
  expect(guard.isCurrent(first)).toBe(false);
  expect(guard.isCurrent(second)).toBe(true);
  guard.invalidate();
  expect(guard.isCurrent(second)).toBe(false);
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm test apps/astrologer-web/src/features/numerology/model/numerologyPeriodModel.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the period model**

```ts
export const MIN_NUMEROLOGY_YEAR = 1000;
export const MAX_NUMEROLOGY_YEAR = 9999;

export type NumerologyPeriodSelection = {
  readonly selectedYear: number;
  readonly isVisible: boolean;
};

export function parseNumerologyYearDraft(value: string) {
  if (!/^\d{4}$/.test(value)) {
    return { value: null, error: "Введите год четырьмя цифрами" } as const;
  }
  const year = Number(value);
  if (year < MIN_NUMEROLOGY_YEAR || year > MAX_NUMEROLOGY_YEAR) {
    return { value: null, error: "Год должен быть от 1000 до 9999" } as const;
  }
  return { value: year, error: null } as const;
}

export function toNumerologyPreviewPeriodRequest(mode, selection) {
  if (mode !== "individual" || !selection.isVisible) return { kind: "current_year" };
  return {
    kind: "explicit",
    personalYear: { year: selection.selectedYear },
    personalMonths: { year: selection.selectedYear }
  };
}

export function createLatestPreviewGuard() {
  let latest = 0;
  return {
    begin: () => ++latest,
    invalidate: () => {
      latest += 1;
    },
    isCurrent: (requestId: number) => requestId === latest
  };
}
```

Use exact shared contract types for `mode`, return value, selection, and guard.

- [ ] **Step 4: Run GREEN**

Run the Step 2 command; expect PASS.

- [ ] **Step 5: Write failing preview-override test**

```ts
it("uses explicit preview period without personal day", () => {
  const request = toPreviewNumerologyRequest(validState(), {
    kind: "explicit",
    personalYear: { year: 2027 },
    personalMonths: { year: 2027 }
  });
  expect(request.periodRequest).toEqual({
    kind: "explicit",
    personalYear: { year: 2027 },
    personalMonths: { year: 2027 }
  });
});
```

- [ ] **Step 6: Run RED**

Run: `pnpm test apps/astrologer-web/src/features/numerology/model/numerologyFormModel.test.ts`

Expected: FAIL because the second argument is unsupported.

- [ ] **Step 7: Add the preview override**

```ts
export function toPreviewNumerologyRequest(
  state: NumerologyFormState,
  periodRequest: PreviewNumerologyRequest["periodRequest"] = toPeriodRequest(state.forecastDate)
): PreviewNumerologyRequest {
  const persisted = toCreateNumerologyRequest(state) as unknown as Record<string, unknown>;
  const request = { ...persisted, periodRequest };
  delete request.title;
  return previewNumerologyRequestSchema.parse(request) as PreviewNumerologyRequest;
}
```

- [ ] **Step 8: Verify and commit**

Run both Task 1 test files; expect PASS. Stage only the four Task 1 files and commit `feat: project Numerology period previews`.

---

### Task 2: Year Picker And Guarded Preview Orchestration

**Files:**

- Create: `apps/astrologer-web/src/pages/numerology/NumerologyYearPicker.tsx`
- Create: `apps/astrologer-web/src/pages/numerology/NumerologyYearPicker.module.css`
- Create: `apps/astrologer-web/src/pages/numerology/NumerologyYearPicker.test.tsx`
- Modify: `apps/astrologer-web/src/pages/numerology/useNumerologyPageController.ts`
- Modify: `apps/astrologer-web/src/pages/numerology/NumerologyPageView.tsx`
- Modify: `apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx`
- Modify: `apps/astrologer-web/src/features/numerology/components/NumerologyResultPanel.tsx`
- Modify: `apps/astrologer-web/src/features/numerology/components/YearMonthsPanel.tsx`
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyResultPanelModel.ts`
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyResultPanelModel.test.ts`

**Interfaces:**

- Consumes Task 1 period selection/projection/guard.
- Replaces `isYearMode` with `selectedYear`, `isPeriodVisible`, and `isYearPickerOpen`.
- Produces `onToggleYearPicker`, `onApplyYear`, `onHidePeriod`, and `onRetryPeriod`.

- [ ] **Step 1: Write failing picker markup test**

```tsx
const markup = renderToStaticMarkup(
  <NumerologyYearPicker
    selectedYear={2027}
    isOpen
    isPeriodVisible
    isPreviewPending={false}
    errorMessage={null}
    onToggle={vi.fn()}
    onApply={vi.fn()}
    onHide={vi.fn()}
    onRetry={vi.fn()}
  />
);
expect(markup).toContain("Год · 2027");
expect(markup).toContain('aria-expanded="true"');
expect(markup).toContain('inputmode="numeric"');
expect(markup).toContain("Текущий год");
expect(markup).toContain("Применить");
expect(markup).toContain("Скрыть период");
```

- [ ] **Step 2: Run RED**

Run: `pnpm test apps/astrologer-web/src/pages/numerology/NumerologyYearPicker.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the picker**

Use this public contract:

```ts
export type NumerologyYearPickerProps = {
  readonly selectedYear: number;
  readonly isOpen: boolean;
  readonly isPeriodVisible: boolean;
  readonly isPreviewPending: boolean;
  readonly errorMessage: string | null;
  readonly onToggle: () => void;
  readonly onApply: (year: number) => void;
  readonly onHide: () => void;
  readonly onRetry: () => void;
};
```

Own a string draft locally. Reset it from `selectedYear` only when opening. Add bounded minus/plus, current-year shortcut, input validation, `aria-expanded`, `aria-controls`, error association, retry, apply, and hide. Escape/outside click closes without applying and returns focus to the trigger.

- [ ] **Step 4: Run GREEN**

Run the Step 2 command; expect PASS.

- [ ] **Step 5: Write failing page integration tests**

Update `baseProps()` with the new state/actions. Assert the view passes `selectedYear: 2027` and `isPeriodVisible: true` into `NumerologyYearPicker`; assert compatibility keeps the presentation button and disables/closes the picker.

- [ ] **Step 6: Run RED**

Run: `pnpm test apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx`

Expected: FAIL because the view still renders the old toggle and hides compatibility presentation.

- [ ] **Step 7: Wire guarded controller previews**

Add:

```ts
const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
const [isPeriodVisible, setIsPeriodVisible] = useState(false);
const [isYearPickerOpen, setIsYearPickerOpen] = useState(false);
const [periodErrorMessage, setPeriodErrorMessage] = useState<string | null>(null);
const previewGuardRef = useRef(createLatestPreviewGuard());
```

For every preview, derive the shared `periodRequest`, call `begin()` before `mutateAsync`, and apply success/error only if `isCurrent(id)`. Preserve the previous result while pending/failed. Invalidate pending requests when selecting a saved result. Force server preview instead of selecting a saved calculation whenever explicit period display is active. Compatibility must retain selection but use neutral period. Applying year performs one explicit preview; hiding retains year and removes the period section without persistence.

- [ ] **Step 8: Integrate the picker and period visibility**

Replace the old toolbar toggle with `NumerologyYearPicker`. Pass `isPeriodVisible` to `NumerologyResultPanel`. Keep presentation available in both modes. Present period errors with retry near the picker and use an accessible status announcement.

- [ ] **Step 9: Write RED for retrospective month highlighting**

```ts
const result = buildPersonalMonthItems({
  personalMonths: [{ year: 2025, month: 7, value: 4 }],
  currentYear: 2026,
  currentMonth: 7
});
expect(result.items[0]?.isCurrent).toBe(false);
```

Run: `pnpm test apps/astrologer-web/src/features/numerology/model/numerologyResultPanelModel.test.ts`

Expected: FAIL because only the month is compared.

- [ ] **Step 10: Fix highlighting and verify**

Calculate `isCurrent` as `month.year === input.currentYear && month.month === input.currentMonth`; pass both date parts from `YearMonthsPanel`. Run all Task 1-2 focused tests; expect PASS.

- [ ] **Step 11: Commit**

Stage only Task 2 files and commit `feat: select Numerology preview years`.

---

### Task 3: Complete Presentation Renderers

**Files:**

- Create: `apps/astrologer-web/src/pages/numerology/IndividualNumerologyPresentation.tsx`
- Create: `apps/astrologer-web/src/pages/numerology/CompatibilityNumerologyPresentation.tsx`
- Create: `apps/astrologer-web/src/pages/numerology/NumerologyPresentationDialog.tsx`
- Create: `apps/astrologer-web/src/pages/numerology/NumerologyPresentation.module.css`
- Create: `apps/astrologer-web/src/pages/numerology/NumerologyPresentation.test.tsx`
- Delete: `apps/astrologer-web/src/pages/numerology/NumerologyPresentation.tsx`
- Modify: `apps/astrologer-web/src/pages/numerology/NumerologyPageView.tsx`
- Modify: `apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx`
- Modify: `apps/astrologer-web/src/pages/numerology/NumerologyPage.module.css`

**Interfaces:**

- Produces `NumerologyPresentationDialog({ model, isPeriodVisible, interpretationText, onClose })`.
- Individual renderer consumes the complete individual `NumerologyWorkspaceModel`.
- Compatibility renderer consumes the complete compatibility model without recomputation.

- [ ] **Step 1: Write failing presentation completeness tests**

For an individual typed fixture assert five key labels, `Личный год 2027`, 12 `data-personal-month` items, 9 `data-matrix-cell` items, 8 `data-strength-line` items, and non-empty manual interpretation. Assert period markup is absent when visibility is false.

For a compatibility typed fixture assert exactly 5 `data-key-comparison`, 9 `data-matrix-comparison`, 8 `data-line-comparison`, and 4 `data-compatibility-zone` items, plus both names, pair number, all four count labels, and the server conclusion/explanation.

- [ ] **Step 2: Run RED**

Run: `pnpm test apps/astrologer-web/src/pages/numerology/NumerologyPresentation.test.tsx`

Expected: FAIL because the split renderers/dialog do not exist.

- [ ] **Step 3: Implement individual renderer**

Render semantic participant identity, every `model.keyNumbers` item, optional selected personal year and twelve months, all matrix cells, all strength lines as raw values, and trimmed manual interpretation. Do not slice key numbers or invent meanings.

- [ ] **Step 4: Implement compatibility renderer**

Render participants and their five numbers; pair number/meaning; three comparison sections. Each row shows label, `valueA · valueB`, difference, relation label, and explanation. Render every zone, all count groups, conclusion label/explanation, and optional interpretation.

- [ ] **Step 5: Implement shared dialog with design-system Modal**

```tsx
<Modal
  title={title}
  closeLabel="Закрыть презентацию"
  backdropClassName={styles.backdrop}
  className={styles.dialog}
  contentClassName={styles.content}
  onClose={onClose}
>
  {model.mode === "compatibility" ? (
    <CompatibilityNumerologyPresentation model={model} interpretationText={interpretationText} />
  ) : (
    <IndividualNumerologyPresentation
      model={model}
      isPeriodVisible={isPeriodVisible}
      interpretationText={interpretationText}
    />
  )}
</Modal>
```

Do not add global key/focus code; `Modal` already implements the W3C dialog keyboard contract.

- [ ] **Step 6: Add responsive presentation styles**

Use a full-viewport high-contrast surface, scrollable content, responsive `minmax(0, 1fr)` grids, visible explanations, stable close control, and no horizontal clipping. Remove obsolete presentation rules from `NumerologyPage.module.css`.

- [ ] **Step 7: Integrate and verify GREEN**

Replace the old presentation import. Pass model, visibility, current manual interpretation, and close callback. Run presentation, page-view, and compatibility-workspace tests; expect PASS.

- [ ] **Step 8: Commit**

Stage only Task 3 files and commit `feat: complete Numerology presentations`.

---

### Task 4: Automated Verification And Canonical Status

**Files:**

- Modify: `docs/architecture/design-reference-inventory.md`
- Modify: `docs/superpowers/specs/2026-07-14-numerology-period-presentation-design.md`

- [ ] **Step 1: Run all Numerology frontend tests**

Run: `pnpm test apps/astrologer-web/src/features/numerology apps/astrologer-web/src/pages/numerology`

Expected: every matched test PASS.

- [ ] **Step 2: Run scoped static/build checks**

```bash
pnpm exec eslint apps/astrologer-web/src/features/numerology apps/astrologer-web/src/pages/numerology
pnpm --filter @elevenhouse/astrologer-web typecheck
pnpm --filter @elevenhouse/astrologer-web build
```

Expected: exit 0 for all three.

- [ ] **Step 3: Update status truthfully**

Record exact automated evidence in the inventory and Phase 2 spec. Keep browser evidence pending and lifecycle/AI/PDF explicitly incomplete.

- [ ] **Step 4: Commit**

Run Prettier check and `git diff --check`, then commit only these docs as `docs: record Numerology presentation checks`.

---

### Task 5: Repository And Authorized-Browser Verification

**Files:**

- Modify only Phase 2 evidence docs or regression files justified by a browser defect.

- [x] **Step 1: Run repository gate**

Run: `pnpm verify`

Expected: lint, typechecks, tests, and builds exit 0. Report any unrelated pre-existing failure exactly.

- [x] **Step 2: Diagnose services read-only**

```bash
lsof -nP -iTCP:5174 -sTCP:LISTEN
lsof -nP -iTCP:3002 -sTCP:LISTEN
curl -fsS http://localhost:3002/health
```

Reuse healthy processes. If a required port is absent, stop and report; do not start/restart anything.

- [ ] **Step 3: Verify the existing authorized Chrome tab through Computer Use**

Partial: individual golden values, 2025/2026 server previews, all twelve months,
and hide/retain-year behavior were verified. The remaining scenarios are
recorded in the design evidence because Computer Use stopped returning
renderable Chrome frames.

1. Confirm Golubev's unchanged golden individual values.
2. Apply a retrospective year and verify selected label, personal year, and 12 returned months.
3. Use current-year shortcut and verify a fresh server preview.
4. Rapidly apply two years and confirm only the newest remains current.
5. Hide/reopen the period and confirm the selected year is retained.
6. Verify individual presentation: five keys, matrix, eight raw lines, period, interpretation.
7. Verify Golubev/Koshkina presentation: both people, pair, 5+9+8 comparisons, 4 zones, counts `3/7/7/5`, mixed conclusion.
8. Verify Escape, Tab containment, close button, focus restoration, scrolling, and narrow layout.

- [x] **Step 4: Correct browser defects through TDD**

For every defect: add focused failing regression test, observe RED, apply minimal fix, observe GREEN, rerun the browser step.

- [x] **Step 5: Record evidence and close**

Update the spec/inventory with exact evidence, run Prettier check plus `git diff --check`, commit `docs: confirm Numerology period presentation`, and verify `git status --short` is clean. Final report must separate implemented, verified, partial, deferred, blocked, skipped/residual risk, and untouched foreign changes.

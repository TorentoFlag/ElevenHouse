# Numerology Result Completeness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the deterministic Pythagorean result shown in the existing `/numerology` workspace by fixing method edge rules and rendering every server-provided compatibility comparison, zone, count, and conclusion.

**Architecture:** Keep the existing domain result contract as the source of truth. Add explicit exported compatibility types where needed, map them into a typed frontend read model without arithmetic, and split rendering into focused components inside the existing three-column layout. Cell and row selection use stable selectors that resolve to server explanations.

**Tech Stack:** TypeScript 6, Zod, React 19, CSS Modules, Vitest, Testing Library, Computer Use.

## Global Constraints

- One active `pythagorean` engine; no algorithm or result version history.
- No client-side numerology arithmetic, thresholds, relation derivation, or fallback dates.
- Preserve the existing toolbar and three-column result layout.
- Do not add setup/configuration UI in this phase.
- Selecting clients and toggling compatibility remain non-persisting preview operations.
- Line values remain raw psychomatrix counts and are never normalized to 1-10.
- Use exact server relation codes: `match`, `close`, `different`, `tension`.
- Preserve unrelated user changes and stage only files owned by each task.

---

### Task 1: Lock The Remaining Pythagorean Edge Rules

**Files:**
- Modify: `packages/domain/src/numerology/methods/pythagorean-ru/name-numbers.ts`
- Modify: `packages/domain/src/numerology/methods/pythagorean-ru/name-numbers.test.ts`
- Modify: `packages/domain/src/numerology/methods/pythagorean-ru/psychomatrix.ts`
- Modify: `packages/domain/src/numerology/methods/pythagorean-ru/psychomatrix.test.ts`
- Modify: `docs/superpowers/specs/2026-07-14-pythagorean-ru-correction-design.md`

**Interfaces:**
- Produces: canonical `normalizeCalculationName()` behavior and documented unsigned third working number.
- Consumed by: `pythagoreanRuEngine`; no API signature changes.

- [x] **Step 1: Add failing punctuation-normalization tests**

Add a table test proving that these names have the same expression/soul/personality values:

```ts
const equivalentNames = [
  "Голубев Антон",
  "Голубев. Антон",
  "«Голубев» Антон",
  "\"Голубев\" Антон",
  "Голубев — Антон",
  "Голубев’Антон"
];

expect(equivalentNames.map(calculateNameNumbers)).toEqual(
  equivalentNames.map(() => ({ expression: 6, soul: 6, personality: 9 }))
);
```

- [x] **Step 2: Run the name test and confirm RED**

Run:

```bash
pnpm test packages/domain/src/numerology/methods/pythagorean-ru/name-numbers.test.ts
```

Expected: at least the dot/quote/dash cases fail before normalization is extended.

- [x] **Step 3: Implement explicit ignored separators**

Use one Unicode-aware separator expression containing whitespace, `.`, `-`,
Unicode dashes, straight/curly apostrophes, straight/curly quotes, and
guillemets. Keep unsupported letters/symbols on the existing validation path;
do not silently remove arbitrary punctuation.

- [x] **Step 4: Add the negative-third-number fixture**

Add a fixture whose raw subtraction is negative and assert the method contract:

```ts
expect(calculatePsychomatrix("1000-01-30").workingNumbers).toEqual({
  first: 5,
  second: 5,
  third: 1,
  fourth: 1
});
```

The third value is the unsigned magnitude of `first - 2 * firstBirthDayDigit`;
the minus sign is not included in matrix digits.

- [x] **Step 5: Run focused domain verification**

Run:

```bash
pnpm test packages/domain/src/numerology/methods/pythagorean-ru/name-numbers.test.ts packages/domain/src/numerology/methods/pythagorean-ru/psychomatrix.test.ts packages/domain/src/numerology/methods/pythagorean-ru/engine.test.ts
pnpm --filter @elevenhouse/domain typecheck
```

Expected: all focused tests and domain typecheck pass.

- [x] **Step 6: Document and commit the rule**

Update the edge-fixture section of the correction design with the exact ignored
separator set and unsigned-third-number rule, then commit:

```bash
git add packages/domain/src/numerology/methods/pythagorean-ru/name-numbers.ts packages/domain/src/numerology/methods/pythagorean-ru/name-numbers.test.ts packages/domain/src/numerology/methods/pythagorean-ru/psychomatrix.ts packages/domain/src/numerology/methods/pythagorean-ru/psychomatrix.test.ts docs/superpowers/specs/2026-07-14-pythagorean-ru-correction-design.md
git diff --cached --check
git commit -m "fix: codify Pythagorean input edges"
```

### Task 2: Export The Complete Compatibility Contract Surface

**Files:**
- Modify: `packages/contracts/src/numerology.ts`
- Modify: `packages/contracts/src/numerology.test.ts`

**Interfaces:**
- Produces: exported `NumerologyRelation`, `NumerologyRelationCounts`,
  `NumerologyComparison`, `NumerologyCompatibilityZone`, and
  `NumerologyCompatibilityConclusion` types inferred from existing schemas.
- Consumed by: frontend workspace model and components.

- [x] **Step 1: Add a failing exact-shape contract test**

Parse `compatibilityFixture` and assert:

```ts
expect(result.comparisons.filter(({ block }) => block === "key_numbers")).toHaveLength(5);
expect(result.comparisons.filter(({ block }) => block === "psychomatrix")).toHaveLength(9);
expect(result.comparisons.filter(({ block }) => block === "strength_lines")).toHaveLength(8);
expect(result.zones).toHaveLength(4);
expect(result.counts.total).toEqual({ match: 3, close: 7, different: 7, tension: 5 });
expect(result.conclusion.code).toBe("mixed");
```

- [x] **Step 2: Export schema-derived types without duplicating DTOs**

Export the existing schemas where useful and infer types from them. Do not add
new transport fields and do not recreate the same structures in frontend DTOs.

- [x] **Step 3: Verify and commit contracts**

Run:

```bash
pnpm test packages/contracts/src/numerology.test.ts
pnpm --filter @elevenhouse/contracts typecheck
git add packages/contracts/src/numerology.ts packages/contracts/src/numerology.test.ts
git diff --cached --check
git commit -m "refactor: expose Numerology comparison contracts"
```

Expected: contract tests and typecheck pass with no response-shape change.

### Task 3: Build A Lossless Frontend Compatibility Read Model

**Files:**
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyWorkspaceModel.ts`
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyWorkspaceModel.test.ts`
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyResultPanelModel.ts`
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyResultPanelModel.test.ts`

**Interfaces:**
- Consumes: `PythagoreanCompatibilityResult` and exported comparison types.
- Produces: `NumerologyWorkspaceCompatibility` with participant five-number
  summaries, grouped comparisons, zones, counts, conclusion, and stable selectors.

- [x] **Step 1: Write failing model assertions**

Build the Koshkina/Golubev fixture model and assert:

```ts
expect(model.compatibility?.participants[0]).toMatchObject({
  lifePath: 5,
  expression: 7,
  soul: 9,
  personality: 7,
  birthday: 7
});
expect(model.compatibility?.keyNumberComparisons).toHaveLength(5);
expect(model.compatibility?.matrixComparisons).toHaveLength(9);
expect(model.compatibility?.strengthLineComparisons).toHaveLength(8);
expect(model.compatibility?.zones).toHaveLength(4);
expect(model.compatibility?.counts.total).toEqual({
  match: 3,
  close: 7,
  different: 7,
  tension: 5
});
expect(model.compatibility?.conclusion.code).toBe("mixed");
```

Also assert one exact item retains `difference`, `relation`, and
`explanation`; this prevents future field loss.

- [x] **Step 2: Run frontend model tests and confirm RED**

Run:

```bash
pnpm test apps/astrologer-web/src/features/numerology/model/numerologyWorkspaceModel.test.ts apps/astrologer-web/src/features/numerology/model/numerologyResultPanelModel.test.ts
```

Expected: failures show the current model only exposes three participant
numbers and line value pairs.

- [x] **Step 3: Add the typed read-model structures**

Add focused types:

```ts
type NumerologyWorkspaceCompatibilityComparison = {
  readonly selector: `compatibility:${"key_numbers" | "psychomatrix" | "strength_lines"}:${string}`;
  readonly block: "key_numbers" | "psychomatrix" | "strength_lines";
  readonly code: string;
  readonly label: string;
  readonly valueA: number;
  readonly valueB: number;
  readonly difference: number;
  readonly relation: NumerologyRelation;
  readonly relationLabel: string;
  readonly explanation: string;
};
```

Map every returned comparison exactly once. Label lookup may translate stable
codes, but it must not compute values, differences, relations, zones, counts,
or conclusion.

- [x] **Step 4: Resolve compatibility selectors to detail models**

Extend detail resolution so a selected compatibility comparison renders its
two values, difference, relation label, and exact server explanation. The
default compatibility selector points to the conclusion, not the pair number.

- [x] **Step 5: Verify and commit the model**

Run:

```bash
pnpm test apps/astrologer-web/src/features/numerology/model
pnpm --filter @elevenhouse/astrologer-web typecheck
git add apps/astrologer-web/src/features/numerology/model
git diff --cached --check
git commit -m "fix: preserve complete compatibility results"
```

### Task 4: Render Complete Compatibility Without Redesigning The Page

**Files:**
- Create: `apps/astrologer-web/src/features/numerology/components/CompatibilityParticipants.tsx`
- Create: `apps/astrologer-web/src/features/numerology/components/CompatibilityComparisonList.tsx`
- Create: `apps/astrologer-web/src/features/numerology/components/CompatibilitySummary.tsx`
- Create: `apps/astrologer-web/src/features/numerology/components/CompatibilityWorkspace.test.tsx`
- Modify: `apps/astrologer-web/src/features/numerology/components/CompatibilityWorkspace.tsx`
- Modify: `apps/astrologer-web/src/features/numerology/components/PythagoreanMatrix.tsx`
- Modify: `apps/astrologer-web/src/features/numerology/components/NumerologyResultPanel.tsx`
- Modify: `apps/astrologer-web/src/features/numerology/components/NumerologyComponents.module.css`
- Modify: `apps/astrologer-web/src/features/numerology/components/NumerologyResultPanel.structure.test.ts`

**Interfaces:**
- Consumes: Task 3 `NumerologyWorkspaceCompatibility` and comparison selectors.
- Produces: complete accessible compatibility UI in the existing rail/workspace/detail columns.

- [x] **Step 1: Write failing component tests**

Render the fixture and assert visible sections and accessible labels:

```ts
expect(screen.getByRole("region", { name: "Ключевые числа пары" })).toBeVisible();
expect(screen.getByRole("region", { name: "Сравнение психоматриц" })).toBeVisible();
expect(screen.getByRole("region", { name: "Линии совместимости" })).toBeVisible();
expect(screen.getByRole("region", { name: "Зоны совместимости" })).toBeVisible();
expect(screen.getByText("Итог совместимости")).toBeVisible();
expect(screen.getByText("3 совпадения")).toBeVisible();
expect(screen.getByText("7 близких")).toBeVisible();
expect(screen.getByText("7 различий")).toBeVisible();
expect(screen.getByText("5 напряжений")).toBeVisible();
```

Assert both participant cards show `Путь`, `Выражение`, `Душа`, `Личность`,
and `День рождения`.

- [x] **Step 2: Confirm RED**

Run:

```bash
pnpm test apps/astrologer-web/src/features/numerology/components/CompatibilityWorkspace.test.tsx apps/astrologer-web/src/features/numerology/components/NumerologyResultPanel.structure.test.ts
```

Expected: tests fail because the current component renders only three numbers
and eight raw line pairs.

- [x] **Step 3: Split rendering by responsibility**

- `CompatibilityParticipants` renders five numbers per participant.
- `CompatibilityComparisonList` renders values, difference, relation badge,
  explanation summary, and selection state for one comparison block.
- `CompatibilitySummary` renders four zones, four count groups, and conclusion.
- `CompatibilityWorkspace` only composes the existing three columns.

Do not derive relation labels from numeric thresholds. Translate only the
server relation code through a fixed presentation dictionary.

- [x] **Step 4: Wire matrix cells to comparison selectors**

For compatibility matrices, clicking digit `8` calls
`onSelect("compatibility:psychomatrix:8")`. The right panel must show the same
comparison that appears in the list. Preserve individual matrix selection.

- [x] **Step 5: Add bounded scrolling and readable hierarchy**

Keep the toolbar and column widths. Add internal scrolling to the right detail
column, relation badges with text (not color alone), visible focus states, and
responsive stacking using existing breakpoints. Do not change global shell or
navigation styles.

- [x] **Step 6: Verify component behavior**

Run:

```bash
pnpm test apps/astrologer-web/src/features/numerology/components apps/astrologer-web/src/features/numerology/model
pnpm --filter @elevenhouse/astrologer-web typecheck
pnpm --filter @elevenhouse/astrologer-web build
```

Expected: all component/model tests, typecheck, and build pass.

- [x] **Step 7: Commit the UI slice**

```bash
git add apps/astrologer-web/src/features/numerology/components
git diff --cached --check
git commit -m "feat: show complete Numerology compatibility"
```

### Task 5: Correct Formula Explanations

**Files:**
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyWorkspaceModel.ts`
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyWorkspaceModel.test.ts`
- Modify: `apps/astrologer-web/src/features/numerology/components/DetailPanel.tsx`

**Interfaces:**
- Consumes: selected key/cell/line/comparison selector.
- Produces: formula-specific Russian explanation with no nonexistent settings or period claims.

- [x] **Step 1: Add failing copy assertions**

Assert:

```ts
expect(lifePathDetail.formula).toBe("Сумма всех цифр даты рождения с последующим сведением числа.");
expect(expressionDetail.formula).toBe("Сумма значений всех букв полного имени по таблице Пифагора.");
expect(personalYearDetail.formula).toBe("День и месяц рождения плюс цифры выбранного года.");
expect(lifePathDetail.formula).not.toContain("выбранного периода");
expect(lifePathDetail.formula).not.toContain("настройками метода");
```

- [x] **Step 2: Replace the generic formula fallback**

Create a complete stable-code formula dictionary for key numbers, matrix cells,
strength lines, and compatibility comparisons. Unknown codes return `null` and
do not invent a formula.

- [x] **Step 3: Verify and commit copy**

```bash
pnpm test apps/astrologer-web/src/features/numerology/model/numerologyWorkspaceModel.test.ts
pnpm --filter @elevenhouse/astrologer-web typecheck
git add apps/astrologer-web/src/features/numerology/model/numerologyWorkspaceModel.ts apps/astrologer-web/src/features/numerology/model/numerologyWorkspaceModel.test.ts apps/astrologer-web/src/features/numerology/components/DetailPanel.tsx
git diff --cached --check
git commit -m "fix: explain Numerology formulas accurately"
```

### Task 6: Verify Phase 1 End To End And Synchronize Canonical Docs

**Files:**
- Modify: `docs/architecture/design-reference-inventory.md`
- Modify: `docs/superpowers/specs/2026-07-14-pythagorean-ru-correction-design.md`
- Modify: this plan only to check completed boxes during execution.

**Interfaces:**
- Consumes: Tasks 1-5.
- Produces: browser evidence and current documentation status.

- [x] **Step 1: Run focused verification**

```bash
pnpm test packages/contracts/src/numerology.test.ts packages/domain/src/numerology/methods/pythagorean-ru apps/astrologer-web/src/features/numerology/model apps/astrologer-web/src/features/numerology/components
pnpm --filter @elevenhouse/domain typecheck
pnpm --filter @elevenhouse/contracts typecheck
pnpm --filter @elevenhouse/astrologer-web typecheck
pnpm --filter @elevenhouse/astrologer-web build
```

Expected: all focused tests, typechecks, and frontend build pass.

- [x] **Step 2: Inspect existing local services**

```bash
lsof -nP -iTCP:5174 -sTCP:LISTEN
lsof -nP -iTCP:3002 -sTCP:LISTEN
curl -fsS http://localhost:3002/health
```

Use running services without changing lifecycle. If a required service is
absent, stop and request explicit startup authorization.

- [x] **Step 3: Verify the authorized browser flow with Computer Use**

Verified on 2026-07-14 in the user's existing authorized Chrome tab. The live
flow confirmed the Golubev fixture, the Koshkina compatibility result, all
comparison sections and zones, counts `3/7/7/5`, the `mixed` conclusion, and
the shared digit-8 matrix/comparison selection.

In the existing Chrome profile:

1. Select Golubev and confirm the individual golden fixture.
2. Switch to compatibility with Koshkina.
3. Confirm five key, nine matrix, and eight line comparisons.
4. Confirm four zones and counts `3/7/7/5`.
5. Confirm conclusion `mixed` and its explanation.
6. Click matrix digit `8` and verify the selected comparison detail.
7. Confirm no 1-10 language or normalized line values appear.
8. Capture screenshot and accessibility evidence.

- [x] **Step 4: Update current documentation status**

Mark complete compatibility rendering ready in the design inventory, while
leaving period selection, lifecycle UI, AI, and PDF explicitly incomplete.

- [x] **Step 5: Run the repository completion gate**

```bash
pnpm verify
git diff --check
git status --short
```

Expected: repository verification passes and only intentionally scoped files
remain changed.

- [x] **Step 6: Commit documentation status**

```bash
git add docs/architecture/design-reference-inventory.md docs/superpowers/specs/2026-07-14-pythagorean-ru-correction-design.md docs/superpowers/plans/2026-07-14-numerology-result-completeness.md
git diff --cached --check
git commit -m "docs: record Numerology result completion"
```

## Plan Self-Review

- Scope coverage: audit findings 1-9, 17-20, 23, and the line-scale clarification are covered by Tasks 1-6.
- Deferred by decomposition: year/presentation, lifecycle/manual/title, AI, and PDF are explicitly assigned to later phases in the completion design.
- No frontend arithmetic is introduced.
- The plan preserves the accepted toolbar and three-column visual contract.
- All new types have a single contract or read-model owner.
- Every implementation task has a RED/GREEN verification path and scoped commit.

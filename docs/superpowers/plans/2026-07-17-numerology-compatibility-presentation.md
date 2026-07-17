# Numerology Compatibility Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove raw Numerology compatibility codes from user-facing web, PDF
and AI explanations by routing all three consumers through one deterministic
RU/EN presenter.

**Architecture:** Add `@elevenhouse/numerology-presentation`, a pure workspace
package depending only on `@elevenhouse/contracts`. Keep raw `explanation` in
the saved/result contract for backward compatibility, but make consumer tests
prove that web, PDF and AI build copy from typed fields instead of trusting that
raw string.

**Tech Stack:** TypeScript 6, Zod-derived contract types, Vitest 4, React 19,
Vite 8, NestJS API composition, worker PDF content builder, pnpm workspaces.

## Global Constraints

- Work in the existing shared checkout on `main`; no branch, worktree, stash,
  rebase or checkout.
- Do not start, stop or restart any frontend, API, worker, Docker or database
  process.
- Do not change Numerology formulas, thresholds, codes, counts, checksums or
  persisted-result shape.
- Do not use raw `explanation` as a consumer fallback.
- Support exactly `ru | en` and preserve typed codes next to localized AI copy.
- Preserve current card geometry, expansion behavior and visual tokens.
- Do not commit, push, deploy or mutate external state without new authority.
- Preserve all unowned shared-main changes and re-read every target immediately
  before editing.

---

## Purpose / Big Picture

On `/numerology` in compatibility mode, expanded comparison cards and the detail
panel must say, for example, `Число жизненного пути: 2 и 5. Разница — 3. По
методике это категория «Различие».` instead of exposing `key_numbers` and
`lifePath`. The same deterministic facts must be phrased in the requested
locale in PDFs and in AI prompt context.

## Context and Orientation

- Domain produces structured comparison facts plus a legacy raw explanation in
  `packages/domain/src/numerology/methods/pythagorean-ru/compatibility.ts`.
- Contract types are exported from `packages/contracts/src/numerology.ts`.
- Web maps the result in
  `apps/astrologer-web/src/features/numerology/model/numerologyWorkspaceModel.ts`.
- Current UI locale exists in
  `apps/astrologer-web/src/pages/numerology/useNumerologyPageController.ts`.
- AI context is built in
  `apps/astrologer-api/src/modules/numerology/numerology-ai-context.ts`.
- PDF compatibility rows are built in
  `apps/workers/src/calculation-pdf/numerology-pdf.renderer.ts`.
- Design spec:
  `docs/superpowers/specs/2026-07-17-numerology-compatibility-presentation-design.md`.

## Interfaces and Dependencies

The new package exports:

```ts
export type NumerologyPresentationLocale = "ru" | "en";

export function getNumerologyCompatibilityLabels(
  locale: NumerologyPresentationLocale
): NumerologyCompatibilityLabels;

export function getNumerologyComparisonIndicatorLabel(
  comparison: NumerologyComparison,
  locale: NumerologyPresentationLocale
): string;

export function formatNumerologyComparison(
  comparison: NumerologyComparison,
  locale: NumerologyPresentationLocale
): string;

export function formatNumerologyZone(
  zone: NumerologyCompatibilityZone,
  locale: NumerologyPresentationLocale
): string;

export function formatNumerologyConclusion(
  conclusion: NumerologyCompatibilityConclusion,
  locale: NumerologyPresentationLocale
): string;
```

`NumerologyCompatibilityLabels` exposes readonly `blockLabels`,
`relationLabels`, `zoneLabels`, `conclusionLabels`, `indicatorLabels` and
`lineLabels`. Consumers may use these labels, but formatting remains inside the
package.

## Progress

- [x] 2026-07-17: Root cause researched and verdict accepted.
- [x] 2026-07-17: Written design reviewed and approved by the user.
- [x] 2026-07-17: Task 1 shared presentation package implemented and freshly
  verified.
- [x] 2026-07-17: Task 2 web workspace integration implemented and freshly
  verified.
- [x] 2026-07-17: Task 3 AI and PDF integration implemented and freshly
  verified.
- [ ] 2026-07-17: Task 4 automated verification is current; runtime E2E and
  design-parity acceptance remain blocked by the existing blank Vite browser
  surface documented in the parallel card-expansion work.

## Surprises & Discoveries

- 2026-07-17: PDF already has correct independent RU/EN catalogs; it is the
  best copy baseline but also demonstrates terminology duplication.
- 2026-07-17: Web already knows the active locale in the page controller but
  does not pass it into the workspace model.
- 2026-07-17: Existing result contracts require non-empty explanation strings,
  so deleting the field would become a persisted-data migration rather than a
  presentation fix.

## Decision Log

- 2026-07-17, user + Codex: preserve deterministic formulas and typed codes;
  treat raw explanation as internal/backward-compatible only.
- 2026-07-17, user + Codex: use one package-level RU/EN presenter across web,
  PDF and AI instead of consumer-specific string replacement.
- 2026-07-17, Codex: run the plan inline because current instructions prohibit
  subagent dispatch unless explicitly requested.

---

### Task 1: Shared Numerology Presentation Package

**Files:**

- Create: `packages/numerology-presentation/package.json`
- Create: `packages/numerology-presentation/tsconfig.json`
- Create: `packages/numerology-presentation/tsconfig.build.json`
- Create: `packages/numerology-presentation/src/index.ts`
- Create: `packages/numerology-presentation/src/compatibility.ts`
- Test: `packages/numerology-presentation/src/compatibility.test.ts`
- Modify: `vitest.config.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: `NumerologyComparison`, `NumerologyCompatibilityZone`,
  `NumerologyCompatibilityConclusion`, `NumerologyRelation` from
  `@elevenhouse/contracts`.
- Produces: all signatures in `Interfaces and Dependencies`.

- [ ] **Step 1: Write failing package tests**

Cover canonical RU and EN comparison, zone and conclusion copy; every canonical
label catalog entry; psychomatrix digit labeling; and humanized unknown
snake_case/camelCase labels. Inject a deliberately hostile raw explanation such
as `RAW key_numbers lifePath mixed` and assert no formatter output contains it.

Representative assertions:

```ts
expect(formatNumerologyComparison(comparison, "ru")).toBe(
  "Число жизненного пути: 2 и 5. Разница — 3. По методике это категория «Различие»."
);
expect(formatNumerologyComparison(comparison, "en")).toBe(
  "Life path number: 2 and 5. Difference — 3. The method classifies this as “Different”."
);
expect(formatNumerologyConclusion(conclusion, "ru")).toBe(
  "Совпадения и близкие значения — 10; различия и напряжения — 12. Итог: смешанная совместимость."
);
```

- [ ] **Step 2: Run the test and confirm RED**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/numerology-presentation/src/compatibility.test.ts
```

Expected: FAIL because `./compatibility` does not exist.

- [ ] **Step 3: Implement the pure presenter and package boundary**

Create immutable RU/EN catalogs, one `humanizeCode` helper, canonical indicator
selection by block, and the three formatters. Formatters read only structured
values and never `input.explanation`. Export the public API from `src/index.ts`.

Add the package manifest with `@elevenhouse/contracts: workspace:*`, standard
`build`/`typecheck` scripts and Node16 TypeScript configs matching sibling
packages. Add a Vitest source alias and the package importer/dependency links to
the lockfile.

- [ ] **Step 4: Run package GREEN checks**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/numerology-presentation/src/compatibility.test.ts
pnpm --filter @elevenhouse/numerology-presentation typecheck
pnpm --filter @elevenhouse/numerology-presentation build
```

Expected: all tests pass and TypeScript emits `dist` without errors.

---

### Task 2: Route Web Compatibility Copy Through The Presenter

**Files:**

- Modify: `apps/astrologer-web/package.json`
- Modify: `apps/astrologer-web/tsconfig.json`
- Modify: `apps/astrologer-web/vite.config.ts`
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyWorkspaceModel.ts`
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyWorkspaceModel.test.ts`
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyPageModel.ts`
- Modify: `apps/astrologer-web/src/pages/numerology/NumerologyPageView.tsx`
- Modify: `apps/astrologer-web/src/pages/numerology/useNumerologyPageController.ts`
- Modify: focused affected tests only where signatures change
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: Task 1 presenter API and current `locale` from `useI18n`.
- Produces: `buildNumerologyWorkspaceModel(..., locale = "ru")` and
  `buildNumerologyPageViewModel(..., locale = "ru")` whose compatibility
  labels/explanations are locale-aware.

- [ ] **Step 1: Write failing web model tests**

Change the compatibility fixture raw explanation fields to hostile values.
Assert RU output exactly matches shared copy and excludes `key_numbers`,
`lifePath`, `mixed` and `RAW`. Add an EN model call asserting English labels and
explanation. Preserve assertions for 5 + 9 + 8 comparisons, zones, counts and
conclusion code.

- [ ] **Step 2: Run the web model test and confirm RED**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts apps/astrologer-web/src/features/numerology/model/numerologyWorkspaceModel.test.ts
```

Expected: FAIL because the model still spreads raw explanations and accepts no
locale.

- [ ] **Step 3: Integrate presenter without changing UI geometry**

Import the presenter into the workspace model. Build comparison, zone and
conclusion labels and explanations from structured values. Thread the locale
through page model and page view from the controller's existing `useI18n`
value. Add package/TypeScript/Vite dependencies and aliases. Do not modify
compatibility card CSS or expansion state.

- [ ] **Step 4: Run web GREEN checks**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts \
  apps/astrologer-web/src/features/numerology/model/numerologyWorkspaceModel.test.ts \
  apps/astrologer-web/src/features/numerology/components/CompatibilityWorkspace.test.tsx \
  apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx
pnpm exec eslint \
  apps/astrologer-web/src/features/numerology/model/numerologyWorkspaceModel.ts \
  apps/astrologer-web/src/features/numerology/model/numerologyWorkspaceModel.test.ts \
  apps/astrologer-web/src/features/numerology/model/numerologyPageModel.ts \
  apps/astrologer-web/src/pages/numerology/NumerologyPageView.tsx \
  apps/astrologer-web/src/pages/numerology/useNumerologyPageController.ts
pnpm --filter @elevenhouse/astrologer-web typecheck
pnpm --filter @elevenhouse/astrologer-web build
```

Expected: tests, lint, typecheck and build pass; only the existing documented
chunk-size warning may remain.

---

### Task 3: Route AI And PDF Copy Through The Presenter

**Files:**

- Modify: `apps/astrologer-api/package.json`
- Modify: `apps/astrologer-api/src/modules/numerology/numerology-ai-context.ts`
- Modify: `apps/astrologer-api/src/modules/numerology/numerology-ai-context.test.ts`
- Modify: `apps/workers/package.json`
- Modify: `apps/workers/src/calculation-pdf/numerology-pdf.renderer.ts`
- Modify: `apps/workers/src/calculation-pdf/numerology-pdf.renderer.test.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: Task 1 presenter API and each consumer's already validated `ru | en`.
- Produces: locale-matched deterministic explanation strings while typed AI
  codes and PDF document structure remain unchanged.

- [ ] **Step 1: Write failing AI/PDF consumer tests**

For AI, calculate the canonical result, replace raw explanation strings with
hostile mixed-language values, build RU and EN contexts, and assert formatted
comparison/zone/conclusion explanations plus preserved codes and privacy
exclusions. For PDF content, assert canonical RU/EN comparison and conclusion
sentences and absence of the raw explanation.

- [ ] **Step 2: Run the consumer tests and confirm RED**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts \
  apps/astrologer-api/src/modules/numerology/numerology-ai-context.test.ts \
  apps/workers/src/calculation-pdf/numerology-pdf.renderer.test.ts
```

Expected: AI test fails on raw explanation; PDF terminology-sharing assertions
fail until it imports the presenter.

- [ ] **Step 3: Integrate presenter and remove duplicate compatibility catalogs**

Map AI comparison, zone and conclusion explanations through the presenter while
leaving machine-readable fields intact. In PDF, use shared indicator, block,
relation, zone and conclusion labels/formatters; keep document-only headings,
months, level labels and layout functions local.

- [ ] **Step 4: Run AI/PDF GREEN checks**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts \
  apps/astrologer-api/src/modules/numerology/numerology-ai-context.test.ts \
  apps/workers/src/calculation-pdf/numerology-pdf.renderer.test.ts
pnpm exec eslint \
  apps/astrologer-api/src/modules/numerology/numerology-ai-context.ts \
  apps/astrologer-api/src/modules/numerology/numerology-ai-context.test.ts \
  apps/workers/src/calculation-pdf/numerology-pdf.renderer.ts \
  apps/workers/src/calculation-pdf/numerology-pdf.renderer.test.ts
pnpm --filter @elevenhouse/astrologer-api typecheck
pnpm --filter @elevenhouse/workers typecheck
pnpm --filter @elevenhouse/astrologer-api build
pnpm --filter @elevenhouse/workers build
```

Expected: all checks pass with unchanged AI schema and PDF block structure.

---

### Task 4: Affected Surface, Runtime And Design-Parity Verification

**Files:**

- Update: this plan's `Progress`, `Surprises & Discoveries` and
  `Outcomes & Retrospective`.
- Create only if browser evidence is available:
  `.design-qa/numerology-compatibility-presentation/*`.

**Interfaces:**

- Consumes: Tasks 1–3.
- Produces: fresh automated, runtime, accessibility and visual evidence.

- [ ] **Step 1: Refresh shared-main state and review the whole owned diff**

Run:

```bash
git branch --show-current
git status --short
git diff --cached --name-status
git diff --check
git diff -- \
  packages/numerology-presentation \
  apps/astrologer-web/package.json \
  apps/astrologer-web/tsconfig.json \
  apps/astrologer-web/vite.config.ts \
  apps/astrologer-web/src/features/numerology/model/numerologyWorkspaceModel.ts \
  apps/astrologer-web/src/features/numerology/model/numerologyWorkspaceModel.test.ts \
  apps/astrologer-web/src/features/numerology/model/numerologyPageModel.ts \
  apps/astrologer-web/src/pages/numerology/NumerologyPageView.tsx \
  apps/astrologer-web/src/pages/numerology/useNumerologyPageController.ts \
  apps/astrologer-api/package.json \
  apps/astrologer-api/src/modules/numerology/numerology-ai-context.ts \
  apps/astrologer-api/src/modules/numerology/numerology-ai-context.test.ts \
  apps/workers/package.json \
  apps/workers/src/calculation-pdf/numerology-pdf.renderer.ts \
  apps/workers/src/calculation-pdf/numerology-pdf.renderer.test.ts \
  vitest.config.ts pnpm-lock.yaml \
  docs/superpowers/specs/2026-07-17-numerology-compatibility-presentation-design.md \
  docs/superpowers/plans/2026-07-17-numerology-compatibility-presentation.md
```

Expected: `main`, no accidental staged aggregation, no whitespace errors, and
no unowned semantic changes in the owned diff.

- [ ] **Step 2: Run the affected Numerology suite and package gates**

Run focused package/app tests first, then:

```bash
pnpm test -- --dir packages/numerology-presentation
pnpm test -- --dir apps/astrologer-web/src/features/numerology
pnpm test -- --dir apps/astrologer-api/src/modules/numerology
pnpm test -- --dir apps/workers/src/calculation-pdf
pnpm docs:check:test
pnpm docs:check
pnpm verify
```

If a broad command fails due an exact concurrent unowned path, capture the
failure and run the narrowest complete affected surface; do not edit the
unowned path to force green.

- [ ] **Step 3: Verify the already-running runtime read-only**

Use `lsof`/`curl` only to confirm the current frontend/API availability. Do not
start or restart anything. In the user's existing Chrome tab, open the real
authenticated `/numerology` compatibility result, expand a key-number card and
inspect the conclusion/detail text. Exercise pointer, Enter, Space and focus.
Check RU, switch to EN if the current UI exposes it, inspect console/network and
capture desktop plus affected mobile viewport evidence.

Acceptance:

- no raw canonical compatibility code is visible;
- full audit text is readable when expanded;
- counts and result category match the saved calculation;
- geometry, badge, selected/expanded styling and responsive behavior are
  unchanged;
- no unexpected console error or failed compatibility request appears.

- [ ] **Step 4: Final self-review and plan retrospective**

Re-read all owned files. Check dependency direction, consumer fallbacks,
locale threading, privacy, duplicate catalogs, file size, stale docs and
unrelated edits. Record implemented, verified, partial, deferred, blocked,
skipped and residual risk in `Outcomes & Retrospective` before reporting.

## Validation and Acceptance

The feature is accepted only when package tests prove canonical RU/EN copy,
consumer tests prove hostile raw explanations are ignored, formulas/counts/codes
remain unchanged, and the real expanded card shows clean text without visual
regression. Runtime/design acceptance is blocked—not passed—if the existing
service or Chrome state is unavailable.

## Idempotence and Recovery

All edits are deterministic source changes. Test/build commands are safe to
repeat. Package builds may recreate only their own `dist`. No DB reset,
migration, process lifecycle or external cleanup is required. If a target file
changes concurrently, stop that edit group, re-read the file and its diff, then
adapt the patch to the combined current state.

## Artifacts and Notes

- Design spec:
  `docs/superpowers/specs/2026-07-17-numerology-compatibility-presentation-design.md`
- Implementation plan:
  `docs/superpowers/plans/2026-07-17-numerology-compatibility-presentation.md`
- Runtime evidence target:
  `.design-qa/numerology-compatibility-presentation/`

## Outcomes & Retrospective

The shared RU/EN presenter package is implemented and consumed by the web
workspace model, AI context and Numerology PDF renderer. A fresh commit-time
verification run passed 5 presenter consumer test files / 46 tests, focused
ESLint, package/API/web/workers typechecks and builds, plus both documentation
checks. The tests prove that hostile legacy `explanation` strings are ignored
and that structured facts are rendered through the shared locale-aware copy.

Runtime E2E, keyboard exercise, responsive inspection and screenshot comparison
remain blocked by the existing blank `localhost:5174` browser surface recorded
in the compatibility-card expansion plan. No service lifecycle action was
taken, and automated evidence is not being substituted for visual acceptance.
The historical RED phase was not replayed during commit preparation; only the
current GREEN state was freshly verified.

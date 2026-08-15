# AI-черновик для всех сохранённых методов карт — implementation plan

> **For the implementing agent:** this plan is executed inline in the shared
> `main` checkout. Do not create a branch, worktree, commit, push, or PR unless
> the user explicitly authorizes it. Preserve concurrent/unrelated changes.

## Goal

Make the `AI` panel available for every current saved chart calculation:
adult natal, child natal, transit, progression, synastry, composite, solar,
astrocartography, and horary. Each generation remains a private, editable,
idempotent AI draft bound to the saved calculation checksum and owner. The child
chart has exactly the adult natal lifecycle and eligibility; only its prompt
uses child-appropriate language.

## Constraints and acceptance criteria

- Keep the existing `POST /charts/calculations/:calculationId/ai-draft` route,
  CSRF protection, idempotency scope, ownership check, checksum freshness check,
  persistence model, and draft UI lifecycle.
- A current V2 result for each supported method receives `ai_draft`; legacy and
  malformed/unreproducible calculations never do.
- The tariff check combines global `ai` with the chart-method entitlement:
  `natal`, `forecast`, `synastry`, `solar`, `horar`; composite uses the
  synastry entitlement and astrocartography uses forecast. The pre-controller
  guard must not claim `natal` for every request.
- Remove existing child-card capability restrictions that contradict the product
  rule: child natal has the same permission, publication, delivery, PDF, and
  persistence semantics as adult natal. Its selected prompt is the only
  distinction.
- Render `AI` as the last panel tab. Astrocartography keeps its compact table
  tab set but appends `AI` after `Интерпретации` when eligible.
- Do not add calculation math, a new database migration, or non-natal PDF
  scope. No mock/fallback generation path.
- Verify unit/API/UI behavior plus network-backed browser evidence against the
  existing visual reference before claiming the user-visible scope complete.

## Owned paths

- `packages/domain/src/charts/**`
- `packages/domain/src/platform-billing/**`
- `packages/ai/src/**`
- `apps/astrologer-api/src/modules/charts/**`
- `apps/astrologer-web/src/features/charts/**`
- focused tests alongside those paths
- this plan and the approved design specification

## Task 1 — Make capability and tariff resolution method-aware

**Files:**

- Modify: `packages/domain/src/charts/chart-recalculation.ts`
- Modify: `packages/domain/src/charts/chart-recalculation.test.ts`
- Modify: `packages/domain/src/platform-billing/platform-capability-manifest-registry.ts`
- Modify: `packages/domain/src/platform-billing/platform-capability-manifest-operation.fixture.ts`
- Add or modify focused domain tests for the exported method-entitlement helper

1. Write failing table-driven tests that build current V2 calculations for all
   supported methods and assert `ai_draft` is present; assert V1, legacy,
   invalid mode/method combinations, and stale input remain ineligible.
2. Write failing tests for method-to-plan mapping:

   ```ts
   expect(resolveChartAiDraftTariffCapabilities("transit")).toEqual(["ai", "forecast"]);
   expect(resolveChartAiDraftTariffCapabilities("composite")).toEqual(["ai", "synastry"]);
   expect(resolveChartAiDraftTariffCapabilities("astrocartography")).toEqual(["ai", "forecast"]);
   ```

3. Add one domain-owned helper which accepts a validated chart method and
   returns the global plus resource capability. Reuse the same map in the
   platform capability manifest so the API has no copied switch.
4. Remove the natal-only `ai_draft` addition from
   `deriveChartCalculationCapabilities`; add it only for a reproducible V2
   result whose method is registered for AI. Child natal must pass this rule.
5. Run the focused domain tests and `pnpm exec tsc --noEmit` for the affected
   packages. Inspect the diff before continuing.

## Task 2 — Build validated, method-specific AI prompt profiles

**Files:**

- Add: `packages/ai/src/chart-ai-draft-profile.ts`
- Add: `packages/ai/src/chart-ai-draft-profile.test.ts`
- Add or modify: `packages/ai/src/prompts/chart-interpretation-draft.v2.ts`
- Add or modify: `packages/ai/src/prompts/chart-interpretation-draft.v2.test.ts`
- Modify: `packages/ai/src/index.ts` and any narrow exports

1. First add failing prompt/profile tests for every method. They must verify
   validated parsing of its calculation factors, a method-specific system
   instruction, and a consistent structured editable draft output.
2. Define a discriminated, schema-validated profile registry keyed by chart
   method. It receives only calculation-derived data, not client identity or
   free-form profile data. Each profile supplies:
   - a context projection for the saved result;
   - dictionary-grounding codes where available;
   - method instructions and uncertainty boundaries;
   - the existing safe structured result contract.
3. Implement profiles for adult natal, transit, progression, synastry,
   composite, solar, astrocartography, and horary. Preserve method language:
   transit is a time-window reading, progression a developmental cycle,
   synastry/composite a two-person/relationship analysis, solar a return-year
   reading, astrocartography an angular-line relocation reading, and horary a
   moment-question reading without false certainty.
4. Add the child natal profile last. Reuse adult natal factor extraction and
   every draft lifecycle/output rule; change only the prompt wording to
   supportive, age-appropriate, non-deterministic language. A test must show
   it is not routed to the adult prompt.
5. Retain V1 compatibility for already persisted drafts if necessary, but route
   all new eligible requests through the versioned generic profile. Do not
   silently coerce unsupported input.
6. Run `pnpm exec vitest run packages/ai/src/...` for the new/changed tests.

## Task 3 — Generalize the protected API generation command

**Files:**

- Modify: `apps/astrologer-api/src/modules/charts/charts.controller.ts`
- Modify: `apps/astrologer-api/src/modules/charts/charts.service.ts`
- Modify: `apps/astrologer-api/src/modules/charts/charts.module.ts` only if a
  required entitlement port is not already available
- Modify: `apps/astrologer-api/src/modules/charts/charts.service.test.ts`
- Modify: `apps/astrologer-api/src/modules/charts/charts.e2e.test.ts`
- Modify focused platform-entitlement guard tests if its policy contract changes

1. Before production edits, run GitNexus `impact` for `ChartsService.createAiDraft`,
   the tariff guard/policy function being changed, and the calculation
   capability derivation function. Record callers and stop only on a semantic
   conflict or HIGH/CRITICAL result requiring user warning.
2. Add failing service tests that prove each supported V2 method can generate
   and persist a draft under the matching entitlement, while a missing resource
   entitlement, foreign calculation, old result, failed checksum, or unhandled
   method is rejected before the provider call.
3. Replace `assertAdultNatalInterpretationMode` and
   `assertNatalChartAiCalculation` with one validated resolver: load once,
   authenticate ownership, parse/reconcile the saved result, ensure its method
   matches persisted metadata, resolve the profile, and invoke its prompt.
4. Change the controller-level tariff policy to require only the global `ai`
   capability. After the resource has been loaded, resolve the method-specific
   capability through the canonical domain helper and the existing entitlement
   store. This preserves early global rejection while preventing a universal
   natal requirement.
5. Keep idempotency and draft storage untouched. Store the selected profile
   version/model metadata in the existing draft metadata field if supported;
   do not change the database schema solely for this feature.
6. Extend E2E coverage for an allowed non-natal calculation and a child natal
   calculation, then ensure the old child-denial expectation is removed.
7. Run focused API tests, lint/typecheck for the affected app, and inspect the
   combined diff.

## Task 4 — Expose AI consistently as the final chart panel

**Files:**

- Modify: `apps/astrologer-web/src/features/charts/model/chartEngineCapabilities.ts`
- Modify: `apps/astrologer-web/src/features/charts/model/chartEngineCapabilities.test.ts`
- Modify: `apps/astrologer-web/src/features/charts/components/ChartEngineWorkspace.tsx`
- Modify: `apps/astrologer-web/src/features/charts/components/ChartAiPanel.tsx`
- Modify: `apps/astrologer-web/src/features/charts/components/ChartEnginePage.test.tsx`
- Modify/add narrow component tests for tabs and panel submission

1. Write failing capability tests: each reproducible V2 method exposes
   `canRequestAi`; old/invalid result input does not.
2. Update the client capability parser to follow the server’s V2 method rule,
   with no `child` exception.
3. Make `AI` the last normal panel tab whenever `canRequestAi` is true. For
   astrocartography, keep `Интерпретации` then `AI`; all other current table
   tabs keep their order and append `AI`.
4. Remove the `result.method !== "natal"` client-side disabled branch from
   `ChartAiPanel`. Rendering eligibility remains server-derived; local UI only
   disables for genuine loading/currentness/submission states.
5. Update component/page tests to prove child remains eligible, every named
   calculation mode displays the correct tab order, astrocartography includes
   its final AI tab, and a generated draft/retry/error state remains visible.
6. Run focused web tests plus application typecheck/lint; run formatting only
   on owned files if the repository-wide formatter has pre-existing debt.

## Task 5 — Integrate, inspect, and provide evidence

**Files:** only task-owned test/docs files if a correction is necessary.

1. Re-read all changed files and their current diff to merge safely with shared
   checkout changes. Run `git diff --check` and focused tests across domain,
   AI, API, and web.
2. Start/reuse only local services according to `docs/development/commands.md`.
   Seed or create local calculations for every method under an entitled local
   astrologer account. Do not touch remote/production data.
3. In the user’s existing Chrome session, visit each real chart mode with
   network-backed data. Verify the final tab order, generate/reload/retry one
   draft per method where the local AI provider/config permits, and inspect
   network/console failures. Capture reference and implementation screenshots
   on the required viewport; compare tab placement, panel state, and keyboard
   focus.
4. If a provider or local runtime prerequisite blocks generation, report that
   separately: UI and API test coverage may be verified, but browser generation
   acceptance remains blocked.
5. Run GitNexus `detect_changes` before any future commit decision. This task
   does not authorize staging, commit, push, or PR. Report exact commands,
   results, residual risk, and unrelated concurrent changes.

## Execution order

1. Domain capability + tariff mapping.
2. Adult/non-natal profile registry and prompts.
3. Generalized API command and its authorization.
4. Web capability/tab/panel rendering.
5. Child profile and child end-to-end tests last, with no lifecycle exception.
6. Full focused verification and browser acceptance.

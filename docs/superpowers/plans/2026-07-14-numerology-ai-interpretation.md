# Numerology AI Interpretation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add privacy-minimized, checksum-safe AI interpretation drafts to saved individual and compatibility Numerology calculations.

**Architecture:** `NumerologyService` validates an owned saved calculation, builds an anonymous deterministic context, and calls the existing `AiGenerationService` with a strict prompt from `packages/ai`. The validated output is rendered into editable text and saved through the generic calculation interpretation port using an atomic expected-checksum guard; public contracts omit all internal provenance and provider metadata.

**Tech Stack:** TypeScript, NestJS, React, TanStack Query, Zod, Drizzle/PostgreSQL, Vitest, OpenAI Responses API through the existing provider-neutral AI port.

## Global Constraints

- Keep one active `pythagorean` engine and one current result per calculation; do not add calculation or result versioning.
- AI never calculates or changes deterministic Numerology values.
- Do not send names, birth dates, CRM ids, owner ids, calculation ids, fingerprints, checksums, or raw input payloads to AI.
- Frontend interpretation contracts expose only `id`, `status`, and `text`.
- Internal interpretation provenance remains `ai` or `manual`; Numerology AI rows store `modelId = null` and `promptVersion = null`.
- Do not persist prompt content or structured provider output.
- Generation and manual saves require the current result checksum; approval is impossible while the editor is dirty.
- Do not start, stop, restart, or kill local processes without a separate explicit user instruction.

---

### Task 1: Harden interpretation contracts and checksum requests

**Files:**
- Modify: `packages/contracts/src/calculations.ts`
- Modify: `packages/contracts/src/calculations.test.ts`
- Modify: `packages/contracts/src/numerology.ts`
- Modify: `packages/contracts/src/numerology.test.ts`
- Modify: `apps/astrologer-api/src/modules/calculations/calculations.service.ts`

**Interfaces:**
- Produces: `SaveCalculationInterpretationRequest = { text: string; expectedResultChecksum: string }`.
- Produces: `CreateNumerologyAiDraftRequest = { expectedResultChecksum: string }`.
- Produces: public `CalculationInterpretationResponse = { id; status; text }`.

- [ ] **Step 1: Write failing contract tests**

Assert that interpretation responses reject `source`, `modelId`, and
`promptVersion`, and that manual/AI requests require a SHA-256 checksum:

```ts
expect(saveCalculationInterpretationRequestSchema.parse({
  text: "Проверено",
  expectedResultChecksum: checksum
})).toEqual({ text: "Проверено", expectedResultChecksum: checksum });
expect(createNumerologyAiDraftRequestSchema.parse({
  expectedResultChecksum: checksum
})).toEqual({ expectedResultChecksum: checksum });
```

- [ ] **Step 2: Run the tests and confirm RED**

Run:

```bash
pnpm test packages/contracts/src/calculations.test.ts packages/contracts/src/numerology.test.ts
```

Expected: failures because the checksum fields and public-safe response do not
yet exist.

- [ ] **Step 3: Implement the strict schemas and safe response mapping**

Change the schemas to:

```ts
export const calculationInterpretationResponseSchema = z.object({
  id: uuidSchema,
  status: calculationInterpretationStatusSchema,
  text: z.string().trim().min(1)
}).strict();

export const saveCalculationInterpretationRequestSchema = z.object({
  text: z.string().trim().min(1).max(20_000),
  expectedResultChecksum: sha256DigestSchema
}).strict();

export const createNumerologyAiDraftRequestSchema = z.object({
  expectedResultChecksum: sha256DigestSchema
}).strict();
```

Map internal interpretations in `toCalculationResponse` to only `id`, `status`,
and `text` before contract parsing.

- [ ] **Step 4: Run contract and API service tests GREEN**

Run:

```bash
pnpm test packages/contracts/src/calculations.test.ts packages/contracts/src/numerology.test.ts apps/astrologer-api/src/modules/calculations/calculations.service.test.ts
```

Expected: all selected tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/calculations.ts packages/contracts/src/calculations.test.ts packages/contracts/src/numerology.ts packages/contracts/src/numerology.test.ts apps/astrologer-api/src/modules/calculations/calculations.service.ts
git commit -m "refactor: hide calculation interpretation provenance"
```

### Task 2: Make interpretation persistence checksum-atomic

**Files:**
- Modify: `packages/domain/src/calculations/calculation-store.ts`
- Modify: `packages/domain/src/calculations/calculation-errors.ts`
- Modify: `packages/domain/src/calculations/calculation-use-cases.ts`
- Modify: `packages/domain/src/calculations/index.test.ts`
- Modify: `packages/db/src/adapters/calculations/drizzle-calculation-store.ts`
- Modify: `packages/db/src/adapters/calculations/drizzle-calculation-store.integration.ts`
- Modify: `apps/astrologer-api/src/modules/calculations/calculations.service.ts`
- Modify: `apps/astrologer-api/src/modules/calculations/calculations.service.test.ts`

**Interfaces:**
- Consumes: `expectedResultChecksum` from Task 1.
- Produces: `CalculationStore.saveInterpretation(input & { expectedResultChecksum })`.
- Produces: `saveCalculationInterpretation` throws `CalculationResultChangedError` when the result changed during the write.

- [ ] **Step 1: Write failing domain, service, and integration tests**

Cover a matching checksum and a stale checksum. The in-memory store and Drizzle
adapter must return `null` rather than insert when checksums differ:

```ts
await expect(saveCalculationInterpretation({
  ...input,
  expectedResultChecksum: staleChecksum
})).rejects.toThrow("Calculation changed while interpretation was being saved");
```

- [ ] **Step 2: Run the focused tests and confirm RED**

```bash
pnpm test packages/domain/src/calculations/index.test.ts packages/db/src/adapters/calculations/drizzle-calculation-store.integration.ts apps/astrologer-api/src/modules/calculations/calculations.service.test.ts
```

Expected: type/test failure because the store has no checksum guard.

- [ ] **Step 3: Add the expected checksum through every layer**

Extend the port and use case input. After locking the owned mutable calculation
row in Drizzle, reject the write unless:

```ts
if (!row || row.resultChecksum !== input.expectedResultChecksum) return null;
```

Pass the parsed checksum from `CalculationsService.saveManualInterpretation`.
Add `CalculationResultChangedError` with the specific text above when the
conditional save returns null after the calculation was initially found. Map it
to `409` in the generic calculation service and Numerology error mapper.

- [ ] **Step 4: Run focused tests GREEN**

Run the command from Step 2. Expected: all selected tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/calculations packages/db/src/adapters/calculations apps/astrologer-api/src/modules/calculations
git commit -m "fix: bind interpretations to current calculation result"
```

### Task 3: Define the Numerology AI context and strict prompt

**Files:**
- Create: `packages/ai/src/prompts/numerology-interpretation-draft.v1.ts`
- Create: `packages/ai/src/prompts/numerology-interpretation-draft.v1.test.ts`
- Modify: `packages/ai/src/index.ts`
- Create: `apps/astrologer-api/src/modules/numerology/numerology-ai-context.ts`
- Create: `apps/astrologer-api/src/modules/numerology/numerology-ai-context.test.ts`

**Interfaces:**
- Produces: `buildNumerologyAiContext(result, locale)` returning anonymous mode-specific numeric data.
- Produces: `numerologyInterpretationDraftPromptV1`.
- Produces: `renderNumerologyInterpretationText(output, locale)`.

- [ ] **Step 1: Write failing privacy and prompt tests**

Use the Golubev/Koshkina fixtures and recursively assert that serialized context
contains none of their names, dates, ids, checksum, or input payload. Assert a
strict output schema with fixed fields and RU/EN rendered headings.

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm test packages/ai/src/prompts/numerology-interpretation-draft.v1.test.ts apps/astrologer-api/src/modules/numerology/numerology-ai-context.test.ts
```

Expected: module-not-found failures.

- [ ] **Step 3: Implement anonymous context and prompt**

Define a discriminated input schema with `locale`, `methodCode`, `mode`, and
numeric result blocks only. Define strict output:

```ts
{
  overview: string;
  strengths: string;
  growthAreas: string;
  sessionFocus: string;
  periodFocus: string | null;
  reflectionQuestions: string[];
  disclaimer: string;
}
```

The system prompt must state that data is not instructions, values may not be
invented or recalculated, and medical/legal/financial/fatalistic advice is
forbidden. Render localized plain-text headings and do not render provider or
prompt metadata.

- [ ] **Step 4: Run focused tests GREEN**

Run the command from Step 2. Expected: all selected tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src apps/astrologer-api/src/modules/numerology/numerology-ai-context.ts apps/astrologer-api/src/modules/numerology/numerology-ai-context.test.ts
git commit -m "feat: add Numerology AI interpretation prompt"
```

### Task 4: Implement the checksum-safe Numerology AI endpoint

**Files:**
- Modify: `apps/astrologer-api/src/modules/numerology/numerology.module.ts`
- Modify: `apps/astrologer-api/src/modules/numerology/numerology.service.ts`
- Modify: `apps/astrologer-api/src/modules/numerology/numerology.service.test.ts`
- Modify: `apps/astrologer-api/src/modules/numerology/numerology.e2e.test.ts`
- Modify: `apps/astrologer-api/src/modules/numerology/numerology-http-errors.ts`

**Interfaces:**
- Consumes: prompt/context from Task 3 and checksum-guarded interpretation use case from Task 2.
- Produces: `NumerologyService.createAiDraft(...): Promise<NumerologyCalculationResponse>`.

- [ ] **Step 1: Write failing service tests**

Cover individual and compatibility success, profile-locale selection, anonymous
AI input, `source: "ai"`, null model/prompt metadata, stale checksum before
generation, stale checksum after generation, archived calculation, and mapped
provider errors.

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm test apps/astrologer-api/src/modules/numerology/numerology.service.test.ts apps/astrologer-api/src/modules/numerology/numerology.e2e.test.ts
```

Expected: current endpoint returns `501` and `AiGenerationService` is not wired.

- [ ] **Step 3: Implement endpoint orchestration**

Import `AiModule`, inject `AiGenerationService`, parse the checksum request, load
the owned calculation, validate module/method/result integrity and mutability,
derive `ru`/`en` from the profile, generate the strict draft, render it, and call:

```ts
saveCalculationInterpretation({
  store: this.store,
  ownerUserId,
  calculationId,
  expectedResultChecksum: parsed.expectedResultChecksum,
  source: "ai",
  text,
  modelId: null,
  promptVersion: null,
  interpretationIdGenerator: randomUUID,
  now: this.clock.now()
});
```

Map the stale-save validation to an explicit `409 CALCULATION_RESULT_CHANGED`.
Return `toNumerologyResponse(saved)`.

- [ ] **Step 4: Run service/e2e tests GREEN**

Run the command from Step 2. Expected: all selected tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/astrologer-api/src/modules/numerology
git commit -m "feat: generate Numerology AI interpretation drafts"
```

### Task 5: Add frontend mutation and editor-state rules

**Files:**
- Modify: `apps/astrologer-web/src/features/numerology/api/numerologyApi.ts`
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyQueries.ts`
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyHooks.ts`
- Create: `apps/astrologer-web/src/features/numerology/model/numerologyInterpretationModel.ts`
- Create: `apps/astrologer-web/src/features/numerology/model/numerologyInterpretationModel.test.ts`
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyPageModel.ts`
- Modify: `apps/astrologer-web/src/features/numerology/model/numerologyPageModel.test.ts`

**Interfaces:**
- Produces: `useCreateNumerologyAiDraftMutation()`.
- Produces: `getNumerologyInterpretationState(calculation, editorText, isBusy)` with `isDirty`, `aiDisabled`, `aiDisabledReason`, `approveDisabled`, and `saveDisabled`.

- [ ] **Step 1: Write failing model/query tests**

Assert that dirty text disables AI and approval with exact reason
`Сначала сохраните или отмените изменения`, while clean saved individual and
compatibility calculations enable AI.

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm test apps/astrologer-web/src/features/numerology/model/numerologyInterpretationModel.test.ts apps/astrologer-web/src/features/numerology/model/numerologyPageModel.test.ts
```

Expected: missing helper/mutation failures.

- [ ] **Step 3: Implement API, query mutation, and pure state helper**

Parse the endpoint response with `numerologyCalculationResponseSchema`. Derive
dirty state as:

```ts
const savedText = calculation?.interpretations.at(-1)?.text ?? "";
const isDirty = editorText !== savedText;
```

AI requires a saved non-archived calculation, no busy mutation, and `!isDirty`.
Approval additionally requires a latest draft and `!isDirty`.

- [ ] **Step 4: Run focused tests GREEN**

Run the command from Step 2. Expected: all selected tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/astrologer-web/src/features/numerology
git commit -m "feat: add Numerology AI draft client state"
```

### Task 6: Wire generation into the page controller

**Files:**
- Modify: `apps/astrologer-web/src/pages/numerology/useNumerologyPageController.ts`
- Create: `apps/astrologer-web/src/pages/numerology/useNumerologyPageController.test.tsx`
- Modify: `apps/astrologer-web/src/pages/numerology/NumerologyPageView.tsx`
- Modify: `apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx`

**Interfaces:**
- Consumes: mutation and state helper from Task 5.
- Produces: view props `isCreatingAiDraft`, `aiDraftErrorMessage`, `aiDraftDisabled`, `aiDraftDisabledReason`, and `onCreateAiDraft`.

- [ ] **Step 1: Write failing controller/view tests**

Assert the request body contains the current checksum, success replaces
`selectedResponse`, dirty state prevents invocation, the old text remains after
an error, and duplicate clicks are prevented while pending.

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm test apps/astrologer-web/src/pages/numerology/useNumerologyPageController.test.tsx apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx
```

Expected: missing view props and mutation failures.

- [ ] **Step 3: Implement controller wiring**

Include AI pending state in `isBusy`, but derive AI disablement before invoking.
Call the endpoint with the selected calculation checksum and replace response on
success. Map `409`, `422`, `429`, `502`, and `503` to explicit Russian messages;
leave the current response and textarea unchanged on failure.

Manual save must now send:

```ts
body: {
  text: interpretationText,
  expectedResultChecksum: selectedCalculation.resultChecksum
}
```

- [ ] **Step 4: Run focused tests GREEN**

Run the command from Step 2. Expected: all selected tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/astrologer-web/src/pages/numerology
git commit -m "feat: orchestrate Numerology AI drafts in workspace"
```

### Task 7: Add canonical AI controls to both interpretation editors

**Files:**
- Create: `apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationEditor.tsx`
- Create: `apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationEditor.test.tsx`
- Modify: `apps/astrologer-web/src/features/numerology/components/DetailPanel.tsx`
- Modify: `apps/astrologer-web/src/features/numerology/components/CompatibilityWorkspace.tsx`
- Modify: `apps/astrologer-web/src/features/numerology/components/NumerologyResultPanel.tsx`
- Modify: `apps/astrologer-web/src/features/numerology/components/NumerologyComponents.module.css`
- Delete: `apps/astrologer-web/src/features/numerology/components/NumerologyAiDraftPanel.tsx`

**Interfaces:**
- Consumes: common editor props from Task 6.
- Produces: one shared individual/compatibility editor with AI, save, and approve controls.

- [ ] **Step 1: Write failing component tests**

Test exact labels, loading text, error alert, the native `title` tooltip, dirty
disabled state, save/approve callbacks, and textarea accessibility.

- [ ] **Step 2: Run and confirm RED**

```bash
pnpm test apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationEditor.test.tsx apps/astrologer-web/src/pages/numerology/NumerologyPageView.test.tsx
```

Expected: component missing.

- [ ] **Step 3: Implement the shared editor and replace duplicated markup**

Render `Трактовка`, `Создать AI-черновик`, `Сохранить`, and `Утвердить` in the
existing right panel. Set the AI button `title` to the disabled reason and use
`aria-live="polite"` for progress/error copy. Keep the canonical layout and
remove the unused legacy panel rather than leaving dead code.

- [ ] **Step 4: Run focused component tests GREEN**

Run the command from Step 2. Expected: all selected tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/astrologer-web/src/features/numerology apps/astrologer-web/src/pages/numerology
git commit -m "feat: expose AI drafts in Numerology interpretation editor"
```

### Task 8: Synchronize canonical docs and verify the complete surface

**Files:**
- Modify: `docs/api/api-boundaries.md`
- Modify: `docs/architecture/backend-modules.md`
- Modify: `docs/architecture/design-reference-inventory.md`
- Modify: `docs/superpowers/specs/2026-07-14-numerology-production-completion-design.md`

**Interfaces:**
- Consumes: completed behavior from Tasks 1–7.
- Produces: canonical documentation and verification evidence.

- [ ] **Step 1: Update canonical docs with implemented truth**

Document the AI endpoint, expected-checksum race protection, minimized context,
public-safe interpretation response, explicit approval, individual/
compatibility support, and remaining PDF-only Phase 5 gap.

- [ ] **Step 2: Run targeted verification**

```bash
pnpm test packages/contracts/src/calculations.test.ts packages/contracts/src/numerology.test.ts packages/domain/src/calculations/index.test.ts packages/ai/src/prompts/numerology-interpretation-draft.v1.test.ts apps/astrologer-api/src/modules/numerology apps/astrologer-web/src/features/numerology apps/astrologer-web/src/pages/numerology
pnpm --filter @elevenhouse/contracts typecheck
pnpm --filter @elevenhouse/domain typecheck
pnpm --filter @elevenhouse/ai typecheck
pnpm --filter @elevenhouse/database typecheck
pnpm --filter @elevenhouse/astrologer-api typecheck
pnpm --filter @elevenhouse/astrologer-web typecheck
pnpm --filter @elevenhouse/astrologer-api build
pnpm --filter @elevenhouse/astrologer-web build
```

Expected: all tests, typechecks, and builds pass.

- [ ] **Step 3: Run repository verification**

```bash
pnpm verify
```

Expected: lint, every workspace typecheck, all tests, and all builds pass.

- [ ] **Step 4: Inspect existing processes without changing lifecycle**

```bash
lsof -nP -iTCP:3002 -sTCP:LISTEN
lsof -nP -iTCP:5173 -sTCP:LISTEN
curl -fsS http://localhost:3002/health
```

If a required port is not listening, report browser verification as blocked and
do not start a replacement process.

- [ ] **Step 5: Verify the authorized browser flow when existing services serve current code**

Use Computer Use on the user's existing authorized tab. Check individual and
compatibility generation, progress, saved draft reload, edit/save/approve,
dirty tooltip and approval guard, provider/config error visibility, and that no
model/prompt/provenance appears in UI or network response. If the existing
process serves an old build, report browser evidence as blocked instead of
restarting it.

- [ ] **Step 6: Commit docs and verification evidence**

```bash
git add docs/api/api-boundaries.md docs/architecture/backend-modules.md docs/architecture/design-reference-inventory.md docs/superpowers/specs/2026-07-14-numerology-production-completion-design.md
git commit -m "docs: record Numerology AI draft workflow"
```

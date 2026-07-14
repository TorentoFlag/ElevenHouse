# Numerology AI Interpretation Design

Date: 2026-07-14
Status: approved
Scope: Phase 4 of the Numerology production completion plan

## 1. Goal

Add an explicit AI-assisted interpretation workflow to the existing saved
Pythagorean Numerology workspace. The astrologer can generate an editable draft
for either an individual or compatibility calculation, review and change it,
save the changed text, and explicitly approve the latest saved interpretation.

AI never calculates, replaces, or corrects deterministic Numerology values. The
current `pythagorean` engine and its validated saved result remain the only
arithmetic authority.

## 2. Confirmed Constraints

- Reuse the existing provider-neutral `AiModule`, `AiGenerationService`, OpenAI
  provider, rate limiting, safety identifier, timeout, error mapping, and usage
  recording.
- Reuse the generic calculation interpretation lifecycle. Do not introduce a
  Numerology report table, result history, calculation versioning, or a second
  AI subsystem.
- Generate only for an owned, persisted, non-archived Numerology calculation.
- Support both `individual` and `compatibility` results.
- Require explicit astrologer approval. Generation itself never approves or
  publishes an interpretation.
- Do not overwrite unsaved editor changes.
- Do not expose AI provenance, provider model, prompt identifier, or prompt
  version through frontend contracts.
- Keep only the internal `ai`/`manual` provenance needed for backend audit and
  lifecycle integrity. Numerology interpretation rows store `model_id = null`
  and `prompt_version = null`.
- Never persist prompt content.
- Preserve the canonical toolbar and three-column result workspace.

## 3. Chosen Architecture

### 3.1 Alternatives considered

1. **Feature-specific prompt plus generic interpretations — chosen.** The
   Numerology module prepares a minimized deterministic context, calls the
   existing AI service, renders the validated structured output into editable
   text, and saves it through `Calculations`.
2. **Dedicated Numerology report subsystem.** This would duplicate the generic
   interpretation lifecycle and add storage and API concepts that Phase 4 does
   not need.
3. **Unstructured free-text completion.** This is smaller but gives weaker
   validation, inconsistent sections, and poorer error handling.

The chosen approach keeps provider concerns in `Ai`, deterministic result
ownership in `Numerology`, and interpretation persistence in `Calculations`.

### 3.2 Module wiring

- `NumerologyModule` imports `AiModule`.
- `NumerologyService` orchestrates ownership, checksum validation, context
  minimization, generation, and the calculation interpretation use case.
- The controller remains thin and keeps the existing CSRF-protected route:

  ```text
  POST /numerology/calculations/:calculationId/ai-draft
  ```

- The prompt definition lives in `packages/ai` and contains no persistence or
  calculation logic.
- `packages/domain/calculations` owns checksum-guarded interpretation saving.
- `packages/db` performs the final conditional write against the expected
  current checksum.

## 4. API And Frontend Contract

The request body is strict:

```json
{
  "expectedResultChecksum": "sha256:..."
}
```

The endpoint returns the updated `NumerologyCalculationResponse` so the page can
replace its current server state without a second read.

The public calculation interpretation response is hardened to contain only
frontend-required fields:

- `id`;
- `status`;
- `text`.

It does not expose internal provenance, model id, or prompt version. Domain and
database types retain internal provenance independently of the API response.
No current frontend consumer relies on the removed provenance fields.

## 5. Generation Context And Privacy

The server derives language from the astrologer profile locale and supports
Russian and English without a client-controlled prompt setting.

The AI context contains anonymous roles and already calculated values only.
It never contains:

- participant names;
- birth dates;
- CRM client ids;
- owner ids;
- calculation ids;
- request fingerprints;
- result checksums;
- raw input payloads.

For an individual calculation the context includes key numbers, optional
period values, psychomatrix working numbers and cell counts, and all eight
strength lines. For compatibility it includes the pair number, anonymous
individual numeric results, all server comparisons, four zones, relation
counts, and the deterministic conclusion.

This context is data, not instructions. The prompt explicitly rejects
instructions embedded in data, forbids invented numbers and biographical
claims, and forbids medical, legal, financial, or fatalistic advice.

## 6. Structured Output

The prompt uses strict Structured Outputs with one shared mode-neutral schema:

- `overview`;
- `strengths`;
- `growthAreas`;
- `sessionFocus`;
- `periodFocus`, nullable when no individual period is present;
- `reflectionQuestions`, three to six items;
- `disclaimer`.

The server validates the response again and renders it into localized editable
plain text with stable headings. Only the rendered text is stored in the
calculation interpretation. The structured provider response is not persisted.

The prompt may explain supplied values, but it cannot add, change, or become a
source for key numbers, matrix cells, line counts, comparison relations, zones,
or conclusions.

## 7. Persistence And Concurrency

Generation has two checksum checks:

1. Before calling the provider, the service verifies that
   `expectedResultChecksum` equals the owned saved result checksum.
2. After the provider returns, `saveInterpretation` conditionally saves only if
   the calculation still has that checksum.

If recalculation occurs during generation, the conditional write fails with a
conflict and no stale draft is saved.

The saved generated interpretation has:

- internal source `ai`;
- status `draft`;
- generated editable text;
- `modelId = null`;
- `promptVersion = null`.

Manual saves use the same expected-checksum guard and internal source `manual`.
Approval targets a saved interpretation id; the UI cannot approve unsaved text.
Recalculation continues to clear interpretations atomically as already defined.

## 8. User Interface

The existing interpretation editor remains in the right-hand result panel for
both individual and compatibility modes. It receives a compact AI action rather
than a new modal or separate configuration screen.

Visible behavior:

- The section label becomes `Трактовка` rather than `Ручная трактовка`.
- A `Создать AI-черновик` action appears beside the editor controls.
- While generating, the action shows progress and duplicate submission is
  disabled.
- A successful response replaces the server state and loads the saved draft
  into the existing textarea.
- The user may edit the text, save the edit as a new manual draft, then approve
  the latest saved draft.
- No model, prompt, provider, or persisted provenance label is rendered.

Dirty-state protection is derived by comparing the textarea with the latest
saved interpretation text:

- AI generation is disabled while text is dirty;
- the button tooltip says `Сначала сохраните или отмените изменения`;
- approval is disabled while text is dirty so the visible text cannot be
  confused with the older saved interpretation;
- generation is also disabled for preview-only, missing, archived, or busy
  calculations, with the relevant existing disabled reason.

The presentation overlay may show the current editor text as it does today, but
publication and approval continue to use saved server state only.

## 9. Errors

- Checksum mismatch: `409`, no write, localized message that the calculation
  changed and must be reopened or regenerated.
- Application rate limit: `429` with retry guidance when available.
- AI disabled, provider configuration, authentication, billing, server, or
  timeout failure: `503` with a retryable unavailable message.
- Provider refusal: `422` with a safe input/refusal message.
- Invalid structured response: `502` with a generated-output validation
  message.
- Ownership/not found and malformed request use existing Numerology error
  mapping.

The last valid calculation and editor text remain visible after every AI
failure. Failed or stale generation never creates an interpretation.

## 10. Testing And Evidence

Implementation follows TDD from the narrowest contract outward:

1. Contract tests for the checksum request and public-safe interpretation
   response.
2. Prompt tests for strict input/output schemas, RU/EN rendering, mode handling,
   and absence of PII.
3. Domain and Drizzle tests proving atomic checksum-guarded interpretation
   saving.
4. Numerology service/controller tests for ownership, minimized context,
   internal provenance, null secret metadata, AI error propagation, and the
   recalculation race.
5. Frontend model/component/controller tests for generation, progress, error
   states, dirty tooltip, dirty approval guard, and individual/compatibility
   parity.
6. Relevant package typechecks/builds and then repository `pnpm verify`.
7. Authorized-browser verification on `/numerology` using the existing running
   services only. Process lifecycle is not changed without explicit user
   instruction.

## 11. Acceptance Criteria

- A saved individual or compatibility calculation can produce one editable AI
  interpretation draft through the existing AI platform.
- The request sends only anonymous deterministic result context.
- A draft generated against an old checksum cannot be saved.
- Unsaved text cannot be overwritten or accidentally bypassed during approval.
- AI generation never approves, publishes, or changes deterministic values.
- Frontend/API consumers receive no provenance, model, prompt id, or prompt
  version.
- Database interpretation rows retain only internal `ai`/`manual` provenance;
  Numerology AI rows contain no model or prompt metadata.
- Provider/configuration failures are explicit and leave saved state unchanged.
- Individual and compatibility flows have equivalent generation behavior.

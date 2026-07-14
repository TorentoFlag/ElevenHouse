# Numerology Production Completion Design

Date: 2026-07-14
Status: approved scope; Phases 1-3 implemented; Phase 3 verified automatically
and partially verified in the authorized Chrome session through Computer Use
Scope: production completion of the existing Pythagorean Numerology surface

> This document extends the approved Pythagorean correction design. Formula,
> persistence, module-boundary, and no-version-history decisions from
> `2026-07-14-pythagorean-ru-correction-design.md` remain authoritative. Where
> that document deliberately deferred visible product capabilities, this
> completion design records the user's later instruction to finish the audited
> product scope.

## 1. Goal

Bring `/numerology` from a mathematically correct calculation preview to a
complete production workflow in which an astrologer can understand every
server-calculated value, inspect compatibility conclusions, choose a forecast
period, create and reopen calculations, use manual participants, generate an AI
draft, and export a presentation-quality PDF.

The work preserves the canonical toolbar and three-column workspace. It does
not restore the removed setup modal, algorithm-version history, result-version
history, or client-side arithmetic.

## 2. Confirmed Current State

Phase 1 implementation status as of 2026-07-14:

- The frontend retains and renders the complete server compatibility result:
  five key numbers, nine psychomatrix comparisons, eight strength-line
  comparisons, four zones, relation counts, and the conclusion.
- Participant summaries include all five key numbers, and matrix cells and
  comparison rows share stable typed selectors.
- Formula explanations are specific to the selected number, supported name
  separators are normalized explicitly, and the unsigned third working-number
  rule is covered by tests.
- Focused verification and the full repository `pnpm verify` gate pass.
- Live verification in the user's authorized Chrome tab confirms the Golubev
  individual fixture, the Golubev/Koshkina compatibility fixture, all 22
  comparisons, four zones, counts `3/7/7/5`, the `mixed` conclusion, and the
  shared digit-8 matrix/comparison selector.

Remaining product-completion scope:

- The Golubev and Koshkina golden individual fixtures calculate correctly.
- Their compatibility result calculates all 22 comparisons, four zones,
  relation counts, and a conclusion on the server.
- Current-year values and personal months are server-provided, but the user
  cannot choose another period.
- Preview, persistence, recalculation, interpretation, and AI-draft endpoints
  exist, but the page does not expose the complete lifecycle.
- PDF export has no production endpoint and the toolbar action is disabled.
- The presentation overlay is individual-only, omits forecast and explanatory
  content, and has visible contrast/styling defects.

## 3. Product And Architecture Constraints

- Keep one active `pythagorean` engine and one current result per calculation.
- Do not add method or result versioning.
- All deterministic arithmetic remains in `packages/domain`.
- The browser renders validated server values and never derives compatibility,
  period, matrix, or line results.
- Client selection and view toggles remain side-effect free.
- Persistence, recalculation, interpretation, AI, and export are explicit user
  actions.
- Keep the canonical toolbar and three-column layout. New lifecycle states must
  fit the existing screen and reuse design-system primitives.
- Manual participants never create CRM clients implicitly.
- PDF generation is server-owned and based on a validated saved calculation.
- AI receives a validated saved result and cannot alter deterministic values.
- Russian and English copy must be represented by stable codes, not inferred
  from Russian labels.

## 4. Audited Findings And Disposition

### 4.1 Phase 1: Deterministic Result Completeness

1. Render all five key-number comparisons.
2. Show personality and birthday numbers for both compatibility participants.
3. Render all nine psychomatrix comparisons.
4. Show difference, relation, relation label, and explanation for every
   comparison.
5. Render all eight line comparisons with level and explanation.
6. Render all four compatibility zones.
7. Render key/matrix/line/total relation counts.
8. Render the server conclusion and its explanation.
9. Keep the pair number as one indicator, not the overall verdict.
10. Make compatibility matrix cells and comparison rows select the same typed
    comparison detail.
11. Normalize periods, dots, straight/typographic quotes, guillemets, hyphens,
    apostrophes, and whitespace out of names before letter lookup.
12. Codify the third psychomatrix working number as an unsigned magnitude for
    digit extraction and display; the minus sign is not a matrix digit.
13. Replace generic or inaccurate `Как считается` copy with formula-specific
    server-independent explanatory copy.

The line value remains a raw count. It is not converted to a 1-10 score.

### 4.2 Phase 2: Period And Presentation Completion

Detailed approved design:
`2026-07-14-numerology-period-presentation-design.md`.

1. Add explicit year selection without adding method configuration.
2. Request the selected year from the server and render its returned personal
   year and months.
3. Include personal year/months and selected interpretation in individual
   presentation mode.
4. Add a compatibility presentation using the same complete comparison model.
5. Fix overlay contrast, button styling, responsive overflow, focus trap,
   Escape close, and focus restoration.

### 4.3 Phase 3: Calculation Workspace Lifecycle

1. Expose saved calculations in the existing workspace without restoring the
   setup modal.
2. Provide explicit `Новый расчёт`, open, link, and recalculate actions.
3. Expose calculation title when creating or recalculating.
4. Support manual individual and compatibility participants in a dedicated
   creation state inside the current workspace.
5. Recalculation replaces the current result and invalidates stale
   interpretations/artifacts as already defined by the domain lifecycle.
6. Selecting a CRM client alone continues to create no calculation record.

Implementation evidence as of 2026-07-14:

- The toolbar `Расчёты` disclosure lists active saved records, opens stored
  results without invoking the engine, and contains explicit new,
  recalculation, and archive actions.
- A dedicated inline editor supports manual/CRM individual and compatibility
  participants without restoring the removed setup modal.
- Create, replacement recalculation, and archive reuse the existing owner-scoped
  APIs. Recalculation updates the same record and now propagates an optional
  edited title through service, domain, and Drizzle store boundaries.
- The saved item retains native button semantics inside a separate `listitem`
  wrapper; Chrome Computer Use exposed it as a button after the correction.
- Focused verification covered 92 domain/API/frontend Numerology tests plus
  domain, database, astrologer-api, and astrologer-web typechecks.
- The full `pnpm verify` gate passed: lint, typecheck across 22 packages, all
  351 test files / 1464 tests, and all 22 package builds.
- Authorized-browser evidence covered an explicit manual save, count `0 → 1`,
  stored-result open, prefilled recalculation editor, count remaining `1`,
  compatibility editor with both participant groups, archive confirmation, and
  count `1 → 0` with return to the empty state.
- After rebuilding, the authorized local API lifecycle restart replaced the
  stale static process on port `3002`; `/health` returned `status: ok` from the
  new `node apps/astrologer-api/dist/main.js` process.
- A fresh authorized-browser scenario then created one manual calculation,
  opened its prefilled recalculation editor, changed the title to
  `E2E title after restart`, and kept the active count at `1`. Database evidence
  confirmed that the same calculation id was updated in place, its title and
  `updated_at` changed, and no replacement row or historical version was
  created. The disposable record was archived through the confirmation flow,
  returning the active browser list to `0`.

### 4.4 Phase 4: AI Interpretation

Detailed approved design:
`2026-07-14-numerology-ai-interpretation-design.md`.

1. Expose AI draft creation for saved individual and compatibility results.
2. Show generation progress and explicit provider/configuration errors.
3. Keep AI output as an editable draft requiring astrologer approval.
4. Never use AI text as a source for deterministic numbers or relations.

### 4.5 Phase 5: PDF Export

1. Add an astrologer-api export endpoint for a saved, owner-scoped calculation.
2. Generate the document in a backend export service/worker boundary rather
   than browser print markup.
3. Include participant identity, selected period, key numbers, matrix, lines,
   complete compatibility sections, and approved interpretation when present.
4. Store generated artifacts through the existing Media/Calculations artifact
   boundary and return a short-lived authorized download.
5. Enable the toolbar action only when a saved calculation is exportable.

## 5. Sequencing

The implementation is split because the findings span independent subsystems.

1. **Result completeness:** domain edge rules, typed frontend projection, and
   complete compatibility rendering.
2. **Period and presentation:** selected-year request plus presentation-quality
   views.
3. **Lifecycle:** saved picker, explicit new/manual flow, title, and
   recalculation.
4. **AI:** saved-result draft workflow.
5. **PDF:** backend artifact generation and authorized export.

Each phase must be independently testable and releasable. A later phase cannot
be used to hide incomplete behavior from an earlier phase.

## 6. Phase 1 Data Flow

1. `astrologer-api` returns a validated `PythagoreanCompatibilityResult`.
2. `numerologyWorkspaceModel` maps every server field without arithmetic or
   relation derivation.
3. The page renders:
   - five key-number comparisons;
   - nine matrix comparisons;
   - eight strength-line comparisons;
   - four zones;
   - four count groups;
   - one conclusion.
4. Selecting a matrix cell or comparison row sets a selector such as
   `compatibility:psychomatrix:8`.
5. The right panel resolves that selector to the exact server explanation.

## 7. Error Handling

- Missing or malformed compatibility blocks are contract/integrity errors, not
  empty UI states.
- Preview failures leave the last valid result visible only when clearly marked
  stale; otherwise show the standard page error.
- Unsupported name symbols fail validation with the input field path.
- AI/PDF failures do not modify or invalidate deterministic results.
- Export and AI actions require a saved owner-scoped calculation.

## 8. Verification

- Domain fixtures for Golubev, Koshkina, punctuation normalization, and the
  early-date negative-third-number edge.
- Contract fixtures asserting exactly 5/9/8 comparisons, four zones, counts,
  and conclusion.
- Frontend model tests proving no compatibility fields are discarded.
- Component tests for all sections, selectors, labels, and empty/error states.
- Browser verification in the authorized Chrome tab for individual, year,
  compatibility, presentation, saved lifecycle, AI, and PDF as each phase lands.
- Targeted package checks followed by `pnpm verify` at phase boundaries.

## 9. Acceptance Criteria

- The visible result contains every deterministic field promised by the
  Pythagorean contract.
- Golubev, Koshkina, and their pair still match golden fixtures exactly.
- No line value is presented as a normalized 1-10 assessment.
- The pair conclusion is understandable without manually comparing matrices.
- A selected forecast year is explicit and server-calculated.
- Saved/manual/recalculation workflows are explicit and do not create or modify
  CRM clients implicitly.
- AI and PDF operate only on saved validated results.
- The canonical toolbar and three-column visual structure remain recognizable.

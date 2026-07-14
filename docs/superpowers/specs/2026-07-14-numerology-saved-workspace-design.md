# Numerology Saved Workspace Design

Date: 2026-07-14
Status: approved for implementation
Scope: Phase 3 of `2026-07-14-numerology-production-completion-design.md`

## 1. Goal

Complete the saved-calculation lifecycle inside the existing Numerology screen:
list and open saved calculations, explicitly create manual calculations,
replace a saved result through recalculation, and archive obsolete records.

The canonical toolbar and three-column result remain the primary workspace. No
setup modal, settings page, calculation-version history, method-version UI, or
client-side numerology arithmetic is introduced.

## 2. Existing Backend Boundaries

The implementation reuses the existing owner-scoped operations:

- `GET /calculations?module=numerology` for saved records;
- `POST /numerology/calculations` for explicit creation;
- `POST /numerology/calculations/:id/recalculate` for atomic replacement;
- `POST /calculations/:id/archive` for removal from the active workspace.

Opening a record renders its validated stored `resultData`; it does not invoke
the engine. Recalculation uses the existing domain lifecycle, preserves the
logical record, replaces input/result/checksum/fingerprint atomically, and
invalidates stale interpretations and artifacts. Archive is used instead of
hard deletion because it is the established auditable domain operation.

## 3. Workspace States

The page has three explicit states:

1. **Result** — current preview or saved result in the existing three-column
   workspace.
2. **New calculation** — an inline editor in the central workspace, opened by
   `Новый расчёт`.
3. **Recalculation** — the same editor, prefilled from the selected saved
   record, opened by `Пересчитать`.

The editor never appears as a modal. Cancel returns to the last result without
persisting. A failed create/recalculate keeps the editor and its entered data.

## 4. Saved Calculations

A compact `Расчёты` control is added to the toolbar. Its disclosure contains
active saved calculations ordered by most recently updated, shows title,
participants, mode and update time, marks the current record, and contains the
`Новый расчёт` action. Archived records are excluded from this active list.

Selecting a saved calculation only opens its stored snapshot and rehydrates the
page form. It does not calculate, link, publish, or mutate anything.

## 5. Creation Editor

The editor contains:

- calculation title;
- mode: individual or compatibility;
- participant source per role: CRM client or manual entry;
- CRM client selector when the source is CRM;
- full name and birth date when the source is manual;
- `Рассчитать и сохранить` and `Отмена`.

Birth time and place are not requested because the Pythagorean engine does not
use them. Manual participants do not create CRM clients. The method is fixed to
the current Pythagorean engine; no method configuration is exposed.

`Рассчитать и сохранить` is the only persistence action in the manual editor.
The existing client-selection preview flow remains side-effect free, and its
`Привязать` action keeps the already verified atomic create-and-link behavior.

## 6. Recalculation And Archive

For an active saved result, the toolbar exposes:

- `Пересчитать` — opens the editor with the current title, mode and
  participants; submit calls the replacement endpoint and returns to the new
  stored result;
- `В архив` — opens an explicit confirmation and archives the current record.

Recalculation does not create history or another visible version. If it fails,
the stored result remains unchanged. After archive, the record disappears from
the active list and the next active calculation is opened; if none remain, the
page returns to its empty state.

## 7. Frontend Boundaries

- `numerologySavedWorkspaceModel.ts` owns sorting/filtering, display metadata,
  editor state construction, immutable field updates, and create/recalculate
  request projection.
- `NumerologyCalculationMenu.tsx` owns the saved-calculation disclosure only.
- `NumerologyCalculationEditor.tsx` owns inline creation/recalculation fields
  and accessibility markup only.
- `NumerologyArchiveDialog.tsx` reuses the design-system `Modal` for focus,
  Escape and focus restoration.
- `useNumerologyPageController.ts` orchestrates server mutations and page-state
  transitions; it performs no numerology arithmetic.

## 8. Error And Concurrency Rules

- All controls are disabled while a mutating request is pending.
- Validation errors remain local to the editor and are shown before network
  submission.
- Create, recalculate and archive errors do not discard the last valid result.
- A late preview response is invalidated when the user opens a saved record or
  enters an editor state.
- Archived records cannot be recalculated or selected from the active menu.

## 9. Verification

- Model tests cover active sorting, display metadata, editor construction,
  immutable updates and request projection.
- Query tests cover archive invalidation.
- Component tests cover saved selection, inline manual individual and
  compatibility fields, recalculation, cancellation, confirmation and disabled
  states.
- Controller source/behavior tests cover explicit mutation wiring and absence
  of persistence on selection.
- Browser verification uses the user's existing authorized production tab and
  covers create, reopen, recalculate and archive without changing service
  lifecycle.

## 10. Acceptance Criteria

- Saved calculations are visible and can be opened without recalculation.
- A manual individual or compatibility calculation can be explicitly saved.
- A saved calculation can be replaced through explicit recalculation with no
  history/version UI.
- A saved calculation can be archived after confirmation and disappears from
  the active list.
- Selecting a CRM client alone still creates no database record.
- The canonical result workspace remains intact and all arithmetic stays on the
  server.

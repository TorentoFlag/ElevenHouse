# Numerology Period And Presentation Design

Date: 2026-07-14
Status: approved design; implementation not started
Scope: Phase 2 of Pythagorean Numerology production completion

> This document refines Phase 2 of
> `2026-07-14-numerology-production-completion-design.md`. The existing
> Pythagorean calculation contract and the Phase 1 complete result projection
> remain authoritative. This phase does not add calculation versions, method
> configuration, saved-calculation lifecycle, AI generation, or PDF export.

## 1. Goal

Complete two user-visible capabilities in the existing `/numerology`
workspace:

1. let the astrologer request and inspect a server-calculated personal year and
   its twelve personal months for an explicitly selected calendar year;
2. provide accessible presentation modes that faithfully show the complete
   current individual or compatibility result.

The feature keeps the canonical toolbar and three-column workspace. Choosing a
year is a read-only preview operation and never creates, recalculates, updates,
or links a saved calculation.

## 2. Product Decisions

- Year selection is forecast-period selection, not numerology-method
  configuration.
- The toolbar owns the entry point. The existing year action becomes a compact
  `Год · YYYY` control with an anchored popover.
- Retrospective and future years are supported in the four-digit range
  `1000-9999`.
- Applying a year requests a fresh preview from the server. The frontend does
  not calculate personal year or month values.
- Applying or hiding a period does not save anything.
- The selected year remains available while the user changes clients or
  temporarily enters compatibility mode.
- Compatibility does not have a period calculation in this phase and therefore
  does not send period parameters.
- Presentation can include the current unsaved manual interpretation from the
  workspace. An empty interpretation section is omitted.
- Compatibility presentation is complete rather than summarized: both
  participants, the pair number, all `5 + 9 + 8` comparisons, four zones,
  relation statistics, and the conclusion are included.

## 3. Scope Boundaries

### 3.1 In Scope

- Selected-year UI state and validation.
- Explicit personal-year and personal-month preview requests through the
  existing numerology preview API.
- Rendering the selected personal year and all twelve returned personal
  months.
- A shared presentation shell with individual and compatibility renderers.
- Presentation overlay contrast, responsive overflow, keyboard handling,
  focus containment, Escape close, and focus restoration.
- Unit, controller, component, accessibility, and authorized-browser evidence
  for the new behavior.

### 3.2 Out Of Scope

- Method setup, configuration screens, or restoration of the removed setup
  modal.
- Personal-day selection or day forecasts.
- Saved calculation creation, opening, linking, titling, or recalculation.
- Calculation or result version history.
- AI interpretation generation or approval.
- PDF generation or export.
- New CRM clients or implicit changes to existing CRM links.
- Client-side numerology arithmetic or fallback values.

## 4. Architecture

### 4.1 Existing Boundaries Remain

- `packages/domain` remains the only arithmetic owner.
- Shared contracts continue to validate the explicit period request and the
  returned Pythagorean result.
- `astrologer-api` continues to serve preview requests through the existing
  numerology endpoint.
- `apps/astrologer-web` owns only interaction state, API orchestration, typed
  projection, and rendering.
- No new backend endpoint, database schema, persistence adapter, or calculation
  lifecycle transition is introduced.

### 4.2 Frontend Components

The implementation adds focused components rather than expanding the page or
presentation into a single file:

- `NumerologyYearPicker` owns the anchored popover, draft input, local
  validation, and apply/hide/current-year actions.
- The page controller owns applied year, period visibility, preview request
  orchestration, and stale-response protection.
- The existing result panel renders the personal-year and personal-month data
  returned by the server.
- `NumerologyPresentationDialog` owns the accessible overlay shell, focus
  management, page-scroll lock, and close behavior.
- `IndividualNumerologyPresentation` renders the complete individual model.
- `CompatibilityNumerologyPresentation` renders the complete compatibility
  model.

Presentation components receive the current typed workspace model and manual
interpretation text. They do not fetch, calculate, normalize, or persist data.

## 5. Period State And Data Flow

The controller maintains separate state for:

- `selectedYear`: the last valid applied four-digit year;
- `isPeriodVisible`: whether period data is requested and shown;
- `draftYear`: temporary popover input owned by the picker;
- the identity of the newest preview request.

`draftYear` cannot affect the result before an explicit apply action.

### 5.1 Apply Flow

1. The user opens the year popover from the toolbar.
2. The picker initializes its draft from `selectedYear`, or the current
   calendar year when no year has been applied in this page session.
3. The user types a year, steps it with previous/next controls, or selects the
   current-year shortcut.
4. Local validation accepts only an integer from `1000` through `9999`.
5. `Применить` copies the draft into `selectedYear`, sets
   `isPeriodVisible = true`, closes the popover, and requests a preview.
6. The request includes only `personalYear` and `personalMonths` for the
   selected year. It does not request a personal day.
7. The result panel replaces its period section only with the validated server
   response and renders the returned personal year plus all twelve months.

### 5.2 Client And Mode Changes

- Selecting another individual client while period display is active requests
  a preview for that client and the same explicit year.
- Entering compatibility mode retains `selectedYear` and period visibility in
  controller state but sends no period parameters and shows no period section.
- Returning to individual mode restores the selected year and obtains the
  appropriate individual preview when the current model does not already match
  the selected client and year.
- `Скрыть период` sets `isPeriodVisible = false` without resetting
  `selectedYear`. The period section disappears and subsequent individual
  previews omit period parameters until the period is shown again.
- Client selection, mode switching, apply, and hide remain preview-only and
  have no persistence side effects.

### 5.3 Concurrency

Every preview request is associated with a monotonically increasing request
identity or equivalent cancellation mechanism. Only the newest applicable
request may update the displayed model or error state. A slow response for an
older year or client cannot replace the current result.

While a preview is pending, the last valid result remains visible with a clear
busy state. If the request fails, that result remains visible and is explicitly
treated as the last valid preview; the failure is announced and can be retried.

## 6. Year Picker UI Contract

- The toolbar control displays `Год · YYYY` when a year has been selected and
  retains the existing toolbar styling and placement.
- Activating the control opens an anchored popover containing:
  - previous-year button;
  - four-digit year input;
  - next-year button;
  - `Текущий год` shortcut;
  - `Применить` primary action;
  - `Скрыть период` action when period display is active.
- Previous/next controls never step outside `1000-9999`.
- Invalid draft input has an associated message and disables apply. No network
  request is made.
- `Escape` closes the popover without applying the draft.
- Closing the popover returns focus to the year toolbar control.
- Applying closes the popover and retains predictable focus on the toolbar
  control while the result enters its busy state.

The picker is compact and contextual. It does not create a persistent central
configuration panel or a separate setup state.

## 7. Presentation UI Contract

The existing presentation toolbar action is available when a valid individual
or compatibility workspace model is present. It remains unavailable when
there is no renderable result.

### 7.1 Shared Dialog Shell

- Uses an accessible dialog contract with an accessible name.
- Covers the working surface with a high-contrast background without making
  text or controls blend into the page beneath it.
- Provides a visible, keyboard-operable close button.
- Owns its vertical scrolling so long content never becomes unreachable.
- Prevents background-page scrolling while open and restores the previous
  scroll behavior when closed.
- Moves focus into the dialog on open, keeps Tab and Shift+Tab within the
  dialog, and closes on `Escape`.
- Restores focus to the presentation toolbar action after every close path,
  including `Escape`.
- Adapts grids and comparison layouts for narrow viewports without horizontal
  clipping or inaccessible controls.

### 7.2 Individual Presentation

The individual renderer includes:

1. participant identity;
2. all five key numbers;
3. selected personal year and all twelve personal months when period display
   is active and those values exist in the current server result;
4. the complete psychomatrix;
5. all eight strength lines using raw counts;
6. the current manual interpretation when non-empty.

It must not present strength-line values as normalized 1-10 scores.

### 7.3 Compatibility Presentation

The compatibility renderer includes:

1. both participant identities and their five key numbers;
2. the pair number as one indicator rather than the overall verdict;
3. all five key-number comparisons;
4. all nine psychomatrix comparisons;
5. all eight strength-line comparisons;
6. all four compatibility zones;
7. key, matrix, line, and total relation statistics;
8. the server conclusion and explanation;
9. the current manual interpretation when non-empty.

Every comparison preserves the server-provided participant values, relation,
relation label, difference, level where applicable, and explanation. The
presentation does not reduce the complete model to a score or summary card.

## 8. Errors And Empty States

- Invalid year drafts are local field errors and never reach the server.
- Preview failures do not clear or overwrite the last valid result.
- The error is placed next to the period control/result context, announced
  through the existing accessible status mechanism, and exposes retry.
- Missing or malformed server period data is a contract/integrity error, not a
  reason to invent a current-year fallback in the browser.
- The presentation action is disabled when no valid workspace model exists.
- Optional manual interpretation is omitted when blank; no placeholder prose
  is generated.
- Dialog setup and cleanup must be exception-safe so focus and page scrolling
  are restored even when content changes during the open session.

## 9. Verification Strategy

Implementation follows the repository TDD contract: introduce failing focused
tests first, implement the smallest coherent behavior, then widen evidence.

### 9.1 Model And Request Tests

- Explicit selected year maps to `personalYear` and `personalMonths` request
  fields and never to a personal-day request.
- Hidden period and compatibility previews omit period parameters.
- Returned server values are projected without arithmetic or normalization.

### 9.2 Controller Tests

- Applying a year triggers exactly one applicable preview.
- Invalid drafts trigger none.
- Client changes preserve and re-request the selected year when visible.
- Compatibility mode retains the selection but omits the period request.
- Returning to individual mode restores the relevant period result.
- A stale client/year response cannot replace a newer response.
- Pending and failed previews preserve the last valid model and expose the
  correct busy/error state.

### 9.3 Component And Accessibility Tests

- Picker range limits, stepping, current-year shortcut, apply, hide, retry,
  Escape behavior, and focus restoration.
- Individual presentation completeness, including the selected year, twelve
  months, five key numbers, matrix, eight lines, and optional interpretation.
- Compatibility presentation completeness: exactly `5 + 9 + 8` comparisons,
  four zones, four statistics groups, and the conclusion.
- Dialog role/name, initial focus, Tab containment, Shift+Tab containment,
  Escape close, close-button behavior, background scroll restoration, and
  trigger focus restoration.
- Responsive component states and contrast are checked against the canonical
  Numerology design reference.

### 9.4 Evidence Ladder

1. Focused tests for touched models, controller, picker, result, and
   presentation components.
2. Frontend lint and typecheck for `@elevenhouse/astrologer-web`.
3. Relevant contract/domain tests if request projection changes shared code.
4. Repository `pnpm verify` at the phase boundary.
5. Live flow in the user's already authorized Chrome tab through Computer Use:
   retrospective year, current-year shortcut, rapid year/client changes,
   preview failure preservation where safely reproducible, individual
   presentation, complete compatibility presentation, keyboard close/focus,
   and narrow viewport behavior.

No local service lifecycle is changed for verification without a new explicit
user instruction. Existing healthy processes may be inspected and reused.

## 10. Acceptance Criteria

- The astrologer can select any valid four-digit year and see only
  server-calculated personal-year and twelve-month values for that year.
- Selecting or hiding a year never writes a calculation or changes CRM data.
- Rapid client/year changes cannot surface an obsolete preview as current.
- The chosen year survives client and mode navigation within the current page
  session.
- Individual presentation shows the complete current individual result,
  optional period, and optional manual interpretation.
- Compatibility presentation shows both participants and the complete
  `5 + 9 + 8` comparison model, zones, statistics, and conclusion.
- Both presentation modes are readable, responsive, keyboard-complete, and
  restore focus and page scroll state after closing.
- No client-side numerology arithmetic, method configuration, persistence,
  AI, PDF, or version-history behavior is added in this phase.

## 11. Follow-Up Boundary

After this phase is implemented and verified, Phase 3 may add the explicit
saved-calculation workspace lifecycle. It must build on the read-only period
and presentation behavior defined here without turning year selection or view
toggles into implicit persistence actions.

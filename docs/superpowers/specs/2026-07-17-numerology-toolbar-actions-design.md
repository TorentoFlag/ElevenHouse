# Numerology Toolbar Actions Design

Date: 2026-07-17
Status: approved product and UX design; implementation pending
Scope: responsive action hierarchy in `/numerology` for individual and
compatibility calculations

## 1. Outcome

Keep the selected client and partner readable in the Numerology toolbar by
moving the rare pre-consultation commands `Презентация`, `Привязать` and
`Скачать PDF` into one labeled `Действия` menu.

The participant pair remains a single visual expression, `Клиент + Партнёр`.
When available content width becomes insufficient, the pair moves together to
another toolbar row before either selector collapses to an avatar-only state.

## 2. Product Decision

The astrologer prepares a calculation before a consultation and does not use
the Numerology workspace during the consultation. Presentation, linking and
PDF export are therefore secondary preparation commands rather than persistent
primary toolbar actions.

The following controls remain directly visible because they change the current
calculation context:

- saved `Расчёты` selection;
- `Клиент` and, in compatibility mode, `Партнёр`;
- personal `Год` selection;
- `Совместимость` mode.

No command, calculation state, API behavior or permission rule is removed.

## 3. Current-State Evidence

The production route is `http://localhost:5174/numerology` in
`apps/astrologer-web`. At the inspected 1290 by 768 browser window, the app
sidebar leaves approximately 1070 pixels for the workspace. The toolbar keeps
two participant selectors and five fixed-width controls on one line. Flex
shrink reduces both participant selectors until only their avatars remain,
making the selected client and partner difficult to identify visually.

Relevant sources:

- inventory row: `docs/architecture/design-reference-inventory.md`;
- production composition:
  `apps/astrologer-web/src/pages/numerology/NumerologyPageView.tsx`;
- toolbar layout:
  `apps/astrologer-web/src/pages/numerology/NumerologyPage.module.css`;
- participant selector:
  `apps/astrologer-web/src/features/clients/components/ClientSearchCombobox*`;
- visual reference:
  `ElevenHouseDesign/app/numerology.jsx`, `numerology-data.jsx` and
  `numerology-extra.jsx`;
- reusable menu:
  `packages/design-system/src/components/ActionMenu/`.

The visible deviation from the original reference toolbar is approved by the
user to fix overcrowding while preserving the ElevenHouse visual language.

## 4. Chosen Interaction

### 4.1 Actions trigger

Replace the three standalone action buttons with one text-labeled button:
`Действия` plus the existing menu chevron. Do not use an unlabeled ellipsis;
the text label keeps the command set discoverable in a page toolbar.

The trigger uses the existing toolbar button height, radius, border, type and
focus treatment. It remains in the trailing control group after
`Совместимость`.

### 4.2 Menu contents

The menu contains these commands in the existing visual/action order:

1. `Открыть презентацию` with the `arrowUpRight` icon;
2. `Привязать к клиенту` with the `pin` icon, or the non-action state
   `Привязано к клиенту` with the `check` icon;
3. the current PDF action and state with the `doc` icon, including
   `Скачать PDF`, generation/polling, retry and unavailable states.

Each item reuses the current controller callback and disabled condition. PDF
and link failure reasons must remain understandable after the controls move
into the menu; they cannot be reduced to unexplained disabled rows. Menu item
copy may include a concise reason when the command is unavailable.

Opening or closing the menu never changes the calculation. Selecting an
enabled item closes the menu and invokes exactly one existing command.

### 4.3 Participant pair

`Клиент + Партнёр` is one responsive group:

- both selectors keep a minimum width sufficient for initials, a readable
  name fragment and the chevron;
- the plus sign remains centered between the selectors and never separates
  onto another row;
- names and dates may use the existing ellipsis only after the minimum readable
  width is preserved;
- compatibility mode moves the entire pair to a new toolbar row when the
  toolbar content box, not merely the browser viewport, becomes too narrow;
- individual mode keeps the single client selector in the same participant
  group and follows the same width rule;
- the mobile state keeps the pair full-width and horizontally stable without
  creating a separate mobile workflow.

The responsive condition must account for the expanded or collapsed app
sidebar. A viewport-only breakpoint is insufficient because the current defect
appears when the viewport is wide but the workspace content box is narrow.

## 5. Alternatives Rejected

### Move only the three actions

This is the smallest patch, but it leaves participant readability dependent on
remaining free space and allows the same avatar-only collapse with longer
names, a narrower window or an expanded sidebar.

### Adaptive visible actions

Showing the three commands at wide widths and moving them into overflow only
at narrow widths preserves one-click access, but these actions are confirmed
rare. The changing command location adds layout movement and implementation
complexity without improving the preparation workflow.

### Keep presentation visible

This is appropriate when presentation is a frequent in-session command. The
confirmed workflow uses Numerology before the consultation, so presentation
has no stronger priority than link or PDF export.

## 6. Accessibility Contract

- `Действия` is a real button with an accessible name, `aria-haspopup="menu"`
  and current `aria-expanded` state.
- Enter and Space open the menu. Up/Down move through enabled commands. Escape
  closes it and returns focus to the trigger.
- Each command has an action-oriented text label; icons remain decorative.
- Disabled or state-only rows expose their reason in text and do not appear to
  be silently broken.
- Participant selectors retain their `combobox` names, visible `Клиент` and
  `Партнёр` labels, focus rings and keyboard behavior.
- Responsive reflow preserves DOM reading order: calculation context,
  participants, mode controls, then actions.

## 7. Implementation Boundaries

- `NumerologyPageView.tsx` composes the menu and participant/action groups.
- A focused numerology model may build action-menu items and state copy; JSX
  must not duplicate PDF or linking state transitions.
- `NumerologyPage.module.css` owns toolbar grouping and content-width reflow.
- Reuse `packages/design-system` `ActionMenu`; do not create another popover or
  copy the component into the app.
- Change `ActionMenu` itself only if the approved disabled/status semantics
  cannot be expressed accessibly through its current public API. Any shared
  change requires its own focused tests and affected consumer verification.
- Do not change contracts, API calls, domain transitions, PDF jobs,
  calculation persistence, presentation content or client-selection queries.
- Existing unrelated changes in `useNumerologyPageController.ts` and other
  shared-main paths are unowned and must be preserved.

## 8. Behavioral States

The implementation covers:

- individual saved result;
- compatibility saved result with long client and partner names;
- unsaved preview;
- no linkable CRM participant;
- already linked calculation;
- PDF unavailable, queued/processing, ready and failed/retry states;
- busy mutation state;
- menu closed/open, pointer and keyboard selection;
- expanded and collapsed app sidebar;
- wide desktop, the current 1290 by 768 window and affected mobile width.

## 9. Verification

Behavioral TDD must prove:

- only `Год`, `Совместимость` and `Действия` remain in the trailing toolbar
  group;
- the menu contains the correct enabled, disabled and state-specific commands;
- each enabled item calls its existing callback once;
- presentation, linking and PDF state machines are unchanged;
- keyboard open, navigation, activation, Escape and focus restoration work;
- client and partner stay in one group and do not collapse below the approved
  readable minimum.

Targeted component/model tests run first, followed by the astrologer-web
typecheck and build and every affected design-system test if `ActionMenu`
changes.

Runtime acceptance uses the existing Chrome tab and real network-backed data.
It compares the exact reference and production states, inspects console and
network results, exercises the menu and participant selectors by keyboard, and
captures desktop/current-window/mobile screenshots. Visual acceptance remains
blocked if the required browser surface or services are unavailable.

## 10. Research

Question: How should rare page-level commands behave when a toolbar becomes
too crowded?

Decision affected: whether presentation, linking and PDF export stay visible,
use a single menu, or move adaptively based on width.

Accessed: 2026-07-17

Sources:

- [Carbon menu buttons](https://carbondesignsystem.com/components/menu-buttons/usage/)
  distinguishes a labeled menu button for page-header actions of equal
  importance and recommends keeping a primary action visible only when one is
  materially more important.
- [Apple toolbar guidance](https://developer.apple.com/design/human-interface-guidelines/toolbars?changes=_2)
  recommends deliberate item prioritization and moving less important actions
  to overflow as available width changes.
- [WAI-ARIA menu button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/)
  defines the required button, menu roles, expanded state, focus placement and
  keyboard behavior.

Repository evidence: ElevenHouse already has a tested `ActionMenu` with menu
roles, focus movement, Escape handling and focus restoration. The current
participant selector already owns accessible combobox behavior and
ellipsis-safe text; the missing boundary is a minimum readable group width and
content-aware toolbar reflow.

Inference: because all three commands are rare and used in the same preparation
phase, a stable labeled menu is more predictable than adaptive command
visibility. The participant pair is the higher-priority information and should
receive width before secondary commands.

User decisions: none remaining for this scope.

## 11. Acceptance Criteria

- Client and partner are visually distinguishable at the reproduced current
  window size.
- The participant pair never separates across toolbar rows.
- Presentation, link and PDF are available through one labeled `Действия`
  menu with their current permissions, states and failure behavior.
- Year and compatibility controls remain directly visible.
- No backend, calculation or persistence behavior changes.
- Keyboard, focus, responsive and real-browser evidence satisfies the state
  matrix above.

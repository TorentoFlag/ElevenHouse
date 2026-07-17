# Numerology Interpretation Modal Editor Design

Date: 2026-07-17
Status: approved by the user; implemented with automated evidence, runtime visual acceptance blocked
Scope: `/numerology` AI interpretation reading and editing in `astrologer-web`

## 1. Outcome

Move long-form Numerology interpretation reading and editing out of the narrow
right detail column into a large, focused modal editor. Keep the compact
`AI-разбор портрета` disclosure and AI-generation entry point in the result
panel, add an adjacent expand icon button, and preserve the existing
server-backed draft and approval lifecycle.

The change solves one observed problem: the current `126px`-minimum textarea in
the detail column is too small for reading and editing the multi-paragraph AI
output. It does not change Numerology arithmetic, AI generation, persistence,
approval, publication, PDF, or calculation state.

The user approved this direction on 2026-07-17.

## 2. Relationship To Existing Decisions

This specification supersedes only the editor-placement decision in
`docs/superpowers/specs/2026-07-17-numerology-interpretation-editor-visual-parity-design.md`:

- the compact warm `AI-разбор портрета` disclosure remains the visual contract;
- the textarea and save/approve actions no longer remain inside the narrow
  expanded right-panel block;
- those controls move into an app-owned large modal;
- all existing controller, API, checksum, dirty-state, AI, and approval
  behavior remains authoritative.

The earlier Numerology AI architecture in
`docs/superpowers/specs/2026-07-14-numerology-ai-interpretation-design.md`
continues to define business behavior. This design introduces no ADR conflict
and no backend or contract change.

## 3. Sources Of Truth And Evidence Matrix

### Product behavior

- latest user instruction and approval from 2026-07-17;
- `docs/api/api-boundaries.md` for saved-draft and explicit-approval behavior;
- current controller/model implementation for dirty, disabled, loading, and
  error states.

### Visual contract

- design inventory row: `Numerology` in
  `docs/architecture/design-reference-inventory.md`;
- compact reference state:
  `ElevenHouseDesign/app/numerology-extra.jsx`, `NumAiPanel`;
- reference modal language:
  `ElevenHouseDesign/app/ref-library.jsx`, `RefEditor`;
- production route: `/numerology` in `apps/astrologer-web`;
- production component:
  `apps/astrologer-web/src/features/numerology/components/NumerologyInterpretationEditor.tsx`;
- existing evidence:
  `.design-qa/numerology-interpretation-editor/reference-closed.png`,
  `.design-qa/numerology-interpretation-editor/production-closed.png`, and
  `.design-qa/numerology-interpretation-editor/production-open.png`.

The exact Numerology reference has no long-form modal editor. The user-approved
large modal is therefore an intentional product extension. It must reuse the
measured compact Numerology disclosure and the established ElevenHouse modal
language rather than inventing a new visual system.

### Required implementation evidence

| Surface | State | Role / locale | Desktop | Mobile |
| --- | --- | --- | --- | --- |
| Reference | compact AI disclosure | astrologer / RU | captured and rechecked | responsive source inspected |
| Production | disclosure closed and open | astrologer / RU and EN copy | required | required |
| Production | modal clean draft | astrologer / RU | required | required |
| Production | modal dirty draft | astrologer / RU | required | required |
| Production | AI loading and error | astrologer / reachable locale | required | affected layout check |
| Production | save and approve disabled/enabled | astrologer / RU | required | required |
| Production | keyboard open, trap, close, return | astrologer | required | required where keyboard applies |

The implementation must capture fresh screenshots and measured DOM/computed
styles under `.design-qa/numerology-interpretation-modal-editor/`.

## 4. Approved Interaction Design

### 4.1 Compact disclosure

The disclosure header remains unchanged in purpose and visual language. When
expanded, its body contains one compact action row:

```text
[ Create AI draft ]  [ expand icon ]
```

The localized RU labels are:

- `Создать AI-черновик`;
- expand icon accessible label:
  `Открыть редактор трактовки`.

The English equivalents are:

- `Create AI draft`;
- `Open interpretation editor`.

The expand control uses the shared `IconButton`, medium size (`36px`), and the
`default` variant. It exposes `aria-haspopup="dialog"` and a stable accessible
name without a visual tooltip or `aria-describedby`. The icon is a dedicated
`expand` glyph. `arrowUpRight` is not reused because it conventionally suggests
an external destination rather than an in-context editor.

Activating the expand icon opens the modal without generating new content.
Activating `Создать AI-черновик` opens the modal immediately and then invokes
the existing generation callback. The user therefore sees progress and the
generated result in the surface where review is expected.

### 4.2 Modal shell

The modal uses the shared design-system `Modal` for portal behavior, backdrop,
body scroll lock, dialog semantics, focus containment, Escape handling, close
button, and focus restoration.

Desktop geometry at viewports wider than `640px`:

- width: `min(840px, calc(100vw - 48px))`;
- height: `min(720px, calc(100dvh - 48px))`;
- centered, not fullscreen;
- existing ElevenHouse dark gradient surface, border, radius, shadow, and
  blurred backdrop;
- fixed header and action footer;
- only the editor body scrolls when necessary; no horizontal scrolling.

The visible title is:

- RU: `Трактовка нумерологического портрета`;
- EN: `Numerology portrait interpretation`.

The existing close button remains the only dedicated close action. A redundant
`Отмена`/`Cancel` footer action is not added because closing does not discard
the editor buffer.

### 4.3 Editor body

The body contains one visible label and one textarea:

- RU label: `Текст трактовки`;
- EN label: `Interpretation text`;
- textarea flexes to fill the modal body and never becomes shorter than `360px`
  at a desktop viewport that can accommodate the preferred modal height;
- font size: `16px`;
- line height: `1.6`;
- readable line length target: `70–80` characters;
- browser resizing is disabled because the textarea already fills the bounded
  modal body and manual resizing would break the fixed header/footer contract;
- the textarea receives initial focus when the modal opens.

The modal edits the same controller-owned `interpretationText`. It must not
create a second buffer, copy server data into independent local business state,
or use local storage.

### 4.4 Footer actions

The fixed footer keeps two actions aligned to the right:

- secondary/glass:
  `Сохранить черновик` / `Save draft`;
- primary/brand:
  `Утвердить` / `Approve`.

Renaming `Сохранить` to `Сохранить черновик` makes the existing lifecycle
explicit. Approval still targets only the latest saved interpretation id; it
does not save dirty text, publish to the client, or trigger PDF generation.

Saving keeps the modal open. Approval also keeps the modal open and lets the
server-derived state disable or update the actions. The modal never claims
success before the existing mutation returns.

## 5. State And Data Flow

```text
expand icon
  -> local presentation state opens modal
  -> textarea renders controller-owned interpretationText

AI draft action
  -> opens modal
  -> existing onCreateAiDraft callback
  -> current API/checksum flow
  -> selected server response updates
  -> existing effect updates interpretationText

textarea input
  -> existing onTextChange callback
  -> existing derived dirty state

Save draft
  -> existing onSave callback
  -> checksum-guarded persisted manual draft
  -> modal remains open

Approve
  -> existing onApprove callback
  -> latest saved interpretation id is approved
  -> modal remains open
```

Modal open/closed state is presentation-only and lives inside
`NumerologyInterpretationEditor`. All text, dirty state, availability, and
mutations remain owned by the existing page/controller/model contour.

Closing by the close icon, Escape, or backdrop keeps unsaved text in the
controller buffer. Reopening resumes the same text. No unsaved-change
confirmation is shown because the close action causes no data loss. Navigating
away retains the current application behavior and is outside this scope.

## 6. State Matrix

- **No saved calculation / preview:** existing save, approve, and AI guards
  remain authoritative; the modal must not imply persistence is available.
- **Clean saved draft:** textarea is readable; save is disabled; approve follows
  the current saved-status rule.
- **Dirty text:** save draft is enabled; AI generation and approval remain
  disabled with the existing reason.
- **Generating:** modal is already open; textarea and conflicting actions are
  disabled; localized progress is announced; duplicate generation is blocked.
- **AI error:** modal remains open; the last valid text remains; the existing
  localized error is shown in an associated live region.
- **Saving/approving:** existing global busy/disabled state prevents duplicate
  mutations; content remains visible.
- **Approved:** approval becomes disabled according to server state; a later
  manual edit can be saved as a new draft under the existing lifecycle.
- **Archived:** the interpretation remains readable but mutations retain the
  existing archived guards.
- **Modal close with dirty text:** text is retained in memory and is restored on
  reopen; no mutation occurs.

The same modal supports individual and compatibility calculations.

## 7. Responsive Design

Desktop keeps the compact disclosure inside the existing three-column
Numerology workspace and places the editor above the page in a centered modal.
The workspace grid does not resize when the modal opens.

At `640px` and below:

- modal uses the existing bottom-aligned/inset shell;
- `16px` viewport inset is preserved;
- width is `100%` of the available inset area;
- height is `calc(100dvh - 32px)` without becoming a separate route;
- header and footer remain visible;
- textarea takes the remaining available height;
- software keyboard, safe-area inset, scrolling, wrapping RU/EN labels, and
  `200%` zoom must not produce horizontal scrolling or hide actions.

At viewports `360px` wide and below, footer actions stack vertically at full
available width, with `Сохранить черновик` before `Утвердить` in DOM and visual
order. Wider mobile viewports keep both actions in one row.

## 8. Accessibility Contract

- Expand action is a semantic button with an accessible verb-first name,
  visible focus, and at least the shared `36px` target size. It has no visual
  tooltip or `aria-describedby`.
- Dialog has `role="dialog"`, `aria-modal="true"`, a visible title connected
  through `aria-labelledby`, and a visible close button.
- Initial focus goes to the textarea, not the close button.
- `Tab` and `Shift+Tab` remain inside the dialog.
- `Escape` closes the dialog and focus returns to the trigger that opened it.
  If the AI trigger is temporarily disabled by an in-flight mutation, focus
  returns to the adjacent enabled expand trigger instead.
- Textarea has a persistent visible label; placeholder text is not its label.
- Loading and errors use the existing `aria-live`/alert contract without
  replacing the user's last valid text.
- AI button disabled reasons remain perceivable and are not coupled to the
  expand button's accessible name.
- Focus rings, contrast, target size, text zoom, reduced motion, and keyboard
  order are verified in the real browser.

The current shared `Modal` focuses the first focusable element, which is often
the close button. Add an optional generic
`initialFocusRef?: RefObject<HTMLElement | null>` contract to `Modal` and use it
for this textarea. The default behavior for all existing consumers must remain
unchanged.

## 9. Component And File Boundaries

Expected implementation ownership:

- `NumerologyInterpretationEditor.tsx`:
  compact disclosure, action row, modal open/closed presentation state, and
  wiring of existing callbacks;
- new focused `NumerologyInterpretationModal.tsx`:
  app-owned modal composition, visible label, textarea, progress/error region,
  and save/approve footer;
- focused Numerology modal CSS module:
  large geometry, editor sizing, sticky layout, and responsive treatment;
- Numerology component/model tests:
  observable open/generate/edit/close/save/approve behavior and state matrix;
- `astrologerCopy.ts` and its tests:
  centralized RU/EN strings introduced or changed by this design;
- design-system `Modal` types/component/tests:
  optional initial-focus target with backward-compatible default;
- design-system icon registry and focused icon tests:
  dedicated `expand` glyph;
- the existing design-system `IconButton` is reused directly, without a
  `Tooltip` wrapper.

No page-specific workflow moves into `packages/design-system`. No backend,
contract, domain, DB, AI prompt, or worker file is expected to change.

## 10. Error Handling And Reliability

- Opening or closing the modal performs no network write.
- AI, save, and approval continue through the existing typed mutations and
  checksum guards.
- A stale checksum or recalculation race remains an explicit error; it is not
  hidden by the modal.
- Failed generation, save, or approval leaves the last valid text visible and
  the modal usable for correction or retry when allowed.
- Rapid repeated activation cannot submit duplicate AI/save/approval requests
  because existing busy guards remain in effect.
- Background page content is not interactive while the modal is open.
- No analytics, autosave, new persistence, or browser-only success state is
  introduced.

## 11. Research

Question: Which web interaction best supports reading and editing a long AI
interpretation without turning Numerology into a separate page?

Decision affected: editor surface, modal geometry, focus behavior, textarea
sizing, and action placement.

Accessed: 2026-07-17.

### Sources

- [WAI-ARIA Modal Dialog Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
  — focus containment, Escape, accessible naming, initial focus, close control,
  and focus restoration.
- [WAI-ARIA Button Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/button/)
  — semantic button activation and focus transfer when a button opens a dialog.
- [WAI Accessible Names and Descriptions](https://www.w3.org/WAI/ARIA/apg/practices/names-and-descriptions/)
  — concise function-oriented accessible names for icon-only controls.
- [WCAG 2.2 Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)
  — minimum pointer target and spacing guidance.
- [WCAG 2.2 Visual Presentation](https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation)
  — enhanced readability guidance for line width and text reflow.
- [Carbon Modal Usage](https://carbondesignsystem.com/components/modal/usage/)
  — size selection, fixed modal zones, scroll behavior, focused tasks, and the
  threshold for switching to a full page.
- [Carbon Text Input and Textarea Usage](https://carbondesignsystem.com/components/text-input/usage/)
  — long-form textarea usage, visible labels, sizing, resize, and overflow.
- [Fluent 2 Dialog Usage](https://fluent2.microsoft.design/components/web/react/core/dialog/usage)
  — focused-task dialogs, persistent header/footer, action restraint, focus,
  dismissal, and avoiding nested dialogs.
- [GOV.UK Textarea](https://design-system.service.gov.uk/components/textarea/)
  — textarea height proportional to expected content and persistent labels.

### Findings

- **Sourced fact:** modal dialogs are appropriate for one focused task and must
  contain keyboard focus, support dismissal, and return focus to the trigger.
- **Sourced fact:** larger/complex modal content should use a large modal with
  persistent header/footer and a scrolling body; a full page is preferable only
  when even the large modal cannot contain the task comfortably.
- **Sourced fact:** long-form textareas need a persistent label and dimensions
  proportional to the expected input.
- **Repository evidence:** the current textarea has `min-height: 126px` and
  lives in the narrow right detail column.
- **Repository evidence:** ElevenHouse already has shared `Modal` and
  `IconButton` primitives plus established reference modal styling.
- **Inference:** one large modal is the smallest intervention that materially
  improves reading/editing while preserving calculation context and the
  existing three-column workspace.

### Options

1. **Large centered modal — selected.** Best reading/editing area, clear focus,
   existing primitive reuse, no route or backend change. Cost: modal-specific
   responsive and keyboard QA plus a small shared initial-focus enhancement.
2. **Wide right drawer.** Preserves more background context but competes with
   the current right column/navigation and remains narrow for long text.
3. **Inline auto-growing textarea.** Lowest implementation cost but expands the
   result column vertically, does not solve width, and degrades the canonical
   three-column workspace.

### Recommendation

Use the large centered modal with one textarea, fixed footer actions, explicit
`Save draft` copy, and the existing compact disclosure as the entry point. Use
the current shared modal behavior and production state rather than introducing
a new overlay system or editor persistence model.

### Rejected alternatives

- Drawer: insufficient reading width and visual competition with the workspace.
- Inline expansion: preserves the original constraint and distorts the page.
- Dedicated route or true fullscreen: unnecessary navigation/context loss for
  a single-field editing task.
- Rich-text editor: no product requirement for formatting and a materially
  larger interaction/data surface.

### User decisions

- The user approved the large, non-fullscreen modal direction on 2026-07-17.
- No unresolved product or architecture decision remains before planning.

## 12. Testing And Acceptance Evidence

Implementation follows behavioral TDD:

1. RED component tests for the compact action row, icon-button semantics,
   modal open/close, visible textarea label, localized copy, and absence of the
   inline textarea.
2. RED design-system tests for optional initial focus and the `expand` icon.
3. GREEN implementation with no controller/API behavior change.
4. Affected Numerology component, view, controller, interpretation-state, and
   individual/compatibility tests.
5. Design-system Modal/IconButton/icon registry tests and package export
   checks.
6. Targeted ESLint, both affected package typechecks/builds, `git diff --check`,
   then the repository gate appropriate to the combined surface.
7. Real network-backed browser verification in the existing Chrome session:
   RU/EN copy, clean/dirty, AI loading/error, save, approve, close/reopen,
   keyboard trap/Escape/focus return, desktop/mobile, zoom, console, and network.
8. Reference/production screenshots and computed-style measurements in the
   task-specific `.design-qa` directory.

No application, API, worker, database, Docker, or browser process is started,
stopped, or restarted without direct authority. If the required existing
runtime or browser surface is unavailable, visual/Runtime E2E acceptance is
reported as blocked rather than replaced with component-test claims.

## 13. Scope

### In scope

- compact AI action row and expand trigger;
- large app-owned interpretation modal;
- same-buffer editing and close/reopen retention;
- `Сохранить черновик` / `Save draft` copy;
- RU/EN copy for changed/new controls;
- optional shared Modal initial-focus target;
- dedicated shared expand icon;
- focused behavior, accessibility, responsive, and visual evidence;
- minimal documentation/inventory update required to describe implemented
  current state.

### Out of scope

- AI prompt/output changes;
- autosave or draft recovery across navigation/reload;
- rich-text formatting, markdown, version comparison, or comments;
- calculation, checksum, interpretation approval, publication, PDF, API,
  domain, DB, worker, or consent changes;
- redesign of the Numerology grid/detail panel;
- unrelated design-system refactoring;
- deploy, process lifecycle, commit, push, or PR without separate authority.

## 14. Acceptance Criteria

- The narrow right-panel block no longer contains the editable textarea or
  save/approve buttons.
- The expanded compact block shows AI generation plus an adjacent accessible
  expand icon button.
- Both triggers open the same large editor; AI generation starts only from the
  AI action.
- Desktop editor is large but not fullscreen; mobile uses the available inset
  viewport without hiding actions behind the software keyboard.
- The modal has a visible label, readable type and line length, a large textarea,
  fixed header/footer, and no horizontal scrolling.
- The textarea receives initial focus; focus is trapped and returned correctly;
  Escape and close button work; visible focus and touch targets pass.
- Closing and reopening retains unsaved text without writing to the server.
- `Сохранить черновик` persists through the existing checksum-safe draft flow;
  `Утвердить` remains a separate saved-id mutation and never saves dirty text or
  publishes to a client.
- Loading, error, dirty, disabled, approved, archived, individual, and
  compatibility states preserve current production rules.
- New/changed copy works in RU and EN.
- Targeted automated checks, affected package checks, real browser/network QA,
  accessibility exercise, and measured design evidence pass, or any unavailable
  runtime evidence is reported explicitly as blocked.

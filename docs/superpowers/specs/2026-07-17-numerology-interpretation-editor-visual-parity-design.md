# Numerology Interpretation Editor Visual Parity Design

Date: 2026-07-17
Status: approved visual direction; awaiting written-spec review
Scope: `/numerology` interpretation editor in the astrologer workspace

## 1. Goal

Bring the production-only interpretation editor into the exact visual language
of the approved Numerology reference while preserving its existing production
workflow: generate an AI draft, edit the text, save a manual draft, and approve
the latest saved interpretation.

The reference does not contain a textarea workflow. Its compact
`AI-разбор портрета` disclosure in the right detail panel is therefore the
visual source for the added production control, not a business-behavior source.

## 2. Confirmed Direction

Use one compact expandable interpretation block in the right detail panel:

- the closed header follows the reference `AI-разбор портрета` control with a
  warm accent border/background, sparkle icon, label, and chevron;
- opening the block reveals the existing textarea and save/approve actions on
  a dark translucent project surface;
- `Сохранить` is a quiet glass/secondary action;
- `Утвердить` is the warm accent primary action;
- the separate purple AI button is removed; AI generation is triggered from
  the disclosure header action;
- loading, dirty, disabled, success, and error behavior remain derived from the
  existing production state and API contracts.

The block is closed by default to match the reference's compact right-panel
composition. It remains open while the astrologer edits or handles an error.
Starting AI generation opens the editor, keeps it visible during progress, and
shows the returned saved draft in place.

## 3. Visual Contract

Reference surface:

- app: `ElevenHouseDesign`;
- route/state: astrologer cabinet, Numerology, individual result, selected key
  number, closed `AI-разбор портрета` control;
- source: `ElevenHouseDesign/app/numerology.jsx`;
- reference URL in the existing Chrome session:
  `http://localhost:8000/ElevenHouse.html`.

Production surface:

- app: `apps/astrologer-web`;
- route/state: `/numerology`, saved individual or compatibility calculation,
  selected result detail;
- production URL in the existing Chrome session:
  `http://localhost:5174/numerology`.

The disclosure uses the reference panel rhythm: compact horizontal header,
approximately 12px vertical and 14px horizontal padding, 12px radius, thin
warm translucent border, restrained accent tint, and the existing panel text
scale. The expanded editor uses the same border, surface, typography, and
focus language as other ElevenHouse form controls. It must not introduce the
current purple call-to-action treatment or generic light-theme button styling.

Exact computed dimensions, colors, focus ring, and responsive behavior are
captured from the running reference before implementation and compared with
the rendered production state after implementation.

## 4. Component Design

`NumerologyInterpretationEditor` remains the focused owner of the UI. It gains
local disclosure presentation state only. Production interpretation text,
dirty state, loading, availability, save, and approval continue to come from
the existing controller/model props.

The component contains:

1. an accessible disclosure/action header with sparkle icon, label, progress
   copy, and chevron;
2. an expanded content region containing the textarea;
3. a compact footer with secondary `Сохранить` and accent `Утвердить` buttons;
4. an `aria-live` status/error area that does not collapse the surrounding
   layout unexpectedly.

The disclosure exposes `aria-expanded` and an associated region id. The
textarea retains its accessible name. Keyboard activation, visible focus,
disabled semantics, and tab order must remain correct.

No new shared design-system primitive is introduced unless inspection proves
an existing stable primitive already implements the required disclosure.
This is a Numerology-specific composition, not a new cross-product workflow.

## 5. Behavior And Data Flow

The existing flow remains unchanged:

```text
disclosure action -> existing onCreateAiDraft callback
textarea edit -> existing onTextChange callback -> derived dirty state
save -> existing onSave callback -> checksum-guarded persisted draft
approve -> existing onApprove callback -> latest saved interpretation
```

The new local open/closed state is presentation-only and never becomes the
source of business truth. It does not persist in local storage and does not
change API payloads, result checksums, interpretation status, or approval
rules.

## 6. States

- **Closed, available:** reference-style warm disclosure action.
- **Open, clean:** textarea plus actions; save remains disabled when there is
  nothing new to persist.
- **Open, dirty:** save becomes available; AI and approval keep their existing
  dirty-state guards.
- **Generating:** editor stays open; header shows progress and prevents a
  duplicate generation request.
- **Disabled:** the header remains visually legible, exposes the existing
  disabled reason, and does not imply a successful action.
- **Error:** editor remains open, last valid text stays visible, and the
  localized error is rendered in the existing live region using project error
  tokens.
- **Approved/saved:** no new status or fake success state is invented; current
  server-derived behavior remains authoritative.

The same composition is used for individual and compatibility calculations.

## 7. Responsive Contract

Desktop keeps the editor inside the existing right detail panel without
changing the three-column workspace widths. At narrower layouts, the block
follows the current detail-panel/mobile-sheet composition and uses full
available width. Footer actions may wrap, but labels, focus rings, and touch
targets must remain intact with Russian and English copy.

## 8. Testing And Evidence

Implementation follows behavioral TDD:

1. component tests first prove disclosure semantics, closed/open content,
   keyboard-operable controls, loading copy, disabled behavior, and preservation
   of save/approve callbacks;
2. existing Numerology view/controller/model tests prove that API and dirty
   state behavior did not change;
3. targeted lint, Vitest, astrologer-web typecheck, and build are run;
4. `git diff --check` and affected repository verification are run;
5. the existing Chrome session is used for real network-backed comparison of
   reference and production states at equivalent desktop viewport;
6. closed, open, dirty, disabled/loading where reachable, focus, keyboard,
   console, and network behavior are inspected; mobile is checked at the
   affected responsive breakpoint if the current browser surface permits it.

Visible acceptance requires screenshots and measured comparison. If the shared
browser tab or required service is unavailable, automated checks may pass but
visual acceptance remains blocked.

## 9. Scope Boundaries

In scope:

- `NumerologyInterpretationEditor` composition and its focused tests;
- Numerology component styles needed for the editor and buttons;
- minimal adjacent test updates required by the accessible disclosure behavior.

Out of scope:

- AI, calculation, checksum, persistence, approval, or API behavior changes;
- changes to the deterministic Numerology engine;
- redesign of the right detail panel or workspace grid;
- unrelated design-system extraction, refactoring, or copy changes;
- process lifecycle, deploy, commit, or push.

## 10. Acceptance Criteria

- The added editor looks native to the Numerology reference rather than like a
  separate purple form card.
- The closed state closely matches the reference `AI-разбор портрета` control.
- The expanded textarea and buttons continue the same surface, typography,
  border, radius, focus, and warm-accent language.
- `Сохранить` is a polished quiet secondary action and `Утвердить` is a polished
  warm primary action, with correct hover, focus, pressed, and disabled states.
- AI generation, text editing, save, approval, dirty guards, loading, and error
  handling retain their current production behavior.
- Individual and compatibility modes render the same editor treatment.
- Automated and browser evidence cover the changed observable states, or the
  missing evidence is reported as blocked rather than passed.

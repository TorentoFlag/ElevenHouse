# Flows Visual Parity Design

Date: 2026-08-11
Status: approved design, pending implementation plan
Reference: `http://localhost:8000/ElevenHouse.html`
Production route: `http://localhost:5174/flows`

## Outcome

Bring the complete astrologer `/flows` experience into measured visual and
interaction parity with the ElevenHouse reference while preserving the current
production Flow contracts, server data, authorization, lifecycle, persistence,
runtime history, and accessibility.

The work covers the gallery, create dialog, builder header, palette, graph
canvas, node inspector, runtime history, all dialogs and notices owned by the
Flows route, and the mobile gallery and builder states.

## Product Boundaries

The reference is visual and interaction truth, not business or data truth.
Production remains authoritative for:

- persisted Flow definitions and `flow-graph.v2`;
- immutable published versions and draft revisions;
- CAS-based draft updates and conflict recovery;
- enrollment and activation state;
- runtime availability, runs, work items, and approvals;
- singleton client birth-profile readiness;
- client-astrologer and booking/service authorization policies;
- locale, timezone warnings, loading, empty, validation, error, and retry states.

Reference-only conversion counts, completion totals, demo descriptions, plan
gates, AI generation, and fake success states must not enter production. Real
technical lifecycle data uses the same visual hierarchy and density instead.

The timezone warning remains visible when the profile is incomplete. It is a
production state absent from the reference and will use the reference visual
language without being hidden or converted into a silent fallback.

## Current Evidence

Browser comparison used authenticated production data and matching viewports.
At `1440x900`, the common app shell is 248 px wide and the Flow content area is
1192 px wide in both implementations.

Measured gallery differences include:

- reference cards: approximately 370.7 x 211.3 px; production: 370.7 x 207 px;
- reference preview: 64 px high with 26 px categorical nodes; production:
  56 px high with 34 px uniformly gold nodes;
- reference body padding: 14 px 16 px; production: 10 px 16 px;
- reference cards use a layered gradient, inset highlight, and outer shadow;
  production cards currently use a flatter translucent surface.

Measured builder evidence includes:

- both implementations use 244 px palette, 608 px canvas, and 340 px inspector
  columns at `1440x900`;
- the reference builder body begins at y=128 and is 772 px high;
- production inserts a permanent 31 px save/read-only row, so its body begins
  at y=160 and is 740 px high;
- reference palette items are compact icon/title/subtitle rows around 48.5 px;
  production items are text-only blocks around 78-88 px;
- reference canvas uses a transformable viewport with pan, zoom, fit, and node
  dragging; production currently relies on a large scrollable node grid.

At `390x844`, the reference uses dense graph previews and a compact card footer.
Production uses a separate metadata card layout. The production mobile layout
must be recomposed, not merely recolored.

## Chosen Architecture

The implementation will retain the existing production component and contract
boundaries. Visual parity will be introduced as a page-scoped presentation
layer rather than by porting prototype state or replacing production Flow
components.

### Page Composition

`FlowsPageView` remains the route-owned composition root. It continues to own
the transitions between gallery, create dialog, builder, activation review,
manual run, pause confirmation, and runtime/work-item dialogs.

`FlowsPage.module.css` remains the route-scoped visual authority. It will define
Flow-specific visual tokens and responsive layout rules. It must not alter the
global app shell or unrelated modules.

### Visual Model

`flowsVisualModel` will map real Flow node kinds and lifecycle states into
stable presentation categories:

- trigger;
- communication/action;
- chart and AI;
- logic/condition;
- wait;
- human work;
- successful or suppressed result.

The mapping supplies icon choice, accent color, soft background, and compact
labels. It does not synthesize metrics or infer business state. The mapping is
exhaustive over the validated contract union, so adding a new supported node
kind requires an explicit visual decision and test instead of a guessed style.

### Gallery

`FlowGallery` keeps the current network-backed list and commands. Its DOM is
recomposed to match the reference hierarchy:

1. 60 px section header with title, real count, and primary create command.
2. Three-column desktop grid with 16 px gaps and responsive collapse.
3. 64 px graph preview using 26 px category-colored nodes and 14 x 2 px links.
4. Body with real name, lifecycle chips, and graph summary.
5. Footer with compact real lifecycle facts and a labeled activation control.

The full card remains a semantic open action without nesting interactive
controls. Activation stays a separate switch with an explicit accessible name
and must not trigger card navigation.

### Create Dialog

`FlowCreateDialog` adopts the reference modal dimensions, spacing, backdrop,
typography, template card rhythm, icon treatment, and responsive behavior.

Only server-provided and production-supported templates are displayed. Product
eligibility remains explicit. Blank creation remains available according to the
existing API. The reference AI prompt block is excluded until a real backend
capability, contract, authorization policy, and observable failure path exist.

### Builder Header

The builder uses one 60 px header. The current separate 30 px save/read-only
row is removed from normal layout.

Real state is not removed:

- draft dirty/saved state appears in the header save command;
- published read-only state appears as a compact header status;
- revision and published version remain visible in the title group or an
  accessible detail label;
- create-next-version, publish, save, and manual-run commands retain their
  existing authorization and disabled-state logic;
- conflict, validation, and mutation errors remain dedicated full-width rows
  because they require action and must not be compressed into the header.

### Palette

`FlowNodePalette` keeps the production list of legal node templates and the
existing connection-source rules. Each item becomes an icon/title/subtitle row
matching the reference geometry. Category is expressed by section heading,
icon, and color instead of a repeated uppercase label inside every card.

Disabled reasons remain available through native disabled state plus visible or
accessible explanatory text. The single existing trigger remains represented
but compact; the UI does not imply that a second trigger can be added.

### Canvas and Presentation State

`FlowBuilderCanvas` receives a bounded viewport controller for:

- pointer and touch panning;
- wheel or control-based zooming;
- zoom-in, zoom-out, and fit controls;
- direct node dragging for editable drafts;
- keyboard-operable node selection and connection handles.

Viewport position and zoom are presentation-only state. They do not affect Flow
runtime semantics. The existing `FlowPresentationV1.viewport` is the persisted
representation; transient interaction state remains local until the user saves
the draft.

Node dragging updates the existing presentation through the current draft
command and CAS path. Published versions allow selection, pan, zoom, and fit,
but never graph mutation. No browser-only graph edits or silent persistence are
allowed.

Canvas node dimensions, ports, connection colors, grid spacing, selected state,
and controls will match measured reference styles. Rendering continues to use
the actual graph and edge records.

### Inspector and Runtime History

`FlowBuilderInspector` keeps schema-aware real fields and editability rules. It
adopts the reference section spacing, categorical icon header, field styling,
segmented controls, and destructive-action treatment.

When no node is selected, the inspector shows real Flow identity and lifecycle
facts using the reference summary layout. Runtime notices and
`FlowRunHistoryPanel` remain server-backed and are visually integrated below
the summary rather than hidden.

### Mobile

Mobile does not render the desktop three-column canvas. It keeps the existing
mobile DAG projection and modal editing boundaries, but adopts the reference
Flow header, compact graph-preview cards, typography, spacing, category colors,
and activation treatment.

The builder mobile actions remain explicit: add step, configure step, inspect
run history, and return to the gallery. Dialog content uses the same production
palette and inspector components as desktop.

## State and Error Handling

Every server state must have a deliberate rendered state:

- loading uses stable skeleton dimensions and does not shift the gallery grid;
- empty state retains the reference section composition and one create action;
- timezone incomplete remains actionable and visible;
- activation review, denied activation, and pause confirmation retain their
  server decisions and error details;
- draft validation identifies the affected node where possible;
- CAS conflict offers reload and the currently supported retry action;
- runtime unavailable is explicit in the inspector and disables only commands
  that require runtime execution;
- network failures retain retry paths and must not fall back to demo data;
- long Russian and English labels wrap or truncate without resizing fixed
  controls or overlapping adjacent content.

## Accessibility

- All icon-only controls have accessible names and tooltips where their meaning
  is not universal.
- Card navigation and activation controls are separate focus targets.
- Modal focus is trapped and restored using the existing design-system modal.
- Canvas selection and connection handles remain keyboard operable.
- Pan and zoom are not required to read the graph: the mobile/list projection
  and accessible edge descriptions remain available.
- Focus rings use the Flow accent without relying on color alone.
- Text, status, and disabled states meet contrast requirements against their
  actual computed backgrounds.
- Touch targets are at least 44 x 44 px on mobile even when their visible icon
  or switch is smaller.

## Verification Contract

Implementation follows behavioral TDD and a state-by-state visual evidence
matrix.

### Automated Checks

- model tests for categorical visual mapping across every supported node kind;
- component tests for gallery interaction separation, lifecycle rendering,
  create-dialog eligibility, builder read-only/editable behavior, and mobile
  composition;
- canvas tests for pan, zoom, fit, drag, persisted presentation updates, and
  prohibition of published graph mutation;
- existing Flow API, page, enrollment, runtime, approval, and work-item tests;
- lint, typecheck, and affected application build.

### Browser Evidence

Use authenticated, network-backed production data and the exact reference state.
Capture and compare at minimum:

- desktop `1440x900`: gallery, create dialog, draft builder with selected node,
  published builder, runtime history, activation review, validation error, and
  timezone warning;
- mobile `390x844`: gallery, create dialog, DAG projection, palette sheet,
  inspector sheet, and runtime history;
- hover, focus-visible, disabled, active switch, modal backdrop, overflow, and
  long-text states.

For each compared element, record bounding box and computed values for padding,
gap, typography, color, background, border, radius, shadow, overflow, and
z-index. Visible deviations require a documented product, accessibility, or
production-state reason.

The browser pass also checks console errors, failed network requests, keyboard
navigation, focus restoration, and interaction effects on real API state.

## Expected Code Surface

Primary owned paths are expected to be:

- `apps/astrologer-web/src/pages/flows/FlowsPage.module.css`;
- `apps/astrologer-web/src/pages/flows/FlowsPageView.tsx`;
- `apps/astrologer-web/src/features/flows/ui/FlowGallery.tsx`;
- `apps/astrologer-web/src/features/flows/ui/FlowCreateDialog.tsx`;
- `apps/astrologer-web/src/features/flows/ui/FlowBuilder.tsx`;
- `apps/astrologer-web/src/features/flows/ui/FlowBuilderCanvas.tsx`;
- `apps/astrologer-web/src/features/flows/ui/FlowBuilderInspector.tsx`;
- `apps/astrologer-web/src/features/flows/ui/FlowNodePalette.tsx`;
- `apps/astrologer-web/src/features/flows/ui/FlowRunHistoryPanel.tsx`;
- `apps/astrologer-web/src/features/flows/ui/FlowsMobileList.tsx`;
- `apps/astrologer-web/src/features/flows/ui/flowsVisualModel.ts`;
- focused tests adjacent to those modules.

The implementation plan may narrow this list after GitNexus impact analysis.
It must not expand into backend contracts, DB migrations, worker runtime, or the
global app shell unless a verified blocker makes that necessary and the user
approves the expanded scope.

## Out of Scope

- new Flow node kinds or runtime executors;
- fake business analytics or reference demo records;
- AI-generated Flow creation without a production backend capability;
- changes to Flow authorization, enrollment, publication, or CAS semantics;
- global redesign of the astrologer shell;
- backend migrations or changes to financial modules;
- replacement of the production Flow graph with the prototype model.

## Definition of Done

The scope is complete only when all listed surfaces use real production data,
the required automated checks pass, browser scenarios are network-backed, and
reference comparisons show measured parity or an explicit justified deviation.
A passing component test or desktop gallery screenshot alone is insufficient.

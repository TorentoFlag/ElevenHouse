# Clients Section Designer Brief

## Status

This brief is an execution artifact for the future `/clients` section in
`apps/astrologer-web`. It must be read together with:

- `docs/superpowers/specs/2026-08-20-clients-section-design.md`
- `docs/architecture/design-surfaces/astrologer.md`
- `docs/development/agent-runbooks/01-design-to-production.md`
- `docs/development/agent-runbooks/02-frontend-production.md`

The designer must preserve the approved `ElevenHouseDesign` CRM visual
language while removing embedded correspondence from the client card.

## Design question

How should the reference CRM section be adapted into a production
relationship-scoped Clients workspace when messaging content is explicitly out
of scope?

Decision affected: desktop and mobile information architecture, tab/section
labels, activity replacement for correspondence, modals, empty/error/conflict
states and handoff evidence required before implementation.

Accessed: 2026-08-20.

## Reference authority

Use these files as visual and interaction input:

- `ElevenHouseDesign/app/crm.jsx`
- `ElevenHouseDesign/app/crm-card.jsx`
- `ElevenHouseDesign/app/crm-data.jsx`
- `ElevenHouseDesign/app/mobile-crm.jsx`
- CRM responsive styles in `ElevenHouseDesign/app/styles.css`

Do not copy reference mock data, prototype routing, `window.*`, local storage,
message bodies, composer behavior or demo state machines.

## Approved business differences

| Reference behavior | Production Clients behavior |
| --- | --- |
| Client card includes `Переписка` tab. | Replace with `Активность`. |
| `ClientInbox` renders message bubbles and composer. | Remove entirely from Clients. |
| Reference may treat CRM data as local demo state. | Production uses network-backed contracts and server-authorized relationship data. |
| Prototype can show all sample clients. | Production shows only active relationships for the authenticated astrologer. |
| Prototype can imply arbitrary pipeline/status labels. | Production reuses fixed Clients lifecycle and relationship access status. |

## Target surface

Route: `/clients` in `apps/astrologer-web`.

Primary actor: authenticated astrologer.

Locales: Russian and English.

Viewports to design and later verify:

| Viewport | Purpose |
| --- | --- |
| 1440 x 900 | Desktop master-detail workspace. |
| 1280 x 800 | Dense laptop workspace. |
| 390 x 844 | Mobile list-to-detail flow. |
| 768 x 1024 | Tablet/narrow split threshold. |

## Required screen states

### Desktop

1. `List empty`: no active client relationships.
2. `List loading`: shell/list skeleton without fake client data.
3. `List error`: retryable failure with no relationship leakage.
4. `List success`: search, filters, client rows/cards, selected first client.
5. `Filtered empty`: query/filter yields no clients.
6. `Detail loading`: selected client identity known, detail pending.
7. `Detail success`: profile header, lifecycle, birth data, related profiles,
   summaries and activity.
8. `Birth data conflict`: save attempted with stale revision.
9. `Related profile editor`: create and edit states.
10. `Activity empty`: no safe business events beyond relationship creation.
11. `Activity success`: timeline with safe business facts and deep links.
12. `Messaging linked`: show only an "open in Inbox" action.
13. `Messaging absent`: no thread action, no embedded placeholder chat.

### Mobile

1. Client list with search/filter controls.
2. Full-screen client detail after selection.
3. Back-to-list control.
4. Detail section navigation.
5. Editor modal/drawer for birth data and related profile.
6. Conflict/error/retry states that fit without text overflow.

## Information architecture

### Desktop layout

Keep the reference CRM master-detail rhythm:

1. Left rail:
   - section title;
   - search;
   - compact filter controls;
   - client list rows/cards;
   - lifecycle/readiness chips;
   - pagination/load-more affordance.
2. Main detail:
   - profile header;
   - relationship/lifecycle facts;
   - tabs or section rail using reference visual weight;
   - Overview;
   - Birth data;
   - Related profiles;
   - Activity;
   - Notes/tags only if the implementation slice includes CRM-owned writes.
3. Right/secondary summary area when the reference layout supports it:
   - orders;
   - bookings/sessions;
   - calculations;
   - AstroDiary;
   - Flows;
   - Inbox deep link.

### Mobile layout

Use list-to-detail, not a squeezed desktop split:

1. list screen owns search/filter;
2. detail opens full-screen;
3. primary actions stay reachable;
4. section navigation should not require horizontal text overflow;
5. modals/drawers must restore focus to the invoking control.

## Copy requirements

Primary Russian labels:

| Concept | Russian |
| --- | --- |
| Section | `Клиенты` |
| Activity replacement | `Активность` |
| Overview | `Обзор` |
| Birth data | `Данные рождения` |
| Related profiles | `Связанные профили` |
| Private notes | `Заметки` |
| Open Inbox action | `Открыть в сообщениях` |
| Empty clients title | `Клиентов пока нет` |
| Conflict title | `Данные изменились` |

English equivalents:

| Concept | English |
| --- | --- |
| Section | `Clients` |
| Activity replacement | `Activity` |
| Overview | `Overview` |
| Birth data | `Birth data` |
| Related profiles | `Related profiles` |
| Private notes | `Notes` |
| Open Inbox action | `Open in Messages` |
| Empty clients title | `No clients yet` |
| Conflict title | `Data changed` |

Do not use visible helper text that explains product internals or says the UI
is a feature preview.

## Activity design rules

Activity is a CRM timeline, not a chat.

Allowed timeline item categories:

- relationship created or relinked;
- lifecycle changed;
- birth profile updated;
- related profile created or updated;
- order created or captured;
- payment/refund status changed when allowed for astrologer view;
- booking/session scheduled, started, completed or cancelled;
- calculation created, recalculated, completed or PDF generated;
- AstroDiary paid period or journal status changed;
- Flow enrolled, run started, work item completed or run finished;
- private note created/updated if notes are included.

Forbidden timeline content:

- message bodies;
- chat bubbles;
- message composer;
- provider-specific raw identifiers;
- hidden contact identifiers;
- raw external provider payloads;
- sensitive birth fields inside generic activity text.

## Accessibility requirements

Use the following as acceptance rules, not optional polish:

- Tabs follow WAI APG tab semantics: tablist, tab, tabpanel, selected state and
  arrow-key behavior.
- Editors follow WAI APG modal dialog behavior: focus enters the dialog, remains
  trapped, closes with Escape and returns to the invoking control.
- Client list should use native list/table semantics unless it becomes a true
  interactive grid.
- Touch targets must remain comfortable on mobile.
- Error and conflict text must be associated with the relevant control.
- Visible focus must be present for every interactive control.
- Text must fit in buttons, chips, rows, modals and mobile containers.

Primary references:

- WAI APG tabs: https://www.w3.org/WAI/ARIA/apg/patterns/tabs/
- WAI APG modal dialog: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- WAI APG table: https://www.w3.org/WAI/ARIA/apg/patterns/table/
- WCAG 2.2: https://www.w3.org/TR/WCAG22/

## Designer deliverables

Produce one design handoff package with:

1. Desktop states listed in this brief.
2. Mobile states listed in this brief.
3. A visual replacement for the reference `Переписка` tab using `Активность`.
4. A clear no-thread and linked-thread state without embedded messages.
5. Birth data and related-profile editor states.
6. Conflict/error/loading/empty/retry states.
7. A measurements table for:
   - layout widths;
   - padding/gaps;
   - typography;
   - colors;
   - borders/radii;
   - shadows;
   - z-index/overflow behavior;
   - focus/hover/disabled/open states.
8. Intentional deviations list with product/accessibility/production rationale.

Use Superdesign when it is available in the execution environment. If the
session has no callable Superdesign tool, the designer must still produce the
same handoff from the exact `ElevenHouseDesign` reference evidence and mark
Superdesign-specific rendering as blocked, not silently replaced by a mock.

Do not save screenshots or generated visual evidence in the repository unless
the user explicitly asks for that artifact to be committed.

## Handoff to implementation

The implementation agent must not claim visual completion until it has:

1. captured the exact reference route/state;
2. captured the adjusted design state;
3. implemented network-backed production UI;
4. captured production desktop/mobile screenshots;
5. inspected DOM/computed styles;
6. checked console/network;
7. compared measured reference/design/production values;
8. marked unverified browser states as blocked rather than passed.

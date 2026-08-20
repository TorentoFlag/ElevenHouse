# Clients Section Product Design

## Status and authority

This is an execution artifact for the astrologer `Clients` section. Product
truth remains the latest user decision, canonical product docs, accepted ADRs,
domain contracts and current production code.

Approved direction:

- The astrologer `Clients` section is a relationship-scoped CRM workspace.
- It is not a marketplace, public client directory, platform-wide people
  search, astrologer discovery surface or cross-promotion surface.
- Embedded chat, message bubbles and message composer are out of scope for
  the client card. Messaging remains owned by Inbox/Messaging. The Clients UI
  may expose a deep link to an existing linked thread.
- The reference CRM design is visual truth for layout, density, hierarchy,
  colors, controls and responsive behavior, but its embedded correspondence
  area must be replaced with CRM-owned activity.
- `Активность` is the approved replacement for the reference `Переписка`
  section.

## Outcome

Build a production CRM section where an astrologer can understand and manage
their relationship with each linked client: profile context, birth profiles,
relationship lifecycle, activity, orders, bookings, calculations, AstroDiary
and Flow participation. The screen must help the astrologer answer:

1. Who is this client and why can I see them?
2. What is the current state of my relationship with them?
3. What data is missing before I can serve them?
4. What work, purchases, bookings, calculations and journal activity already
   exist?
5. What is the next legitimate action I can take?

## Business model

### Relationship-scoped CRM

The primary business object is the relationship between one astrologer account
and one client account. A client can exist on the platform without being
visible to every astrologer. An astrologer can see a client only when an
explicit relationship exists.

Relationship sources are the existing fixed sources:

| Source | Meaning |
| --- | --- |
| `direct_link` | Client entered through the astrologer's direct public link. |
| `booking` | A booking flow created the relationship. |
| `order` | A captured order created the relationship. |
| `lead_magnet` | A lead magnet flow created the relationship. |
| `manual` | The astrologer or an approved backend workflow created the relationship. |

Relationship access status remains separate from client lifecycle:

| Relationship status | Meaning in Clients |
| --- | --- |
| `active` | The astrologer may read and manage the relationship-scoped CRM view. |
| `archived` | The relationship is no longer active; archive behavior needs a later product decision before UI write actions are exposed. |
| `blocked` | Access and mutations fail closed; blocked clients must not appear as normal active CRM entries. |

### Client lifecycle

Clients must reuse the existing Clients-owned lifecycle model, not invent a
second status vocabulary. Lifecycle is keyed by relationship ID and is distinct
from relationship access status.

Statuses:

| Lifecycle status | Product meaning |
| --- | --- |
| `new` | The relationship exists, but no strong service activity has happened yet. |
| `active` | The client has recent qualifying activity such as purchase, inbound message or astrologer action. |
| `waiting_for_client` | The astrologer needs information or action from the client. |
| `in_service` | A booking/service is currently in progress. |
| `inactive` | No qualifying activity for the configured inactivity window. |

Lifecycle mode:

| Mode | Product meaning |
| --- | --- |
| `automatic` | Source modules update visible lifecycle through audited domain transitions. |
| `manual_override` | Astrologer correction controls visible status while automatic candidates are still recorded. |

The Clients section may display lifecycle immediately. Manual override controls
must be implemented only when architecture and audit requirements are included
in the delivery slice.

### Birth profiles

The client has one primary birth profile. The client can also have related
birth profiles for partner, family or other calculation participants.

Birth profile behavior:

- primary and related profiles are reusable production data, not per-screen
  form state;
- astrologer access is derived from the active relationship with the owner
  client;
- edits require authoritative server validation, audit actor and CAS revision;
- old browser state must not silently overwrite a newer profile revision;
- profile update events are redacted and must not place birth data into generic
  outbox payloads.

### CRM-owned private context

The following are intended CRM features, but they require explicit persistence,
authorization and audit behavior in the architecture plan:

| Feature | Scope decision |
| --- | --- |
| Private notes | In scope as astrologer-private relationship notes, not client-visible journal entries and not message content. |
| Tags | In scope if scoped to one astrologer's relationship with the client. No platform-global segment catalog in this slice. |
| Manual lifecycle controls | In scope only with audited commands and idempotency. |
| Manual client creation | Product-approved direction, but implementation needs a dedicated architecture decision for required identity/contact fields and anti-enumeration. |

## User journeys and acceptance

### J1 - open Clients list

1. The authenticated astrologer opens `/clients`.
2. The page lists only clients with an active relationship to this astrologer.
3. Each row/card shows display name, relationship source, linked date, last
   activity, lifecycle status, birth-data readiness and compact service
   indicators.
4. Empty state says there are no linked clients yet and offers only legitimate
   entry points: direct link, booking/order paths, lead magnet or approved
   manual add.
5. The screen does not offer platform-wide people search.

### J2 - search and filter own clients

1. The astrologer searches by client-facing identity fields and allowed
   relationship-owned metadata.
2. Filtering never expands visibility beyond active relationships.
3. Pagination must be stable under repeated reads; a full implementation should
   use cursor pagination rather than frontend-owned offset assumptions.
4. Loading preserves the current list context rather than flashing unrelated
   empty states.

### J3 - open client detail

1. The astrologer selects a client.
2. The detail view shows profile header, lifecycle, relationship facts, primary
   birth profile, related birth profiles, private CRM context and activity.
3. All cross-module summaries are authorized for this astrologer-client
   relationship.
4. If a linked Messaging thread exists, the detail can show an "open in Inbox"
   action. It must not render messages or a composer.

### J4 - edit birth data

1. The astrologer opens the primary birth profile editor.
2. Birth place search and place resolution use the existing provider-backed
   server APIs.
3. Save sends the expected revision and server-validated fields.
4. If the profile changed after the editor opened, the API returns a conflict
   state and the UI offers refresh/retry with current data.
5. A successful save updates the visible readiness for calculations and emits
   only redacted integration events.

### J5 - manage related birth profiles

1. The astrologer creates or edits a related birth profile for the selected
   client.
2. The related profile includes display name, relationship label and normalized
   birth data.
3. The profile becomes available to eligible calculation flows as a typed
   `client_related_profile`, not as a login-capable CRM client.
4. Unauthorized, archived or blocked relationships cannot read or mutate
   related profiles.

### J6 - view activity instead of chat

1. The client detail includes an `Activity` area in the reference card location
   where correspondence appears in the prototype.
2. Activity is a chronological CRM timeline of safe business facts: relationship
   creation, lifecycle changes, birth-profile updates, orders, payments,
   bookings, sessions, calculations, AstroDiary periods, Flow enrollment and
   private note events.
3. Timeline items link to the owning module when a deep link exists.
4. The timeline never contains message bodies, message composer controls,
   provider-specific message IDs, hidden contact identifiers or external
   provider payloads.

### J7 - use module summaries

The Clients detail may show compact summary cards for adjacent modules:

| Module | Clients role | Owning module remains |
| --- | --- | --- |
| Orders | Show recent orders, payment state and deep links. | Orders/Finance |
| Bookings/Sessions | Show upcoming and recent service work. | Booking/Sessions |
| Calculations | Show readiness and saved calculation results. | Charts/Calculations/Human Design/Numerology/Matrix |
| AstroDiary | Show paid-period/journal relationship summary and deep links. | AstroDiary |
| Flows | Show enrollments/runs involving the client. | Flows |
| Messaging | Show linked-thread existence and open action only. | Messaging |

Clients must not duplicate the owning module's state machine or write directly
to another module's tables from UI code.

### J8 - mobile CRM

1. Mobile starts from the client list.
2. Selecting a client opens a full-screen detail rather than forcing a cramped
   desktop split layout.
3. Filters, add/edit modals and activity remain reachable with touch-sized
   controls.
4. The layout follows the reference mobile CRM visual language while preserving
   production data boundaries.

## Explicit non-scope

- Embedded correspondence, message bubbles, message composer or in-card thread
  UI.
- Platform-wide client search or importing arbitrary people from other
  astrologers' relationships.
- Public discovery, recommendations or cross-promotion of astrologers.
- Showing clients without an explicit relationship to the current astrologer.
- Browser-calculated business metrics, calculation readiness or payment state.
- Copying reference mock data, demo routing, `localStorage`, `window.*` state or
  prototype component boundaries.
- Consent-dependent recordings, transcripts or client-visible delivery controls
  unless a dedicated consent/product decision is added.
- Admin/moderator CRM operations; those belong to admin surfaces and audited
  admin APIs if later approved.

## Visual product contract

Reference files:

- `ElevenHouseDesign/app/crm.jsx`
- `ElevenHouseDesign/app/crm-card.jsx`
- `ElevenHouseDesign/app/crm-data.jsx`
- `ElevenHouseDesign/app/mobile-crm.jsx`
- CRM responsive styles in `ElevenHouseDesign/app/styles.css`

Required production adaptation:

- keep the reference master-detail CRM density, list hierarchy, profile card
  rhythm, pipeline/status language, compact controls and mobile list-to-detail
  behavior;
- remove the `Переписка` tab and embedded `ClientInbox` behavior;
- introduce `Активность` as the replacement section in the same visual weight;
- keep any "open messages" affordance as a navigational action to `/inbox`,
  never as an embedded thread;
- document every visible deviation as a product, accessibility or production
  constraint before implementation.

Before UI implementation, the designer/implementer must capture fresh reference
desktop and mobile states, measure computed styles and compare against the
real network-backed production route after implementation.

## Target information architecture

### Desktop

1. Left pane: clients list, search, filters, lifecycle/status chips and compact
   client facts.
2. Main pane: selected client profile header and tabs/sections.
3. Detail sections:
   - overview;
   - birth data;
   - related profiles;
   - activity;
   - private notes;
   - orders/bookings/calculations/AstroDiary/flows summaries.
4. Modals/drawers: add client, edit birth profile, edit related profile,
   private note, lifecycle override if included.

### Mobile

1. List screen with search/filter controls.
2. Full-screen client detail.
3. Sticky or reachable primary actions.
4. Modal/drawer editors that preserve focus and support keyboard navigation.

## Architecture direction

The recommended architecture is to evolve the existing `ClientsModule` into a
server-owned CRM aggregate/read surface.

Backend direction:

- keep controllers thin under `apps/astrologer-api/src/modules/clients`;
- keep use cases and policy in `packages/domain/src/clients`;
- keep Drizzle adapters and projections under `packages/db/src/adapters/clients`;
- extend `packages/contracts/src/clients.ts` with explicit CRM list/detail,
  activity and note/tag/lifecycle command contracts;
- use CSRF for writes, idempotency for create/override commands and CAS for
  mutable profile/note records;
- expose cross-module summaries through explicit ports/read models rather than
  frontend fanout.

Frontend direction:

- add an app-owned `/clients` route in `apps/astrologer-web`;
- keep reusable client selector logic in `features/clients`;
- create focused page/components for list, detail, birth profile editor,
  related profile editor, activity timeline and private notes;
- use generated/validated contracts only;
- use server state as authority and update TanStack Query caches only from
  authoritative mutation responses.

Rejected architecture options for this slice:

| Option | Reason rejected |
| --- | --- |
| React fanout from Clients to every adjacent module | Leaks business composition and authorization into the browser, creates N+1 and inconsistent loading/error states. |
| Separate CRM/search service now | Premature until the relationship-scoped read model proves scale and search requirements. |
| Embedding Messaging thread in Clients | Violates the approved product boundary and duplicates Inbox ownership. |

## Current implementation and gap

| Capability | Current evidence | Required delivery |
| --- | --- | --- |
| `/clients` route | No full route/page in astrologer web router. | Add authenticated Clients section with nav copy and responsive page states. |
| Client list API | Existing `GET /clients` with query/limit/offset and total. | Expand to CRM-ready stable list; prefer cursor pagination in full slice. |
| Client detail API | Existing `GET /clients/:clientUserId` returns current client item shape. | Return CRM detail projection with lifecycle, summaries, private context and activity. |
| Birth data | Existing contracts/API/domain/DB with CAS and provider-backed place lookup. | Surface editor in full Clients detail with conflict UI and readiness updates. |
| Related profiles | Existing astrologer create/update endpoints and spec. | Integrate into Clients detail and calculation readiness. |
| Lifecycle | Existing domain and DB lifecycle model from Flow triggers. | Display lifecycle and, if included, expose audited manual override/return commands. |
| Notes/tags | No confirmed production surface found. | Add relationship-scoped CRM notes/tags only after architecture plan defines schema/audit. |
| Activity timeline | No unified Clients timeline. | Build server-owned safe activity projection from owning modules. |
| Messaging | Inbox foundation exists separately. | Clients can deep link to Inbox but must not embed messages. |
| Visual parity | CRM reference exists; production Clients UI missing. | Designer pass plus browser-backed parity verification. |

## Release recommendation

### Slice 1 - useful CRM foundation

- `/clients` route and navigation;
- list/search/filter over active relationships;
- detail header with relationship and lifecycle facts;
- primary birth profile and related profile read/edit;
- Activity section shell with relationship, lifecycle and profile events;
- no embedded Messaging UI.

### Slice 2 - business context

- server-owned summaries for orders, bookings/sessions, calculations,
  AstroDiary and Flows;
- deep links to owning modules;
- readiness indicators for missing birth data or pending work.

### Slice 3 - CRM-owned management

- private notes;
- relationship-scoped tags;
- audited manual lifecycle override/return-to-automatic;
- manual client creation if identity/contact rules are approved.

### Slice 4 - polish and acceptance

- desktop/mobile reference parity;
- keyboard/focus and accessibility pass;
- browser-backed real data acceptance for loading, empty, success, conflict,
  error, disabled and retry states.

## Verification expectations

- Contract tests for every new request/response shape and invalid state.
- Domain tests for lifecycle display/override decisions, note/tag permissions
  and activity projection redaction.
- DB integration tests for relationship scope, CAS, notes/tags/history,
  timeline ordering and non-enumeration.
- API E2E for authentication, CSRF, idempotency, conflict and archived/blocked
  access behavior.
- Frontend component tests for list/detail/edit/conflict/empty/error states.
- Real browser E2E for authenticated astrologer `/clients` with network-backed
  data.
- Design parity evidence for desktop and mobile reference states.
- Accessibility checks for tabs, dialogs, tables/lists, focus restore, target
  size, contrast and keyboard navigation.

## Research references

Repository sources:

- `docs/product/full-functional-scope.md`
- `docs/architecture/design-surfaces/astrologer.md`
- `docs/decisions/0010-messaging-channel-architecture.md`
- `docs/superpowers/specs/2026-08-13-flow-real-triggers-design.md`
- `docs/superpowers/specs/2026-08-16-related-birth-profiles-design.md`
- `packages/contracts/src/clients.ts`
- `packages/domain/src/clients`
- `apps/astrologer-api/src/modules/clients`
- `apps/astrologer-web/src/features/clients`

External implementation references used for architecture and UX direction:

- TanStack Query paginated queries, query keys, invalidation and mutation
  updates: https://tanstack.com/query/latest/docs/framework/react/guides/paginated-queries
- NestJS controllers, modules and providers:
  https://docs.nestjs.com/controllers, https://docs.nestjs.com/modules,
  https://docs.nestjs.com/providers
- Drizzle transactions: https://orm.drizzle.team/docs/transactions
- OWASP Authorization, IDOR, CSRF and Logging cheat sheets:
  https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html,
  https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html,
  https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html,
  https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- WAI APG tabs, dialogs and tables plus WCAG 2.2:
  https://www.w3.org/WAI/ARIA/apg/patterns/tabs/,
  https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/,
  https://www.w3.org/WAI/ARIA/apg/patterns/table/,
  https://www.w3.org/TR/WCAG22/

## Open product decisions before implementation

1. Confirm whether private notes, tags and manual lifecycle override are part
   of the first implementation or a follow-up.
2. Decide manual client creation rules: required identity fields, whether a
   contact method is mandatory, and how duplicate/non-enumeration behavior
   should work.

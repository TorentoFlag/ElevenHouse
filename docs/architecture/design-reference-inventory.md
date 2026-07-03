# Design Reference Inventory Mapping

This document maps `ElevenHouseDesign/` reference screens to production
surfaces, domain ownership, API readiness, frontend readiness and design-system
work. It is a technical integration map, not a product-priority document.

`ElevenHouseDesign/` remains a visual and product-flow reference. Its JSX file
structure, `window.*` globals, localStorage state and mock datasets must not be
treated as production frontend architecture.

## Status Legend

- `ready`: production layer exists and can be integrated or extended now.
- `partial`: production layer exists, but does not cover the full reference flow.
- `missing`: production layer must be designed and implemented before real
  integration.
- `wrong-surface`: reference belongs to another app/API surface.

## Current Production Baseline

### Backend

`apps/astrologer-api` currently has these feature modules:

- `identity`: astrologer passwordless login, registration verification, session
  cookie, current account, logout.
- `products`: product list, summary, detail, create, update, publish, move to
  draft, archive, duplicate.
- `dictionary`: categories, entries, custom entries, platform entry overrides,
  resets and deletes.
- `dictionary-ai`: AI draft generation for dictionary entries.
- `ai`: provider-neutral generation service and rate limiting.
- `security`: route metadata, session cookie CSRF policy.
- `database`, `redis`, `clock`, `health`: technical modules.

There are shared contracts for `identity`, `products`, `dictionary`,
`ai-drafts` and `health`.

There are domain and DB layers for `identity`, `products`, `dictionary`,
`outbox` and auth-code delivery.

### Frontend

`apps/astrologer-web` currently has production code for:

- Auth page and authenticated route guard.
- App shell, header and navigation drawer.
- Products page with real API queries and a partial product creation flow.
- Reference/dictionary page with real API queries, mutations and AI draft flow.
- Dashboard placeholder-level page.

The frontend already uses `@elevenhouse/contracts`, Zod response parsing,
React Query and the shared `HttpClient` with credentials and CSRF headers.

### Design System

`packages/design-system` currently has:

- Core components: `Button`, `Card`, `Chip`, `IconButton`,
  `LanguageSwitcher`, `Modal`, `OtpAuthForm`, `OtpCodeForm`,
  `SegmentedTabs`.
- Navigation: `NavigationDrawer`, `Breadcrumbs`, `BackLink`.
- Motion primitives: `MotionContent`, `MotionHeight`, `MotionRouteContent`,
  `MotionText`, `SegmentedIndicator`.
- Icons used by the current shell, auth, products and reference pages.

Additional workflow-heavy components must be extracted from the reference into
the design system only when they are reusable across production apps.

## Astrologer Surface Mapping

| Reference area | Reference files | Production route/app | Domain ownership | API/contracts status | Frontend status | Design-system needs | Integration notes |
|---|---|---|---|---|---|---|---|
| App shell, navigation, topbar | `app.jsx`, `shared.jsx`, `data.jsx`, `icons.jsx`, `toast.jsx`, `notifications.jsx`, `guide.jsx`, `access.jsx`, `plans-data.jsx` | `apps/astrologer-web` layout | `Identity`, future `AstrologerProfile`, future `Notifications`, future `PlatformPlans` | `identity` ready; notifications/plans/profile missing | partial | Menu, command menu, notifications popover, avatar/profile summary, badges, plan access indicators | Keep current production shell. Replace hardcoded profile/page link with profile contract later. Do not port `DemoSwitch`, `TweaksPanel` or `window` intent wiring. |
| Auth/register | `landing.jsx`, `landing-*`, `onboarding-hero.jsx`, `onboarding.jsx`, `onboarding-steps*.jsx`, `i18n.jsx` | `/auth`, future `/onboarding` in `astrologer-web` | `Identity`, future `AstrologerProfile`, `Verification`, `PlatformPlans`, `Payouts` | `identity` ready; onboarding/profile/plans/payouts/verification missing | auth ready; onboarding missing | Onboarding stepper, form sections, media/avatar upload field, checklist | Auth already production-backed. Onboarding must be split into profile/product/schedule/payout/verification modules rather than copied as one local form. |
| Dashboard | `dashboard.jsx`, `dashboard2.jsx`, `data.jsx`, `notifications-data.jsx` | `/dashboard` in `astrologer-web` | Aggregation over `Products`, future `Bookings`, `Clients`, `Orders`, `Wallet`, `Notifications`, `Analytics` | missing except products summary | placeholder | Metric cards, activity feed, task list, today's sessions, compact charts | First production dashboard can use only existing product summary plus empty states. Full dashboard needs analytics/read-model contracts. |
| Products catalog | `products.jsx`, `products-data.jsx` | `/products` in `astrologer-web` | `Products` | ready, with analytics stub | partial real integration | Product card actions menu, status menu, summary strip refinements | This is the most ready vertical slice. Existing API already covers list, summary, status transitions and duplicate. |
| Product constructor | `product-constructor.jsx`, `products-data.jsx` | `/products` modal or dedicated product editor route | `Products`; future `Media`, `Content`, `Charts`, `Subscriptions` depending fields | partial: core product contract ready; media upload and generated artifacts missing | partial creation modal only | Form blocks, selectable cubes, stepper, icon picker, editable included items, modifiers editor, live preview | Map reference config directly to `CreateProductRequest`/`UpdateProductRequest`. Unsupported media fields stay typed but require future media module before uploads. |
| Reference library | `ref-library.jsx`, `ref-data.jsx` | `/reference` in `astrologer-web` | `Dictionary`, `DictionaryAi`, `Ai` | ready | mostly ready | Category rail, source filters, long-form editor refinements | Existing page is production-backed and should be refined against reference visuals. |
| Calendar, availability and sessions | `calendar.jsx`, `calendar-data.jsx`, `calendar-month.jsx`, `calendar-panels.jsx`, `widgets.jsx` | future `/calendar` in `astrologer-web` | `Availability`, `Booking`, `Sessions`, `Clients`, `Notifications` | missing | missing | Week/month calendar grid, slot editor, session detail panel, policy modals | Must not be implemented as local calendar state. Requires timezone-aware availability, slot holds, booking/session contracts. |
| CRM clients | `crm.jsx`, `crm-data.jsx`, `crm-card.jsx`, `widgets.jsx` | future `/clients` in `astrologer-web` | `ClientProfile`, `Clients`, `BirthData`, `Orders`, `Sessions`, `Messaging`, `Notes`, future `CRMStages` | missing | missing | Master-detail layout, client card, tags, pipeline/kanban, notes composer | Requires consent-aware birth data and clear ownership between client profile, sessions, orders and messaging. |
| Inbox and messages | `inbox.jsx`, `inbox-data.jsx`, `notifications.jsx` | future `/inbox` in `astrologer-web` | `Messaging`, `Notifications`, future channel integrations | missing | missing | Conversation list, message thread, channel badges, connection modal | External channels must be provider-adapter backed. Do not persist linked chats in browser storage. |
| Analytics | `analytics.jsx`, `analytics-data.jsx`, `analytics-charts.jsx` | future `/analytics` in `astrologer-web` | `Analytics`, plus read models from `Orders`, `Bookings`, `Products`, `Clients`, `Wallet` | missing | missing | Chart primitives, comparison controls, source detail cards | Build as read-model/query surface. Avoid recalculating business metrics in React. |
| Finance and wallet | `finance.jsx`, `finance-data.jsx` | future `/finance` in `astrologer-web` | `Wallet`, `Ledger`, `Payouts`, `Payments/Billing`, `PlatformPlans` | missing | missing | Balance cards, ledger table, payout modal, financial report export | Must be backed by ledger entries and idempotent payment/withdrawal workflows. No controller-side balance mutation. |
| Automation/funnels | `flow-builder.jsx`, `flow-canvas.jsx`, `flow-data.jsx`, `flow-engine.jsx`, `flow-gallery.jsx`, `flow-inspector.jsx`, `flow-nodes.jsx`, `flow-ai.jsx` | future `/funnels` in `astrologer-web` | `Automation`, `Broadcasts`, `Messaging`, `Notifications`, `Analytics`, `Ai` | missing except generic AI service | missing | Flow canvas, node palette, inspector, AI suggestions | Needs explicit event model and job dispatch. Do not execute automation from browser state. |
| Content | `content.jsx`, `content-data.jsx` | future `/content` in `astrologer-web` | `Content`, `Media`, `Subscriptions`, `Moderation`, `Notifications` | missing | missing | Content calendar, post editor, social badges, publish controls | Content moderation and external publishing require backend workflow and auditability. |
| Reviews | `reviews.jsx` | future `/reviews` in `astrologer-web` | `Reviews`, `Moderation`, `Orders/Sessions` | missing | missing | Review cards, moderation/status controls | Review visibility must respect moderation workflow. |
| Settings | `settings.jsx`, `page-data.jsx`, `plans-data.jsx`, `access.jsx` | future `/settings` in `astrologer-web` | `AstrologerProfile`, `PublicPage`, `Integrations`, `NotificationPreferences`, `PlatformPlans`, `Payouts`, `Verification` | missing | nav footer only | Settings sections, toggles, profile/public page editor controls | Split by domain. Public page settings affect `client-web` direct-link surface through `public-api`, not only astrologer API. |
| Personal public page editor/preview | `page.jsx`, `page-data.jsx`, `landing-sales.jsx` | editor in `astrologer-web`; public rendering in `client-web` | `AstrologerProfile`, `PublicPage`, `Products`, `Availability`, `Reviews`, `LeadMagnets` | missing except products | missing | Public page blocks, block ordering controls, preview frame | Public page data for clients belongs to `public-api`. Astrologer editing belongs to `astrologer-api`. |
| Chart engine | `engine.jsx`, `engine-data.jsx`, `engine-wheel.jsx`, `engine-modes.jsx`, `engine-tables.jsx`, `wheel.jsx`, `astro-store.jsx` | future `/chart-engine` in `astrologer-web` | `BirthData`, `Charts`, `ChartWorker`, `Ai` | missing except generic AI | missing | Chart wheel/canvas, subject picker, tables, interpretation panels | Heavy calculations must go through chart domain/worker. Reference calculation helpers are not production-grade chart services. |
| Numerology | `numerology.jsx`, `numerology-data.jsx`, `numerology-extra.jsx` | future `/numerology` in `astrologer-web` | `Charts` or dedicated `Numerology`, `BirthData`, `Ai` | missing | missing | Number grids, interpretation panels, comparison controls | Decide whether numerology is a submodule of `Charts` or a separate calculation domain before implementation. |
| Destiny matrix | `matrix.jsx`, `matrix-data.jsx`, `matrix-graph.jsx`, `matrix-modes.jsx` | future `/destiny-matrix` in `astrologer-web` | `Charts` or dedicated `Matrix`, `BirthData`, `Ai` | missing | missing | Matrix graph, legend, health table, year selector | Same calculation-boundary issue as numerology. |
| Human Design | `hd.jsx`, `hd-data.jsx`, `hd-graph.jsx`, `hd-modes.jsx` | future `/human-design` in `astrologer-web` | `Charts` or dedicated `HumanDesign`, `BirthData`, `Ai` | missing | missing | Bodygraph, centers/channels tables, comparison panels | Requires authoritative calculation rules and test fixtures before product integration. |
| Astro calendar | `astro-calendar.jsx`, `astro-calendar-data.jsx` | future `/astro-calendar` in `astrologer-web` | `Charts`, `AstroCalendar`, `Notifications`, `Automation` | missing | missing | Astro calendar views, event cards, trigger controls | Can become a read model from chart/calendar calculations plus automation triggers. |
| Journal | `journal.jsx`, `journal-data.jsx` | future `/journal` in `astrologer-web`; possibly also `client-web` | `Journal`, `ClientProfile`, `BirthData`, `Charts`, `Subscriptions` | missing | missing | Timeline, diary prompts, shared notes | Clarify ownership: astrologer-only working notes vs client-visible shared journal. |
| Video session | `session-call.jsx`, `calendar-panels.jsx` | future session route/modal in `astrologer-web` and `client-web` | `Sessions`, `Bookings`, `Recordings`, `Notifications`, `Media` | missing | missing | Call controls, overlays, recording status, session materials | Do not implement real calls without provider adapter, recording consent and session lifecycle. |
| Mobile astrologer views | `mobile.jsx`, `mobile-dashboard.jsx`, `mobile-products.jsx`, `mobile-calendar.jsx`, `mobile-crm.jsx`, `mobile-finance.jsx`, `mobile-flows.jsx`, `mobile-inbox.jsx`, `mobile-analytics.jsx`, `mobile-reviews.jsx`, `ios-frame.jsx` | responsive states inside `astrologer-web`, not a separate app | Same modules as desktop | depends per module | missing | Responsive variants, mobile navigation, touch-friendly controls | Treat as responsive requirements for each production surface, not separate mock screens. |

## Client Surface Mapping

These reference files belong primarily to `apps/client-web` and `apps/public-api`,
not to `astrologer-web`/`astrologer-api`.

| Reference area | Reference files | Production surface | Domain ownership | API/contracts status | Notes |
|---|---|---|---|---|---|
| Client cabinet | `client.jsx`, `client-data.jsx`, `session-call.jsx`, `journal.jsx` where client-visible | `client-web` with `public-api` authenticated client routes | `ClientProfile`, `Bookings`, `Orders`, `Sessions`, `Materials`, `Subscriptions`, `BirthData`, `Journal` | missing | Must preserve direct-link astrologer context and avoid showing other astrologers as discovery. |
| Public astrologer page and booking entry | `page.jsx`, `page-data.jsx`, `landing-sales.jsx` | `client-web` public/direct-link routes backed by `public-api` | `AstrologerProfile`, `PublicPage`, `Products`, `Availability`, `Booking`, `Orders`, `Payments`, `Reviews`, `LeadMagnets` | missing except product data exists only in `astrologer-api` | Public read contracts must be separate from astrologer management contracts. |
| Client registration during booking | `client.jsx`, `landing*.jsx`, auth-like pieces | `client-web` and `public-api` | `Identity`, `ClientProfile`, `Booking` | public identity exists in `public-api`; booking missing | Registration must be explicit client-only and direct-link scoped. |

## Admin Surface Mapping

These reference files belong to `apps/admin-web` and future `apps/admin-api`.
They must not be added to `astrologer-api`.

| Reference area | Reference files | Production surface | Domain ownership | API/contracts status | Notes |
|---|---|---|---|---|---|
| Admin dashboard and operations | `admin.jsx`, `admin-data.jsx` | `admin-web` + future `admin-api` | `Users/Roles`, `Verification`, `Moderation`, `Payments`, `Disputes`, `AuditLog`, `PlatformSettings` | missing | Requires separate API surface with internal role authorization and audit logs. |
| Admin plans | `admin-plans.jsx`, `plans-data.jsx` | `admin-web` + future `admin-api` | `PlatformPlans`, `Billing`, `AuditLog` | missing | Plan edits are sensitive platform settings and need auditability. |

## Cross-Cutting Reference Assets

| Reference files | Production interpretation |
|---|---|
| `styles.css`, `icons.jsx`, `tweaks-panel.jsx` | Visual reference only. Tokens and icons must be implemented in `packages/design-system`; runtime tweak panel is not production UI. |
| `image-slot.js`, screenshot assets | Useful for visual review only. Production media requires object storage, CDN/media contracts and accessibility metadata. |
| `uploads/*.md`, `uploads/*.html` | Requirements/reference input only. Do not import into app runtime. |
| `ios-frame.jsx` | Device mock/reference artifact. Use responsive web implementation rather than iOS frame wrappers in production screens. |

## Design-System Extraction Backlog

Extract only reusable primitives or workflow components. Page-specific business
composition stays in the owning app.

Ready or near-ready extraction candidates:

- `CommandMenu` / create menu popover for topbar create actions.
- `MetricStrip` and compact `MetricCard`.
- `StatusMenu` and `ActionMenu` patterns for products, sessions and reviews.
- `SelectableTile` / cube controls from product constructor.
- `Stepper`, `IconPicker`, editable list row and form block components.
- `MasterDetailShell` for CRM-like screens.
- `CalendarGrid` primitives after availability/session contracts exist.
- `LedgerTable` and money display primitives after wallet/ledger contracts exist.
- Chart/canvas primitives only after calculation boundaries and data shapes are
  formalized.

Do not extract components that encode unresolved business state transitions.
For example, booking cancellation, payout request and moderation actions need
domain use cases before shared UI should imply behavior.

## Recommended Integration Sequence

1. **Products/Product Constructor**
   - Backend/contracts: existing `Products` contract is ready for most fields.
   - Frontend: replace the partial product editor with a full constructor mapped
     to `CreateProductRequest` and `UpdateProductRequest`.
   - Design system: selectable tiles, stepper, icon picker, form blocks.
   - Remaining explicit gap: media upload/storage and real product analytics.

2. **Reference/Dictionary Refinement**
   - Backend/contracts: ready.
   - Frontend: refine visual parity and editor ergonomics; keep AI draft flow
     provider-neutral.
   - Design system: long-form editor and source/status filter patterns if
     reusable.

3. **Astrologer Profile and Onboarding**
   - Create `AstrologerProfile` domain/contracts/db/api module.
   - Use reference onboarding screens as product flow, not as state architecture.
   - Keep payout, verification and schedule steps behind their own domain
     modules rather than a single generic onboarding blob.

4. **Availability, Calendar, Booking and Sessions**
   - Implement timezone-aware availability first.
   - Add booking/session read models for astrologer calendar.
   - Booking/order/payment commands must use idempotency where applicable.

5. **Clients/CRM**
   - Implement client profile, relationship to astrologer, notes/tags and
     consent-aware birth data.
   - Add order/session aggregates after corresponding modules exist.

6. **Finance/Wallet and Analytics**
   - Implement ledger/payment read models before finance UI.
   - Analytics screens should read backend aggregates, not compute business
     metrics from frontend mock data.

7. **Charts and Specialized Calculation Surfaces**
   - Define calculation ports, worker contracts and test fixtures before porting
     chart, numerology, matrix or human-design screens.

8. **Automation, Content, Messaging and Notifications**
   - Build on domain events, outbox/jobs and provider adapters.
   - Avoid browser-local automation execution.

9. **Client and Admin Surfaces**
   - Client booking/cabinet belongs to `client-web`/`public-api`.
   - Admin/moderator workflows wait for `admin-api`; do not place them in
     `astrologer-api`.

## First Implementation Slice Candidate

The safest first code slice is `Products/Product Constructor` because it has the
highest overlap between reference UI and existing production backend:

- Existing API supports product CRUD/status transitions/duplicate.
- Existing shared contract already models product type, delivery formats,
  execution mode, payment model, participant mode, required data, methods,
  access grants, included items and modifiers.
- Existing frontend already has product list, summary, create mutation and a
  draft-to-contract mapper.

The implementation should not copy `ProductConstructor` directly. It should
rebuild the interaction with production React components, shared contracts,
React Query mutations and design-system primitives.


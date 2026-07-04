# Design Implementation Inventory

This inventory is the primary source of truth for mapping the implemented
`ElevenHouseDesign/` design project to production surfaces, domain ownership,
API/contracts readiness, frontend readiness and design-system work.

`ElevenHouseDesign/` is not just visual inspiration. It is the canonical
implemented product design for screens, UX flows, terminology and visible
functional scope. At the same time, its JSX file structure, UMD script loading,
`window.*` globals, `localStorage` persistence, mock datasets, demo switcher and
one-file component boundaries are prototype architecture and must not be copied
into production. Production implementation must rebuild these flows through the
documented apps, packages, contracts, domain use cases and design-system
primitives.

When other project documentation describes product surfaces or feature scope, it
must stay consistent with this inventory and with the current production code.

## Status Legend

- `ready`: production layer exists and can be integrated or extended now.
- `partial`: production layer exists, but does not cover the full design flow.
- `missing`: production layer must be designed and implemented before real
  integration.
- `wrong-surface`: design area belongs to another app/API surface.
- `design-only`: useful for visual QA or authoring context, but not production
  runtime code.

## Validated Design Project Facts

Validated against the repository on 2026-07-03.

- `ElevenHouseDesign/ElevenHouse.html` loads a single browser prototype with
  React UMD, Babel-in-browser, Three.js, many JSX files and a root demo router.
- Root views in `app.jsx`: landing, astrologer registration, client
  registration, onboarding, astrologer cabinet, mobile astrologer cabinet,
  client cabinet, public page and admin.
- Astrologer cabinet navigation in `data.jsx`: dashboard, analytics, calendar,
  clients, products, funnels, chart engine, numerology, destiny matrix, human
  design, astro calendar, journal, reference, inbox, finance, content and
  reviews; settings is exposed from the shell footer/profile.
- Client cabinet in `client.jsx` contains home, consultations, feed, personal
  data, subscriptions/billing, booking, notifications and linked-astrologer
  management.
- Admin in `admin.jsx` contains overview, analytics, users, plans,
  verification, moderation, disputes and platform settings.
- `screenshots/` contains 471 rendered screenshots, including desktop and mobile
  states, booking/checkout, client cabinet, admin, public page, product
  constructor, charts, flows and settings screens.
- `uploads/` contains source requirements and visual assets. These files are
  product/design input, not runtime implementation.

## Current Production Baseline

### Backend

`apps/public-api` currently exposes health and client identity/passwordless
session routes. Its `identity` module imports database, redis and security
modules for the identity workflow. Booking, orders, payments, public page reads
and client cabinet APIs are missing.

`apps/astrologer-api` currently has these feature modules:

- `identity`: astrologer passwordless login, registration verification, session
  cookie, current account and logout.
- `products`: product list, summary, detail, create, update, publish, move to
  draft, archive and duplicate.
- `dictionary`: categories, entries, custom entries, platform entry overrides,
  resets and deletes.
- `dictionary-ai`: AI draft generation for dictionary entries.
- `ai`: provider-neutral generation service, safety identifier, usage recorder
  and rate limiting.
- `security`: route metadata and session cookie CSRF policy.
- `database`, `redis`, `clock`, `health`: technical modules.

`apps/admin-api` is not created yet. Internal admin, moderator and super-admin
workflows must wait for that separate Nest app and must not be added to
`public-api` or `astrologer-api`.

Shared contracts exist for `identity`, `products`, `dictionary`, `ai-drafts`,
`astrologer-profile` and `health`.

Domain and DB layers currently cover identity/accounts/roles/auth sessions,
products, dictionary, outbox, auth-code delivery and the
`AstrologerProfile` domain foundation. The current working tree also contains
in-progress DB schema/adapter work for `AstrologerProfile`, but
`apps/astrologer-api` does not yet have an `astrologer-profile` feature module,
so the API surface is still missing.

### Frontend

`apps/astrologer-web` currently has production code for:

- Auth page and authenticated route guard.
- App shell, header and navigation drawer.
- `/dashboard` placeholder-level page.
- `/products` with real API queries and product create/edit/status actions in
  progress.
- `/reference` with real API queries, mutations and AI draft flow.

`apps/client-web` currently has:

- Public home placeholder.
- Client auth page.
- Authenticated `/me` placeholder.

`apps/admin-web` currently has only a shell placeholder.

The frontends use shared contracts, Zod response parsing, React Query and the
shared HTTP client pattern with credentials and CSRF headers where applicable.

### Design System

`packages/design-system` currently has:

- Core components: `Button`, `Card`, `Chip`, `IconButton`, `IconPicker`,
  `LanguageSwitcher`, `Modal`, `NumberStepper`, `OtpAuthForm`, `OtpCodeForm`,
  `SegmentedTabs`, `SelectableTile`.
- Navigation: `NavigationDrawer`, `Breadcrumbs`, `BackLink`.
- Motion primitives: `MotionContent`, `MotionHeight`, `MotionRouteContent`,
  `MotionText`, `SegmentedIndicator`.
- Icons used by the current shell, auth, products and reference pages.

Workflow-heavy components should be extracted only when they are reusable across
production apps. Page-specific business composition stays in the owning app.

## Astrologer Surface Mapping

| Design area | Design files | Production route/app | Domain ownership | API/contracts status | Frontend status | Design-system needs | Integration notes |
|---|---|---|---|---|---|---|---|
| Astrologer acquisition landing | `landing.jsx`, `landing-3d.jsx`, `landing-scene.jsx`, `landing-legal.jsx`, `landing-sales.jsx`, `i18n.jsx` | future unauthenticated route in `astrologer-web` or separate acquisition frontend | `Identity`, future `PlatformPlans`, future `PublicContent` | identity ready; plans/public content missing | missing; `/` redirects to `/auth` | Marketing layout sections, plan cards, language toggle, legal modal, 3D/canvas wrappers if kept | This is not a public astrologer marketplace and must not introduce discovery pages. It is an entry surface for astrologers. |
| Auth/register | `app.jsx`, `landing.jsx`, `onboarding-hero.jsx`, `onboarding.jsx`, `onboarding-steps*.jsx`, `i18n.jsx` | `/auth`, future `/onboarding` in `astrologer-web` | `Identity`, `AstrologerProfile`, future `Verification`, `PlatformPlans`, `Payouts`, `Availability` | identity ready; profile foundation partial; onboarding/plans/payouts/verification missing | auth ready; onboarding missing | Onboarding stepper, form sections, media/avatar upload field, checklist | Auth is production-backed. Onboarding must be split into profile/product/schedule/payout/verification modules rather than copied as one local form. |
| App shell, navigation, topbar | `app.jsx`, `shared.jsx`, `data.jsx`, `icons.jsx`, `toast.jsx`, `guide.jsx`, `access.jsx`, `plans-data.jsx` | authenticated `astrologer-web` layout | `Identity`, `AstrologerProfile`, future `Notifications`, `PlatformPlans/Entitlements` | identity ready; profile foundation partial; notifications/plans missing | partial | Command menu/create menu, notifications popover, avatar/profile summary, badges, entitlement indicators | Keep production shell boundaries. Do not port `DemoSwitch`, `TweaksPanel`, `window.__ehIntent` or global navigation wiring. |
| Dashboard | `dashboard.jsx`, `dashboard2.jsx`, `data.jsx`, `notifications-data.jsx` | `/dashboard` in `astrologer-web` | Read models over `Products`, future `Bookings`, `Clients`, `Orders`, `Wallet`, `Notifications`, `Analytics`, `Disputes` | missing except products summary | placeholder | Metric cards, activity feed, task list, today's sessions, compact charts, attention banners | Full dashboard needs backend read models. Do not compute business metrics from frontend mock arrays. |
| Products catalog | `products.jsx`, `products-data.jsx` | `/products` in `astrologer-web` | `Products` | ready, with analytics stub | partial real integration | Product card actions menu, status menu, summary strip refinements | Current API covers list, summary, detail, status transitions and duplicate. |
| Product constructor | `product-constructor.jsx`, `products-data.jsx`, `image-slot.js` | `/products` modal or dedicated product editor route | `Products`; future `Media`, `Content`, `Charts`, `Subscriptions`, `Availability` depending fields | partial: core product contract ready; media upload, generated artifacts and access delivery missing | partial/in progress | Existing `SelectableTile`, `NumberStepper`, `IconPicker`; still need form blocks, editable list rows, modifiers editor and live preview patterns | Map supported config to `CreateProductRequest`/`UpdateProductRequest`. Unsupported media/generated artifact fields require future modules before real uploads or delivery. |
| Reference library | `ref-library.jsx`, `ref-data.jsx` | `/reference` in `astrologer-web` | `Dictionary`, `DictionaryAi`, `Ai` | ready | mostly ready | Category rail, source filters, long-form editor refinements | Existing page is production-backed and should be refined against design visuals. |
| Calendar, availability and sessions | `calendar.jsx`, `calendar-data.jsx`, `calendar-month.jsx`, `calendar-panels.jsx`, `widgets.jsx` | future `/calendar` in `astrologer-web` | `Availability`, `Booking`, `Sessions`, `Clients`, `Notifications`, `Orders` | missing | missing | Week/month calendar grid, slot editor, session detail panel, policy modals | Requires timezone-aware availability, slot holds, booking/session contracts and explicit cancellation/reschedule policies. |
| CRM clients | `crm.jsx`, `crm-data.jsx`, `crm-card.jsx`, `widgets.jsx` | future `/clients` in `astrologer-web` | `ClientProfile`, `ClientRelationship`, `BirthData`, `Orders`, `Sessions`, `Messaging`, `Notes`, future `CRMStages` | missing | missing | Master-detail layout, client card, tags, pipeline/kanban, notes composer | Requires consent-aware birth data and clear ownership between client profile, sessions, orders and messaging. |
| Inbox and messages | `inbox.jsx`, `inbox-data.jsx`, `notifications.jsx` | future `/inbox` in `astrologer-web` | `Messaging`, `Notifications`, future channel integrations | missing | missing | Conversation list, message thread, channel badges, connection modal | External channels must be provider-adapter backed. Do not persist linked chats in browser storage. |
| Analytics | `analytics.jsx`, `analytics-data.jsx`, `analytics-charts.jsx` | future `/analytics` in `astrologer-web` | `Analytics`, read models from `Orders`, `Bookings`, `Products`, `Clients`, `Wallet`, `Subscriptions` | missing | missing | Chart primitives, comparison controls, source detail cards | Build as read-model/query surface. Avoid recalculating business metrics in React. |
| Finance and wallet | `finance.jsx`, `finance-data.jsx` | future `/finance` in `astrologer-web` | `Wallet`, `Ledger`, `Payouts`, `Payments/Billing`, `PlatformPlans` | missing | missing | Balance cards, ledger table, payout modal, financial report export | Must be backed by ledger entries and idempotent payment/withdrawal workflows. No controller-side balance mutation. |
| Automation/funnels | `flow-builder.jsx`, `flow-canvas.jsx`, `flow-data.jsx`, `flow-engine.jsx`, `flow-gallery.jsx`, `flow-inspector.jsx`, `flow-nodes.jsx`, `flow-ai.jsx` | future `/funnels` in `astrologer-web` | `Automation`, `Broadcasts`, `Messaging`, `Notifications`, `Analytics`, `Ai`, `Charts`, `Orders`, `Booking` | missing except generic AI service | missing | Flow canvas, node palette, inspector, AI suggestions | Needs explicit event model and job dispatch. Automation must call domain use cases and cannot override booking/payment/consent rules. |
| Content | `content.jsx`, `content-data.jsx` | future `/content` in `astrologer-web` | `Content`, `Media`, `Subscriptions`, `Moderation`, `Notifications`, `SocialPublishing` | missing | missing | Content calendar, post editor, social badges, publish controls | Content moderation and external publishing require backend workflow and auditability. |
| Reviews | `reviews.jsx` | future `/reviews` in `astrologer-web` | `Reviews`, `Moderation`, `Orders`, `Sessions` | missing | missing | Review cards, moderation/status controls | Review visibility must respect moderation workflow. |
| Settings and profile | `settings.jsx`, `page-data.jsx`, `plans-data.jsx`, `access.jsx` | future `/settings` in `astrologer-web` | `AstrologerProfile`, `PublicPage`, `Media`, `Integrations`, `NotificationPreferences`, `PlatformPlans`, `Payouts`, `Verification`, `Loyalty`, `Referral`, `Consent`, `Security` | profile foundation partial; public page/media/integrations/plans/payouts/verification missing | nav footer only | Settings sections, toggles, profile/public page editor controls | Split by domain. Public page settings affect `client-web` direct-link rendering through `public-api`, not only astrologer API. |
| Platform plans and access gates | `plans-data.jsx`, `access.jsx`, `admin-plans.jsx`, `settings.jsx`, `landing.jsx` | astrologer settings/landing plus admin plan management | `PlatformPlans`, `Billing`, `Entitlements`, `AuditLog` | missing | missing | Plan cards, feature matrix, entitlement badges, upsell modal | Plan data cannot live in localStorage. Admin edits require `admin-api` and audit logs; astrologer plan changes need billing workflow. |
| Personal public page editor/preview | `page.jsx`, `page-data.jsx`, `landing-sales.jsx` | editor in `astrologer-web`; public rendering in `client-web` | `AstrologerProfile`, `PublicPage`, `Products`, `Availability`, `Reviews`, `LeadMagnets`, `Content`, `Promotions` | profile/products partial; public page, availability, reviews and lead magnets missing | missing | Public page blocks, block ordering controls, preview frame, story/editor primitives | Public page reads belong to `public-api`; astrologer editing belongs to `astrologer-api`. |
| Chart engine | `engine.jsx`, `engine-data.jsx`, `engine-wheel.jsx`, `engine-modes.jsx`, `engine-tables.jsx`, `wheel.jsx`, `astro-store.jsx` | future `/chart-engine` in `astrologer-web` | `BirthData`, `Charts`, `ChartWorker`, `Ai` | missing except generic AI | missing | Chart wheel/canvas, subject picker, tables, interpretation panels | Heavy calculations must go through chart domain/worker. Design helpers are not production-grade chart services. |
| Numerology | `numerology.jsx`, `numerology-data.jsx`, `numerology-extra.jsx` | future `/numerology` in `astrologer-web` | `Charts` or dedicated `Numerology`, `BirthData`, `Ai` | missing | missing | Number grids, interpretation panels, comparison controls | Decide calculation boundary before implementation. |
| Destiny matrix | `matrix.jsx`, `matrix-data.jsx`, `matrix-graph.jsx`, `matrix-modes.jsx` | future `/destiny-matrix` in `astrologer-web` | `Charts` or dedicated `Matrix`, `BirthData`, `Ai` | missing | missing | Matrix graph, legend, health table, year selector | Same calculation-boundary issue as numerology. |
| Human Design | `hd.jsx`, `hd-data.jsx`, `hd-graph.jsx`, `hd-modes.jsx` | future `/human-design` in `astrologer-web` | `Charts` or dedicated `HumanDesign`, `BirthData`, `Ai` | missing | missing | Bodygraph, centers/channels tables, comparison panels | Requires authoritative calculation rules and test fixtures before product integration. |
| Astro calendar | `astro-calendar.jsx`, `astro-calendar-data.jsx` | future `/astro-calendar` in `astrologer-web` | `Charts`, `AstroCalendar`, `Notifications`, `Automation`, `Clients` | missing | missing | Astro calendar views, event cards, trigger controls | Can become a read model from chart/calendar calculations plus automation triggers. |
| Journal | `journal.jsx`, `journal-data.jsx` | future `/journal` in `astrologer-web`; client-visible subset in `client-web` | `Journal`, `ClientProfile`, `BirthData`, `Charts`, `Subscriptions`, `Consent` | missing | missing | Timeline, diary prompts, shared notes | Separate astrologer private notes from client-visible shared journal entries. |
| Video session | `session-call.jsx`, `calendar-panels.jsx` | future session route/modal in `astrologer-web` and `client-web` | `Sessions`, `Bookings`, `Recordings`, `Notifications`, `Media`, `Consent` | missing | missing | Call controls, overlays, recording status, session materials | Do not implement real calls without provider adapter, recording consent and session lifecycle. |
| Mobile astrologer views | `mobile.jsx`, `mobile-dashboard.jsx`, `mobile-products.jsx`, `mobile-calendar.jsx`, `mobile-crm.jsx`, `mobile-finance.jsx`, `mobile-flows.jsx`, `mobile-inbox.jsx`, `mobile-analytics.jsx`, `mobile-reviews.jsx`, `ios-frame.jsx` | responsive states inside `astrologer-web`, not a separate app | Same modules as desktop | depends per module | missing | Mobile navigation, bottom sheets, touch controls, responsive variants | Treat as responsive requirements for each production surface, not an iOS-frame production wrapper. |

## Client Surface Mapping

These design files belong primarily to `apps/client-web` and `apps/public-api`,
not to `astrologer-web` or `astrologer-api`.

| Design area | Design files | Production surface | Domain ownership | API/contracts status | Frontend status | Notes |
|---|---|---|---|---|---|---|
| Public astrologer page | `page.jsx`, `page-data.jsx`, `landing-sales.jsx` | `client-web` public direct-link routes backed by `public-api` | `AstrologerProfile`, `PublicPage`, `Products`, `Availability`, `Reviews`, `LeadMagnets`, `Content`, `Promotions` | profile foundation partial; public read contracts missing | missing | Public reads must use separate public contracts. Direct-link pages must not become SEO discovery or a public catalog. |
| Booking and checkout entry | `page.jsx`, `client.jsx`, `calendar-panels.jsx`, screenshots `*-book*`, `*-chk*`, `*-pay*` | `client-web` booking/checkout flow with `public-api` | `Booking`, `Availability`, `Orders`, `Payments`, `Products`, `ClientProfile` | missing except public identity | missing | Requires slot holds, idempotent order/payment commands, explicit timezone display and failure/expiry handling. |
| Client registration during booking | `app.jsx`, `client.jsx` (`ClientRegister`) | `client-web` + `public-api` | `Identity`, `ClientProfile`, `Booking` | public identity ready; booking/client profile missing | auth page exists; booking registration missing | Registration must be explicit client-only and direct-link scoped. |
| Client cabinet | `client.jsx`, `client-data.jsx` | authenticated `client-web` routes | `ClientProfile`, `ClientAstrologerRelationship`, `Bookings`, `Orders`, `Sessions`, `Materials`, `Subscriptions`, `BirthData`, `Journal`, `Notifications` | missing | `/me` placeholder only | The design's "all astrologers" selector may show only astrologers already connected through direct links, purchases, bookings, lead magnets or manual relationship; it must never become discovery. |
| Client sessions and materials | `client.jsx`, `session-call.jsx` | `client-web` authenticated session/material routes | `Sessions`, `Bookings`, `Orders`, `Recordings`, `Materials`, `Media`, `Consent` | missing | missing | Recording playback and downloadable materials require consent, retention and access-control rules. |
| Client feed and subscriptions | `client.jsx`, `client-data.jsx`, `content-data.jsx` where client-visible | `client-web` authenticated feed/subscription routes | `Content`, `Subscriptions`, `Orders`, `Payments`, `Notifications` | missing | missing | Feed must be scoped to astrologers the client already follows/has relationships with. |
| Client birth data, charts and diary | `client.jsx`, `client-data.jsx`, `journal.jsx` where client-visible | `client-web` authenticated personal data/chart/journal routes | `BirthData`, `Charts`, `Journal`, `Consent`, `ClientProfile` | missing | missing | Birth data sharing is consent-bound per order/relationship. |
| Client notifications and disputes | `client.jsx`, `client-data.jsx`, admin dispute screens for operator side | `client-web` plus future support/admin workflows | `Notifications`, `Disputes`, `Payments`, `Orders`, `AuditLog` | missing | missing | Client dispute creation must be public/client-side; resolution belongs to `admin-api`. |

## Admin Surface Mapping

These design files belong to `apps/admin-web` and future `apps/admin-api`. They
must not be added to `astrologer-api`.

| Design area | Design files | Production surface | Domain ownership | API/contracts status | Frontend status | Notes |
|---|---|---|---|---|---|---|
| Admin overview and analytics | `admin.jsx`, `admin-data.jsx` | `admin-web` + future `admin-api` | `PlatformAnalytics`, `Users/Roles`, `Verification`, `Moderation`, `Payments`, `Disputes`, `AuditLog` | missing | shell placeholder | Needs internal role authorization and backend read models. |
| User operations and payout terms | `admin.jsx`, `admin-data.jsx` | `admin-web` + future `admin-api` | `Users/Roles`, `AstrologerProfile`, `Payouts`, `PlatformPlans`, `AuditLog` | missing | missing | Admin user actions and payout overrides must be audited and must call domain use cases. |
| Verification queues | `admin.jsx`, `admin-data.jsx` | `admin-web` + future `admin-api` | `Verification`, `AstrologerProfile`, `KYC`, `AuditLog` | missing | missing | Verification status is protected workflow state, not an astrologer-editable profile field. |
| Moderation queues | `admin.jsx`, `admin-data.jsx` | `admin-web` + future `admin-api` | `Moderation`, `Content`, `Reviews`, `PublicPage`, `Products`, `AuditLog` | missing | missing | Moderation decisions need reasons, reviewer identity and audit trail. |
| Disputes and refunds | `admin.jsx`, `admin-data.jsx` | `admin-web` + future `admin-api` | `Disputes`, `Orders`, `Payments`, `Refunds`, `Wallet/Ledger`, `AuditLog` | missing | missing | Refunds must go through payment/billing use cases and idempotent provider workflows. |
| Admin plans | `admin-plans.jsx`, `plans-data.jsx` | `admin-web` + future `admin-api` | `PlatformPlans`, `Billing`, `Entitlements`, `AuditLog` | missing | missing | Plan edits are sensitive platform settings and need auditability. |
| Platform settings and legal | `admin.jsx`, `admin-data.jsx` | `admin-web` + future `admin-api` | `PlatformSettings`, `LegalDocuments`, `FeatureFlags`, `AuditLog` | missing | missing | Settings cannot be local toggles. They require permission checks, versioning and audit logs. |
| Admin communications | `admin.jsx` (`AdmCompose`) | `admin-web` + future notification/admin API | `Notifications`, `Support`, `AuditLog` | missing | missing | Operator messages must use notification providers/templates and record sender/action context. |

## Cross-Cutting Design Assets

| Design files | Production interpretation |
|---|---|
| `styles.css`, `icons.jsx` | Canonical visual direction and icon vocabulary. Tokens and icons must be implemented in `packages/design-system`; do not copy global CSS wholesale. |
| `tweaks-panel.jsx`, `DemoSwitch` in `app.jsx` | Prototype-only controls. Not production UI. |
| `image-slot.js`, screenshot assets, `.image-slots.state.json` | Useful for visual QA and media placeholders only. Production media requires object storage, CDN/media contracts and accessibility metadata. |
| `uploads/*.md`, `uploads/*.html` | Requirements/design input only. Do not import into app runtime. Important product rules must be represented in docs, contracts or code. |
| `ios-frame.jsx` | Device mock/reference artifact. Use responsive web implementation rather than iOS frame wrappers in production screens. |
| `astro-store.jsx` and design calculation helpers | Mock persistence and demo calculation state. Real calculations require domain ports, worker contracts and fixtures. |

## Design-System Extraction Backlog

Already extracted or started:

- `SelectableTile`, `NumberStepper`, `IconPicker` for product constructor-style
  controls.
- Current shell/auth/products/reference icons and navigation primitives.

Still valid extraction candidates:

- `CommandMenu` / create menu popover for topbar create actions.
- `NotificationsPopover` primitives and toast patterns.
- `MetricStrip` and compact `MetricCard`.
- `StatusMenu` and `ActionMenu` patterns for products, sessions and reviews.
- Form block, editable list row and modifier editor components.
- `MasterDetailShell` for CRM-like screens.
- Public page block editor primitives after `PublicPage` contracts exist.
- Calendar grid primitives after availability/session contracts exist.
- Ledger table and money display primitives after wallet/ledger contracts exist.
- Chart/canvas primitives only after calculation boundaries and data shapes are
  formalized.

Do not extract components that encode unresolved business state transitions. For
example, booking cancellation, payout request and moderation actions need domain
use cases before shared UI should imply behavior.

## Recommended Integration Sequence

1. **Products/Product Constructor**
   - Backend/contracts: existing `Products` contract is ready for most core
     fields.
   - Frontend: complete the constructor mapped to `CreateProductRequest` and
     `UpdateProductRequest`.
   - Design system: continue using extracted selectable tiles, number stepper
     and icon picker; add form block/list/modifier primitives only when they are
     reusable.
   - Remaining explicit gap: media upload/storage, generated artifacts and real
     product analytics.

2. **Reference/Dictionary Refinement**
   - Backend/contracts: ready.
   - Frontend: refine visual parity and editor ergonomics; keep AI draft flow
     provider-neutral.
   - Design system: long-form editor and source/status filter patterns if
     reusable.

3. **Astrologer Profile, Public Page and Onboarding Foundation**
   - Finish `AstrologerProfile` DB/API wiring before profile-backed shell,
     settings and onboarding.
   - Add `PublicPage` editing contracts separately from public read contracts.
   - Keep payout, verification, plan and schedule steps behind their own domain
     modules rather than a single generic onboarding blob.

4. **Availability, Calendar, Booking and Sessions**
   - Implement timezone-aware availability first.
   - Add slot holds, booking/session read models and idempotent booking/order
     commands.
   - Booking/order/payment commands must require idempotency where applicable.

5. **Client Cabinet**
   - Implement client profile, relationships to astrologers, orders/bookings,
     materials and consent-aware birth data.
   - Preserve direct-link relationship boundaries. Multiple astrologers in the
     client cabinet are allowed only when the client already has explicit
     relationships with them.

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

9. **Admin Surface**
   - Create `admin-api` before implementing admin/moderator/super-admin
     workflows.
   - Route internal actions through domain use cases and audit logs.

## First Implementation Slice Candidate

The safest first code slice remains `Products/Product Constructor` because it
has the highest overlap between the design and existing production backend:

- Existing API supports product CRUD/status transitions/duplicate.
- Existing shared contract already models product type, delivery formats,
  execution mode, payment model, participant mode, required data, methods,
  access grants, included items and modifiers.
- Existing frontend already has product list, summary, create/update mutations
  and draft-to-contract mapping work in progress.

The implementation should not copy `ProductConstructor` directly. It should
rebuild the interaction with production React components, shared contracts,
React Query mutations and design-system primitives.

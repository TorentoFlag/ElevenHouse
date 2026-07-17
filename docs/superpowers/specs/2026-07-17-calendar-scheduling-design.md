# Calendar And Scheduling Production Design

**Status:** approved by the user for Program A implementation on 2026-07-17

**Date:** 2026-07-17

**Owning product surface:** authenticated astrologer workspace in
`apps/astrologer-web`, with future direct-link booking in `apps/client-web`

## Purpose

Build the production calendar contour for ElevenHouse without copying the
prototype runtime architecture. The astrologer must be able to understand their
schedule in day, week and month views, configure bookable availability in their
own timezone and create a real booking for an already-linked CRM client.

The approved frontend direction is hybrid:

- ElevenHouse owns product behavior, contracts, state, design-system components,
  panels, modals, responsive composition and mobile presentation.
- A calendar layout engine may own desktop time-grid and day-grid geometry behind
  an app-local adapter.
- The selected engine does not become a domain model, API contract or persistence
  dependency.
- Exact `ElevenHouseDesign` screens remain the visual contract.

The complete calendar program also includes public booking, expiring holds,
orders, real payments, session outcomes, notifications and external calendar
integration. Those contours are sequenced after the first production slice and
must not be represented by mock success or inferred financial state.

## Observable Definition Of Done

### First delivery slice

An authenticated astrologer can open `/calendar` and:

1. navigate real day, week and month date ranges;
2. see server-backed availability, manual blocks and bookings for the requested
   range in the astrologer's configured IANA timezone;
3. open and close the right summary panel;
4. enter availability-edit mode, create or remove multiple time periods on a
   date or weekday, add a date override and save through the API;
5. create a booking for an existing active CRM relationship and an active,
   live-session product;
6. receive an explicit conflict response if another active reservation overlaps
   the selected occupied interval;
7. reopen the created booking from the calendar after a page reload;
8. use an accessible non-drag interaction for every operation available by
   pointer;
9. use the equivalent mobile agenda flow at the approved mobile viewport;
10. switch RU/EN without untranslated calendar-owned copy.

The first slice does not display received/expected revenue, payment holds,
payment-pending states, completed sessions or no-show outcomes. Those values
become visible only when their authoritative domains are implemented.

### Complete program target

Later independently planned slices add:

- direct-link client booking with expiring slot holds;
- orders, provider-backed payment attempts, manual payment records, refunds and
  ledger-backed finance summaries;
- reschedule requests, cancellation policies, no-show and session lifecycle;
- notification jobs and reminders;
- Google Calendar OAuth, incremental synchronization, channel renewal and
  external busy intervals;
- optional real AstroCalendar overlay.

## Scope

### In scope for the first delivery slice

- `/calendar` route in `astrologer-web`.
- Day, week and month views.
- Desktop right-panel layout and responsive mobile agenda.
- Availability schedules, weekly periods and date overrides.
- Manual non-bookable blocks such as leave or personal time.
- Schedule-level booking policy defaults:
  - start interval;
  - buffer before and after;
  - minimum booking notice;
  - booking horizon;
  - maximum confirmed bookings per day.
- Assignment of active live-session products to the default schedule.
- Calendar range read model.
- Manual booking for an existing active CRM client.
- Immutable product, money and scheduling snapshots on the booking.
- Database-enforced overlap protection.
- CSRF, persisted idempotency and owner scoping for mutations.
- RU/EN contracts and UI copy.
- Targeted, integration, API, frontend and browser/design-parity evidence.

### Out of scope for the first delivery slice

- Client-facing public booking.
- Guest or unlinked-client creation from the booking modal.
- Provider payment checkout, prepayment, postpayment or refunds.
- Revenue cards and finance totals.
- Completion, no-show, recordings, materials or session calls.
- Email, SMS, Telegram or push delivery.
- Google Calendar OAuth or synchronization.
- Astro hints calculated from chart data.
- Recurring appointments or group/resource scheduling.
- Admin support workflows.

These are deferred vertical slices, not hidden or browser-only behavior.

## Sources Of Truth

### Product and architecture

- `docs/product/full-functional-scope.md`
- `docs/product/roadmap.md`
- `docs/architecture/backend-modules.md`
- `docs/architecture/design-reference-inventory.md`
- `docs/api/api-boundaries.md`
- `docs/decisions/0001-monorepo-and-app-boundaries.md`
- `docs/decisions/0003-nestjs-modular-backend.md`
- `docs/decisions/0004-payments-notifications-workers.md`
- `docs/decisions/0005-custom-design-system.md`
- `docs/decisions/0006-drizzle-database-tooling.md`
- `docs/decisions/0007-cookie-auth-csrf-and-idempotency.md`

### Visual and interaction

- `ElevenHouseDesign/app/calendar.jsx`
- `ElevenHouseDesign/app/calendar-data.jsx`
- `ElevenHouseDesign/app/calendar-month.jsx`
- `ElevenHouseDesign/app/calendar-panels.jsx`
- `ElevenHouseDesign/app/mobile-calendar.jsx`
- `ElevenHouseDesign/screenshots/cal-1.png`
- `ElevenHouseDesign/screenshots/cal-2.png`
- user-provided day, week, status, availability and booking-modal screenshots

Prototype `window.*`, local state, mock arrays, hardcoded May 2026 dates and
prototype status mutation are explicitly rejected as production sources.

## Approved Product Corrections To The Prototype

The design's visible language is retained, but the following prototype behavior
is not valid production behavior.

1. **Slot duration becomes start interval.** Product duration remains owned by
   the selected product. A global `60 minute slot` cannot schedule existing
   30/45/60/90-minute products correctly. The availability control is named
   `Шаг начала слотов` / `Start interval`.
2. **Availability supports multiple periods.** A day may contain `10:00-13:00`
   and `15:00-19:00`; clicking one whole hour is not the persistence model.
3. **Date overrides are first-class.** Leave, holidays and exceptional working
   dates override weekly recurrence without rewriting the base schedule.
4. **Statuses remain separate domain states.** Hold, payment, booking and session
   outcomes are combined only into a read-model `displayStatus`.
5. **Manual payment never means completed session.** Payment and session outcome
   are independent. Payment UI is absent until the payment contour exists.
6. **A booking snapshots commercial terms.** Later product or policy edits do
   not rewrite an existing appointment.
7. **Financial summaries are authoritative.** They come from payment/ledger read
   models, never from completed mock sessions multiplied by current product
   prices.
8. **Drag is not an immediate mutation.** A drop creates a proposed reschedule,
   is validated by the server and is reverted on rejection. Rescheduling itself
   is deferred beyond the first slice.
9. **Astro is an optional real overlay.** Hardcoded daily recommendations are not
   shipped.
10. **Existing client means an active owner-scoped relationship.** The first
    slice does not silently create a guest or global client record.

## Domain Boundaries

### Availability

Owns:

- named schedules and their IANA timezone;
- weekly recurring availability periods;
- date-specific available/unavailable overrides;
- schedule policy defaults;
- product-to-schedule assignments;
- manual blocks;
- deterministic candidate-slot projection.

Availability answers whether a candidate can be offered. It does not own a
booking, order, payment or session outcome.

### Booking

Owns:

- booking identity and astrologer/client/product references;
- service start/end instants;
- immutable product, price, currency and policy snapshots;
- confirmed/cancelled booking lifecycle;
- future reschedule request lifecycle;
- the command that atomically claims schedule occupancy.

The first slice creates only confirmed internal bookings. Future public booking
creates an expiring hold before confirmation.

### Schedule Occupancy

`ScheduleReservation` is the concurrency boundary shared by bookings, holds and
manual blocks. It owns an occupied UTC range that includes applicable buffers.
The database, not the browser and not Redis, is the final double-booking guard.

### Orders, Payments, Sessions And Notifications

These remain separate modules:

- Orders owns the purchase lifecycle.
- Payments owns provider attempts, callbacks, reconciliation and refunds.
- Wallet/Ledger owns financial truth.
- Sessions owns in-progress, completed and no-show outcomes.
- Notifications owns templates and delivery state.

The calendar consumes read models from these modules when they exist; it never
mutates their tables directly.

## Time Model

- Persist concrete bookings, reservations and blocks as UTC instants.
- Persist recurring weekly periods as weekday plus local wall-clock minutes in
  the schedule's IANA timezone.
- Persist date overrides as ISO calendar dates interpreted in that schedule
  timezone.
- Return ISO instants and the effective display timezone in API responses.
- Use half-open ranges `[start, end)` throughout so adjacent reservations do not
  overlap.
- Reject nonexistent local times during forward DST transitions.
- When a local time occurs twice during a backward transition, require a
  resolved offset/instant from the slot projection instead of silently choosing
  in a mutation request.
- A timezone change affects future slot projection but never changes the UTC
  instant of an existing booking.

Calendar arithmetic is centralized in Availability domain services. React,
controllers and Drizzle adapters do not duplicate timezone calculations.

## Availability Projection

Available starts for a product and bounded range are derived as follows:

1. Load the schedule, timezone, weekly periods and date overrides.
2. Resolve effective local periods for each requested date.
3. Generate candidate starts at the configured start interval.
4. Apply product duration and schedule buffers to produce service and occupied
   ranges.
5. Remove candidates outside minimum notice and booking horizon.
6. Remove candidates intersecting active reservations or external busy ranges.
7. Remove candidates after the daily confirmed-booking limit is reached.
8. Return exact UTC starts/ends plus local display labels.

Future slots are not materialized as permanent rows. Projection is range-bounded
and queryable for day/week/month and public booking windows.

## Persistence Design

The following focused schema groups belong under `packages/db/src/schema/`.

### Availability tables

- `availability_schedules`
  - owner astrologer;
  - name;
  - IANA timezone;
  - default flag;
  - version for optimistic updates;
  - start interval, buffers, notice, horizon and daily limit;
  - created/updated timestamps.
- `availability_weekly_periods`
  - schedule;
  - weekday `1..7`;
  - local start and end minute;
  - non-overlapping periods per schedule/day.
- `availability_date_overrides`
  - schedule and local date;
  - `available` or `unavailable` mode;
  - one override per schedule/date.
- `availability_override_periods`
  - available override;
  - local start/end minute.
- `availability_product_assignments`
  - schedule and active product;
  - unique product assignment per owner.

### Scheduling tables

- `schedule_reservations`
  - astrologer owner;
  - kind `booking | hold | manual_block`;
  - lifecycle `active | consumed | released | expired | cancelled`;
  - service start/end UTC;
  - occupied start/end UTC;
  - optional source aggregate ID;
  - optional hold expiry;
  - created/updated timestamps.
- `bookings`
  - owner astrologer;
  - related active client user ID;
  - source product ID;
  - reservation ID;
  - state `confirmed | cancelled` for the first slice;
  - product title, duration and delivery-format snapshot;
  - price minor/currency snapshot;
  - timezone and policy snapshot;
  - created/updated timestamps.
- `manual_calendar_blocks`
  - owner astrologer;
  - reservation ID;
  - owner-visible title;
  - state `active | released`;
  - created/updated timestamps.
- `idempotency_commands`
  - API surface, authenticated actor, command scope and key;
  - canonical request hash;
  - lifecycle and serialized contract result;
  - expiry and timestamps.

`schedule_reservations` uses PostgreSQL `tstzrange` semantics and a GiST
exclusion constraint combining astrologer identity with overlapping active
occupied ranges. The migration installs `btree_gist` when it is not already
present. Expected conflicts are translated to a typed scheduling conflict, not
leaked as a database error.

Schema work follows the repository baseline policy: regenerate the current
baseline, verify production reconciliation fixtures when the baseline has
already been deployed, and reset only the confirmed local ElevenHouse database.

## Contracts And API

All request/response schemas live in `packages/contracts`; frontends parse every
response before use.

### Astrologer API, first slice

- `GET /availability/schedules/default`
  - returns schedule policy, weekly periods, overrides in a bounded date range,
    and assigned product IDs;
  - returns safe `404 schedule_not_found` when no default exists and never
    creates state as a read side effect.
- `PUT /availability/schedules/default`
  - creates the first default schedule when `expectedVersion` is `null`, or
    replaces the complete validated default aggregate when it is a positive
    version;
  - requires CSRF;
  - returns `409` with current version on optimistic conflict.
- `GET /calendar/range?start=<instant>&end=<instant>&timeZone=<iana>`
  - range is required and bounded;
  - returns availability backgrounds, manual blocks, booking entries and summary
    counts/hours;
  - does not return financial totals in the first slice.
- `POST /bookings/manual`
  - accepts related client ID, active live product ID, a delivery format offered
    by that product and exact projected start;
  - requires CSRF and `Idempotency-Key`;
  - atomically validates ownership/product/schedule and claims occupancy;
  - returns the contract-shaped booking and calendar entry.
- `POST /calendar/blocks`
  - accepts an owner-visible title and exact UTC start/end instants;
  - requires CSRF and `Idempotency-Key`;
  - atomically creates a manual-block reservation and block record, using the
    same owner-wide overlap invariant as bookings.
- `DELETE /calendar/blocks/:blockId`
  - requires CSRF;
  - idempotently releases an owner-scoped active block and its reservation.
- `GET /bookings/:bookingId`
  - returns an owner-scoped booking detail used by the right panel.

### Error contracts

- `availability_version_conflict`
- `schedule_not_found`
- `product_not_bookable`
- `client_relationship_not_active`
- `slot_no_longer_available`
- `slot_outside_availability`
- `booking_notice_violation`
- `booking_horizon_violation`
- `daily_booking_limit_reached`
- `manual_block_not_found`
- `idempotency_key_reused_with_different_request`

Errors contain stable codes and safe field context. They do not expose another
owner's record, raw SQL or provider internals.

### Future API surfaces

Public slot reads and booking intents belong to `public-api`; internal calendar
management remains in `astrologer-api`. Admin exceptions belong to `admin-api`
with permissions and audit logging.

## Frontend Architecture

### Page ownership

`apps/astrologer-web/src/pages/calendar/CalendarPage.tsx` is the route
composition. Derived range, selection, panel and mutation behavior lives under
`apps/astrologer-web/src/features/calendar/model/`. API calls live in focused
`features/availability/api` and `features/bookings/api` modules.

### Renderer boundary

Define an app-local `CalendarRendererAdapter` interface that consumes only the
validated calendar view model:

- visible range and active view;
- timezone and locale;
- calendar entries;
- availability backgrounds and blocks;
- selection and navigation callbacks;
- event activation callback.

FullCalendar types must not appear in page props, query cache payloads,
contracts or domain packages. The adapter maps read-model entries to engine
events and renders ElevenHouse React components through supported content hooks.

### Desktop presentation

- App-owned `CalendarToolbar` matches the reference navigation and segmented
  day/week/month control.
- `CalendarWorkspace` places the renderer beside the right panel.
- `CalendarSessionCard` renders time, client, product, format icon and display
  status using design-system tokens.
- `CalendarSummaryPanel` shows range title, booking count, booked hours and
  authoritative status counts.
- `AvailabilityEditorPanel` edits policy and active schedule.
- `BookingDetailPanel` shows the server-backed booking snapshot.
- `ManualBookingDialog` searches existing related clients and active live
  products, selects a delivery format when the product offers more than one,
  then requests projected valid starts.

The revenue cards and statuses without authoritative domains are omitted in the
first slice. Their later insertion preserves the reference panel geometry.

### Month presentation

The bounded spike first tests FullCalendar DayGrid with custom day header,
day-cell and event content hooks. It is accepted only if the reference month
geometry, overflow behavior and keyboard semantics can be achieved without
private DOM coupling.

If the spike fails, `CalendarMonthView` is an app-owned component over the same
view model. This does not change contracts, queries or other views.

### Mobile presentation

Mobile uses an app-owned agenda/list based on `mobile-calendar.jsx`, not a
compressed seven-column desktop time grid. It shares queries, display-status
mapping, dialogs and mutations with desktop.

### Design-system boundary

Only stable visual primitives with demonstrated reuse enter
`packages/design-system`. Calendar-specific panels, renderer adapters and
business composition stay in `astrologer-web`.

## Visual Evidence Matrix

Before implementation the following exact reference states must be captured in
a real browser:

| State | Route | Locale | Viewport | Required evidence |
| --- | --- | --- | --- | --- |
| Week with panel | `ElevenHouseDesign/ElevenHouse.html`, calendar/week | RU | approved desktop | screenshot and grid/panel metrics |
| Week panel hidden | same | RU | approved desktop | screenshot, width and overflow |
| Day | calendar/day, Friday 29 May 2026 | RU | approved desktop | screenshot and event geometry |
| Month | calendar/month, May 2026 | RU | approved desktop | screenshot, cell sizing and overflow |
| Availability | calendar/week with availability mode | RU | approved desktop | screenshot, selection, controls and focus |
| Manual booking | booking dialog open | RU | approved desktop | screenshot, dropdown/modal interactions |
| Mobile agenda | mobile calendar/day | RU | approved mobile | screenshot and touch targets |
| Mobile detail | mobile booking/session detail | RU | approved mobile | screenshot, sheet focus and scroll |

Measured evidence includes dimensions, padding, gaps, typography, colors,
borders, radii, shadows, z-index, overflow, hover, focus, disabled and selected
states. Production is compared at the same viewport and equivalent server-backed
state.

The design server was reachable at `http://localhost:8000/ElevenHouse.html`
during research, but the earlier session exposed no controllable browser. No
visual implementation claim is permitted until this matrix is captured.

## Accessibility

- Calendar entries are interactive buttons or receive equivalent button
  semantics and are keyboard focusable.
- Color never carries status alone; text and border treatment are present.
- Toolbar has an appropriate heading hierarchy and labelled view selector.
- Availability periods can be created and edited with keyboard-accessible form
  controls; pointer range selection is an enhancement.
- Any future drag/drop action has an equivalent move/reschedule dialog.
- Dialogs and mobile sheets trap and restore focus, close with Escape and expose
  name/description relationships.
- Mutations announce pending, success and conflict results through a live region.
- Target size and contrast are verified in the rendered reference comparison.

## Security, Privacy And Reliability

- Every read and mutation is scoped to the authenticated astrologer.
- Client lookup returns only active explicit relationships and never becomes
  discovery.
- Booking creation revalidates client relationship and product ownership on the
  server.
- Availability and booking mutations require CSRF.
- Booking creation requires persisted idempotency with request-hash comparison
  and result replay.
- Overlap prevention is transactional and database-enforced.
- Client-facing calendar responses never expose unrelated booking details or
  external-calendar titles.
- Calendar reads are bounded by maximum duration and result count.
- Audit-friendly structured logs contain aggregate IDs, command code and safe
  outcome, not sensitive birth data.
- Metrics cover slot projection latency, booking conflicts, idempotent replays
  and range-read latency.

## Loading, Empty, Error And Conflict States

- Initial range loading retains the calendar shell and shows a non-blocking
  progress state.
- Empty ranges show availability backgrounds and an explicit no-bookings state,
  not mock cards.
- A failed range read shows retry without clearing the last validated range into
  invented empty data.
- An availability version conflict preserves local edits and offers reload of
  the current server version.
- A booking conflict leaves the dialog open, marks the selected start stale and
  reloads candidate starts.
- Permission/not-found responses use the same safe public shape to avoid owner
  enumeration.
- Unsupported financial and integration functionality is absent rather than
  silently disabled.

## Research

**Question:** Can a hybrid renderer match the ElevenHouse calendar while the
project retains production scheduling correctness?

**Decision affected:** frontend calendar engine boundary, availability time
model, overlap protection and future external-calendar integration.

**Accessed:** 2026-07-16 and refreshed 2026-07-17.

### Sources

- [FullCalendar React component](https://fullcalendar.io/docs/react) — React
  17-19 support, JSX content injection and custom toolbar controller in v7.
- [FullCalendar event render hooks](https://fullcalendar.io/docs/event-render-hooks)
  — public class/content hooks for event presentation.
- [FullCalendar custom themes](https://fullcalendar.io/docs/custom-themes) —
  public class-name theme boundary.
- [FullCalendar accessibility](https://fullcalendar.io/docs/accessibility) —
  keyboard/focus and ARIA capabilities that still require product verification.
- [FullCalendar license](https://fullcalendar.io/license) — Standard plugins use
  the MIT license; Premium resource views are not required.
- [RFC 5545](https://www.rfc-editor.org/info/rfc5545/) — timezone-referenced
  recurrence and recurrence exception semantics.
- [TC39 Temporal time zones](https://tc39.es/proposal-temporal/docs/timezone.html)
  — wall-clock versus exact time and DST ambiguity handling.
- [PostgreSQL range types](https://www.postgresql.org/docs/17/rangetypes.html#RANGETYPES-CONSTRAINT)
  — GiST exclusion constraints for non-overlapping reservations.
- [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)
  and [CREATE TABLE](https://www.postgresql.org/docs/current/sql-createtable.html)
  — exclusion and partial-constraint semantics.
- [PostgreSQL btree_gist](https://www.postgresql.org/docs/current/btree-gist.html)
  — GiST equality operator classes for scalar owner IDs.
- [Drizzle indexes and constraints](https://orm.drizzle.team/docs/indexes-constraints)
  — supported schema DSL used to verify the exclusion-constraint gap.
- [Google appointment schedules](https://support.google.com/calendar/answer/10729749)
  — recurring periods, adjusted availability, buffers, notice and daily limits.
- [Google incremental synchronization](https://developers.google.com/workspace/calendar/api/guides/sync)
  — persisted sync tokens and full resync after invalidation.
- [Google push notifications](https://developers.google.com/workspace/calendar/api/guides/push)
  — expiring channels and bodyless change notifications.
- [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests)
  and [webhook behavior](https://docs.stripe.com/webhooks) — future payment
  commands and duplicate/out-of-order delivery requirements.

### Findings

- **Repository evidence:** ElevenHouse already separates Availability, Booking,
  Orders, Payments, Sessions and Notifications in canonical architecture.
- **Sourced fact:** FullCalendar v7 exposes React JSX render hooks and a custom
  toolbar controller; Standard plugins are sufficient and MIT licensed.
- **Inference:** A renderer adapter can preserve ElevenHouse presentation while
  avoiding the cost and accessibility risk of writing all calendar geometry.
- **Sourced fact:** PostgreSQL exclusion constraints directly express the
  non-overlap invariant required for booking occupancy; `tstzrange(..., '[)')`
  permits adjacent reservations and a partial predicate limits the constraint
  to active rows.
- **Repository and sourced finding:** installed Drizzle ORM/Kit can express the
  scheduling tables, foreign keys, checks and indexes, but its documented and
  installed schema DSL has no first-class exclusion-constraint declaration.
- **Inference:** the baseline generator therefore needs a deterministic,
  fail-closed and idempotent SQL augmentation, covered by tests, instead of
  weakening the invariant to application-only checks.
- **Inference:** Weekly availability must remain local-time recurrence while
  concrete reservations remain exact UTC instants.
- **Sourced fact:** External calendar notifications are not a complete event
  feed and channels expire; Google integration therefore requires a worker and
  reconciliation, not a frontend toggle.

### Options

1. **Fully custom calendar.** Maximum DOM control, but ElevenHouse would own
   overlap layout, navigation, selection, drag/touch and accessibility. This
   creates high delivery and maintenance risk.
2. **FullCalendar as the feature architecture.** Fastest initial rendering, but
   library objects and imperative state can leak into contracts and page logic,
   making replacement and testing expensive.
3. **Hybrid adapter.** Use the engine only for replaceable desktop geometry;
   retain app-owned state, components and domain contracts. This adds an adapter
   and bounded visual spike but best balances fidelity and production risk.

### Recommendation

Use option 3. Evaluate FullCalendar Standard v7 in a bounded spike against the
exact day/week/month reference states. Promote it only behind
`CalendarRendererAdapter`. Use a custom month or mobile presentation when a
public hook cannot reach parity without private DOM coupling.

### Rejected alternatives

- Fully custom day/week geometry is rejected because it duplicates mature
  interaction and accessibility work without product value.
- FullCalendar-owned business state is rejected because booking correctness and
  API state must remain independent of a renderer.
- Premium scheduler/resource plugins are rejected because the first program has
  one astrologer resource and needs no resource timeline.
- Pre-materializing every future slot is rejected because rule edits, timezone
  changes and external busy updates would create large stale datasets.

### User decisions

- Hybrid renderer approach: approved 2026-07-17.
- No remaining material decision blocks the first delivery slice.

## Delivery Decomposition

### Program A: Calendar foundation and internal booking

This spec's first implementation plan covers the bounded spike, Availability,
range read model, day/week/month UI and manual booking for an existing CRM
client. It produces useful production behavior without payment fiction.

### Program B: Public direct-link booking

Add public slot reads, booking intents, expiring holds, client authentication
continuation and confirmation without discovery.

### Program C: Orders and payments

Add provider-backed checkout, prepayment/postpayment policy, manual payment
records, webhook reconciliation, refunds, ledger and financial summary cards.

### Program D: Session lifecycle and notifications

Add reschedule/cancel/no-show/completion policies, reminders, session materials
and consent-dependent recordings.

### Program E: External calendars and overlays

Add Google Calendar OAuth/sync/reconciliation and the optional authoritative
AstroCalendar overlay.

Each program receives its own living ExecPlan and acceptance matrix. Program A
does not create disabled simulations of Programs B-E.

## Verification Strategy

### Automated

- Contract parsing and rejected-shape tests.
- Pure slot projection tests including multiple periods, overrides, notice,
  horizon, limits and DST fixtures.
- Booking use-case tests for owner scoping, snapshots and typed conflicts.
- Database integration tests for concurrent overlap, adjacent ranges,
  idempotent replay and transaction rollback.
- API tests for auth, CSRF, idempotency, safe errors and range bounds.
- Frontend tests for range navigation, validated response mapping, panels,
  conflict recovery and RU/EN copy.
- Renderer adapter contract tests without testing library internals.

### Runtime and visual

- Existing services are diagnosed read-only; lifecycle changes require explicit
  user authority.
- Run the authenticated, network-backed `/calendar` flow with real local DB
  records.
- Capture reference and production states from the evidence matrix at identical
  viewports.
- Inspect console, network, keyboard/focus, loading, empty, success, validation,
  conflict, error and retry behavior.
- Run affected package/app builds and repository `pnpm verify` after targeted
  checks.

## Operational And Migration Notes

- Calendar range reads must be index-backed and bounded.
- Projection should be instrumented before caching is introduced; caching is not
  required for the first slice.
- Redis is not required for correctness of internal booking.
- Expired public holds later require a worker/reaper, while database time and
  status remain authoritative.
- New outbox payload variants are added only with the slice that sends real
  notifications.
- Production baseline reconciliation recognizes only the explicitly approved
  predecessor histories, applies the scheduling DDL transactionally and then
  records the new baseline hash. Unknown histories fail closed.
- The first default schedule is created only by the authenticated CSRF-protected
  `PUT` command; reads remain side-effect free.
- Deployment readiness does not depend on FullCalendar; it is a frontend
  dependency behind an adapter.

## Approval Gate

After written review of this spec, create a self-contained Program A
implementation plan. Implementation begins with the renderer spike and domain
contract tests, not with copying prototype JSX.

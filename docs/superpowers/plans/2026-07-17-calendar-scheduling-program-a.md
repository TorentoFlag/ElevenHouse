# Calendar Scheduling Program A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:executing-plans` to implement this plan inline task-by-task.
> ElevenHouse repository policy overrides generic worktree/feature-branch
> guidance: execute in the existing checkout on `main`, preserve concurrent
> changes and do not commit without separate user authority.

**Goal:** Deliver the first production calendar slice: owner-scoped day, week
and month views, availability editing, manual blocks and idempotent manual
booking for an existing active CRM client and active live-session product.

**Architecture:** Availability owns recurring local-time rules and projection;
Booking atomically claims a UTC occupancy range through a database-enforced
exclusion constraint; the astrologer API exposes validated contracts; the
frontend owns product state and presentation while FullCalendar Standard v7 is
isolated behind an app-local renderer adapter.

**Tech Stack:** TypeScript 6, React 19, Vite 8, TanStack Query 5, NestJS,
Drizzle ORM, PostgreSQL, Zod-backed ElevenHouse contracts, FullCalendar 7,
Temporal polyfills, Vitest and the ElevenHouse design system.

**Status:** Approved; implementation in progress on shared `main`.

## Global Constraints

- Work only in the current ElevenHouse checkout on `main`.
- Re-read complete target files and their path-scoped diff before every edit
  group; preserve all unowned modifications.
- Follow red-green-refactor. No production implementation precedes the failing
  test that specifies it.
- Do not start, stop or restart any frontend, API, database, Redis, worker or
  other long-running process without a direct user command.
- Do not create fake booking, payment, revenue, Google Calendar or astrology
  state. Unsupported later-program behavior remains absent.
- Store concrete instants in UTC and recurring availability in schedule-local
  wall time plus an IANA timezone.
- Keep FullCalendar types inside the renderer adapter only.
- Do not run destructive `db:reset` until the local ElevenHouse database and
  mapped port are re-established from `docs/development/commands.md` and the
  user has explicitly authorized lifecycle-affecting verification.
- Do not call the visible feature complete without authenticated network-backed
  browser evidence against the exact `ElevenHouseDesign` states.

## Purpose / Big Picture

After Program A an astrologer can use `/calendar` as a real scheduling surface,
not a prototype. Day, week and month show server-backed bookings, availability
and manual blocks. Availability can be edited as recurring periods and date
overrides. A manual booking snapshots product and policy data, rejects overlap
at the database boundary, replays an identical idempotent request and remains
visible after reload. Desktop follows the supplied calendar design; mobile uses
an app-owned agenda rather than a compressed seven-column grid.

## Progress

- [x] 2026-07-17: repository, canonical docs and design implementation studied.
- [x] 2026-07-17: hybrid renderer direction approved by the user.
- [x] 2026-07-17: product/architecture spec approved.
- [x] Task 1: contract and renderer boundary; DayGrid visual acceptance remains
  explicitly gated in Task 9.
- [x] Task 2: availability domain and timezone projection.
- [x] Task 3: booking domain and idempotent command contract; persisted
  concurrency/reuse evidence remains in Task 5.
- [x] Task 4: scheduling persistence and overlap invariant, including tested
  baseline augmentation and production-history reconciliation.
- [x] Task 5: database adapters and transactional integration evidence.
- [x] Task 6: Availability and Calendar API modules with HTTP auth, CSRF,
  owner-scope, validation, idempotency and conflict evidence.
- [ ] Task 7: Booking API module and security policy.
- [ ] Task 8: frontend queries, state model and route integration.
- [ ] Task 9: reference-parity desktop and mobile UI.
- [ ] Task 10: runtime, visual, accessibility and repository verification.

## Surprises & Discoveries

- The repository has no calendar, availability or booking module yet; this is a
  cross-layer feature rather than a UI-only transfer.
- `astrologer-api` exports CSRF protection but lacks the public API's validated
  idempotency-key guard, so booking cannot safely reuse a decorator by importing
  app internals.
- Current Node does not expose native `Temporal`. FullCalendar requires the
  ESM-only `temporal-polyfill`, while the Node16/CommonJS domain build requires
  the dual ESM/CJS `@js-temporal/polyfill` for the same Temporal semantics.
- FullCalendar v7 moved standard React plugins into `@fullcalendar/react/*`
  subpath exports. The legacy standalone plugin packages have no final 7.0.0
  release and must not be mixed with the v7 React package.
- Drizzle can define the scheduling columns and indexes but does not provide a
  first-class schema DSL for the required multi-column partial exclusion
  constraint. The checked-in baseline must therefore receive a deterministic,
  tested SQL augmentation after generation.
- The first default schedule needs an explicit create path: a read must not
  silently create it, and update-by-ID cannot address a schedule that does not
  exist yet.
- Manual blocks were in the first-slice read model but initially lacked a
  mutation contract. They use the same owner-wide reservation invariant and an
  explicit create/release lifecycle.
- Drizzle generation expects either a valid migration journal or an absent
  metadata directory; an empty `meta/` directory fails before generation.
- The DB package compiles as Node16/CommonJS, so executable generator scripts
  use `__dirname`/`require.main` instead of `import.meta`.
- Drizzle wraps PostgreSQL errors in `DrizzleQueryError`; expected constraint
  translation must walk the safe `cause` chain and match both code and named
  constraint instead of inspecting only the wrapper.
- Parallel hydration queries on one transaction client trigger a pg 9 removal
  warning. Transaction-bound hydration is sequential; pool-backed independent
  reads may remain parallel.
- Reusing a parameterized timezone expression in SELECT and GROUP BY creates
  distinct bind positions. Daily booking counts group by the selected local-date
  column ordinal, preserving parameterization and PostgreSQL equivalence.
- Calendar range responses require schedule working-window backgrounds, while
  the existing domain projection intentionally models product-specific starts.
  A separate range-bounded, timezone-aware domain projector now exposes working
  intervals without inventing a product duration in the API layer.
- HTTP E2E exposed two gaps hidden by service tests: feature modules using the
  exported CSRF guard still need `ConfigModule` in their local Nest context,
  and malformed manual-block route IDs must be contract-parsed before an
  owner-scoped lookup so `400` is not conflated with safe `404`.
- The design server was reachable during research, but no controllable browser
  target was exposed. Visual acceptance remains a hard gate, not an assumption.

## Decision Log

- **2026-07-17, user:** approved the hybrid renderer approach.
- **2026-07-17, user:** approved proceeding with Program A.
- **2026-07-17, agent:** use FullCalendar Standard `7.0.0` only behind an
  app-local interface; use a custom month renderer if public hooks cannot reach
  parity.
- **2026-07-17, agent:** install only `@fullcalendar/react@7.0.0` and
  `temporal-polyfill@1.0.1`; import standard plugins from the React package's
  documented `daygrid`, `timegrid` and `interaction` subpaths.
- **2026-07-17, agent:** use `@js-temporal/polyfill@0.5.1` in the domain package
  because its conditional exports support the repository's Node16/CommonJS
  compilation; do not change the whole package module format for one library.
- **2026-07-17, agent:** availability `startIntervalMinutes` controls candidate
  starts; product `durationMinutes` controls appointment duration.
- **2026-07-17, agent:** require `deliveryFormat` in manual booking commands.
  A product may offer several formats, so silently choosing array order would
  create an unstable booking snapshot.
- **2026-07-17, agent:** a single transactional Booking store owns persisted
  idempotency replay and occupancy claim so an API retry cannot split them.
- **2026-07-17, agent:** `PUT /availability/schedules/default` uses
  `expectedVersion: null` to create and a positive version to update; `GET`
  remains side-effect free.
- **2026-07-17, agent:** manual block creation and release are explicit
  idempotent commands backed by `schedule_reservations`, not synthetic calendar
  entries.
- **2026-07-17, agent:** owner-scoped composite foreign keys bind schedule,
  product, reservation, booking and manual-block ownership at the database
  boundary.
- **2026-07-17, agent:** production baseline reconciliation accepts only known
  predecessor histories and fails closed for any unknown history.
- **2026-07-17, agent:** default-schedule create/update, manual-block commands
  and calendar range reads receive persistence-agnostic domain ports before DB
  adapters; infrastructure does not invent parallel contracts.
- **2026-07-17, agent:** scheduling integration tests create isolated temporary
  databases from the checked-in baseline and drop them after each file; they do
  not reset or mutate the main ElevenHouse application database.
- **2026-07-17, agent:** omit finance/statuses owned by later domains instead of
  deriving misleading totals from bookings.

## Outcomes & Retrospective

Task 1 established strict schedule/range/manual-booking contracts, an
engine-neutral renderer model and a single FullCalendar adapter. RED was
recorded for both missing contract and missing renderer modules. GREEN is 13
focused tests, contracts build, astrologer-web typecheck and astrologer-web
production build. FullCalendar's v7 packaging mismatch was corrected from
registry and official migration evidence before dependency installation.
Task 2 added owner-scoped availability ports/use cases and pure range-bounded
slot projection. RED was recorded for the missing projection and use-case
modules. GREEN is 12 focused tests plus domain typecheck/build, including split
periods, date overrides, half-open reservations, policy limits and spring/fall
DST fixtures. The backend Temporal dependency was corrected after its ESM-only
package exports failed the real Node16 typecheck.
Task 3 added Booking ports/use cases, typed safe errors, immutable product and
schedule snapshots, exact-start evaluation and canonical SHA-256 command
hashing. The request contract now requires an offered delivery format. RED was
recorded for the missing booking module and changed contract. GREEN is 35
focused contract/domain tests plus domain build and contracts/domain typecheck.
Concurrent same-key execution and different-request reuse are persistence
properties intentionally proved with the transactional adapter in Task 5.
Task 4 added nine scheduling tables, owner-scoped composite references, the
active owner/range GiST exclusion constraint, a deterministic fail-closed
baseline augmenter and explicit production-baseline reconciliation for known
predecessor histories. RED was recorded for missing schemas, augmentation and
reconciliation planning modules. GREEN is 18 focused tests, DB typecheck/build
and three isolated PostgreSQL reconciliation integration cases. The current
local application database was not reset.
Task 5 added the default-schedule create/update port, manual-block command
domain, bounded calendar read port and four Drizzle adapter factories.
Persisted idempotency, booking/manual-block occupancy and aggregate replacement
are single-transaction operations. RED was recorded for every missing domain
and adapter surface, projection-context hydration, wrapped PostgreSQL errors
and timezone grouping. GREEN is 46 focused tests, seven isolated PostgreSQL
integration cases, domain/DB typecheck and builds, with pg deprecation tracing
enabled and no warnings. The main local application database was not reset.
Task 6 added Availability and Calendar Nest feature modules,
thin controllers, contract-parsing services, owner scoping, CSRF-decorated
mutations, adapter composition and stable domain-error mapping. A new domain
availability-background projector has RED/GREEN evidence. HTTP E2E first failed
on missing ConfigModule wiring and malformed block-ID handling, then passed for
auth, CSRF, owner isolation, side-effect-free missing schedule, bounded IANA
ranges, optimistic version conflict, idempotent block replay/release, changed
request reuse and overlap conflict. GREEN is 23 focused tests, seven isolated
PostgreSQL adapter tests, astrologer-api typecheck/build and repository verify
with 387 files / 1670 tests.
Program A is not complete until database, network-backed browser, visual and
accessibility acceptance are also recorded here with exact evidence and risk.

## Context and Orientation

The approved design is
`docs/superpowers/specs/2026-07-17-calendar-scheduling-design.md`. Domain code
belongs under `packages/domain/src/availability` and
`packages/domain/src/bookings`, with range read contracts under
`packages/domain/src/calendar`; contracts under `packages/contracts/src`;
schema and adapters under `packages/db`; Nest features under
`apps/astrologer-api/src/modules`; and page/feature code under
`apps/astrologer-web/src/pages/calendar` and
`apps/astrologer-web/src/features/{calendar,availability,bookings}`.

The exact visual implementation is in `ElevenHouseDesign/app/calendar*.jsx`
and `mobile-calendar.jsx`. Those files supply layout and interaction intent,
not persistence, contracts or production state.

## Interfaces and Dependencies

The shared contract payloads use ISO strings and primitives only:

```ts
export type CalendarView = "day" | "week" | "month";

export type CalendarRangeResponse = {
  timeZone: string;
  range: { start: string; end: string };
  entries: CalendarEntry[];
  availability: AvailabilityBackground[];
  summary: {
    bookingCount: number;
    bookedMinutes: number;
    byDisplayStatus: Partial<Record<CalendarDisplayStatus, number>>;
  };
};

export type PutDefaultAvailabilityScheduleRequest = {
  expectedVersion: number | null;
  timeZone: string;
  startIntervalMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minimumNoticeMinutes: number;
  bookingHorizonDays: number;
  maximumBookingsPerDay: number | null;
  weeklyPeriods: Array<{
    weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7;
    startMinute: number;
    endMinute: number;
  }>;
  dateOverrides: Array<{
    date: string;
    mode: "available" | "unavailable";
    periods: Array<{ startMinute: number; endMinute: number }>;
  }>;
  productIds: string[];
};

export type CreateManualBookingRequest = {
  clientUserId: string;
  productId: string;
  deliveryFormat: ProductDeliveryFormat;
  projectedStartAt: string;
};

export type CreateManualBlockRequest = {
  title: string;
  startAt: string;
  endAt: string;
};
```

The domain ports remain persistence-agnostic:

```ts
export interface AvailabilityStore {
  findDefaultByOwner(ownerUserId: string): Promise<AvailabilitySchedule | null>;
  putDefault(input: PutDefaultAvailabilityInput): Promise<PutDefaultAvailabilityResult>;
  replace(input: ReplaceAvailabilityInput): Promise<AvailabilitySchedule>;
  readProjectionContext(input: ProjectionContextQuery): Promise<ProjectionContext>;
}

export interface BookingCommandStore {
  executeManualBooking(
    command: CreateManualBookingCommand,
    create: () => Promise<ClaimedBooking>
  ): Promise<{ kind: "created" | "replayed"; booking: Booking }>;
}

export interface ManualCalendarBlockCommandStore {
  executeCreate(
    command: CreateManualBlockCommand,
    create: () => Promise<ManualCalendarBlockClaim>
  ): Promise<{ kind: "created" | "replayed"; block: ManualCalendarBlock }>;
  release(input: ReleaseManualBlockInput): Promise<ManualCalendarBlock | null>;
}

export interface CalendarReadStore {
  readRange(input: CalendarRangeQuery): Promise<CalendarRangeReadModel>;
}
```

`BookingCommandStore` implementations execute request-hash validation,
reservation insertion, booking insertion and replay-result persistence in one
database transaction. The domain callback performs all owner/client/product/
slot validations through injected ports before returning immutable snapshots.

The frontend renderer boundary is deliberately engine-neutral:

```ts
export type CalendarRendererProps = {
  view: CalendarView;
  locale: "ru" | "en";
  timeZone: string;
  visibleRange: { start: string; end: string };
  entries: CalendarEntryViewModel[];
  availability: AvailabilityBackgroundViewModel[];
  onRangeChange(range: { start: string; end: string }): void;
  onEntryActivate(entryId: string): void;
  onEmptyRangeSelect(selection: { start: string; end: string }): void;
};
```

Dependencies added with exact versions:

```json
{
  "@js-temporal/polyfill": "0.5.1",
  "@fullcalendar/react": "7.0.0",
  "temporal-polyfill": "1.0.1"
}
```

`@js-temporal/polyfill` is added to `@elevenhouse/domain`. Calendar packages
are consumed from `@fullcalendar/react/*`; `@fullcalendar/react` and its
required `temporal-polyfill` peer are added to `@elevenhouse/astrologer-web`.

## Plan of Work

First establish contract and renderer boundaries so no engine type leaks into
the feature. Then implement pure availability projection and booking commands.
Next add schema, database constraints and adapters, followed by thin API
modules. The frontend is composed only after real contracts exist. Visual work
is measured against the reference and accepted last through an authenticated
network-backed browser flow.

## Concrete Steps

### Task 1: Specify shared contracts and the renderer adapter

**Files:**

- Modify: `packages/contracts/package.json`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/contracts/src/calendar.ts`
- Create: `packages/contracts/src/calendar.test.ts`
- Modify: `apps/astrologer-web/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/astrologer-web/src/features/calendar/model/calendarRenderer.ts`
- Create: `apps/astrologer-web/src/features/calendar/model/calendarRenderer.test.ts`
- Create: `apps/astrologer-web/src/features/calendar/components/FullCalendarRenderer.tsx`
- Create: `apps/astrologer-web/src/features/calendar/components/FullCalendarRenderer.test.tsx`

- [x] Write contract parsing tests for valid schedule/range/booking payloads,
  invalid timezone/date/instant, duplicate periods and unsupported statuses.
- [x] Run `pnpm exec vitest run packages/contracts/src/calendar.test.ts` and
  record RED from missing schemas.
- [x] Implement and export Zod schemas plus inferred types. Use existing
  validation helpers and the repository's response-schema convention.
- [x] Run the contract test and contracts typecheck; record GREEN.
- [x] Write renderer-boundary tests that reject imports containing
  `@fullcalendar` outside `components/FullCalendarRenderer.tsx` and assert
  stable mapping of contract entries to engine event inputs.
- [x] Install exact dependencies through pnpm, implement the adapter and custom
  event-content hook, then run focused frontend tests and typecheck.
- [ ] Record whether DayGrid public hooks satisfy month overflow and keyboard
  requirements; retain it only if the later browser gate confirms parity.

### Task 2: Implement availability and deterministic timezone projection

**Files:**

- Modify: `packages/domain/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `packages/domain/src/availability/availability-types.ts`
- Create: `packages/domain/src/availability/availability-errors.ts`
- Create: `packages/domain/src/availability/availability-store.ts`
- Create: `packages/domain/src/availability/availability-use-cases.ts`
- Create: `packages/domain/src/availability/slot-projection.ts`
- Create: `packages/domain/src/availability/slot-projection.test.ts`
- Create: `packages/domain/src/availability/availability-use-cases.test.ts`
- Create: `packages/domain/src/availability/index.ts`
- Modify: `packages/domain/src/index.ts`

- [x] Write projection tests for split periods, date overrides, adjacent
  reservations, buffers, notice, horizon, daily maximum and range bounds.
- [x] Add DST tests for nonexistent `Europe/Berlin` spring time and duplicate
  autumn time; mutations accept projected exact instants, never ambiguous local
  labels.
- [x] Run the two focused tests and record RED from missing domain code.
- [x] Implement pure validation, `Temporal.ZonedDateTime` conversion and
  half-open overlap logic. Keep all clock/timezone arithmetic out of React,
  controllers and database adapters.
- [x] Add replacement-use-case tests for owner scope, optimistic version and
  non-overlapping periods; implement minimal store-backed use cases.
- [x] Run focused tests, domain typecheck and domain build; record GREEN.

### Task 3: Implement booking use cases and idempotent command semantics

**Files:**

- Create: `packages/domain/src/bookings/booking-types.ts`
- Create: `packages/domain/src/bookings/booking-errors.ts`
- Create: `packages/domain/src/bookings/booking-ports.ts`
- Create: `packages/domain/src/bookings/booking-use-cases.ts`
- Create: `packages/domain/src/bookings/booking-use-cases.test.ts`
- Create: `packages/domain/src/bookings/index.ts`
- Modify: `packages/domain/src/index.ts`

- [x] Write failing tests for inactive/unrelated clients, foreign/draft/
  non-live products, stale starts, notice/horizon/daily-limit violations,
  immutable snapshots and safe not-found behavior.
- [x] Specify canonical request hashing: normalized actor, scope, client,
  product, delivery format and exact projected start serialized as a stable
  ordered tuple and hashed with SHA-256.
- [x] Write failing tests for first execution, identical replay and canonical
  equivalent instants. Prove concurrent duplicate and changed-request reuse at
  the persisted transaction boundary in Task 5.
- [x] Implement the use case against `AvailabilityStore`, owner-scoped client
  and product ports, `Clock` and `BookingCommandStore`; do not import Drizzle.
- [x] Run focused tests, domain typecheck and build; record GREEN.

### Task 4: Define scheduling persistence and the database invariant

**Files:**

- Create: `packages/db/src/schema/scheduling/scheduling-values.ts`
- Create: `packages/db/src/schema/scheduling/availability.schema.ts`
- Create: `packages/db/src/schema/scheduling/bookings.schema.ts`
- Create: `packages/db/src/schema/scheduling/idempotency-commands.schema.ts`
- Create: `packages/db/src/schema/scheduling/index.ts`
- Create: `packages/db/src/schema/scheduling/scheduling.schema.test.ts`
- Modify: `packages/db/src/schema/products/products.schema.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/scripts/augment-scheduling-baseline.ts`
- Create: `packages/db/scripts/augment-scheduling-baseline.test.ts`
- Create: `packages/db/scripts/production-baseline-plan.ts`
- Create: `packages/db/scripts/production-baseline-plan.test.ts`
- Modify: `packages/db/scripts/reconcile-production-baseline.ts`
- Modify:
  `packages/db/src/production-baseline-reconciliation.integration.ts`
- Modify: `packages/db/package.json`
- Modify: `packages/db/tsconfig.json`
- Regenerate: `packages/db/drizzle/0000_*.sql`
- Regenerate: `packages/db/drizzle/meta/0000_snapshot.json`
- Regenerate: `packages/db/drizzle/meta/_journal.json`

- [x] Write schema tests for owner/reference/check/unique/index constraints and
  the checked-in baseline's `btree_gist` extension plus GiST exclusion SQL.
- [x] Write augmentation tests using a temporary migration fixture; require
  idempotent insertion of exactly one named exclusion constraint.
- [x] Run focused tests and record RED.
- [x] Implement Drizzle tables and deterministic augmentation script. Change
  `db:generate` to run Drizzle generation followed by the augmentation.
- [x] Generate the current baseline using the documented baseline workflow.
  Do not reset a database in this task.
- [x] Run focused schema/script tests, DB typecheck and `git diff --check`;
  inspect the complete regenerated baseline and metadata diff.
- [x] Add a hash-verified production reconciliation plan for the current and
  approved predecessor histories; prove legacy conversion, previous-baseline
  upgrade, repeat no-op and unknown-history refusal in isolated PostgreSQL
  integration databases.

The baseline must contain the semantic equivalent of:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "schedule_reservations"
  ADD CONSTRAINT "schedule_reservations_active_owner_range_exclude"
  EXCLUDE USING gist (
    "owner_user_id" WITH =,
    tstzrange("occupied_start_at", "occupied_end_at", '[)') WITH &&
  ) WHERE ("lifecycle" = 'active');
```

### Task 5: Implement database adapters and transactional evidence

**Files:**

- Modify: `packages/domain/src/availability/availability-store.ts`
- Modify: `packages/domain/src/availability/availability-use-cases.ts`
- Modify: `packages/domain/src/availability/availability-use-cases.test.ts`
- Create: `packages/domain/src/availability/manual-calendar-blocks.ts`
- Create: `packages/domain/src/availability/manual-calendar-blocks.test.ts`
- Create: `packages/domain/src/calendar/calendar-read.ts`
- Create: `packages/domain/src/calendar/calendar-read.test.ts`
- Create: `packages/domain/src/calendar/index.ts`
- Modify: `packages/domain/src/index.ts`
- Create: `packages/db/src/adapters/scheduling/drizzle-availability-store.ts`
- Create: `packages/db/src/adapters/scheduling/drizzle-calendar-read-store.ts`
- Create: `packages/db/src/adapters/scheduling/drizzle-booking-command-store.ts`
- Create: `packages/db/src/adapters/scheduling/drizzle-manual-block-command-store.ts`
- Create:
  `packages/db/src/adapters/scheduling/drizzle-idempotent-scheduling-command.ts`
- Create: `packages/db/src/adapters/scheduling/drizzle-availability-store.integration.ts`
- Create: `packages/db/src/adapters/scheduling/drizzle-booking-command-store.integration.ts`
- Create: `packages/db/src/adapters/scheduling/index.ts`
- Modify: `packages/db/src/adapters/index.ts`
- Modify: `packages/db/src/index.ts`
- Modify: `packages/db/package.json`

- [x] Add the missing persistence-agnostic default-schedule, manual-block and
  calendar-read domain ports/use cases with failing tests before adapters.
- [x] Write integration tests for aggregate replacement/version conflict,
  owner scoping and rollback on invalid child data.
- [x] Write integration tests that race overlapping claims, permit adjacent
  ranges, replay an identical idempotency key, reject a changed request and
  roll back reservation when booking insertion fails.
- [x] Write integration tests for idempotent manual-block creation and release,
  owner isolation and conflicts with active bookings/blocks.
- [x] Run tests against the already configured local test database only if it
  is listening; otherwise record the environment blocker without starting it.
- [x] Implement minimal adapters and translate exclusion violations to
  `slot_no_longer_available` without leaking SQL details.
- [x] Export only adapter factories from `@elevenhouse/db/scheduling`.
- [x] Run unit, integration, typecheck and build checks as the environment
  permits; record exact skipped evidence.

### Task 6: Expose Availability and Calendar API modules

**Files:**

- Create: `apps/astrologer-api/src/modules/availability/availability.module.ts`
- Create: `apps/astrologer-api/src/modules/availability/availability.controller.ts`
- Create: `apps/astrologer-api/src/modules/availability/availability.service.ts`
- Create: `apps/astrologer-api/src/modules/availability/availability.tokens.ts`
- Create: `apps/astrologer-api/src/modules/availability/availability.service.test.ts`
- Create: `apps/astrologer-api/src/modules/calendar/calendar.module.ts`
- Create: `apps/astrologer-api/src/modules/calendar/calendar.controller.ts`
- Create: `apps/astrologer-api/src/modules/calendar/calendar.service.ts`
- Create: `apps/astrologer-api/src/modules/calendar/calendar.tokens.ts`
- Create: `apps/astrologer-api/src/modules/calendar/calendar.e2e.test.ts`
- Modify: `apps/astrologer-api/src/app.module.ts`

- [x] Write E2E tests for authentication, owner scoping, required/bounded range,
  IANA timezone validation, side-effect-free missing default, CSRF, create with
  `expectedVersion: null` and optimistic update `409` response.
- [x] Write E2E tests for idempotent manual-block creation/release, owner
  isolation and overlap conflicts.
- [x] Assert summary contains bookings/minutes/status counts and no finance
  fields.
- [x] Run focused E2E tests and record RED.
- [x] Implement feature modules with thin controllers, contract parsing in
  services and adapter factories in module composition roots.
- [x] Run focused unit/E2E tests, API typecheck and build; record GREEN.

### Task 7: Expose manual Booking API with persisted idempotency

**Files:**

- Create: `apps/astrologer-api/src/modules/security/idempotency/idempotency.guard.ts`
- Create: `apps/astrologer-api/src/modules/security/idempotency/idempotency.guard.test.ts`
- Create: `apps/astrologer-api/src/modules/security/route-policy/route-security-metadata.ts`
- Create: `apps/astrologer-api/src/modules/security/route-policy/route-security-policy.ts`
- Modify: `apps/astrologer-api/src/modules/security/security.module.ts`
- Create: `apps/astrologer-api/src/modules/bookings/bookings.module.ts`
- Create: `apps/astrologer-api/src/modules/bookings/bookings.controller.ts`
- Create: `apps/astrologer-api/src/modules/bookings/bookings.service.ts`
- Create: `apps/astrologer-api/src/modules/bookings/bookings.tokens.ts`
- Create: `apps/astrologer-api/src/modules/bookings/bookings.service.test.ts`
- Create: `apps/astrologer-api/src/modules/bookings/bookings.e2e.test.ts`
- Modify: `apps/astrologer-api/src/app.module.ts`

- [ ] Port the public API's header-shape behavior through new astrologer-local
  code and tests; do not import another app's internals.
- [ ] Write E2E tests for auth, CSRF, missing/invalid idempotency key, replay,
  changed request, active-client/product checks, overlap conflict and safe GET.
- [ ] Run focused tests and record RED.
- [ ] Implement thin controller/service/module wiring and stable error mapping.
- [ ] Run focused tests, API typecheck and build; record GREEN.

### Task 8: Add frontend data model, state and route integration

**Files:**

- Create: `apps/astrologer-web/src/features/calendar/api/getCalendarRange.ts`
- Create: `apps/astrologer-web/src/features/calendar/model/calendarRange.ts`
- Create: `apps/astrologer-web/src/features/calendar/model/calendarRange.test.ts`
- Create: `apps/astrologer-web/src/features/calendar/model/useCalendarRangeQuery.ts`
- Create: `apps/astrologer-web/src/features/availability/api/getAvailabilitySchedule.ts`
- Create: `apps/astrologer-web/src/features/availability/api/putDefaultAvailabilitySchedule.ts`
- Create: `apps/astrologer-web/src/features/calendar/api/createManualBlock.ts`
- Create: `apps/astrologer-web/src/features/calendar/api/releaseManualBlock.ts`
- Create: `apps/astrologer-web/src/features/bookings/api/createManualBooking.ts`
- Create: `apps/astrologer-web/src/features/bookings/api/getBooking.ts`
- Create: `apps/astrologer-web/src/features/bookings/model/useCreateManualBookingMutation.ts`
- Create: `apps/astrologer-web/src/pages/calendar/useCalendarPageController.ts`
- Create: `apps/astrologer-web/src/pages/calendar/useCalendarPageController.test.tsx`
- Create: `apps/astrologer-web/src/pages/calendar/CalendarPage.tsx`
- Modify: `apps/astrologer-web/src/router.tsx`
- Modify: astrologer navigation and RU/EN locale dictionaries at their existing
  canonical files discovered immediately before this task.

- [ ] Write tests for day/week/month range navigation, panel persistence during
  range refetch, stale booking conflict recovery, validated responses and
  locale-safe labels.
- [ ] Run focused tests and record RED.
- [ ] Implement query options, mutations and a controller that owns view/range,
  selected entry, availability mode and dialog state outside JSX.
- [ ] Add `/calendar` and navigation entry without changing unrelated routes.
- [ ] Run focused tests, frontend typecheck and build; record GREEN.

### Task 9: Build the reference-parity desktop and mobile surface

**Files:**

- Create one component per file under
  `apps/astrologer-web/src/pages/calendar/components/` for:
  `CalendarToolbar`, `CalendarWorkspace`, `CalendarSummaryPanel`,
  `CalendarSessionCard`, `CalendarMonthView`, `CalendarMobileAgenda`,
  `AvailabilityEditorPanel`, `ManualBookingDialog`, `BookingDetailPanel` and
  focused form/empty/error/loading primitives.
- Create: `apps/astrologer-web/src/pages/calendar/CalendarPageView.tsx`
- Create: `apps/astrologer-web/src/pages/calendar/CalendarPageView.test.tsx`
- Create: `apps/astrologer-web/src/pages/calendar/CalendarPage.module.css`
- Create focused CSS/static and interaction tests adjacent to the components.
- Modify `packages/design-system` only if measured reuse proves a primitive is
  stable beyond calendar; otherwise keep components app-local.

- [ ] With an authorized browser target, capture every reference state in the
  spec's Visual Evidence Matrix before styling. Measure DOM/computed dimensions,
  gaps, typography, colors, radii, overflow, z-index and focus states.
- [ ] Write component tests for toolbar, panel toggle, accessible event
  activation, keyboard availability forms, dialog focus restoration, conflict
  live announcement, mobile agenda and RU/EN copy; record RED.
- [ ] Implement desktop day/week and conditionally DayGrid month. If measured
  parity needs private FullCalendar DOM coupling, use app-owned
  `CalendarMonthView` over the same view model.
- [ ] Implement mobile agenda/sheets with shared queries and mutations.
- [ ] Render only server-backed first-slice statuses. Omit revenue, payment,
  completion, no-show, Google and Astro controls.
- [ ] Run focused tests, typecheck and build; record GREEN.

### Task 10: Verify the full production contour

**Files:**

- Update this plan's Progress, Surprises, Decision Log, Outcomes and evidence.
- Update canonical architecture/API/product docs only where implemented module
  boundaries or visible scope changed.
- Store approved screenshot evidence in the repository's established evidence
  location discovered from current docs; do not invent a parallel convention.

- [ ] Run targeted contract, domain, DB, API and frontend tests from Tasks 1-9.
- [ ] Run affected package/app typechecks and builds.
- [ ] Run `pnpm verify` only after targeted checks pass.
- [ ] Diagnose ports read-only. If required services are already running, use
  them; if a standard port is absent, stop and report rather than starting it.
- [ ] In the authorized existing browser, execute authenticated network-backed
  availability save, booking create, conflict and reload flows. Inspect network
  requests, console, persistence and owner isolation.
- [ ] Capture all reference/production viewport pairs and compare metrics,
  loading, empty, error, retry, keyboard, focus, contrast and touch targets.
- [ ] Review `git status --short`, `git diff --cached`, every owned path diff,
  untracked files and `git diff --check`. Separate unowned changes in the final
  report and do not commit without user authority.

## Validation and Acceptance

Program A acceptance requires all of the following:

1. Focused tests prove contracts, projection, domain errors, idempotency and
   database overlap behavior.
2. API tests prove owner scoping, auth, CSRF, idempotency and bounded reads.
3. Frontend tests prove all views, panel/dialog state, conflict recovery,
   accessible alternatives and RU/EN copy.
4. Typecheck/build succeeds for every affected package and app.
5. An authenticated network-backed browser flow proves save, create, conflict
   and reload against real local persistence.
6. Screenshot and computed-style evidence confirms the exact reference states
   at equivalent desktop/mobile viewports.
7. `pnpm verify` and `git diff --check` pass, or every pre-existing/unavailable
   check is explicitly separated with evidence.

## Idempotence and Recovery

Tests and generation are repeatable. The baseline augmenter is idempotent and
fails closed if the expected scheduling table or migration is absent. Booking
retries use the persisted command record; a matching request replays its saved
response, while a different hash fails safely. Availability replacement uses
an expected version and leaves the caller's edits intact on conflict. If any
target changes concurrently, re-read the full file and path diff, adapt the
owned patch, and never reset, stash or overwrite the other work.

## Artifacts and Notes

- Approved design:
  `docs/superpowers/specs/2026-07-17-calendar-scheduling-design.md`.
- Execution plan: this file.
- Visual source: `ElevenHouseDesign/app/calendar*.jsx` and
  `ElevenHouseDesign/app/mobile-calendar.jsx`.
- Browser evidence is currently pending an exposed authorized browser target;
  no shell or component-test result substitutes for that gate.

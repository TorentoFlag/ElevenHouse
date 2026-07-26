# Astro Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first production slice of `/astro-calendar`: a read-only astrologer workspace calendar that surfaces deterministic global and owner-client astrological events from real chart calculations, with honest readiness/error states and dictionary-backed interpretations.

**Architecture:** Add a new Astro Calendar contour instead of overloading scheduling calendar or chart-engine natal UI. Shared contracts define the public shape; `astrologer-api` owns auth, CRM hydration, persistence and read/generation lifecycle; `chart-worker` calls `apps/chart-engine`; `apps/astrologer-web` renders the design-reference calendar and details surface from network data; Dictionary remains the source of interpretations.

**Tech Stack:** TypeScript, Zod contracts, NestJS API modules, Drizzle/PostgreSQL, BullMQ workers, Python FastAPI chart-engine, Kerykeion/swiss-ephemeris, React, FullCalendar, Vitest/Pytest/Playwright.

## Global Constraints

- Work in the existing shared `main` checkout. Do not create branches, worktrees, stash, reset, checkout, rebase or cherry-pick.
- Preserve all unowned dirty/staged files. Stage and commit only exact owned paths for each task.
- Do not introduce fake success, mock business state, silent fallback data or guessed provider output.
- First slice is read-only. No sends, automations, public/client-facing calendar, booking mutations, funnels, discounts, AI, PDF or ICS.
- `/calendar` scheduling and `/chart-engine` natal/transit UI remain separate product surfaces.
- Use UTC instants in persistence and APIs; display in astrologer-selected/user IANA timezone.
- Dictionary is the only interpretation source. Missing entries must be visible and actionable, not silently filled with generated copy.
- UI parity requires evidence from `ElevenHouseDesign/app/astro-calendar.jsx` and `ElevenHouseDesign/app/astro-calendar-data.jsx`.
- Production-readiness claims require fresh targeted checks plus browser/network evidence for the requested flow.

---

## Current Evidence

- Design spec is committed in `docs/superpowers/specs/2026-07-25-astro-calendar-design.md`.
- Existing chart modes include natal/transits/solar return endpoints in `apps/chart-engine`; there is no `/v1/astro-calendar/range`.
- Existing scheduling calendar contracts/API live under `packages/contracts/src/calendar.ts` and `apps/astrologer-api/src/modules/calendar`; they must not be reused for astrological events.
- `apps/astrologer-web` already has `@fullcalendar/react` in dependencies.
- Chart calculations currently use Kerykeion `>=5.12,<5.13`; exact calendar capabilities must be verified against installed runtime before provider implementation.

## Definition Of Done

- `/astro-calendar` loads for an authenticated astrologer and requests a real astro-calendar range from `astrologer-api`.
- The response contains schema version, timezone, bounded range, generation metadata, events, readiness summary, warning list, summary and dictionary codes.
- Event list includes the first-slice types:
  - `global.moon_phase`
  - `global.eclipse`
  - `global.ingress`
  - `client.birthday`
  - `client.solar_window`
  - `client.transit_aspect`
- Owner scope is enforced: personal events are generated only for clients explicitly connected to the astrologer.
- Missing, unknown and approximate birth data produce visible readiness warnings.
- Failed and stale generations are observable and retryable.
- Dictionary-backed interpretations are resolved by deterministic codes; missing codes show an affordance to create the missing interpretation.
- Design-reference desktop and responsive states are matched closely enough to pass screenshot/self-review evidence.
- Targeted contracts, API, worker/chart-engine, frontend and browser checks pass or any blocker is explicitly documented.

---

## Task 1: Shared Astro Calendar Contracts

**Owned paths**

- `packages/contracts/src/astro-calendar.ts`
- `packages/contracts/src/astro-calendar.test.ts`
- `packages/contracts/src/index.ts`

**Implementation**

- [ ] Create `astro-calendar.ts` with Zod schemas and exported inferred types.
- [ ] Reuse existing contract primitives where appropriate:
  - `ianaTimeZoneSchema`
  - `isoCalendarDateSchema`
  - `chartSettingsSchema`
  - `chartProviderMetadataSchema`
- [ ] Define range query schema:
  - `start` and `end` as ISO calendar dates.
  - `timeZone` as IANA timezone.
  - `scope` as `"all" | "global" | "client"` with default `"all"`.
  - `clientIds` as UUID array, supporting query-string single value and repeated values.
  - `eventTypes` as array of first-slice event types.
  - reject ranges where `end < start`.
  - reject ranges longer than 93 days.
- [ ] Define generation request schema as range query plus `settings: chartSettingsSchema`.
- [ ] Define warning schema with codes:
  - `NO_PROFILE_TIMEZONE`
  - `CLIENT_BIRTH_DATA_MISSING`
  - `CLIENT_BIRTH_TIME_UNKNOWN`
  - `CLIENT_BIRTH_TIME_APPROXIMATE`
  - `CLIENT_SCOPE_TRUNCATED`
  - `PROVIDER_PRECISION_LIMITED`
  - `GENERATION_FAILED`
  - `DICTIONARY_ENTRY_MISSING`
- [ ] Define event schema:
  - `id`
  - `source`
  - `type`
  - `startsAt`
  - `endsAt`
  - `timePrecision`
  - `title`
  - `subtitle`
  - `description`
  - `tone`
  - `points`
  - `aspect`
  - `sign`
  - `clientRefs`
  - `chartLink`
  - `dictionaryCodes`
  - `warnings`
- [ ] Define response schema:
  - `schemaVersion: "astro-calendar-range.v1"`
  - `timeZone`
  - `range`
  - `generation`
  - `events`
  - `readiness`
  - `summary`
  - `dictionaryCodes`
  - `warnings`
- [ ] Export contracts from `packages/contracts/src/index.ts`.

**Tests**

- [ ] Valid response parses with all first-slice event types.
- [ ] Invalid timezone is rejected.
- [ ] Range longer than 93 days is rejected.
- [ ] `end` before `start` is rejected.
- [ ] Unsupported future event type is rejected.
- [ ] Missing dictionary warning parses and preserves code/action target.

**Verification**

- [ ] `pnpm --filter @elevenhouse/contracts test -- astro-calendar`
- [ ] `pnpm --filter @elevenhouse/contracts typecheck`
- [ ] `git diff --check -- packages/contracts/src/astro-calendar.ts packages/contracts/src/astro-calendar.test.ts packages/contracts/src/index.ts`

---

## Task 2: Chart-Engine Calendar Provider Contract

**Owned paths**

- `apps/chart-engine/src/chart_engine/schemas.py`
- `apps/chart-engine/src/chart_engine/main.py`
- `apps/chart-engine/src/chart_engine/kerykeion_adapter.py`
- `apps/chart-engine/tests/test_astro_calendar_contract.py`

**Implementation**

- [ ] Add Python request/response models matching `astro-calendar-range.v1`.
- [ ] Add `POST /v1/astro-calendar/range` as a private chart-engine endpoint.
- [ ] Generate provider-backed global events for the requested bounded range:
  - moon phases where supported by installed Kerykeion/swiss-ephemeris capability;
  - ingresses where supported by installed capability;
  - eclipses only if provider can calculate them deterministically in this runtime.
- [ ] Return typed `PROVIDER_PRECISION_LIMITED` warnings when a first-slice global event type is not calculable with the installed provider version.
- [ ] Do not emit fake events for unsupported provider features.
- [ ] Keep the endpoint deterministic for identical input and settings.

**Tests**

- [ ] Contract shape matches the TypeScript contract expectations.
- [ ] Range bounds are enforced.
- [ ] Unsupported provider capability returns warning rather than fake data.
- [ ] Provider metadata includes provider name/version and ephemeris mode.

**Verification**

- [ ] Chart-engine unit tests for the new endpoint.
- [ ] Direct local HTTP request against the running chart-engine if the service is already up or user explicitly starts it.

**2026-07-26 update**

- [x] `AstroCalendarGenerationRequest` now accepts owner-scoped client input snapshots.
- [x] `astrologer-api` stores eligible CRM birth-data snapshots in the private generation `requestSnapshot`.
- [x] `chart-worker` forwards those snapshots to chart-engine.
- [x] chart-engine generates deterministic `client.birthday` and `client.solar_window` events from snapshots.
- [x] chart-engine generates provider-backed `client.transit_aspect` range windows from Kerykeion daily ephemeris data and owner-scoped client snapshots.
- [x] `/astro-calendar` polls the range while generation is `calculating`, then moves to ready state without a manual refresh.
- [x] Global calendar event titles render in Russian for moon phases, ingresses and eclipses.
- [x] Browser proof covered local login, owner-scoped QA client fixtures, recalculation, worker completion, auto-refresh, 67 events total, 43 client transit events, missing-dictionary CTAs, clean fresh console and ready health endpoints.

---

## Task 3: Astro Calendar Domain Model

**Owned paths**

- `packages/domain/src/astro-calendar/astro-calendar-types.ts`
- `packages/domain/src/astro-calendar/astro-calendar-errors.ts`
- `packages/domain/src/astro-calendar/build-astro-calendar-fingerprint.ts`
- `packages/domain/src/astro-calendar/plan-astro-calendar-generation.ts`
- `packages/domain/src/astro-calendar/index.ts`

**Implementation**

- [ ] Model generation identity, range, settings fingerprint and lifecycle states:
  - `calculating`
  - `ready`
  - `failed`
  - `stale`
- [ ] Add deterministic fingerprint from astrologer id, timezone, range, selected client ids, event types and chart settings.
- [ ] Add readiness evaluation for client birth data:
  - missing birth date/place;
  - unknown birth time;
  - approximate birth time.
- [ ] Add domain errors for invalid range, forbidden client scope and unsupported generation mode.
- [ ] Keep domain independent from Drizzle, Nest, React and chart-engine clients.

**Tests**

- [ ] Same inputs produce the same fingerprint.
- [ ] Changing range, timezone, settings or client set changes fingerprint.
- [ ] Birth-data states map to the expected warnings.
- [ ] Unknown/approximate time does not block every event type, only marks precision.

**Verification**

- [ ] Targeted domain tests.
- [ ] Domain package typecheck.

---

## Task 4: Persistence And Read Model

**Owned paths**

- `packages/db/src/schema/astro-calendar.ts`
- `packages/db/src/schema/index.ts`
- `packages/db/src/adapters/astro-calendar/*`
- generated migration/baseline files required by the repo DB workflow

**Implementation**

- [ ] Add generation table keyed by astrologer, range, timezone, settings fingerprint and status.
- [ ] Add event read-model table keyed by generation id and stable event id.
- [ ] Persist event JSON payload matching shared contract schema.
- [ ] Persist warning records or warning payloads with enough structure for retry/debug.
- [ ] Add stale detection query by current fingerprint.
- [ ] Add repository adapter methods:
  - find ready generation;
  - create calculating generation idempotently;
  - mark ready with events;
  - mark failed with observable error;
  - fetch latest generation for range;
  - mark stale after relevant settings/client birth-data changes.

**Tests**

- [ ] Idempotent create does not duplicate generation for same fingerprint.
- [ ] Ready generation returns events in chronological order.
- [ ] Failed generation preserves error metadata.
- [ ] Stale generation is visible in read response.

**Verification**

- [ ] Follow `docs/development/commands.md` before any DB reset or migration command.
- [ ] Run only local DB commands after confirming local DB host/port.

---

## Task 5: Astrologer API Module

**Owned paths**

- `apps/astrologer-api/src/modules/astro-calendar/*`
- `apps/astrologer-api/src/app.module.ts`
- OpenAPI/docs files required by existing API workflow

**Implementation**

- [ ] Add `AstroCalendarModule` under `apps/astrologer-api/src/modules/astro-calendar`.
- [ ] Add authenticated owner-scoped endpoints:
  - `GET /v1/astro-calendar/range`
  - `POST /v1/astro-calendar/generations`
  - `POST /v1/astro-calendar/generations/:id/retry`
- [ ] Validate all requests with shared schemas.
- [ ] Hydrate only clients connected to the current astrologer.
- [ ] Return `403` for client ids outside owner scope.
- [ ] Return `202` with `calculating` generation state when async work is queued.
- [ ] Return `ready`, `failed` or `stale` state from persisted read model.
- [ ] Include dictionary code list for UI lookup.
- [ ] Keep controllers thin and move orchestration into service/use-case layer.

**Tests**

- [ ] Auth required.
- [ ] Cross-astrologer client id forbidden.
- [ ] Missing birth data appears in readiness warnings.
- [ ] Unknown/approximate birth time appears in warnings.
- [ ] Calculating response does not pretend the queue completed.
- [ ] Failed/retry state is observable.

**Verification**

- [ ] API unit tests for module service/controller.
- [ ] Targeted API e2e tests if local dependencies are available.

---

## Task 6: Worker And Chart-Engine Integration

**Owned paths**

- `apps/chart-worker/src/*`
- `packages/chart-engine-client/src/*`
- worker/domain adapter files required by existing job pattern

**Implementation**

- [ ] Add chart-engine client method for `/v1/astro-calendar/range`.
- [ ] Add BullMQ job type for astro-calendar generation.
- [ ] Make generation job idempotent by generation id/fingerprint.
- [ ] Worker loads generation request, calls chart-engine, merges provider global events with client-derived events:
  - birthday;
  - solar window;
  - transit aspects.
- [ ] Persist ready events only after full successful generation.
- [ ] Mark failed with typed error when chart-engine/provider/database fails.
- [ ] Do not enqueue duplicate jobs for an already calculating identical generation.

**Tests**

- [ ] Job success persists ready generation.
- [ ] Job failure marks failed with observable error.
- [ ] Duplicate job is idempotent.
- [ ] Client event generation respects readiness states.

**Verification**

- [ ] Worker targeted tests.
- [ ] Local queue-backed scenario only if services are already running or user explicitly allows process lifecycle changes.

---

## Task 7: Frontend Data Model And Dictionary Lookup

**Owned paths**

- `apps/astrologer-web/src/features/astro-calendar/api/*`
- `apps/astrologer-web/src/features/astro-calendar/model/*`
- existing route/nav files needed to mount `/astro-calendar`

**Implementation**

- [x] Add typed API client for range read and generation/retry.
- [x] Add query state for selected range, timezone, scope, client filters and event types.
- [x] Add generation state matrix:
  - no data;
  - no time;
  - approximate time;
  - calculating;
  - failed/retry;
  - stale after client/settings change;
  - already calculated;
  - recalculation.
- [x] Fetch dictionary entries by deterministic `dictionaryCodes`.
- [x] Render missing dictionary entries honestly with a create action.
- [ ] Keep future modes visible only as disabled honest affordances when present in design.

**Tests**

- [x] API parser rejects malformed response.
- [x] Missing dictionary entries are surfaced.
- [x] Stale response enables recalculation affordance.
- [x] Calculating state does not show fake queued completion.

**Verification**

- [x] Frontend feature tests.
- [x] Typecheck for affected app/package.

---

## Task 8: `/astro-calendar` UI Parity

**Owned paths**

- `apps/astrologer-web/src/pages/astro-calendar/*`
- `apps/astrologer-web/src/features/astro-calendar/ui/*`
- CSS/module files for the new page

**Implementation**

- [x] Map design-reference states from:
  - `ElevenHouseDesign/app/astro-calendar.jsx`
  - `ElevenHouseDesign/app/astro-calendar-data.jsx`
- [x] Implement first-screen workspace, not a landing page.
- [x] Match core layout:
  - top toolbar;
  - left filters/client readiness rail;
  - central calendar grid;
  - right detail/interpretation panel;
  - event chips;
  - generation status controls.
- [x] Match typography, colors, borders, radii, spacing and scroll behavior from reference.
- [x] Implement responsive states for desktop and narrow viewports.
- [x] Ensure interactive controls are keyboard/focus accessible.

**Tests**

- [x] Component tests for visible state matrix.
- [x] No overlapping text on narrow/desktop viewport fixtures.

**Verification**

- [ ] Real browser screenshot comparison against reference route/state.
- [ ] Console/network inspection for `/astro-calendar`.
- [ ] Keyboard/focus smoke check.

**Current blocker**

- 2026-07-26: production web on `http://localhost:5174/astro-calendar` redirects to
  `/auth` in the available Chrome session because `/api/identity/me` returns `401`.
  Browser screenshot comparison, route console/network inspection and keyboard/focus
  smoke remain open until an authenticated astrologer browser session is available.

---

## Task 9: End-To-End Proof

**Scenario**

- [ ] Sign in as astrologer.
- [ ] Open `/astro-calendar`.
- [ ] Generate a 30-day range.
- [ ] See real global events and eligible client events.
- [ ] Change range/settings/client birth data in a way that makes the calendar stale.
- [ ] Recalculate.
- [ ] Reload the page.
- [ ] Confirm persisted ready result.
- [ ] Open an event with dictionary-backed interpretation.
- [ ] Confirm missing dictionary code shows create affordance when seeded missing entry is used.

**Evidence**

- [ ] Browser screenshots at desktop and mobile/narrow widths.
- [ ] Network requests/responses for read, generate and retry.
- [ ] Console has no new errors.
- [ ] Server logs show no unexpected exceptions.
- [ ] Test command output is captured in final report.

---

## Task 10: Documentation And Operating Notes

**Owned paths**

- `docs/product/*` files directly documenting astrology calendar scope
- `docs/architecture/*` files directly documenting chart/calendar contours
- `docs/api/*` files directly documenting new endpoints
- `docs/development/*` runbook updates if new commands are required

**Implementation**

- [ ] Update docs with actual implemented contract, endpoint names, lifecycle and known limits.
- [ ] Record provider capability limitations discovered during implementation.
- [ ] Document dictionary code naming convention for astro calendar entries.
- [ ] Document verification scenario and any residual risk.

**Verification**

- [ ] `pnpm docs:check`
- [ ] `git diff --check -- <owned-doc-paths>`

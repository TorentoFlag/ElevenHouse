# Astro Calendar Design

Date: 2026-07-25
Status: proposed product and architecture design; user review required before
implementation plan
Scope: first production Astro calendar slice after the chart-engine method
surface reached natal/transit/synastry/solar-return/composite/progression/
child-chart/horary/astrocartography first-slice coverage

> This document is an implementation design artifact. Durable decisions must be
> reflected in canonical product, architecture, API and testing docs as the
> implementation lands.

## 1. Purpose

Add Astro calendar as a separate astrologer workspace surface, not as another
wheel mode inside `/chart-engine` and not as the booking calendar's scheduling
model. An authenticated astrologer can open a forecast calendar, choose a
bounded date range, and see provider-backed global and client-specific
astrological events that can inform consultations, content planning and future
automation.

The first slice is complete only when the events are backed by shared contracts,
owner-scoped server hydration, the private chart-engine provider, a deterministic
read model or generation job, frontend state, Dictionary-backed explanatory
anchors and browser/design evidence. Hardcoded prototype events, frontend-owned
astrology math, fake automation success or guessed event payloads are not
complete.

## 2. Locked Product Decisions

- Astro calendar is a new `/astro-calendar` astrologer-web route.
- `/calendar` remains the scheduling/booking calendar. Astro events may later be
  an overlay there, but the first Astro calendar slice does not change booking
  availability, holds, payments or manual blocks.
- `/chart-engine` remains the calculation-result workspace for a selected chart.
  Astro calendar links back to chart calculations where useful, but it is not a
  wheel-first screen.
- The first slice is read-only. It can show "Написать" or "Автоматизировать" as
  disabled/future affordances with explicit copy, but it must not enqueue
  messages, funnels, notification jobs or silent automation.
- Personal events are calculated only for owner-scoped CRM clients whose birth
  data is chart-ready. Clients with missing or unknown birth time are listed in
  a readiness warning, not silently skipped as if the calendar were complete.
- Approximate birth time may produce events with the same visible warning style
  as chart-engine natal/derived modes.
- The initial range is 30 days. API accepts a bounded range up to 93 days to
  align with the existing calendar range guard and prevent accidental expensive
  all-year generation.
- Event times are stored and transmitted as UTC instants and displayed in the
  requested IANA timezone.
- The frontend renders from ElevenHouse canonical JSON. Provider SVG or provider
  prose is not the UI.
- Dictionary interpretations are looked up only by deterministic
  `astro_calendar.*` event codes from the current response. Missing entries are
  shown honestly with a create-interpretation affordance.

## 3. First-Slice Event Types

The first production slice supports a deliberately narrow, provider-backed set:

- `global.moon_phase`: new moon, first quarter, full moon and last quarter
  events in the requested range.
- `global.eclipse`: next solar/lunar eclipse events when they fall inside the
  requested range.
- `global.ingress`: planet sign ingress events detected from ephemeris position
  changes with a documented precision level.
- `client.birthday`: CRM birthday contact points from owner-scoped client data.
- `client.solar_window`: upcoming solar-return window for clients with ready
  birth data, linked to the existing `/chart-engine?mode=solar_return` path.
- `client.transit_aspect`: major transit-to-natal aspects for clients with
  ready birth data, generated from the same settings family as `/chart-engine`
  transits.

Deferred from first slice:

- void-of-course Moon;
- retrograde station exact timing;
- lunar returns;
- progressed/moon daily feeds;
- city relocation scoring;
- automatically deciding whether an event is "good" or "bad";
- personalized marketing segmentation beyond owner-scoped affected clients.

These can be added later when their calculation contract and interpretation
model are explicit.

## 4. Explicitly Out Of Scope

- Public/client-facing Astro calendar.
- Automation/funnels execution.
- Telegram/email/SMS/push sends.
- Booking availability mutation or schedule blocking from astro events.
- Payments, discounts, loyalty rewards or campaign creation.
- AI-generated event interpretation in the first slice.
- PDF/export.
- Calendar subscription/ICS feed.
- Admin platform-wide astrology calendars.
- Retroactive all-history generation.
- Browser-local event caches as the source of truth.

## 5. Repository Context

- `docs/product/roadmap.md` marks all current `/chart-engine` first slices
  through astrocartography as implemented; range AstroCalendar remains separate
  future scope.
- `docs/architecture/design-reference-inventory.md` maps Astro calendar visual
  truth to `ElevenHouseDesign/app/astro-calendar.jsx` and
  `ElevenHouseDesign/app/astro-calendar-data.jsx`.
- `ElevenHouseDesign/app/astro-calendar.jsx` shows the intended visible
  structure: subheader, global/client filters, search, "now in the sky" card,
  30-day horizon, grouped agenda cards, client readiness chips and future action
  affordances.
- `ElevenHouseDesign/app/astro-calendar-data.jsx` uses hardcoded
  `ASTRO_EVENTS`, prototype client ids and mock automation suggestions. These
  are visual examples only and are rejected as production data sources.
- `packages/contracts/src/calendar.ts` and `apps/astrologer-api/src/modules/calendar`
  already own scheduling calendar contracts/routes for bookings, availability
  and manual blocks. Astro calendar must not overload `CalendarEntry`.
- `apps/astrologer-web/package.json` already includes `@fullcalendar/react`
  7.0.0. FullCalendar may be used through an app-local view adapter, but it must
  not become a domain or API contract.
- `apps/chart-engine` already exposes `/v1/transits`, `/v1/solar-return` and
  `/v1/positions`; it does not yet expose a range Astro calendar endpoint.
- `apps/chart-engine` depends on Kerykeion `>=5.12,<5.13` and `pyswisseph`.

## 6. Research

Question: what calculation source and frontend event model should the first
Astro calendar slice use?

Decision affected: provider endpoint, API shape, async/caching strategy,
frontend route, and separation from booking calendar.

Accessed: 2026-07-25.

### Sources

- https://kerykeion.net/python-library/docs/v5 - official Kerykeion v5 docs
  describe structured astrology calculations, JSON/Pydantic output, forecasting
  with returns, time-range transits and ephemeris data.
- https://kerykeion.net/python-library/docs/v5/transits_time_range_factory -
  official docs for calculating transit moments over days/weeks/months by
  comparing a fixed natal chart with ephemeris data points.
- https://kerykeion.net/python-library/docs/v5/ephemeris_data_factory -
  official docs for time-series ephemeris data with day/hour/minute step sizes
  and safety limits.
- https://kerykeion.net/python-library/docs/v5/moon_phase_details_factory -
  official docs for lunar phase overview, upcoming major phases, eclipse data
  and structured serialization.
- https://fullcalendar.io/docs/event-source - official FullCalendar v7 docs for
  event sources and server-fed event data.
- https://fullcalendar.io/docs/event-object - official FullCalendar v7 docs for
  event object fields, read-only event properties and exclusive `end` semantics.

### Findings

- Sourced fact: Kerykeion v5 has forecasting primitives for transit ranges,
  ephemeris time series and lunar/eclipses context.
- Sourced fact: `TransitsTimeRangeFactory` compares one natal chart against
  ephemeris data points and returns transit moments with aspects.
- Sourced fact: `EphemerisDataFactory` supports `"days"`, `"hours"` and
  `"minutes"` step types and has documented range safety limits.
- Sourced fact: `MoonPhaseDetailsFactory` returns structured lunar phase,
  upcoming phase and eclipse data and is serializable.
- Sourced fact: FullCalendar can consume JSON/function event sources, but its
  event object is a UI model with read-only properties and exclusive `end`
  semantics.
- Repository evidence: current scheduling calendar has its own `CalendarEntry`
  contract for bookings/manual blocks; Astro calendar event semantics are
  different and need separate contracts.
- Repository evidence: current chart-engine transit endpoint is single-moment;
  range transit feeds were explicitly deferred from `/chart-engine` transits.
- Inference: the provider boundary should be extended with an Astro calendar
  range endpoint instead of generating aspects in React or overloading saved
  chart calculation records.
- Inference: first implementation should store or cache generated read-model
  events because a range across many clients can be expensive and must survive
  reloads without browser-local truth.

### Options

1. Provider-backed async generation with server read model.
   Benefits: owner-scoped, deterministic, reload-safe, observable failures,
   performance control, compatible with future automation triggers. Risks:
   adds DB/worker surface. Selected.
2. Synchronous `GET /astro-calendar/range` that calculates all events on every
   request.
   Benefits: fewer moving parts. Risks: slow ranges, repeated provider load,
   poor retry/failure state, timeout risk for many clients. Rejected for the
   production first slice.
3. Frontend composition from existing `/chart-engine` saved results and
   `/v1/positions`.
   Benefits: fast to demo. Risks: browser-owned astrology logic, incomplete
   range aspects, no durable status, no owner-scoped cache and no reliable
   future automation source. Rejected.

### Recommendation

Implement Astro calendar as a new owner-scoped read-model contour:

- shared contracts define `AstroCalendarRangeQuery`,
  `AstroCalendarGenerationRequest`, `AstroCalendarRangeResponse` and
  `AstroCalendarEvent`;
- `astrologer-api` owns auth, CSRF/idempotency for generation, CRM/client
  hydration, readiness warnings and result reads;
- `chart-worker` or a dedicated worker queue executes generation jobs and calls
  `apps/chart-engine`;
- `apps/chart-engine` exposes a private `/v1/astro-calendar/range` endpoint
  that uses Kerykeion forecasting factories and returns canonical event JSON;
- DB stores generation metadata, fingerprint, status and canonical events;
- frontend renders `/astro-calendar` from the API response and Dictionary
  lookup, with honest missing-entry links and disabled future actions.

### Rejected Alternatives

- Treat Astro calendar as a `/calendar` overlay in the first slice: rejected
  because scheduling entries and astro forecast events have different ownership,
  side effects and acceptance criteria.
- Treat Astro calendar as a `/chart-engine` mode: rejected because it is a range
  agenda/read-model surface, not a single calculation wheel.
- Ship automation buttons that navigate to funnels as if automation exists:
  rejected because automation/funnels are still missing and would be fake
  success.
- Calculate retrograde/void-of-course events now: rejected until exact event
  algorithms and precision semantics are specified and tested.

### User Decisions

None required for this spec. The current boundaries determine the first slice:
provider-backed read model first; automation, sends and booking mutations later.

## 7. Proposed Contracts

Add `packages/contracts/src/astro-calendar.ts`.

### Query And Generation

```ts
type AstroCalendarRangeQuery = {
  start: string; // UTC instant
  end: string; // UTC instant, exclusive
  timeZone: string; // IANA
  scope?: "all" | "global" | "client";
  clientIds?: string[];
  eventTypes?: AstroCalendarEventType[];
};

type AstroCalendarGenerationRequest = AstroCalendarRangeQuery & {
  settings: ChartCalculationSettings;
};
```

Rules:

- `end` must be after `start`.
- range cannot exceed 93 days.
- `timeZone` must be a valid IANA timezone.
- `clientIds` are optional but owner-scoped server-side.
- API may cap generated clients per request and return an explicit
  `CLIENT_SCOPE_TRUNCATED` warning instead of silently dropping clients.

### Response

```ts
type AstroCalendarRangeResponse = {
  schemaVersion: "astro-calendar-range.v1";
  timeZone: string;
  range: { start: string; end: string };
  generation: {
    status: "ready" | "calculating" | "failed" | "stale";
    generationId: string | null;
    fingerprint: string;
    generatedAt: string | null;
    provider: ProviderMetadata | null;
  };
  events: AstroCalendarEvent[];
  readiness: AstroCalendarReadinessSummary;
  summary: AstroCalendarSummary;
  dictionaryCodes: string[];
  warnings: AstroCalendarWarning[];
};
```

### Event

```ts
type AstroCalendarEvent = {
  id: string;
  source: "global" | "client";
  type:
    | "global.moon_phase"
    | "global.eclipse"
    | "global.ingress"
    | "client.birthday"
    | "client.solar_window"
    | "client.transit_aspect";
  startsAt: string;
  endsAt: string | null;
  timePrecision: "exact" | "hour" | "day";
  title: string;
  subtitle: string | null;
  description: string | null;
  tone: "neutral" | "supportive" | "intense" | "opportunity";
  points: string[];
  aspect: string | null;
  sign: string | null;
  clientRefs: Array<{ clientId: string; displayName: string; initials: string }>;
  chartLink:
    | { mode: "transit" | "solar_return"; clientId: string; date: string }
    | null;
  dictionaryCodes: string[];
  warnings: AstroCalendarWarning[];
};
```

Contract tests must prove strict parsing, bounded ranges, timezone validation,
exclusive end semantics, deterministic dictionary code ordering, client
readiness warnings and rejection of unsupported lifecycle fiction such as
`automationStatus: "sent"`.

## 8. Backend And Provider Architecture

### API

Add `apps/astrologer-api/src/modules/astro-calendar`:

- `GET /astro-calendar/range` returns the current ready/cached generation or a
  calculating/failed/stale envelope with warnings.
- `POST /astro-calendar/generations` requires auth, CSRF and an
  `idempotency-key`; it creates or reuses a generation job for the normalized
  range/settings/fingerprint.
- `GET /astro-calendar/generations/:generationId` returns generation status and
  ready events.

The API does not accept browser-supplied birth snapshots. It receives only
range/settings/client filters, then hydrates owner-scoped clients and birth data
server-side.

### Domain

Add `packages/domain/src/astro-calendar` use cases:

- normalize range and filters;
- build generation fingerprint from owner id, range, timezone, settings,
  included client birth-data checksums/updated timestamps and provider version;
- select eligible clients and produce readiness warnings;
- create/reuse generation jobs idempotently;
- validate provider result and store read-model events.

### DB

Add DB schema under `packages/db/src/schema/astro-calendar`:

- `astro_calendar_generations`: owner id, range, timezone, settings snapshot,
  client scope snapshot, fingerprint, provider metadata, status, generated at,
  failure code/message.
- `astro_calendar_events`: generation id, event type, source, start/end,
  precision, canonical event data JSON.
- Optional join table for event affected clients if querying by client needs to
  be efficient in later slices.

Generation rows are private to the astrologer owner. They are not public
calculation materials and do not use calculation PDF storage.

### Worker

Use the existing async pattern:

```text
astrologer-api -> DB generation row + outbox/job
  -> worker queue
  -> apps/chart-engine /v1/astro-calendar/range
  -> DB events + generation ready/failed
```

The worker must treat provider/network failures as observable `failed` state,
not an empty successful calendar.

### Chart Engine

Add private `POST /v1/astro-calendar/range`.

Input:

- normalized range/timezone;
- calculation settings;
- global calculation location/timezone context;
- owner-scoped client input snapshots prepared by `astrologer-api`.

Output:

- provider metadata;
- canonical global/client events;
- calculation warnings.

Provider implementation uses:

- `MoonPhaseDetailsFactory` for lunar phase and eclipse context;
- `EphemerisDataFactory` for global planetary position series and ingress
  detection;
- `TransitsTimeRangeFactory` for client transit aspects;
- existing solar-return provider logic or `PlanetaryReturnFactory` for
  solar-return window events.

The provider response includes precision metadata. If an event is detected by a
daily ephemeris step and not refined to an hour/minute, the UI displays day
precision instead of pretending exact time.

## 9. Frontend Design

Add `/astro-calendar` in `apps/astrologer-web`.

Visual source:

- `ElevenHouseDesign/app/astro-calendar.jsx`;
- `ElevenHouseDesign/app/astro-calendar-data.jsx` for example states only;
- existing `/calendar` components for dense calendar ergonomics where reusable;
- existing chart-engine Dictionary missing-entry affordance.

First desktop layout:

- subheader with title, scope segmented control, type filter, search and
  generated/status indicator;
- top "Сейчас на небе" card from the current global response;
- 30-day horizon strip;
- grouped agenda: today, this week, this month, later;
- right/detail panel or inline expanded detail for selected event;
- readiness panel for clients without chart-ready birth data;
- disabled future action buttons for automation/sends with non-broken copy.

Mobile:

- search and filters first;
- compact stats;
- horizon strip;
- one-column agenda;
- event detail as bottom sheet or inline disclosure.

State matrix:

- no profile timezone;
- empty range;
- calculating generation;
- failed generation with retry;
- stale generation after birth data/settings/client scope change;
- partial readiness due to missing/unknown birth time;
- ready with global-only events;
- ready with client events;
- Dictionary loading/error/missing entries;
- disabled future actions.

The page must not derive aspects, moon phases, readiness or event significance
in React. It may format, group, filter and highlight server events.

## 10. Dictionary Codes

Initial deterministic codes:

- `astro_calendar.global.moon_phase.<phase>`
- `astro_calendar.global.eclipse.<solar|lunar>.<type>`
- `astro_calendar.global.ingress.<point>.<sign>`
- `astro_calendar.client.birthday`
- `astro_calendar.client.solar_window`
- `astro_calendar.client.transit.<transitPoint>.<aspect>.<natalPoint>`

The API response carries the exact code list. The frontend calls
`/dictionary/entries/by-codes` with those codes only. Missing entries show:

```text
В справочнике пока нет записи <code>.
Создать трактовку
```

AI drafts are disabled until a separate AI prompt and privacy contract exist.

## 11. Security, Privacy And Consent

- All routes require authenticated astrologer session.
- Generation mutations require CSRF and idempotency.
- Client filters are owner-scoped; unknown clients produce validation/not-found
  errors without leaking other owners' existence.
- Birth snapshots stay server/provider-side and are not returned to the
  frontend.
- Frontend receives only event display data, client display refs already visible
  to the astrologer, warnings and chart links.
- No sends, campaigns or client notifications happen without future explicit
  consent/automation contours.
- Event descriptions must not claim deterministic outcomes or medical/financial
  certainty.

## 12. Testing And Evidence

Implementation must use behavioral TDD by layer:

- contracts tests for strict query/request/response/event validation;
- domain tests for fingerprinting, readiness, stale generation and unsupported
  state rejection;
- DB adapter integration for owner scoping, generation reuse, event persistence
  and failed/retry states;
- chart-engine pytest for `/v1/astro-calendar/range` global events, client
  transit events, precision warnings and provider failure mapping;
- worker tests for dispatch, completion, retry and failure;
- API e2e for auth, CSRF/idempotency, owner scoping and range bounds;
- frontend tests for loading/calculating/failed/stale/ready/missing Dictionary
  states and disabled future actions;
- browser proof on `/astro-calendar`: authenticated role, real network, generate
  range, reload, filter/search, select event, missing Dictionary create link,
  console/network clean;
- design parity against `ElevenHouseDesign/app/astro-calendar.jsx` desktop and
  mobile states with screenshots and measured layout tokens.

Docs updates when implementation lands:

- `docs/product/roadmap.md`;
- `docs/architecture/design-reference-inventory.md`;
- `docs/architecture/backend-modules.md`;
- `docs/api/api-boundaries.md` if new public API boundary details are needed.

## 13. Implementation Milestones

1. Contracts and spec tests for `astro-calendar` request/response/event schemas.
2. Chart-engine bounded spike and provider endpoint for one global range and one
   client transit range.
3. Domain/DB generation read model with idempotent generation lifecycle.
4. Worker dispatch and API routes.
5. Frontend `/astro-calendar` route with real states and Dictionary lookup.
6. Browser/design parity and docs sync.

Each milestone must end with observable verification before moving on.

## 14. Open Risks

- Range transit generation can become expensive for large client lists. The
  first implementation must cap range/client scope and surface truncation.
- Exact ingress/retrograde timing may need root-finding beyond simple ephemeris
  stepping. The first slice must expose precision honestly and defer exact
  retrograde stations.
- Kerykeion docs describe current v5 capabilities, but local dependency is
  pinned to `>=5.12,<5.13`. Implementation must verify behavior against the
  installed version with pytest before relying on every documented factory.
- Product copy must avoid deterministic prediction claims. Dictionary entries
  should explain symbolic timing and suggested work context, not guaranteed
  outcomes.

## 15. Definition Of Done For The First Slice

- `/astro-calendar` is enabled only when contracts, provider, generation
  lifecycle, API, frontend and browser evidence exist.
- Opening the page never shows hardcoded prototype events as production data.
- Readiness gaps are visible and actionable.
- Failed generation is retryable and observable.
- Stale data after birth-data/settings/client-scope changes is detected.
- Dictionary lookup is deterministic and honest about missing entries.
- Future automation/notifications are visibly disabled rather than simulated.
- Runtime browser proof and design parity evidence are recorded.

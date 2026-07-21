# Chart Engine Natal Design

Date: 2026-07-20
Status: approved product and architecture design; implementation planning pending
Scope: first production slice of the ElevenHouse chart engine, focused on
server-backed natal chart calculation for CRM clients

> This document is an implementation design artifact. After implementation,
> durable decisions must also be reflected in canonical architecture, API,
> deployment, testing, and product documents.

## 1. Purpose

Build the chart engine before AstroCalendar. AstroCalendar depends on reliable
personal chart calculations for transits, returns, client-specific actions, and
future retention workflows. The first production slice is natal chart
calculation end to end: authenticated astrologer selects a CRM client with
complete birth data, starts a calculation, and receives a saved canonical chart
result rendered by ElevenHouse frontend components.

The feature is complete when `natal` can be calculated through
`astrologer-api`, asynchronous worker execution, a Python Kerykeion-backed
calculation runtime, PostgreSQL persistence, shared contracts, and a real
frontend state model without fake/browser-only astrology math.

## 2. Locked Product Decisions

- AstroCalendar is deferred. The chart engine is the prerequisite product
  foundation.
- First production method is `natal` only.
- First slice calculates charts for existing CRM clients, not arbitrary manual
  subjects.
- Known birth time, IANA timezone, latitude, and longitude are required for a
  full natal chart.
- `birthTimePrecision = unknown` blocks calculation and shows a birth-data CTA.
- `birthTimePrecision = approximate` may calculate a full chart with a visible
  warning.
- Frontend must not expose technical queue wording. Both backend `queued` and
  `processing` display as one user state: "calculating chart".
- Kerykeion is the primary provider for calculation, but its raw output is not
  a public API or storage contract.
- Kerykeion SVG output is not used for the ElevenHouse UI. The frontend renders
  the wheel and tables from canonical JSON so it can match
  `ElevenHouseDesign`.
- Other methods visible in the design reference, such as transits,
  progressions, directions, returns, synastry, composite, solar, and child
  charts, are capability-gated until implemented.
- Legal/licensing/consent analysis is outside this design artifact. The
  implementation still keeps normal technical boundaries: auth, tenant
  isolation, no unnecessary CRM data in queues/logs/provider calls, and no
  public exposure of calculation inputs.

## 3. Explicitly Out Of Scope

- AstroCalendar event feed and "sky today" read model.
- Personal transit calendar and action recommendations.
- Solar return, lunar return, synastry, composite, progression, direction, and
  child chart production flows.
- Reduced charts for unknown birth time.
- Manual chart creation outside CRM clients.
- Hosted Kerykeion Astrologer API integration.
- AI interpretation generation for charts.
- PDF export for charts.
- Public/client-facing chart sharing.

## 4. Repository Context

Current repository evidence establishes these constraints:

- `apps/chart-worker` exists as a deployable but is currently readiness-only.
- `packages/domain/src/calculations` and `packages/contracts/src/calculations`
  contain generic calculation concepts, including a `chart` module value.
- Existing `calculation_records` stores completed current calculation results
  and has statuses such as calculated, linked, published, and archived. It is
  not an execution job table.
- Existing calculation replacement semantics invalidate dependent artifacts and
  publication state. Chart recalculation must preserve that behavior.
- Client birth data already contains date, time, time precision, timezone,
  latitude, and longitude fields.
- Existing PDF worker infrastructure shows the repository's preferred pattern:
  database job state, transactional outbox, BullMQ delivery, deterministic job
  ids, bounded retries, and separate worker execution.
- `apps/chart-engine` is not in the accepted deployable app list, repository
  structure documentation, or current CI image matrix. Adding it is an
  architecture/deployment boundary change, not a normal feature-module
  extension.
- Current client birth timezone storage is nullable text and current shared
  client contracts accept a trimmed string. The chart engine requires reusable
  IANA timezone validation and explicit DST ambiguity handling before a birth
  snapshot can be considered calculation-ready.
- `ElevenHouseDesign/app/engine-data.jsx`,
  `ElevenHouseDesign/app/engine.jsx`,
  `ElevenHouseDesign/app/engine-tables.jsx`, and
  `ElevenHouseDesign/app/engine-modes.jsx` define visual language and intended
  controls, but the design helpers are deterministic/fake browser
  approximations and are not production calculation logic.
- `docs/architecture/design-reference-inventory.md` treats the chart engine as
  future product surface and `ElevenHouseDesign` as visual truth, not runtime
  architecture.

The implementation must stay in the shared `main` checkout, preserve unrelated
calendar/QA changes, and touch only chart-engine owned paths unless adapting
existing modules is required for the approved contour.

## 5. Research

Question: how should ElevenHouse integrate Python/Kerykeion into a NestJS
production application for chart calculations?

Decision affected: process boundary, provider abstraction, concurrency model,
canonical result contract, deployment, and rollout sequencing.

Accessed: 2026-07-20.

### Sources

- https://pypi.org/project/kerykeion/ - package status, current stable version,
  Python requirement, license metadata, and supported feature claims.
- https://kerykeion.net/python-library/docs/v5 - official v5 documentation for
  natal, synastry, transit, composite, return charts, chart data, SVG rendering,
  JSON support, distributions, house systems, and offline mode.
- https://kerykeion.net/python-library/docs/v5/astrological_subject_factory -
  official factory input model for birth data, coordinates, timezone, house
  systems, zodiac type, perspective, active points, and offline mode.
- https://kerykeion.net/python-library/docs/v5/faq - official production notes
  for offline mode, DST ambiguity, polar latitude handling, thread safety, and
  active point limits.
- https://kerykeion.net/python-library/docs/v5/planetary_return_factory -
  official return-chart capability for later solar/lunar return slices.
- https://kerykeion.net/content/docs/transits_time_range_factory - official
  transit-range capability for later transit/AstroCalendar work.
- https://kerykeion.net/libephemeris/docs/guides/migration-guide - upstream
  context for Swiss Ephemeris global-state thread-safety and process/context
  isolation trade-offs.

### Findings

- Sourced fact: PyPI lists Kerykeion `5.12.9` as latest stable on 2026-05-25,
  with Python `>=3.10` metadata and AGPL-3.0 license metadata.
- Sourced fact: Kerykeion documentation text still mentions Python `3.9+`,
  while PyPI package metadata requires Python `>=3.10`. The implementation
  lock strategy must trust package metadata and confirm installation in the
  provider spike.
- Sourced fact: Kerykeion v5 provides natal chart calculation, houses,
  aspects, SVG chart generation, synastry, transits, composite charts, solar
  and lunar returns, JSON/data-oriented output, house systems, distributions,
  and offline calculation with explicit longitude, latitude, and timezone.
- Sourced fact: Kerykeion's documented workflow separates subject creation,
  data factory output, and chart drawing. ElevenHouse should consume the data
  layer and not adopt provider SVG as product UI.
- Sourced fact: official Kerykeion FAQ recommends offline mode for production
  when coordinates and timezone are available.
- Sourced fact: official Kerykeion FAQ states
  `AstrologicalSubjectFactory` is not thread-safe because Swiss Ephemeris keeps
  global state; the documented mitigation is separate processes or locking.
- Sourced fact: LibEphemeris documentation gives the same global-state warning
  for Swiss/pyswisseph-compatible APIs and identifies isolated contexts as the
  safe multi-threaded model. Until a Kerykeion-specific spike proves safe
  context usage end to end, ElevenHouse treats process isolation or locking as
  the production constraint.
- Sourced fact: official Kerykeion FAQ notes DST ambiguous/non-existent birth
  times and high-latitude house calculation limitations that must become typed
  validation or warning behavior.
- Repository evidence: ElevenHouse already uses asynchronous worker patterns
  with database-backed job state, outbox, BullMQ, retries, readiness, and
  private payload discipline for PDF generation.
- Repository evidence: frontend design expects custom ElevenHouse wheel,
  tables, tabs, settings, and presentation actions. Provider SVG cannot be the
  visual contract.
- Inference: Python should be isolated behind an internal service boundary
  rather than embedded directly in NestJS. This matches provider/runtime needs,
  avoids Node/Python build coupling, and lets process concurrency handle the
  Kerykeion/Swiss Ephemeris thread-safety constraint.
- Inference: a provider-neutral canonical chart contract is required so
  frontend, persistence, AI interpretation, PDF export, and future provider
  swaps do not depend on raw Kerykeion models.

### Options

1. Embed Python/Kerykeion directly into the NestJS API container.
   Benefits: fewer deployables and one request path. Risks: mixed runtimes,
   difficult dependency isolation, API latency, thread-safety hazards, and
   harder scaling. Rejected.

2. Run a separate Python chart-engine service and orchestrate it through
   `astrologer-api` plus asynchronous `chart-worker`.
   Benefits: clean runtime boundary, controlled process concurrency, reliable
   queues, idempotent persistence, and reuse of existing worker/outbox patterns.
   Selected.

3. Use Kerykeion's hosted Astrologer API as the calculation provider.
   Benefits: no Python service to operate. Risks: external network dependency,
   provider data-transfer boundary, less control over latency and contracts, and
   a new vendor integration decision. Deferred.

### Recommendation

Use an internal Python `chart-engine` runtime backed by pinned Kerykeion v5,
called only by `apps/chart-worker`. Keep `astrologer-api` responsible for auth,
validation, CRM birth-data hydration, settings normalization, idempotent job
creation, and result lookup. Keep Python stateless and provider-scoped. Persist
only ElevenHouse canonical chart JSON.

### Rejected Alternatives

- Bespoke astrology math in TypeScript: unnecessary risk because Kerykeion
  already delegates core ephemeris and chart calculations.
- Direct synchronous API calculation: unsuitable for latency, retry, failure,
  and concurrency behavior.
- Raw Kerykeion output as stored result: leaks provider internals into durable
  contracts and blocks future provider changes.
- Kerykeion SVG rendering: conflicts with ElevenHouse visual reference and
  makes UI states hard to control.

### User Decisions

- First slice is natal.
- Unknown birth time blocks calculation instead of producing a reduced chart.
- Technical queue state must not be visible in frontend copy.
- Existing modules may be adapted when needed for the chart engine contour.

## 6. Chosen Architecture

### 6.1 Runtime Flow

```text
astrologer-web
    -> astrologer-api / charts
    -> PostgreSQL chart_calculation_jobs + outbox transaction
    -> outbox relay
    -> BullMQ message containing only jobId
    -> apps/chart-worker
    -> private HTTP call to apps/chart-engine
    -> canonical result validation
    -> PostgreSQL calculation_records completion
```

The API never calls Kerykeion synchronously during a user request. It validates
and creates or reuses a job/result, writes the outbox event in the same
database transaction, then returns quickly. Controllers do not publish directly
to Redis. The outbox relay owns delivery to BullMQ. The worker owns slow and
retryable execution.

### 6.2 Components

`apps/astrologer-api/src/modules/charts`

- verifies authenticated astrologer scope;
- verifies astrologer-client ownership;
- hydrates birth data server-side from CRM/client storage;
- validates known time, timezone, latitude, and longitude;
- applies route security metadata for cookie-auth CSRF on state-changing
  chart routes;
- applies astrologer chart preferences or request settings;
- creates or reuses a calculation job transactionally;
- exposes status/result/recalculation endpoints;
- never trusts browser-provided birth data as the authoritative input.

`packages/domain/src/charts`

- declares provider-neutral chart types, settings, errors, use cases, and
  `ChartCalculationPort`;
- contains no Kerykeion, FastAPI, Redis, NestJS, or Drizzle imports.

`packages/contracts`

- exposes validated request/response/job/result schemas for API and frontend;
- defines canonical chart result JSON schema used to validate Python responses
  before persistence.

`packages/db`

- owns `chart_calculation_jobs`;
- keeps existing `calculation_records` as completed current-result storage;
- supports idempotent job reuse, worker claiming, lease expiry, completion,
  and terminal failure.

`apps/chart-worker`

- consumes BullMQ jobs containing only `{ jobId }`;
- loads the authoritative job snapshot from PostgreSQL;
- calls Python `chart-engine`;
- validates canonical result;
- writes successful completion transactionally and idempotently;
- handles retries, timeouts, leases, final failure, and observability.

`apps/chart-engine`

- new stateless Python/FastAPI deployable;
- pins Kerykeion `5.12.x` until a deliberate upgrade spike approves a newer
  major/alpha version;
- exposes `/live`, `/ready`, and `/v1/natal`;
- accepts only calculation inputs, not names, CRM ids, phone numbers, notes,
  products, or relationship history;
- uses explicit offline coordinates/timezone;
- runs multiple worker processes or a process-local lock, never unsafe
  threaded parallel Kerykeion calls.

`apps/astrologer-web`

- renders the ElevenHouse wheel, tables, settings, tabs, states, and actions
  from canonical JSON;
- never performs authoritative astrology calculation in browser code;
- maps both `queued` and `processing` backend states to one visible
  calculating state.

## 7. API Design

Initial API surface:

- `POST /charts/natal/jobs`
- `GET /charts/jobs/:jobId`
- `GET /charts/calculations/:calculationId`
- `POST /charts/calculations/:calculationId/recalculate`

`POST /charts/natal/jobs` accepts:

- `clientId`;
- optional calculation settings supported by first slice.

It does not accept birth date, birth time, timezone, latitude, longitude, or
client identity fields from the browser. Those are loaded by the API from the
owner-scoped CRM/client record.

Both `POST` routes are cookie-auth state-changing routes. They must use the
`astrologer-api` security module's CSRF route metadata according to ADR 0007.
Feature code must not implement hand-rolled CSRF checks.

The create endpoint returns:

- `200 OK` with existing completed `calculationId` when identical completed
  result already exists;
- `202 Accepted` with existing or newly created `jobId` when calculation is
  queued/processing;
- typed validation error when birth data is incomplete or settings are
  unsupported.

`GET /charts/jobs/:jobId` returns an owner-scoped public job state and, on
success, the resulting `calculationId`. It does not expose worker names,
attempt internals, queue position, Redis ids, or provider tracebacks.

`GET /charts/calculations/:calculationId` returns the saved canonical result
and presentation metadata only if the authenticated astrologer owns the record.

`POST /charts/calculations/:calculationId/recalculate` creates or reuses a new
job from the current CRM birth snapshot and selected settings. On successful
completion it uses existing calculation replacement semantics, including
invalidating stale interpretations, PDFs, artifacts, and publication state.

Replay semantics are business-level and fingerprint-based:

- duplicate create/recalculate requests with the same calculation-ready input
  and settings reuse the existing active job or completed result;
- stale browser retries cannot create multiple completed results;
- if a future shared route policy requires `Idempotency-Key` for all
  state-changing routes, chart routes must comply while still keeping the
  PostgreSQL fingerprint as the authoritative business idempotency boundary.

Queue delivery semantics:

- API transaction writes `chart_calculation_jobs` and an outbox event;
- controller code never publishes directly to Redis/BullMQ;
- outbox relay publishes a BullMQ payload containing only `{ jobId }`;
- worker loads all calculation input from PostgreSQL by owner-scoped job id.

## 8. Idempotency And Fingerprints

The authoritative fingerprint is derived from:

```text
method
client id
birth data snapshot
normalized settings
canonical schema version
provider name/version
ephemeris/version metadata
```

Rules:

- identical completed fingerprint returns the existing result;
- identical active fingerprint returns the existing job;
- duplicate BullMQ delivery cannot create a second `calculation_record`;
- Redis job id uniqueness is useful but PostgreSQL remains the source of
  truth;
- the job snapshot is immutable after creation so later CRM birth-data edits do
  not mutate an in-flight calculation.

## 9. Job Persistence

`chart_calculation_jobs` lifecycle:

```text
queued -> processing -> succeeded
queued -> processing -> failed
queued -> failed
```

Required columns or equivalent fields:

- `id`;
- `owner_user_id`;
- `client_id`;
- `result_calculation_id` nullable, filled only after successful persistence;
- `method`;
- `status`;
- `input_fingerprint`;
- `input_snapshot`;
- `settings_snapshot`;
- `provider`;
- `schema_version`;
- `attempts`;
- `max_attempts`;
- `locked_by`;
- `locked_until`;
- `last_error_code`;
- `last_error_message`;
- `started_at`;
- `finished_at`;
- `created_at`;
- `updated_at`.

`calculation_records` receives only successful current-result data. It is not
used as a placeholder for queued, processing, or failed jobs. A queued or
processing job must not hold a non-null foreign key to `calculation_records`.

## 10. Canonical Result Contract

The stored calculation payload is provider-neutral but has two layers:

- private `inputSnapshot`, used for reproducibility, fingerprints, audit, and
  authorized astrologer-only metadata;
- renderable `result`, used by frontend chart views, future PDF rendering, and
  interpretation inputs.

The frontend must not assume that private birth input fields are part of every
public or future client-visible result contract. Client sharing, public links,
exports, and client-cabinet surfaces need their own gated DTOs.

```ts
type StoredChartCalculationPayload = {
  schemaVersion: "chart-result.v1";
  method: "natal";
  provider: {
    name: "kerykeion";
    version: string;
    ephemeris: string;
  };
  settings: {
    zodiac: "tropical";
    houseSystem: string;
    nodeType: "true" | "mean";
    aspectPreset: "major" | "major_minor";
    orbMultiplier: number;
  };
  inputSnapshot: {
    birthDate: string;
    birthTime: string;
    timezone: string;
    latitude: number;
    longitude: number;
    birthTimePrecision: "exact" | "approximate";
    dstOccurrence?: "first" | "second";
  };
  result: ChartRenderResult;
};

type ChartRenderResult = {
  points: ChartPoint[];
  houses: ChartHouse[];
  aspects: ChartAspect[];
  distributions: ChartDistributions;
  warnings: ChartWarning[];
};
```

`ChartRenderResult` is not allowed to be an empty render shell. A persisted
`chart-result.v1` payload must contain the required point set, all 12 houses,
fixed distribution keys and warning array before it can be rendered or saved.
The frontend must treat missing required render data as invalid canonical
result data, not fill it from private input.

Required first-slice points:

- Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto;
- Ascendant and Midheaven;
- North Node and South Node.

Chiron is desirable but not a first-slice blocker until the adapter spike
confirms stable Kerykeion support under our settings.

Each point includes:

- stable `id`;
- display-neutral `label`;
- absolute longitude;
- sign;
- degree within sign;
- house number when applicable;
- retrograde flag when applicable.

Each house includes:

- house number;
- cusp absolute longitude;
- sign;
- degree within sign.

Each aspect includes:

- first point id;
- second point id;
- aspect type;
- exact angle;
- actual orb;
- applying/separating when provider data is reliable;
- strength/weight for sorting UI and later interpretation.

Aspects must not contain self-pairs after provider name normalization, and must
not contain duplicate normalized point/type pairs. This is especially important
for lunar node aliases, because provider-level true/mean node names can map to
the same ElevenHouse point ids.

Default aspects are major/Ptolemaic aspects:

- conjunction;
- opposition;
- square;
- trine;
- sextile.

The contract supports minor aspects through `aspectPreset = major_minor`. They
are not the default first-slice output, but the adapter and RU UI labels support
semi-sextile, semi-square, quincunx and quintile when the setting is enabled.

`orbMultiplier` affects aspect inclusion and returned `strength`; it must not
be stored as an inert setting.

Distributions include at least:

- element: fire, earth, air, water;
- modality: cardinal, fixed, mutable;
- polarity: masculine/feminine or active/passive, whichever the adapter and
  domain naming standardize during implementation.

Warnings include:

- `BIRTH_TIME_APPROXIMATE`;
- `HIGH_LATITUDE_HOUSES_UNSTABLE`;
- `DST_AMBIGUOUS_TIME`;
- `DST_NON_EXISTENT_TIME`;
- `PROVIDER_PARTIAL_FIELD`.

The canonical result must not contain raw Kerykeion JSON, SVG, client name,
phone, CRM notes, frontend layout coordinates, or style metadata.

Authorized astrologer UI may receive a presentation DTO that includes selected
private birth metadata next to `result`. That DTO is not reusable for public
sharing or client-visible export without a separate product/security decision.

## 11. Supported Settings

First slice supports:

- tropical zodiac fixed internally;
- house system selected from the subset supported by both design and
  Kerykeion adapter;
- true or mean node;
- major aspects or major plus minor aspects;
- orb multiplier between bounded minimum and maximum matching the design
  settings.

Settings from the design reference that are not backed by production logic are
not shown as working controls. They are hidden or disabled through a capability
registry until implemented.

Astrologer chart preferences may be added as a small persistent settings model
if current settings modules do not already provide an appropriate owner-scoped
store. Request settings still get snapshotted into each job so historical
results are reproducible.

## 12. Birth Data Readiness

The chart engine must not treat non-null birth fields as calculation-ready by
default. The API readiness check must require:

- `birthDate` matching the existing date contract;
- `birthTime` matching the existing time contract;
- `birthTimePrecision` equal to `exact` or `approximate`;
- `birthTimezone` validated through the reusable IANA timezone schema;
- `birthLatitude` and `birthLongitude` in valid ranges;
- explicit representation for ambiguous DST local times when the same local
  wall time occurs twice;
- permanent validation failure for non-existent DST local times unless the
  stored birth record is corrected to a real local time.

The implementation should reuse `packages/validation/src/common/time-zone.ts`
for contract/API validation and add DB-level or migration-backed safeguards
where practical. DST ambiguity must be represented in stored birth data or a
strict owner-scoped birth-data readiness table before the first production
chart calculation can rely on ambiguous local times.

## 13. Failure Model

Permanent failures do not retry:

- missing birth time;
- `birthTimePrecision = unknown`;
- missing timezone;
- missing latitude or longitude;
- astrologer does not own the client;
- unsupported settings;
- DST ambiguity that cannot be resolved from stored data;
- provider returns mathematically invalid required fields.

Retryable failures retry with bounded attempts:

- Python service timeout;
- temporary network failure;
- worker process crash;
- transient Redis or PostgreSQL failure;
- Python process restart during execution.

First-slice defaults:

- API create-job request never waits for calculation;
- worker-to-Python natal timeout starts at a conservative value and is tuned
  after benchmark, expected initial range 10-15 seconds;
- max attempts: 3;
- exponential backoff with jitter;
- final failure is persisted and surfaced through job status.

Frontend states:

- incomplete birth data: actionable CTA;
- calculating: backend `queued` or `processing`;
- success: render saved chart;
- retryable final failure: retry action;
- permanent failure: specific CTA/message;
- stale result: previous result visible as stale while recalculation runs when
  the product state requires continuity.

## 14. Scaling And Concurrency

Kerykeion/Swiss Ephemeris thread-safety limits only unsafe parallel calls
inside one Python process. It does not limit how many users can request
calculations. Burst traffic is absorbed by PostgreSQL/BullMQ jobs.

Concurrency model:

- Redis/BullMQ stores only job ids;
- `chart-worker` uses controlled concurrency;
- one Python process handles one calculation at a time or protects Kerykeion
  calls with a process-local lock;
- one container may run multiple Python worker processes;
- horizontal scaling adds more `chart-engine` replicas and adjusts worker
  concurrency;
- exact process count is determined by benchmark, not guessed.

Throughput estimate:

```text
throughput ~= python_process_count / average_calculation_seconds
```

If natal averages 0.5 seconds, 4 processes provide roughly 8 calculations per
second and 100 jobs complete in about 12-15 seconds plus overhead. If natal
averages 2 seconds, 4 processes provide roughly 2 calculations per second and
100 jobs complete in about 50-70 seconds. This must be verified with local
benchmarks before production tuning.

## 15. Observability

Minimum metrics:

- chart job queue depth;
- queue wait time;
- calculation duration;
- success/failure counts by error code;
- retry count;
- timeout count;
- duplicate job reuse count;
- Python process count;
- provider version;
- p95/p99 calculation time.

Minimum logs:

- job id;
- owner id when needed for server audit logs;
- calculation id;
- job id to result calculation id linkage after success;
- method;
- provider version;
- error code;
- duration.

Logs must not include full birth input snapshots, client names, phone numbers,
CRM notes, raw provider payloads, or Python tracebacks in frontend-visible
responses.

## 16. Deployment Impact

The accepted deployable app list currently includes `apps/chart-worker` but not
`apps/chart-engine`. Implementation must therefore update or supersede the
relevant architecture/deployment docs and any ADR text that enumerates
deployables.

This is a prerequisite for implementation planning, not a cleanup task after
coding. `apps/chart-engine` adds a Python runtime, image, health/readiness
contract, dependency lock strategy, private service URL, and scaling knobs that
the current Node-oriented deploy matrix does not express.

Required deployment work:

- update or supersede ADR 0001 and repository/deployment architecture docs for
  the new deployable;
- add Python app workspace under `apps/chart-engine`;
- add Python dependency lock strategy;
- add Dockerfile for the chart engine;
- add production Compose service;
- add CI build/publish step for the Python image;
- wire private service URL from chart-worker to chart-engine;
- expose `/live` and `/ready` probes;
- document process concurrency environment variables;
- keep service private to backend network, not public internet.

## 17. Frontend Product Behavior

The production frontend follows `ElevenHouseDesign` for visual layout and
interaction language, with production state corrections:

- no browser fake calculation;
- no raw provider SVG;
- no fake success state;
- one calculating state for queued and processing;
- disabled or hidden non-implemented methods;
- settings controls only for supported backend settings;
- missing birth-data CTA for incomplete client records;
- approximate-time warning on successful chart;
- stale-result affordance during recalculation where applicable;
- wheel, planet table, aspect table, house table, and interpretation tab render
  from canonical saved data.

Visible implementation cannot be accepted without browser evidence against the
reference state and real network-backed production state.

## 18. Testing Strategy

### 18.1 Provider Spike

Before full implementation, run a bounded spike:

- minimal Python adapter with Kerykeion `5.12.x`;
- 10-20 natal fixtures;
- settings coverage for house systems, node type, aspects, orb multiplier;
- timezone and DST boundary checks;
- high-latitude behavior;
- result field coverage for canonical contract;
- p50/p95 duration benchmark;
- process-concurrency check;
- confirmation that Python `>=3.10` package metadata is the effective install
  constraint despite older prose in parts of the docs.

The spike either confirms the contract or forces a small contract adjustment
before production coding. It does not become a production fallback.

### 18.2 Golden Fixtures

Create trusted fixtures covering:

- Europe, United States, and Asia timezones;
- DST ambiguous and non-existent local times;
- high latitude;
- retrograde planet;
- exact and approximate birth time;
- at least the first-slice house systems.

Assertions compare normalized longitudes, signs, houses, and aspects within
explicit tolerances. They do not compare frontend pixels.

### 18.3 Backend Tests

Cover:

- missing birth data validation;
- owner-scoped client access;
- CSRF metadata on state-changing chart routes;
- idempotent completed result reuse;
- idempotent active job reuse;
- duplicate worker delivery;
- retryable failure then success;
- retryable failure to final failed;
- permanent failure without retry;
- recalculation invalidates dependent artifacts and publication state.

### 18.4 Python Tests

Cover:

- request validation;
- Kerykeion input construction in offline mode;
- Kerykeion output mapping to canonical result;
- provider error normalization;
- unsupported settings;
- no CRM/person data in provider request, response, or logs.

### 18.5 Contract Tests

Cover:

- shared input schema;
- shared output schema;
- Node validation of Python response before persistence;
- frontend consumption of renderable chart result only;
- separation between private input snapshot and future public/client-visible
  DTOs.

### 18.6 Frontend Tests And Browser Evidence

Cover:

- incomplete birth data state;
- calculating state for queued/processing;
- success state from saved canonical result;
- failed permanent state;
- retry state;
- stale recalculation state;
- no fake/browser-only chart calculation.

For visible scope, complete real browser verification:

- exact `ElevenHouseDesign` reference state;
- production route/state with authenticated astrologer;
- desktop and mobile viewports;
- network-backed loading/success/error states;
- console and network clean;
- visual parity for wheel, toolbar, settings, tables, tabs, and responsive
  presentation.

Implementation note, 2026-07-21: the first parity pass now covers Asc-oriented
wheel geometry, Asc/MC labels, degree ticks, zodiac/aspect visual tones,
right-panel tabs, distribution and warning rendering, RU labels for major and
minor aspects, and mobile toolbar stacking. The remaining acceptance work is
the full state matrix and production-like reload/retry/stale coverage.

Implementation note, 2026-07-21: the frontend state matrix now distinguishes
empty/no-client, incomplete or unknown birth time, approximate birth time,
calculating, failed retry, stale result after birth-data/settings changes,
current already-calculated result, recalculation, and reload from a persisted
`clientId` plus `calculationId` URL. The URL persists only identifiers and the
renderable saved result is reloaded through owner-scoped API routes; private
birth input remains inside the backend result payload.

## 19. Rollout Sequence

1. ADR/deployment/repository docs update for `apps/chart-engine` as a new
   private Python deployable.
2. Provider spike and benchmark.
3. Domain and contract definitions.
4. Birth-data readiness and timezone/DST validation hardening.
5. Database job table and idempotency operations.
6. Python chart-engine minimal `/v1/natal`.
7. Chart-worker execution and persistence.
8. Astrologer API endpoints with CSRF route metadata and outbox-only delivery.
9. Frontend integration for natal only.
10. Browser/design parity verification.
11. Production configuration.
12. Follow-on plans for solar return, transits, synastry/composite, and then
    AstroCalendar.

## 20. Open Implementation Notes

- The implementation plan must choose exact schema names and indexes after
  reading current Drizzle schema conventions.
- The provider spike must confirm exact Kerykeion identifiers for house
  systems, nodes, aspects, and optional Chiron support.
- The implementation plan must rename the job result link to
  `result_calculation_id` or equivalent nullable field and must not create
  placeholder `calculation_records`.
- DST ambiguous stored birth times need an explicit data representation because
  the current birth-data model cannot distinguish the two local occurrences.
- High-latitude behavior must become either a warning with Whole Sign
  recommendation or a permanent validation branch depending on provider output.
- Deployment docs must reconcile `apps/chart-engine` with accepted deployable
  boundaries.
- State-changing chart routes must use the existing `astrologer-api` CSRF
  route metadata.
- Outbox relay ownership must be explicit in the implementation plan; controller
  code cannot publish directly to BullMQ.
- Private input snapshots must stay separate from renderable chart results and
  future public/client-visible DTOs.
- The first implementation plan should not include AstroCalendar work, but it
  should keep the canonical contract suitable for future transits and returns.

## 21. Definition Of Done

- Spec is approved and converted into an implementation plan.
- ADR/deployment documentation accounts for `apps/chart-engine` before coding
  the deployable.
- `natal` result can be requested, processed, persisted, and read back through
  production backend paths.
- Kerykeion is isolated behind Python chart-engine and provider adapter.
- Worker execution is idempotent and retry-safe.
- State-changing chart routes use CSRF metadata and outbox-only queue delivery.
- Frontend has no fake chart calculation and no visible queue wording.
- Canonical chart result is validated before persistence and before frontend
  rendering.
- Private input snapshot is not exposed as a reusable public/client-visible
  result shape.
- Incomplete birth data produces typed, actionable states.
- Birth timezone and DST ambiguity are validated strongly enough for chart
  calculation readiness.
- Targeted tests and real browser/design verification provide evidence for the
  entire touched surface.

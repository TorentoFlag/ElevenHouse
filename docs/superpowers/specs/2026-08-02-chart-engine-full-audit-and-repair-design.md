# ElevenHouse Chart Engine Full Audit and Repair Design

**Status:** product, scope, architecture, frontend and rollout direction approved
in discussion on 2026-08-02; this written version awaits user review before an
implementation ExecPlan is created.

**Scope owner:** the complete astrologer Chart Engine contour across
`astrologer-web`, `astrologer-api`, `chart-worker`, the private Python
`chart-engine`, shared contracts/domain/client packages, PostgreSQL adapters,
production reconciliation and the chart-owned AI, Dictionary, PDF and saved
calculation integrations.

**Research accessed:** 2026-08-02.

## 1. Outcome

ElevenHouse must provide a deterministic, fail-closed and operable chart engine
for every currently implemented chart mode:

1. natal;
2. child chart, backed by the natal calculation method but with its own product
   capabilities;
3. transit;
4. synastry;
5. composite;
6. solar return;
7. secondary progression;
8. horary;
9. astrocartography.

Completion means more than obtaining a provider response. Each mode must retain
the correct client identity and calculation participants, survive worker retry
and browser reload, persist reproducible method/version metadata, render all
approved states in Russian and English, and remain correct under duplicate
delivery and concurrent execution.

No production fallback, fake success, silently substituted coordinate, guessed
provider response or browser-only business state may make a failed or
unsupported calculation appear successful. Essential acceptance claims must be
proved with the real provider, PostgreSQL, Redis, HTTP pipeline and browser;
mock-only evidence is insufficient.

## 2. Sources of truth and current evidence

The implementation must preserve the repository truth hierarchy:

- current product instructions and `docs/product/` define product behavior;
- `docs/architecture/`, `docs/api/`, ADRs and current code define architecture;
- the exact mapped state in `ElevenHouseDesign/` defines visible behavior;
- code, schema, tests, logs, network and fresh browser evidence prove current
  implementation;
- this document and the later ExecPlan are execution artifacts, not replacements
  for current code evidence.

The initial audit was read-only and covered the Python provider adapter,
contracts, HTTP client, API, outbox, worker, PostgreSQL adapters, calculation
lifecycle, frontend controller/view, exact visual reference and a read-only
production browser smoke.

Baseline evidence captured before repair:

- repository unit run: 606 files and 3,076 tests passed;
- targeted local PostgreSQL integration: 4 files and 16 tests passed;
- Python chart-engine suite: 18 tests passed;
- focused frontend chart/client/calculation suite: 177 tests passed;
- astrologer-web build passed, but its package typecheck failed on a stale
  `nominatim` fixture after the shared Geoapify contract change;
- adversarial probes reproduced invalid input acceptance, DST failures,
  progression discontinuity, provider metadata drift and output-invariant gaps;
- fresh production desktop natal and 48 Dictionary entries rendered read-only,
  but the production mobile state differed materially from the exact reference;
- the shared checkout was `main`, ahead of and behind `origin/main`, with a clean
  index and unrelated/unowned dirty work. All delivery must preserve that work.

Green legacy tests do not waive the defects below. New tests must assert the
observable invariants that were previously absent.

## 3. Approved scope

### 3.1 In scope

- All nine modes and every input/output contract they share.
- Client birth date, local time, precision, DST occurrence, place, IANA timezone
  and coordinates used by chart calculation.
- Kerykeion/PySwissEph integration, provider versioning, ephemeris provenance,
  concurrency and readiness.
- Chart-engine HTTP timeout, cancellation, validation and error classification.
- API authorization, hydration, idempotency, recalculation and result reads.
- Transactional outbox, BullMQ delivery, leases, fencing, retry limits and
  completion/failure races.
- Calculation records, participants, archival, AI interpretations,
  publication, PDF/artifact lifecycle and saved-calculation linking.
- Production baseline reconciliation for chart schema and constraints.
- Frontend selection, draft, job, result, Dictionary, AI, PDF and linking states.
- Browser reload and URL recovery for every mode.
- Exact desktop/mobile design parity, accessibility and RU/EN copy.
- Astrocartography's geographical base presentation and accessible line data.
- Chart-owned metrics, logs, readiness, smoke cleanup and production evidence.

### 3.2 Conditionally in scope

An adjacent module is changed only when it is the root cause or a required
production prerequisite for the approved chart behavior. Examples include the
shared client birth-data use case, generic calculation replacement, private
object storage cleanup or production deployment reconciliation.

### 3.3 Intentionally outside this delivery

- New astrology methods or interpretation products not already approved.
- Unrelated AstroCalendar, messaging, finance, funnels or generic CRM feature
  work.
- Public astrologer discovery, recommendations or cross-promotion.
- A provider replacement or broad microservice rewrite without evidence that a
  bounded repair cannot satisfy the approved invariants.

## 4. Canonical calculation contract

### 4.1 Strict input validation

The shared TypeScript contracts and Python request models must agree and reject:

- unknown fields;
- impossible calendar dates;
- times outside `00:00` through `23:59`;
- non-IANA or unavailable timezone identifiers;
- non-finite or out-of-range coordinates;
- unsupported enum values, house systems, node modes and aspect presets;
- mode-specific dates or years that precede the subject's birth when the method
  has no defined pre-birth meaning;
- relationship requests whose two authoritative client IDs are missing,
  identical or not related to the astrologer as required by the product rule.

The API hydrates sensitive birth inputs from owner-scoped server data. The
browser supplies IDs and approved calculation settings, not authoritative
birth snapshots.

### 4.2 Civil time and DST

Birth date, birth time and IANA timezone identify a local civil time, not an
instant by themselves.

- A normal local time resolves to its single instant.
- A fall-back fold resolves to two instants and requires `dstOccurrence`:
  `first` maps to the daylight occurrence and `second` to the standard-time
  occurrence.
- A spring-forward gap resolves to no instant and is rejected with a typed,
  localized validation error.
- Changing date, time, place, coordinates or timezone clears a stored
  occurrence until the new civil time has been resolved.
- The Python adapter maps the approved occurrence to Kerykeion `is_dst`.

The same resolution policy must be shared by chart readiness and client
birth-data mutation so an invalid snapshot cannot be saved as calculation-ready.

### 4.3 Coordinates and house systems

The stored and returned coordinate must always be the coordinate used for the
calculation. Kerykeion's current silent clamp of high latitudes to `+/-66`
cannot be exposed as a successful Placidus calculation using the original
latitude.

For a coordinate where the approved house system is not supported, the request
fails with `unsupported_latitude_for_house_system`. ElevenHouse does not silently
change latitude, substitute Whole Sign, remove houses or return a partial chart.
A future user-selectable house-system policy requires a separate product
decision and method version.

Longitude or latitude equal to zero is valid and must never be treated as
missing.

### 4.4 Method-specific correctness

#### Natal and child

The canonical natal result contains the required points, all twelve houses,
normalized aspects, distributions and warnings. Child mode may reuse natal
mathematics, but its capability set remains distinct: adult natal AI is not
available unless a separately approved child interpretation workflow exists.

#### Transit

The event instant, location policy and relationship between natal and transit
points are explicit in the snapshot and method version. A transit response
cannot be accepted if an aspect references a point absent from the relevant
chart layer.

#### Synastry and composite

Both calculations are relationship calculations with two authoritative,
ordered participants. Synastry preserves two subject layers. Composite output
must preserve the input participants even though the provider returns a derived
single chart.

#### Solar return

The requested return year cannot precede birth. The root search must prove that
the returned solar longitude is within the declared tolerance of the natal
Sun. Valid zero coordinates are supported.

#### Secondary progression

The method is versioned as a continuous day-for-a-year secondary progression.
The symbolic provider instant advances by the exact elapsed fraction of a year,
not by completed integer birthdays. Different target dates within the same
year must generally produce different fast-point positions. A target before
birth is rejected rather than coerced to natal.

The chosen year length, time basis and progressed-angle/house convention must be
named in the method version, documented and locked by numeric fixtures.

#### Horary

The question instant and location are authoritative event data. A horary result
must not inherit an unrelated client's natal instant through frontend recovery
or stale URL state.

#### Astrocartography

Provider line paths remain numerical chart output. The frontend renders them
over a real, licensed geographical boundary dataset and projection, not
decorative ellipse placeholders. A keyboard-readable line list conveys the
same labels and line meanings as the visual map.

### 4.5 Canonical output invariants

Parsing a syntactically valid JSON object is not sufficient. Shared validation
must reject at least:

- duplicate point IDs or duplicate houses;
- missing required natal points or house numbers;
- self-aspects;
- duplicate normalized aspect pairs;
- aspects referencing unknown points;
- invalid degrees, longitudes, strengths or distribution totals;
- method/layer combinations that do not match the requested calculation;
- metadata claiming a provider or ephemeris backend different from the one
  actually used.

Provider errors and validation errors are typed and observable. The worker may
retry only failures classified as transient.

## 5. Provider runtime and reproducibility

Kerykeion and PySwissEph versions are pinned exactly in a reproducible build.
The calculation fingerprint and persisted metadata include:

- ElevenHouse method version;
- Kerykeion version;
- PySwissEph/Swiss Ephemeris version;
- the actual ephemeris backend/flags;
- house system, zodiac, node mode, aspect preset and orb multiplier;
- any provider data-file revision that can change numerical output.

If the approved deployment requires Swiss Ephemeris data files, the image must
contain and resolve those files and readiness must verify the expected backend.
If the runtime uses Moshier, the result must identify Moshier truthfully and use
a distinct fingerprint. It may not be labelled `swiss-ephemeris` by a constant.
Licensing and redistribution must follow the already approved closed-SaaS
provider decision; deployment fails closed if the required licensed runtime is
not provisioned. The delivery records evidence of the applicable Kerykeion/
Swiss Ephemeris commercial entitlement and any ephemeris-data redistribution
right before packaging those assets. Missing or ambiguous license authority is
a deployment blocker, not permission to fall back to a different runtime.

Kerykeion/Swiss Ephemeris is treated as process-isolated, non-thread-safe work:

- only one provider calculation executes at a time inside a process;
- multiple Uvicorn processes or service replicas provide bounded throughput;
- sync FastAPI thread-pool execution cannot bypass the per-process guard;
- stress tests mix all methods and require stable hashes and no cross-request
  contamination;
- graceful shutdown stops accepting work and lets an in-flight bounded
  calculation finish or be cancelled by policy.

`/live` proves the process is alive. `/ready` performs a cached, bounded
provider sentinel calculation and verifies pinned versions/backend. It returns
not-ready for missing ephemeris data, version drift or failed computation.

## 6. HTTP client and failure taxonomy

Every provider request, including readiness, has an explicit timeout and
`AbortSignal`. The client preserves a bounded response body for diagnostics
without logging sensitive input.

Failures are classified as:

- **permanent input:** provider 4xx caused by the calculation input;
- **permanent contract:** invalid JSON or a response that violates canonical
  invariants;
- **transient provider:** timeout, connection failure or eligible 5xx;
- **configuration:** version/backend/readiness mismatch;
- **cancelled:** worker shutdown or lost lease.

Permanent and configuration failures are not repeatedly retried. Transient
failures follow one bounded retry policy with observable attempt counters. The
DB and BullMQ cannot disagree about the maximum number of attempts.

## 7. Durable jobs, idempotency and fencing

The chart job aggregate owns a durable execution lease:

- `lockedBy` identifies the worker execution;
- a unique fencing token/lease generation distinguishes consecutive claims;
- `lockedUntil` expires the claim;
- heartbeat extends a live claim for calculations that can exceed the initial
  lease;
- attempt count and `maxAttempts` have one source of truth;
- completion and failure use compare-and-set predicates on job ID, processing
  status and fencing token.

A late failure cannot overwrite success. A late completion cannot resurrect a
terminal failure or overwrite a result produced by a newer lease. Duplicate
outbox/BullMQ delivery either joins the authoritative active job or becomes a
no-op after verifying terminal state.

Started and completed timestamps are captured at their actual transitions, so
duration metrics cannot be zero merely because one timestamp was reused.

Succeeded-job reuse joins the active calculation record. Archived, replaced or
otherwise inactive results are not reused or returned as current.

## 8. Calculation lifecycle and related artifacts

### 8.1 Initial calculation

Job creation, calculation fingerprint and identifier-only outbox publication
remain atomic. A completed job persists the canonical result, checksum,
participants and method metadata in one transaction before exposing success.

### 8.2 Recalculation

`recalculate(calculationId)` targets the owner-scoped existing calculation; it
does not silently call generic natal creation.

The replacement job carries the target calculation ID and expected source
checksum. Successful completion atomically:

- replaces the result/checksum/method metadata on the intended calculation;
- preserves its stable identity and authorized participants where appropriate;
- invalidates stale AI interpretations;
- resets publication state;
- invalidates PDF/artifact metadata;
- emits explicit cleanup work for private objects after the transaction.

A concurrent mutation or checksum mismatch fails safely. External AI or PDF
work is never paid for before archived/current-state authorization is verified.

### 8.3 Participants and linking

Individual modes persist one subject participant. Synastry and composite
persist two ordered participants and relationship mode. Linking and publication
derive targets only from authoritative persisted participants. The currently
selected browser client is never a fallback authorization source.

### 8.4 Security, privacy and consent

All reads remain owner-scoped. Every chart mutation, recalculation, AI, PDF,
publication and link command remains protected by session authorization and
CSRF where applicable. Pair-mode hydration verifies both client relationships;
a request body or URL cannot expand the astrologer's client scope.

Provider and worker logs contain identifiers and safe error codes, never raw
birth date/time, coordinates, CRM notes, prompts or canonical chart payloads.
Private input snapshots and PDFs remain in owner-authorized storage; download
URLs are short-lived and checksum-bound.

External AI receives only the minimum approved chart context and no raw birth
input. Before an external generation call, the use case verifies the current
calculation state and the consent record required by product/data policy. A
missing, revoked or stale consent fails before cost is incurred. Generation,
save, approval and publication remain separate audited transitions.

## 9. Production schema reconciliation

The production baseline reconciler is idempotent and transactionally verifies
constraint definitions, not just column/index presence. The chart method check
contains all currently supported persisted methods, including horary and
astrocartography.

Tests begin from an approved legacy definition, run reconciliation, inspect
`pg_get_constraintdef`, rerun for idempotence and prove that all methods can be
inserted while unknown methods are rejected.

No production reset is used. Any schema change follows the repository's
baseline migration and local reset procedure, while production deploy uses the
fail-closed reconciler/migrator path.

## 10. Frontend state and identity model

### 10.1 Birth-data editor

The editor draft is keyed by client ID and reinitialized when the subject
changes. It cannot save client A's draft into client B. Civil-time changes clear
stale DST occurrence, and ambiguous/nonexistent states are explained before a
calculation can be submitted.

### 10.2 URL and job recovery

The URL encodes the active mode and the minimum non-sensitive state needed to
recover it. An active `jobId` survives reload and resumes polling. Mode-specific
settings such as partner ID, event date/year or approved location reference are
restored for every mode without embedding sensitive birth snapshots.

A terminal `calculationId` is rendered only after owner and participant checks.
Mismatched client/calculation URLs produce a typed state and safe navigation,
not a misleading mixed identity.

### 10.3 Independent state machines

The page separates:

- client selection and birth readiness;
- calculation draft and preflight;
- job submission/polling;
- result loading and rendering;
- Dictionary loading;
- AI generation/save/approval;
- PDF status/generation/download;
- saved-calculation linking.

Each contour has its own loading, success, empty, validation, error, disabled
and retry state. A PDF or link failure cannot become `calculation_failed`, and a
polling failure cannot leave the page permanently claiming that calculation is
still progressing.

### 10.4 Product capabilities

Capabilities are derived from the active product mode plus authoritative result
metadata. Child mode cannot invoke adult natal AI simply because its provider
method is `natal`. Approximate-time warnings cover both relationship
participants and name which participant lowers confidence.

## 11. Visual parity, accessibility and localization

The exact mapped `ElevenHouseDesign` route/state remains visual truth. Before
visible changes, the team captures fresh reference and production screenshots
and computed metrics at approved desktop and mobile viewports.

The mobile contract includes:

- drawer navigation instead of a permanent 72-pixel sidebar;
- the primary wheel/result before the optional summary rail;
- compact action presentation without stacked full-width toolbar rows;
- no horizontal document overflow;
- reference spacing, typography, color, border, radius, shadow and icon
  treatment.

Keyboard and accessibility acceptance includes:

- predictable focus entry, menu navigation and return;
- semantic current/pressed state for mode controls;
- meaningful accessible names, including presentation/PDF actions;
- disabled explanations available without relying on `title` alone;
- visible focus styles and at least 44-pixel mobile interaction targets where
  the control is user-operated;
- the astrocartography line list as a non-visual equivalent of map interaction.

All chart-owned labels, validation messages, statuses, errors, disabled reasons
and retries ship in Russian and English. Dictionary and PDF locale alone do not
satisfy the product invariant.

The existing oversized page/controller/styles are decomposed only along stable
feature boundaries needed by the repair. Page composition remains app-owned;
derived state belongs in `features/charts/model`; reusable visual primitives
move to the design system only when already stable across products. Route and
heavy chart views may be code-split after bundle measurement, without hiding a
loading failure behind a blank screen.

## 12. Testing and evidence design

### 12.1 Red-to-green order

Every confirmed defect starts with an observable failing test or bounded
reproduction. The minimum red matrix includes:

1. invalid date/time/timezone/unknown fields and invalid output references;
2. DST first, second and nonexistent local times;
3. polar unsupported behavior and valid zero coordinates;
4. continuous progression dates and pre-birth rejection;
5. solar return pre-birth rejection and return tolerance;
6. provider version/backend metadata and readiness drift;
7. timeout, abort and permanent/transient classification;
8. concurrent provider determinism;
9. parallel job claims, lease expiry, fencing and late failure-after-success;
10. one-source retry limit and truthful duration;
11. same-ID recalculation replacement and artifact invalidation;
12. archived result non-reuse;
13. relationship mode and two participants;
14. legacy production constraint reconciliation;
15. editor subject switch and DST reset/selection;
16. independent frontend error/retry states;
17. mid-flight reload for every mode;
18. mismatched client/calculation/link identity;
19. child AI prohibition and pair approximate-time warnings;
20. RU/EN state matrix, mobile parity and keyboard behavior;
21. smoke cleanup after both success and intermediate failure.

### 12.2 Numerical fixtures

Fixtures cover both hemispheres, multiple IANA zones, DST fold/gap, ordinary
dates, zero meridian/equator, supported latitude boundaries, multiple dates
inside one progressed year and return years. Expected values are derived from
the pinned provider plus direct Swiss Ephemeris/provider primitives where
possible, recorded with tolerances and provenance. Snapshots alone cannot bless
an unexplained numerical change.

### 12.3 Verification layers

Verification proceeds in this order:

1. targeted unit and contract tests;
2. Python real-provider suite;
3. package typecheck/build/lint;
4. PostgreSQL and Redis integration tests;
5. provider concurrency and worker race tests;
6. affected application/package surface;
7. local network-backed engine -> worker -> API -> web E2E;
8. browser state matrix and visual comparison;
9. repository gate;
10. post-deployment production acceptance.

Passing an earlier layer does not waive a later required layer.

## 13. Test-data safety

Before any mutation, the command resolves the actual database host/port and
proves whether it is the local ElevenHouse database or production. Production
reset is forbidden.

Test records use a unique run namespace. Setup and cleanup are designed
together, with cleanup in `finally` and before/after residue queries for users,
sessions, relationships, birth data, jobs, calculations, interpretations,
publications, PDFs and object-storage keys.

Production acceptance uses isolated test astrologer/client records and never
publishes or links test output to a real client. AI, PDF and linking are tested
only within that namespace. Cleanup failure is an explicit blocker, not a
silently ignored warning.

## 14. Observability and operations

Structured logs and metrics must allow an operator to distinguish input errors,
provider contract drift, timeouts, retries, lease loss, duplicate delivery and
storage cleanup failure without logging sensitive birth data.

At minimum, the contour exposes or records:

- queue depth and oldest-job age;
- calculation count and duration by method/result;
- retry and terminal failure count by safe error code;
- job reuse versus fresh calculation;
- lease expiry/fencing rejection;
- provider version/backend readiness;
- recalculation replacement and artifact cleanup outcomes.

Alerts and runbook evidence must identify the owning service and safe recovery
step. A static `/ready` response is not accepted as provider readiness.

## 15. Delivery, Git and production rollout

Three coordinated workstreams own non-overlapping paths where practical:

1. engine, contracts and numerical correctness;
2. API, worker, database, concurrency and reconciliation;
3. frontend, product states, design parity, accessibility and localization.

The primary agent integrates every workstream, reviews cross-layer contracts
and reruns evidence; a subagent report alone cannot complete a claim.

The shared-main rules remain mandatory:

- work in the existing checkout on `main`;
- reread target files and path-scoped diffs before each edit group;
- preserve unowned dirty and staged work;
- stage exact owned paths only;
- never create a combined commit containing another agent's changes;
- synchronize with `origin/main` without worktree, stash or rebase;
- stop only for an irreconcilable semantic conflict and name exact paths.

Logical commits follow fresh targeted verification. Before push, the cached
diff, affected surface and repository gate are rerun. Push is not deployment
evidence: the team observes the actual deployment revision, health, readiness
and logs.

Production acceptance then runs every mode plus chart-owned AI, PDF and linking
on isolated test data, at Russian/English and desktop/mobile surfaces as
applicable. Console and network must be clean except documented expected
responses. A discovered defect restarts the cycle:

```text
reproduce -> red test -> fix -> targeted verification -> affected gate
          -> commit -> push -> deployed revision -> production retest
```

Test data is removed and residue is queried before completion.

## 16. Definition of done

The full requested scope is complete only when:

- every confirmed defect is either repaired with evidence or identified as an
  external blocker with exact proof;
- no approved path depends on a production mock, silent fallback or fake
  success;
- all nine modes pass strict, numerical, integration and network-backed tests;
- job and calculation lifecycles are fenced, idempotent and artifact-safe;
- frontend identity, recovery and independent state behavior pass in RU/EN;
- fresh desktop/mobile browser comparison meets the exact reference or records
  an approved accessibility/product deviation;
- the shared-main Git history contains only intended owned changes;
- the pushed revision is observed in production and passes production smoke;
- local and production test data cleanup is proven;
- the final report separates implemented, verified, partial, deferred, blocked,
  skipped, residual risk and observed unowned changes.

The words "ready", "fixed", "works" or "production-ready" are not used before
all applicable evidence above exists.

## 17. Primary research sources

Accessed 2026-08-02:

- [Kerykeion troubleshooting and FAQ](https://kerykeion.net/content/docs/faq) —
  DST ambiguity/gap behavior and the provider's thread-safety warning.
- [Kerykeion Astrological Subject Factory](https://kerykeion.net/python-library/docs/v5/astrological_subject_factory) —
  `is_dst`, coordinates, timezone and house-system parameters.
- [Kerykeion repository](https://github.com/g-battaglia/kerykeion) — provider
  workflow, supported chart types and current implementation reference.
- [Swiss Ephemeris official repository](https://github.com/aloistr/swisseph) —
  ephemeris data-file resolution and official runtime source.
- [Astrodienst secondary progression reference](https://www.astro.com/astrowiki/en/Secondary_Progression) —
  day-for-a-year method and continuous timing implications.
- [Astrodienst chart types](https://www.astro.com/cgi/h.cgi?f=gch&h=gch52&lang=e) —
  progressed chart conventions and angle/house method distinctions.
- [BullMQ stalled jobs](https://docs.bullmq.io/guide/workers/stalled-jobs) —
  duplicate/stalled delivery behavior.
- [BullMQ timeout pattern](https://docs.bullmq.io/patterns/timeout-jobs) — bounded
  timeout and cancellation pattern.
- [FastAPI async concurrency guidance](https://fastapi.tiangolo.com/async/) —
  execution behavior of synchronous path operations.

## 18. Approved design decisions

The user approved the following in discussion on 2026-08-02:

- full vertical repair rather than module-only patches, temporary mode disablement
  or a speculative provider rewrite;
- all nine modes and adjacent root-cause prerequisites are in scope;
- strict civil-time/DST behavior and fail-closed unsupported polar houses;
- versioned, process-safe and reproducible provider execution;
- durable job lease/fencing and atomic recalculation replacement;
- authoritative relationship participants and archived-result rules;
- independent frontend state machines, URL/job recovery and client identity;
- explicit child-mode AI capability, RU/EN, mobile parity and accessibility;
- a real astrocartography base map;
- red-to-green real-provider/DB/network/browser evidence;
- exact-path shared-main commits, push, observed deployment, production smoke and
  cleanup of isolated test data.

# API Boundaries

## Public API

`public-api` обслуживает высоконагруженные client-facing flows. В текущем коде
реализованы health, identity/passwordless/session, direct-link client join,
related-astrologer read, cabinet overview, client birth-profile routes and the
relationship-scoped purchase-option and slot reads, booking/order/payment
commands, client checkout-state reads and owner-scoped dispute-candidate
submission/read for paid orders. Full public profile read model, materials,
feed, one-time client paid-access periods, journal and client-visible
calculation delivery remain incomplete contours on this surface.

Ответственности:

- Данные публичной страницы астролога.
- Entry points для lead magnets.
- Booking intents и slot selection.
- Client quick registration/login во время booking.
- Order creation для клиентских покупок.
- Checkout/payment initiation.
- Client cabinet: orders, bookings, materials, subscriptions.
- Client-linked astrologers for cabinet context, limited to existing explicit
  relationships. This must not become astrologer discovery, recommendation,
  search or catalog API.

Ниже — current operational route index, а не полная schema reference: request/
response fields, error codes and versioning остаются shared contracts и
контроллерными contract tests. Список фиксирует реализованные HTTP surfaces;
не добавляй в него будущие product routes как будто они уже существуют.

Public routes:

```text
POST /identity/passwordless/request-code
POST /identity/passwordless/verify-code
POST /identity/registration/passwordless/verify-code
GET  /identity/me
POST /identity/logout
POST /client-join-intents
GET  /me/astrologers
GET  /me/overview
GET  /me/birth-places
GET  /me/birth-data
PUT  /me/birth-data
GET  /a/:handle
POST /booking/intent
POST /booking/:intentId/select-slot
GET  /me/astrologers/:astrologerUserId/purchase-options
GET  /me/astrologers/:astrologerUserId/available-slots?productId=<uuid>&start=<instant>&end=<instant>
POST /orders
GET  /orders/:orderId
POST /payments/checkout
GET  /payments/checkout-preparations/:checkoutPreparationId
GET  /payments/checkout-preparations/:checkoutPreparationId/action
GET  /me/orders
GET  /me/bookings
GET  /sessions?rangeStartAt=<instant>&rangeEndAt=<instant>
GET  /sessions/:sessionId
POST /sessions/:sessionId/join
GET  /sessions/:sessionId/messages
POST /sessions/:sessionId/messages
GET  /sessions/:sessionId/events
POST /client/orders/:orderId/disputes
GET  /client/orders/:orderId/disputes
```

Passwordless login verification is login-only. If the verified identifier is not linked
to an existing account, `public-api` returns the same generic invalid-code response.
Registration is explicit and uses `POST /identity/registration/passwordless/verify-code`
after a code has been requested. Public registration is client-only and accepts only
`roles: ["client"]`; astrologer role assignment belongs to an explicit
astrologer onboarding or authorized internal workflow, not caller-controlled
public registration.

`public-api` reads request IPs from the framework-resolved `request.ip`. Deployments
behind a trusted reverse proxy must enable the explicit `PUBLIC_API_TRUST_PROXY`
runtime setting so Express resolves proxy headers; controllers must not parse
`X-Forwarded-For` directly.

`POST /client-join-intents` resolves an active visible astrologer by exact
public handle and returns a short-lived opaque join token plus the safe public
identity required by the entry screen. The frontend may store that response as
same-session pending context so the auth screen can show which astrologer will
be linked. Passwordless login/registration may consume the token to create or
reactivate the explicit client-astrologer relationship, after which pending
context must be cleared. `GET /me/astrologers` lists only active explicit
relationships; it cannot search, recommend or enumerate unrelated astrologers.

`GET /me/astrologers/:astrologerUserId/purchase-options` and its
`available-slots` child route are client-role, owner-scoped reads. They first
require an active explicit client-astrologer relationship, and reveal only
positive-price one-time or pack products that the astrologer's active tariff,
capabilities and finance policy currently permit. They are not a catalogue or
subscription purchase surface. A live product also requires a server-created
booking hold before `POST /orders` accepts the purchase command.

`GET /orders/:orderId` is owner-scoped for the client that created the order.
`GET /payments/checkout-preparations/:checkoutPreparationId` returns only the
authoritative preparation state. It never reveals a provider URL or provider
payload. The separate `/action` route is the only redirect boundary: after the
worker has sealed a ready checkout artifact it responds with a no-store 303 to
the provider; before then it does not redirect.

`GET /me/overview` is client-role and owner scoped. It returns only explicit
client-astrologer relationships, saved birth profiles and current cabinet
summary counters. The `directLinkOnly: true` summary flag is an invariant, not a
feature toggle; this API must not search, recommend or enumerate astrologers.

`GET /me/birth-places` is client-role and owner scoped. It accepts the strict
shared birth-place query contract and returns only canonical Geoapify candidates
with coordinates and an IANA timezone. The server keeps the quota-bearing
provider key private and applies shared Redis cache, single-flight and
per-owner/global sliding-window limits. Provider, credential, contract or Redis
failures are explicit `4xx`/`5xx` responses; this route has no browser-side or
alternate-provider fallback. Selecting a candidate and persisting a birth
profile remain separate operations.

`GET/PUT /me/birth-data` is client-role and owner scoped. It reads and updates
the client's only reusable birth profile. `PUT` requires CSRF and an explicit
`expectedRevision`; it applies compare-and-swap and returns `409` on a stale
revision. There is no profile selection, sharing grant, consent endpoint or
per-booking birth-data access API in this contour. An astrologer write is
permitted only through the owner-scoped CRM route and an active server-side
client-astrologer relationship.

Client Session routes require the `client` role and exact participant ownership.
`join` returns a short-lived room-scoped credential, never a provider secret or
room administration authority. Text chat is persisted by ElevenHouse and replayed
over HTTP; LiveKit data messages are not its source of truth. Slice A has no
recording, egress, transcription or AI summary surface.

## Astrologer API

`astrologer-api` обслуживает authenticated workflows астрологов. В текущем коде
реализованы health, identity/passwordless/session, dictionary, dictionary AI
draft, products, media uploads, profile/settings billing overview, verification
application submission, CRM clients, availability, calendar/manual booking,
finance overview/manual payout requests, calculations, chart calculations and
PDF export, canonical Pythagorean numerology, canonical Ladini 22 Matrix
calculations with private notes and a versioned interpretation catalog, Human
Design individual/compatibility/transit/AI/PDF contours, provider-neutral
Messaging commands/webhook/SSE freshness and provider-neutral AI generation
through OpenAI, and the Flows templates/draft CRUD/immutable publish,
owner-scoped definition validation, durable enrollment/activation, manual-client
run admission, approval decisions, operational work-item and runtime reads.
Runtime admission remains fail-closed until the current owner, rollout policy
and matching live executor lease are all proven.
Messaging architecture is recorded in
`docs/decisions/0010-messaging-channel-architecture.md`.

Ответственности:

- Profile и onboarding.
- Products.
- Availability.
- Bookings.
- Clients.
- Messaging commands, provider webhook ingestion and realtime freshness.
- Sessions и materials.
- Wallet/finance views.
- Flows templates, draft CRUD, owner-scoped definition validation, immutable
  publish, durable enrollment/activation, manual-client run admission,
  approval/work-item commands and operational runtime projections.
- Analytics.
- Verification submission and current verification status for the signed-in
  astrologer.

Примеры routes:

```text
POST /identity/astrologer/passwordless/request-code
POST /identity/astrologer/passwordless/verify-code
GET  /identity/me
POST /identity/logout
GET  /products
GET  /products/summary
GET  /products/templates?locale=ru|en
GET  /products/:productId
POST /products
POST /products/templates/:templateCode/drafts
PUT  /products/:productId
POST /products/:productId/publish
POST /products/:productId/move-to-draft
POST /products/:productId/archive
POST /products/:productId/duplicate
GET  /availability/schedules/default
PUT  /availability/schedules/default
GET  /calendar/range?start=<instant>&end=<instant>&timeZone=<iana>
POST /calendar/blocks
DELETE /calendar/blocks/:blockId
POST /bookings/manual
GET  /bookings/available-slots?productId=<uuid>&start=<instant>&end=<instant>
GET  /bookings/:bookingId
GET  /sessions?rangeStartAt=<instant>&rangeEndAt=<instant>
GET  /sessions/:sessionId
POST /sessions/:sessionId/join
GET  /sessions/:sessionId/messages
POST /sessions/:sessionId/messages
GET  /sessions/:sessionId/events
POST /sessions/:sessionId/end
POST /session-provider/livekit/webhook
GET  /media/assets/:mediaId
POST /media/upload-intents
POST /media/assets/:mediaId/complete
GET  /dictionary/categories
GET  /dictionary/entries
POST /dictionary/custom-entries
PUT  /dictionary/custom-entries/:entryId
PUT  /dictionary/platform-entries/:platformEntryId/override
DELETE /dictionary/entries/:entryId
DELETE /dictionary/entries
DELETE /dictionary/platform-entries/:platformEntryId/override
POST /dictionary/ai-draft
GET  /astrologer-profile/me
PUT  /astrologer-profile/me
GET  /tariffs
POST /tariffs/subscriptions
GET  /tariffs/subscriptions/:subscriptionId/saved-card-disclosure
POST /tariffs/subscriptions/:subscriptionId/saved-card-setup
GET  /tariffs/subscriptions/:subscriptionId/saved-card-setup
POST /tariffs/saved-card-setups/:setupSessionId/execute
POST /tariffs/saved-card-setups/:setupSessionId/complete-3ds-method
GET  /tariffs/saved-card-setups/:setupSessionId
GET  /tariffs/invoices/:invoiceId/payment-status
GET  /tariffs/subscriptions/:subscriptionId/payment-status
POST /tariffs/invoices/:invoiceId/complete-3ds-method
GET  /verification/me
POST /verification/applications
GET  /calculations?module=numerology&status=all
GET  /calculations?module=matrix&status=all
GET  /calculations/:calculationId
POST /numerology/preview
POST /numerology/calculations
POST /numerology/calculations/:calculationId/recalculate
POST /numerology/calculations/:calculationId/ai-draft
GET  /numerology/calculations/:calculationId/report/pdf?locale=ru|en
POST /numerology/calculations/:calculationId/report/pdf
GET  /numerology/calculations/:calculationId/report/pdf/:jobId/download
POST /matrix/preview
POST /matrix/calculations
POST /matrix/calculations/:calculationId/recalculate
GET  /matrix/calculations/:calculationId/projection?year=2026
GET  /matrix/calculations/:calculationId/notes
POST /matrix/calculations/:calculationId/notes
PUT  /matrix/calculations/:calculationId/notes/:noteId
DELETE /matrix/calculations/:calculationId/notes/:noteId
GET  /matrix/interpretations?locale=ru&arcana=9&context=portrait
GET  /matrix/calculations/:calculationId/report/pdf
POST /matrix/calculations/:calculationId/report/pdf
GET  /matrix/calculations/:calculationId/report/pdf/:jobId/download
GET  /charts/calculations/:calculationId/report/pdf?locale=ru|en
POST /charts/calculations/:calculationId/report/pdf
GET  /charts/calculations/:calculationId/report/pdf/:jobId/download
POST /charts/calculations/:calculationId/ai-draft
POST /human-design/preview
POST /human-design/calculations
POST /human-design/calculations/:calculationId/recalculate
POST /human-design/calculations/:calculationId/ai-draft
GET  /human-design/calculations/:calculationId/transits?instant=...
GET  /human-design/calculations/:calculationId/report/pdf?locale=ru|en
POST /human-design/calculations/:calculationId/report/pdf
GET  /human-design/calculations/:calculationId/report/pdf/:jobId/download
POST /calculations/:calculationId/interpretations
POST /calculations/:calculationId/interpretations/:interpretationId/approve
POST /calculations/:calculationId/publish
POST /calculations/:calculationId/archive
GET  /messaging/channel-connections
POST /messaging/channel-connections/telegram/business/start
GET  /messaging/threads
GET  /messaging/threads/:threadId
GET  /messaging/messages/:messageId/media/source
POST /messaging/threads/:threadId/messages
POST /messaging/threads/:threadId/link-client
POST /messaging/threads/:threadId/create-client
POST /messaging/threads/:threadId/read
POST /messaging/webhooks/telegram/bot
GET  /messaging/events
```

Flows shipped endpoints:

```text
GET /flow-templates
GET /flows
POST /flows
GET /flows/:flowId
GET /flows/:flowId/enrollment
GET /flows/:flowId/activation-review
POST /flows/:flowId/validate
PATCH /flows/:flowId/draft
POST /flows/:flowId/publish
POST /flows/:flowId/next-draft
POST /flows/:flowId/activate
POST /flows/:flowId/pause-enrollment
POST /flows/:flowId/manual-runs
GET /flows/:flowId/runs
GET /flow-runs/:runId
POST /flow-runs/:runId/cancel
GET /flow-approvals
POST /flow-approvals/:approvalId/decision
GET /flow-work-items
POST /flow-work-items/:workItemId/start
POST /flow-work-items/:workItemId/snooze
POST /flow-work-items/:workItemId/complete
```

The internal, super-admin-only Flow runtime control surface is deliberately
separate from astrologer routes:

```text
GET /admin/flows/runtime-control
PUT /admin/flows/runtime-control
```

`GET` returns the verified immutable current rollout policy. `PUT` requires an
admin session with `super_admin`, CSRF and `Idempotency-Key`; it performs a
compare-and-swap replacement using `expectedRevision`, persists a new immutable
policy revision with the operator reason and actor subject, and returns a typed
`409 FLOW_RUNTIME_CONTROL_REVISION_CONFLICT` if another operator already
advanced the policy. It does not start workers, create enrollments, activate a
flow, or bypass activation readiness. An executable policy remains insufficient
until the exact owner/version activation review observes matching live worker
leases, capabilities, entitlement and product readiness.

`GET /flows`, run reads and approval reads include server-backed runtime
metadata. Availability is evaluated for the requesting owner from the verified
current rollout policy, the persisted rollout-subject mapping and a live,
matching executor lease. It is `executionAvailable=false` with
`FLOW_RUNTIME_EXECUTION_UNAVAILABLE` when any of those proofs is absent; an
enabled policy alone is never enough. This metadata is the frontend authority
for disabled execution controls. `historySemantics=durable_execution` means
the returned operational history is the durable runtime record, not a browser
preview.

`POST /flows/:flowId/validate` is an owner-scoped, CSRF-protected read-only
operation. It accepts the canonical strict v2 graph through shared contracts,
returns explicit publishability issues, a canonical v2 graph and capability
requirements when compilation succeeds, and reports activation blockers
separately. A valid graph remains `activatable=false` with
`FLOW_RUNTIME_EXECUTION_UNAVAILABLE` until the versioned runtime readiness
authority exists. Validation does not mutate the flow, runtime or outbox.

Validation, publication, and definition reads use one ordinary
`application/json` contract. They do not negotiate vendor media types and do
not depend on a rollout-phase environment variable. Every publication persists
the canonical `flow-capability-manifest.v2`; idempotency replay returns the
stored command result for the same key and request hash.

Definition list/detail reads are non-cacheable and include the server-backed
runtime availability plus the `enrollment_v1` authority projection. The
projection is derived from the durable enrollment control record, never from a
legacy status flag or browser state.

`GET /flows/:flowId/enrollment` is the owner-scoped, non-cacheable CAS read for
enrollment authority. A never-activated definition is projected as `inactive`
at enrollment revision zero without fabricating a persisted epoch. An active
enrollment includes its exact open activation epoch; inactive and paused
enrollments include no open epoch. Missing and foreign-owned definitions are
indistinguishable `404 FLOW_DEFINITION_NOT_FOUND`; a torn control/epoch snapshot
fails closed with `500 FLOW_ENROLLMENT_AUTHORITY_INTEGRITY_ERROR`.

`GET /flows/:flowId/activation-review?versionId=<uuid>` is an authenticated,
owner-scoped and non-cacheable read. It requires neither CSRF nor an
`Idempotency-Key`. A repeatable-read, read-only PostgreSQL snapshot evaluates
the exact published version, definition/enrollment CAS, legacy status, rollout
policy, worker readiness, product dependencies, entitlement and automation
quota. The response returns `definitionRevision`, `enrollmentRevision` and
`expectedActiveVersionId` together with typed blockers, so the client can build
one exact activation command. The review is advisory: activation locks and
re-evaluates all evidence transactionally and a stale snapshot returns typed
`409` rather than being retried automatically. Missing and foreign-owned
definitions or versions share `404 FLOW_DEFINITION_NOT_FOUND`; corrupt
authority returns `500 FLOW_ENROLLMENT_AUTHORITY_INTEGRITY_ERROR`.

`POST /flows/:flowId/activate` and
`POST /flows/:flowId/pause-enrollment` are authenticated, owner-scoped,
CSRF-protected enrollment commands. Both require a valid `Idempotency-Key` and
strict shared-contract request body. Activation pins definition revision,
enrollment revision, target published version and expected active version.
Pause pins enrollment revision, active version and exact open epoch but does not
depend on definition revision, so draft editing cannot block an urgent stop.
PostgreSQL serializes the command with definition and enrollment authority,
re-evaluates activation readiness inside the command transaction, stores the
exact response for 24-hour replay and preserves an immutable command tombstone
after replay payload expiry. Key reuse with different canonical content and
every stale CAS input return typed `409`; bounded lock/statement timeouts roll
back and return retryable `503 FLOW_ENROLLMENT_COMMAND_BUSY`. Corrupt authority
returns typed `500` instead of a guessed state.

Activation opens one immutable effective-time epoch and atomically closes a
previous epoch as `version_switch`; pause closes the exact current epoch as
`pause_enrollment`. Pausing stops only future enrollment. Existing accepted runs
continue under their pinned version and runtime policy. A valid activation is
accepted only when its own transaction re-proves all readiness requirements;
otherwise it is rejected as `409 FLOW_ACTIVATION_BLOCKED` with explicit
blockers and creates no epoch.

Simulation is not an HTTP surface. `POST /flows/:flowId/manual-runs` is an authenticated,
owner-scoped, CSRF-protected and idempotent command for a `manual_client`
trigger only. Its body contains only `clientUserId`; PostgreSQL locks and proves
the existing client--astrologer relationship, resolves the active enrollment
epoch and pins the immutable definition/manifest snapshot. The browser cannot
supply booking, relationship, occurrence or executor context. Reusing a key
with a different client returns typed `409`; an unavailable or foreign client
returns non-enumerating `404`; a manual run while runtime admission is absent
returns `409 FLOW_RUNTIME_EXECUTION_UNAVAILABLE`. Approval decision is likewise
a durable, idempotent command and is available only while the owner passes the
same live runtime-admission check.

`POST /flow-runs/:runId/cancel` is an independent operational control for
existing durable v2 terminal-token runs; it does not enable activation,
enrollment, traversal or scheduling. The command requires authenticated owner
scope, CSRF and exactly one syntactically valid `Idempotency-Key` field line.
The v1 request is bodyless: no body or `{}` is accepted and any field returns
`400 FLOW_INVALID_REQUEST` before persistence. PostgreSQL atomically persists
the canonical request hash, exact status/body replay for 24 hours, terminal
fencing and command-linked trace. Reusing a key with different canonical valid
content conflicts. Missing and foreign-owned run ids produce the same durable
`404`; already-terminal runs produce a durable `409`. Legacy or internally
inconsistent runs and `waiting_external` runs fail closed with a durable `409`
rather than claiming that in-flight provider work was stopped. Cancellation is
accepted only for runnable or claimed terminal-token work; a claimed
cancellation records the locked attempt identity, while a runnable cancellation
does not fabricate an attempt. Bounded PostgreSQL lock/statement timeouts roll
back before authority is acquired and return `503 FLOW_RUNTIME_COMMAND_BUSY`;
the same idempotency key remains retryable.

Internal event dispatch resolves only the authoritative enrollment control and
its open activation epoch. It returns the terminal disposition
`execution_unavailable` with a matched-flow count when execution admission is
not proven, creates no run/effect and lets the outbox relay consume the event
with a sanitized ignored-event log. This prevents an unbounded payload backlog
and stale events from being replayed after activation. The durable v2 runtime
and activation epochs are defined in [ADR 0011](../decisions/0011-flows-postgres-execution-authority.md).

Availability, calendar and manual-booking routes are authenticated and owner
scoped. Availability and calendar reads are side-effect free. Their mutations
require CSRF; manual-block and manual-booking creation additionally require a
valid `Idempotency-Key`. Booking creation validates an active CRM relationship,
an active live product and an exact currently available start before the
transactional scheduling adapter claims the owner-wide occupied range. Replays
return the persisted result; reuse with a different request and overlap races
return stable safe conflict codes.

Messaging commands are authenticated and owner scoped. State-changing
`/messaging/*` commands require CSRF; outbound send also requires an
`Idempotency-Key`. They atomically persist Messaging state and an outbox event;
delivery is performed later by `notification-worker`, which reloads
authoritative state by identifier. `GET /messaging/events` is an SSE freshness
transport behind an app-local `RealtimeGateway`, not a message write path.
`POST /messaging/webhooks/telegram/bot` is CSRF-exempt only because it is a
provider-authenticated webhook; it must validate provider authenticity and
dedupe provider update/message ids before acknowledgement.

Telegram Business voice, image and video-note webhooks persist message text
fallback plus private provider file metadata and acknowledge before download.
Media ingestion is performed asynchronously by `notification-worker`, which
stores a private `messaging_attachment` media asset and emits a
`message.updated` freshness event.
Browsers never receive Telegram `file_id`, `file_path`, bot-token file URLs or
storage bucket/key values. `GET /messaging/messages/:messageId/media/source` is
authenticated and owner scoped; it returns a short-lived private playback URL
only for ready media and returns a typed `message_media_not_ready` conflict for
pending/failed ingestion.

Messaging logging must never include phone numbers, Telegram verification or
2FA codes, business-connection secrets, raw provider payloads, session strings,
credentials or message bodies.

`POST /numerology/preview` is authenticated and read-only, so it does not require
CSRF and must not create calculation, participant-link or interpretation rows.
State-changing numerology/calculation routes require CSRF. CRM request
participants contain only owner-scoped client IDs; `astrologer-api` hydrates the
current CRM display name and birth date before calculating. `current_year` is
resolved with the astrologer profile timezone and the server clock.

The server is the only numerology arithmetic authority. Persistence accepts the
input, recalculates it and stores one current typed result with a canonical
request fingerprint and SHA-256 result checksum. Recalculation atomically
replaces that result, applies an optional edited title, clears
interpretations/artifacts and revokes publication.
Publishing must name the expected current result checksum and requires an
approved current interpretation. Creating a persisted numerology calculation
atomically creates private links for every owner-scoped CRM participant; an
exact create replay idempotently restores any missing participant links.

`POST /numerology/calculations/:calculationId/ai-draft` accepts the strict body
`{ "expectedResultChecksum": "sha256:..." }` for an owned, saved,
non-archived `pythagorean` calculation. The server checks the checksum before
generation and again during the conditional interpretation write, so a
recalculation racing with AI generation cannot attach stale text to the new
result. Manual interpretation saves use the same expected-checksum guard.

Numerology sends the AI service only anonymous, already calculated numeric
result blocks for individual or compatibility mode. Names, birth dates, CRM and
owner identifiers, calculation identifiers, fingerprints, checksums and raw
inputs are excluded. AI output is saved only as an editable draft and cannot
change deterministic numbers, relations or conclusions. The response is the
updated `NumerologyCalculationResponse`; every public interpretation contains
only `id`, `status` and `text`. Internal source, provider model and prompt
metadata are not exposed to frontend consumers. Approval remains a separate
explicit mutation against a saved interpretation id.

New natal creation requires an explicit persisted `interpretationMode` of
`adult_natal` or `child`. It is product intent, not an age inference: neither
date of birth nor a `mode=child_chart` URL can classify or reclassify a saved
calculation. Chart job/result reads return the server-owned mode. Existing natal
rows without the field are exposed as `legacy_unclassified` and are not
backfilled by guessing; recalculation preserves the stored classification.
Non-natal chart methods use `legacy_unclassified` because this field only
classifies natal interpretation policy.

Result schema version and interpretation classification are separate persisted
facts. A classified `chart-result.v1` natal row keeps its stored adult/child
mode, but remains limited to legacy viewing plus exact-id recalculation; that
recalculation upgrades the result without reclassifying the product intent.

The capability boundary is fail closed. Adult natal supports private linking,
publication/client delivery, chart AI and PDF. Child natal may be viewed,
recalculated and privately linked to its CRM client, but cannot be published,
delivered to the client, exported to PDF or sent to chart AI. Legacy natal may
only be viewed and recalculated until an explicit future classification
workflow exists. These guards run from persisted authority before downstream
provider, PDF-queue or publication work; frontend URL/query state cannot
override them.

Numerology PDF routes are owner-scoped to a current, non-archived
`module = numerology`, `method_code = pythagorean` saved calculation. Latest
state is read per `locale`; enqueue requires CSRF and the strict body
`{ "expectedResultChecksum": "sha256:...", "locale": "ru" | "en" }`.
Individual and compatibility documents include the complete deterministic
result. If a current approved interpretation exists, its text is included;
absence of approved text does not block export, and draft/dirty text is never
accepted from the browser. Download succeeds only for a ready current job and
returns a short-lived private presigned URL.

Chart PDF routes are owner-scoped to a current, non-archived `module = chart`
saved calculation for every current reproducible chart method: `natal`,
`astrocartography`, `transit`, `synastry`, `composite`, `solar_return`,
`progression` and `horary`. Latest state is read per `locale`; enqueue requires
CSRF and the strict body
`{ "expectedResultChecksum": "sha256:...", "locale": "ru" | "en" }`.
Documents render deterministic current calculation data using method-specific
sections: single-wheel charts include wheel, points, houses, aspects and
distributions; transit, solar-return, progression and synastry render one
combined overlay wheel plus the paired chart data tables and cross-chart
aspects; astrocartography includes its line map and angular line table. Natal
documents additionally include dictionary
interpretation rows looked up by deterministic chart codes from the current
saved result. Missing natal dictionary entries are explicit in the export rather
than silently omitted. Download succeeds only for a ready current job and
returns a short-lived private presigned URL.

`POST /matrix/preview` is authenticated and read-only. Matrix persistence
accepts only existing owner-scoped active CRM client IDs: one for an individual
calculation and two distinct clients for compatibility. The API hydrates names
and birth dates, calculates with the sole `ladini_22` engine, and atomically
links every participant when creating the generic `module = matrix` calculation
record. Recalculation accepts an empty body and rehydrates the saved participant
identities; callers cannot replace them.

The saved Matrix fingerprint and result checksum cover only the invariant base
calculation. `GET /matrix/calculations/:calculationId/projection` derives the
current age cycle and requested annual forecast from the owned saved birth-date
snapshot plus the astrologer's timezone. It performs no write and does not
invalidate the saved result. Matrix exposes no module-specific publication,
consultation, messaging or public-calculator route. Matrix POST mutations use
the existing CSRF policy; preview and projection do not.

Matrix notes are astrologer-private and exist only under an owned persisted
`module = matrix`, `method_code = ladini_22` calculation. Create and update
require the caller's `expectedResultChecksum` to equal the current saved result;
otherwise the API returns `409 MATRIX_RESULT_CHANGED` and performs no write.
Each note retains its historical result checksum. Reads derive `stale` by
comparing it with the current calculation, while delete remains allowed for
both current and stale notes. GET note and catalog routes are authenticated and
CSRF-exempt; note POST, PUT and DELETE routes require CSRF. The revisioned RU/EN
catalog is authored in code and has no storage, AI or translation side effect.

Matrix, Numerology and Chart PDF endpoints delegate to one calculation-PDF
lifecycle. Matrix enqueue additionally requires its current checksum-bound
report to be `ready`; its locale comes from that report. Numerology PDFs render
deterministic current calculation data without requiring an approved
interpretation. Chart PDFs render deterministic current calculation data for
all current chart methods; natal PDFs also include owner-scoped dictionary
entries by exact chart codes. Enqueue is idempotent for the same authoritative
document fingerprint. Recalculation atomically invalidates current PDF
jobs/artifact references and writes cleanup events; old jobs cannot be
downloaded, and object deletion is performed asynchronously by `workers`. API
responses expose public job state and the presigned URL only: storage keys,
buckets, source locators, document fingerprints, provider/model and prompt
metadata are never frontend contracts.

`POST /charts/calculations/:calculationId/ai-draft` requires CSRF and exactly
one valid `Idempotency-Key`. The durable command binds the authenticated actor,
calculation id and normalized checksum body and is committed before provider
work. A live duplicate returns `409 CHART_AI_DRAFT_IN_PROGRESS`; reuse for a
different request returns `409 CHART_AI_DRAFT_IDEMPOTENCY_KEY_REUSED`.
Successful replay returns the same deterministic interpretation without new
provider usage. Terminal replay is resolved after authentication, ownership and
request-identity fencing but before mutable consent/configuration/dictionary
preflight, so a previously committed outcome remains stable. Known terminal
failures are replayed, while ambiguous provider or post-provider persistence
outcomes are persisted as `CHART_AI_DRAFT_OUTCOME_UNKNOWN` and require
reconciliation instead of silently repeating billable processing. Command keys
expire after 24 hours; safe expiry cleanup allows one new acquisition while
preserving the unique concurrent-acquisition fence.

`POST /human-design/preview` is authenticated and read-only, so it does not
require CSRF and must not create calculation, participant-link, interpretation,
artifact, outbox or DB rows. The preview contract accepts internal
provider-resolved personality/design longitudes, an owner-scoped CRM `clientId`
for individual mode, or an owner-scoped distinct CRM client pair for
compatibility mode; browser-supplied birth date, birth time, timezone or place
fields are rejected. For CRM input, `astrologer-api` hydrates related client
birth data, validates calculation readiness and resolves birth/design positions
through the private chart-engine provider boundary. The server/domain is the
only Human Design mechanics authority and returns deterministic individual or
compatibility results with input fingerprint and SHA-256 result checksum.
`POST /human-design/calculations` persists an owner-scoped `human_design`
calculation through the shared calculations store and privately links the CRM
subject, plus partner for compatibility mode, to the astrologer. `POST
/human-design/calculations/:calculationId/recalculate` reloads the saved Human
Design record, keeps the same CRM participant identities and replaces the result
from current CRM birth data through the same chart-engine/domain pipeline.
State-changing Human Design routes require CSRF.

`GET /human-design/calculations/:calculationId/transits` is an authenticated
read-only overlay route for saved individual calculations. It resolves transit
positions server-side for the requested instant, returns a checksum-bound
`human-design-transit-result.v1` result and performs no persistence. `POST
/human-design/calculations/:calculationId/ai-draft` accepts the strict current
checksum body and may include a server-resolved transit focus; AI receives only
minimized deterministic Human Design context and frontend responses expose no
provider/model/prompt metadata. Human Design PDF routes use the shared private
calculation-PDF lifecycle for current saved individual or compatibility results;
transit overlays are not standalone PDF exports.

`GET /products/templates` returns active platform-owned starter templates in the
requested locale. `POST /products/templates/:templateCode/drafts` requires an
authenticated astrologer session, CSRF protection and a strict `{ "locale":
"ru" | "en" }` body; it creates a new owner-scoped product draft from the
stored template payload. Template payloads never carry owner, status or media
ownership state from another account.

The `/products` constructor uses the payload returned by
`GET /products/templates` as local form state. Selecting or closing a template
does not call a write endpoint; persistence starts only after the astrologer
explicitly saves or publishes the constructor form. The template-draft POST
remains an explicit API operation for consumers that intentionally need an
immediately persisted draft.

Verification submission in `astrologer-api` only accepts astrologer-owned private
identity and qualification media and creates a pending application. Approve,
reject, revoke, escalation, reviewer identity and audit trails are moderator
workflows for `admin-api`.

AI provider credentials, model selection and rate limits are backend-only
`ASTROLOGER_*` runtime config. `astrologer-web` must call feature-specific routes
and must not know provider keys, prompt ids or provider internals.

## Admin API

`admin-api` является отдельной поверхностью authenticated workflows
администраторов, супер-администраторов и модераторов. В текущем коде app
содержит health и internal finance contour: risk/hold/reserve policies,
versioned fiscal profiles, platform tariffs, payout evidence, recurring-card
disclosures, refund-candidate review, super-admin refund approval и step-up
finance authorizations. Это не означает, что broader user, verification,
moderation, payment-support и platform-settings workflows уже реализованы.

Ответственности администратора/супер-администратора/модератора:

- User search и account status.
- Verification queues.
- Moderation queues.
- Payment и refund support.
- Disputes.
- Platform settings.
- Audit trail.

Current admin routes in this implemented contour:

```text
POST /identity/admin/passwordless/request-code
POST /identity/admin/passwordless/verify-code
GET  /identity/me
POST /identity/logout
/admin/users
/admin/moderation
/admin/payments
/admin/settings
GET  /admin/finance/policies
POST /admin/finance/policies/default
PUT  /admin/finance/policies/default
PUT  /admin/finance/risk-profiles/:astrologerId
POST /admin/finance/orders/:orderId/apply-risk-policy
GET  /admin/finance/payout-requests?status=open|ready|processing|failed|terminal|all
PUT  /admin/finance/payout-requests/:payoutRequestId/status
GET  /admin/finance/reversal-cases?type=all|refund|chargeback
PUT  /admin/finance/reversal-cases/:reversalCaseId/review
GET  /admin/finance/reconciliation/exceptions?evidence=all|payment|settlement|payout|provider_event
PUT  /admin/finance/reconciliation/exceptions/:reconciliationRecordId
GET  /admin/finance/fiscal-profiles
POST /admin/finance/fiscal-profiles
PUT  /admin/finance/fiscal-profiles/:profileSeriesId/:version
POST /admin/finance/fiscal-profiles/:profileSeriesId/:version/publish
POST /admin/finance/fiscal-profiles/:profileSeriesId/:version/retire
GET  /admin/tariffs
POST /admin/tariffs
PUT  /admin/tariffs/:tariffSeriesId/:version
POST /admin/tariffs/:tariffSeriesId/:version/publish
POST /admin/finance/payout-evidence
GET  /admin/finance/saved-card-disclosures
POST /admin/finance/saved-card-disclosures
PUT  /admin/finance/saved-card-disclosures
POST /admin/finance/saved-card-disclosures/:seriesId/:version/:locale/publish
POST /admin/finance/saved-card-disclosures/:seriesId/:version/:locale/retire
GET  /admin/finance/refund-candidates
PUT  /admin/finance/refund-candidates/:candidateId/review
POST /admin/finance/refund-candidates/:candidateId/approval/authorization
POST /admin/finance/refund-candidates/:candidateId/approval
POST /admin/finance/authorizations/begin
POST /admin/finance/authorizations/verify
POST /admin/finance/authorizations/passkeys/registration-options
POST /admin/finance/authorizations/passkeys/verify-registration
```

Новые admin/moderator/super_admin workflows не должны добавляться в `public-api`
или `astrologer-api`. Они должны жить в `admin-api` и вызывать domain use cases
с audit logging.

`POST /admin/finance/refund-candidates/:candidateId/approval/authorization` и
`POST /admin/finance/refund-candidates/:candidateId/approval` доступны только
`super_admin` с session, CSRF и одноразовым WebAuthn grant. Клиент передаёт
только сумму возврата; candidate, review, capture, wallet, provider payment и
refund position повторно читаются и блокируются на сервере. Успешный approval
атомарно резервирует V2 payable position, пишет sealed immutable provider request
и durable outbox. Он не утверждает provider refund: фактический ArcPay outcome
подтверждает только canonical payment-worker processing.

Order-level finance policy changes are never implicit. New orders store the
effective risk/hold/reserve policy snapshot at creation time; applying the
current effective risk policy to an existing active order requires the explicit
`POST /admin/finance/orders/:orderId/apply-risk-policy` action and a durable
audit entry.

## Правило контрактов

Не держи API contracts неформальными. Используй один из подходов:

- OpenAPI, сгенерированный из Nest и используемый frontend clients.
- Shared contract package со schemas и generated clients.

Frontend-приложения не должны вручную дублировать backend DTOs.

## Правило авторизации

Authorization должен быть явным для каждой API surface:

- `public-api`: guest/client access, direct-link context, rate limiting, anti-abuse.
- `astrologer-api`: authenticated astrologer access.
- `admin-api`: authenticated moderator/admin/super_admin access, permissions, auditability.

Admin actions должны вызывать domain use cases и писать audit log entries.

## Правило browser security

Cookie-auth state-changing routes в `public-api`, `astrologer-api` и `admin-api`
должны явно декларировать CSRF policy через security layer соответствующего backend app.
Не реализуй CSRF-проверки локально внутри booking/orders/payments/identity,
astrologer или admin controllers.

Для browser session routes используется signed double-submit CSRF cookie,
проверка `X-CSRF-Token` и allowlist `Origin`/`Referer`. `SameSite=Lax` остаётся
дополнительной защитой, но не заменяет CSRF policy.

Booking/order/payment commands должны требовать `Idempotency-Key` и хранить
idempotency state вместе с соответствующим command/result contract. См.
`docs/decisions/0007-cookie-auth-csrf-and-idempotency.md`.

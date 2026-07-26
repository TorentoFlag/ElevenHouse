# API Boundaries

## Public API

`public-api` обслуживает высоконагруженные client-facing flows. В текущем коде
реализованы health, identity/passwordless/session, direct-link client join,
related-astrologer read, cabinet overview, client birth-profile routes and the
first direct-link booking/order/payment command contour. Full public profile
read model, public product/slot selection reads, client-facing checkout UI,
materials, feed, subscriptions, journal and client-visible calculation delivery
remain incomplete contours on this surface.

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

Примеры routes:

```text
POST /identity/passwordless/request-code
POST /identity/passwordless/verify-code
POST /identity/registration/passwordless/verify-code
GET  /identity/me
POST /identity/logout
POST /client-join-intents
GET  /me/astrologers
GET  /me/overview
GET  /me/birth-data
PUT  /me/birth-data
GET  /me/birth-profiles
POST /me/birth-profiles
PUT  /me/birth-profiles/:birthDataId
GET  /a/:handle
POST /booking/intent
POST /booking/:intentId/select-slot
POST /orders
POST /payments/checkout
GET  /me/orders
GET  /me/bookings
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

`GET /me/overview` is client-role and owner scoped. It returns only explicit
client-astrologer relationships, saved birth profiles and current cabinet
summary counters. The `directLinkOnly: true` summary flag is an invariant, not a
feature toggle; this API must not search, recommend or enumerate astrologers.

`GET/PUT /me/birth-data` is client-role and owner scoped. It is the
primary-profile compatibility route: reads and updates the client's current
primary reusable birth-data record.

`GET /me/birth-profiles`, `POST /me/birth-profiles` and
`PUT /me/birth-profiles/:birthDataId` are client-role and owner scoped.
They support multiple saved birth profiles with at most one primary profile per
client. Birth-profile mutations require CSRF. Sharing any saved birth profile
with an astrologer/order is a separate consent-bound workflow and is not implied
by profile storage.

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
through OpenAI. Messaging architecture is recorded in
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
GET  /platform-billing/me
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
POST /messaging/threads/:threadId/messages
POST /messaging/threads/:threadId/link-client
POST /messaging/threads/:threadId/create-client
POST /messaging/threads/:threadId/read
POST /messaging/webhooks/telegram/bot
GET  /messaging/events
```

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

Numerology PDF routes are owner-scoped to a current, non-archived
`module = numerology`, `method_code = pythagorean` saved calculation. Latest
state is read per `locale`; enqueue requires CSRF and the strict body
`{ "expectedResultChecksum": "sha256:...", "locale": "ru" | "en" }`.
Individual and compatibility documents include the complete deterministic
result. If a current approved interpretation exists, its text is included;
absence of approved text does not block export, and draft/dirty text is never
accepted from the browser. Download succeeds only for a ready current job and
returns a short-lived private presigned URL.

Chart PDF routes are owner-scoped to a current, non-archived `module = chart`,
`method_code = natal` saved calculation. Latest state is read per `locale`;
enqueue requires CSRF and the strict body
`{ "expectedResultChecksum": "sha256:...", "locale": "ru" | "en" }`.
Documents render a deterministic chart wheel, calculation settings, provider
metadata, birth-data snapshot, points, houses, aspects, distributions, warnings
and dictionary interpretations looked up by deterministic chart codes from the
current saved result. Missing dictionary entries are explicit in the export
rather than silently omitted. Download succeeds only for a ready current job and
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
interpretation. Chart PDFs render deterministic current calculation data plus
owner-scoped dictionary entries by exact chart codes. Enqueue is idempotent for
the same authoritative document fingerprint. Recalculation atomically invalidates current PDF
jobs/artifact references and writes cleanup events; old jobs cannot be
downloaded, and object deletion is performed asynchronously by `workers`. API
responses expose public job state and the presigned URL only: storage keys,
buckets, source locators, document fingerprints, provider/model and prompt
metadata are never frontend contracts.

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
содержит health, internal identity/session foundation и первый finance policy
контур для настройки risk/hold/reserve.

Ответственности администратора/супер-администратора/модератора:

- User search и account status.
- Verification queues.
- Moderation queues.
- Payment и refund support.
- Disputes.
- Platform settings.
- Audit trail.

Примеры routes:

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
GET  /admin/finance/payout-requests
PUT  /admin/finance/payout-requests/:payoutRequestId/status
```

Новые admin/moderator/super_admin workflows не должны добавляться в `public-api`
или `astrologer-api`. Они должны жить в `admin-api` и вызывать domain use cases
с audit logging.

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

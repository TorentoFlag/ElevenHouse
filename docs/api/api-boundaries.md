# API Boundaries

## Public API

`public-api` обслуживает высоконагруженные client-facing flows. В текущем коде
реализованы health и identity/passwordless/session routes; booking, orders и
payments остаются будущими модулями этой поверхности.

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

## Astrologer API

`astrologer-api` обслуживает authenticated workflows астрологов. В текущем коде
реализованы health, identity/passwordless/session, dictionary, dictionary AI draft,
products, media uploads, profile/settings billing overview, verification
application submission и provider-neutral AI generation через OpenAI.

Ответственности:

- Profile и onboarding.
- Products.
- Availability.
- Bookings.
- Clients.
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
GET  /products/:productId
POST /products
PUT  /products/:productId
POST /products/:productId/publish
POST /products/:productId/move-to-draft
POST /products/:productId/archive
POST /products/:productId/duplicate
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
```

Verification submission in `astrologer-api` only accepts astrologer-owned private
identity and qualification media and creates a pending application. Approve,
reject, revoke, escalation, reviewer identity and audit trails are moderator
workflows for future `admin-api`.

AI provider credentials, model selection and rate limits are backend-only
`ASTROLOGER_*` runtime config. `astrologer-web` must call feature-specific routes
and must not know provider keys, prompt ids or provider internals.

## Admin API

`admin-api` является целевой отдельной поверхностью authenticated workflows
администраторов, супер-администраторов и модераторов. В текущем коде app ещё не
создан; `admin-web` существует как frontend shell.

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
```

Новые admin/moderator/super_admin workflows не должны добавляться в `public-api`
или `astrologer-api`. Они должны жить в будущем `admin-api` и вызывать domain
use cases с audit logging.

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

Cookie-auth state-changing routes в `public-api`, `astrologer-api` и будущем `admin-api`
должны явно декларировать CSRF policy через security layer соответствующего backend app.
Не реализуй CSRF-проверки локально внутри booking/orders/payments/identity,
astrologer или admin controllers.

Для browser session routes используется signed double-submit CSRF cookie,
проверка `X-CSRF-Token` и allowlist `Origin`/`Referer`. `SameSite=Lax` остаётся
дополнительной защитой, но не заменяет CSRF policy.

Booking/order/payment commands должны требовать `Idempotency-Key` и хранить
idempotency state вместе с соответствующим command/result contract. См.
`docs/decisions/0007-cookie-auth-csrf-and-idempotency.md`.

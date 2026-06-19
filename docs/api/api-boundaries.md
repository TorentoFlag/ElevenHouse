# API Boundaries

## Public API

`public-api` обслуживает высоконагруженные client-facing flows.

Ответственности:

- Данные публичной страницы астролога.
- Entry points для lead magnets.
- Booking intents и slot selection.
- Client quick registration/login во время booking.
- Order creation для клиентских покупок.
- Checkout/payment initiation.
- Client cabinet: orders, bookings, materials, subscriptions.

Примеры routes:

```text
GET  /a/:handle
POST /booking/intent
POST /booking/:intentId/select-slot
POST /orders
POST /payments/checkout
GET  /me/orders
GET  /me/bookings
```

## Ops API

`ops-api` обслуживает authenticated workflows астрологов, админов, супер-админов и модераторов.

Ответственности астролога:

- Profile и onboarding.
- Products.
- Availability.
- Bookings.
- Clients.
- Sessions и materials.
- Wallet/finance views.
- Analytics.

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
/astrologer/profile
/astrologer/products
/astrologer/availability
/astrologer/bookings
/astrologer/clients
/admin/users
/admin/moderation
/admin/payments
/admin/settings
```

## Правило контрактов

Не держи API contracts неформальными. Используй один из подходов:

- OpenAPI, сгенерированный из Nest и используемый frontend clients.
- Shared contract package со schemas и generated clients.

Frontend-приложения не должны вручную дублировать backend DTOs.

## Правило авторизации

Authorization должен быть явным для каждой API surface:

- `public-api`: guest/client access, direct-link context, rate limiting, anti-abuse.
- `ops-api`: authenticated roles, permissions, разделение astrologer/moderator/admin/super_admin.

Admin actions должны вызывать domain use cases и писать audit log entries.

## Правило browser security

Cookie-auth state-changing routes в `public-api` и `ops-api` должны явно
декларировать CSRF policy через security layer соответствующего backend app.
Не реализуй CSRF-проверки локально внутри booking/orders/payments/identity,
astrologer или admin controllers.

Для browser session routes используется signed double-submit CSRF cookie,
проверка `X-CSRF-Token` и allowlist `Origin`/`Referer`. `SameSite=Lax` остаётся
дополнительной защитой, но не заменяет CSRF policy.

Booking/order/payment commands должны требовать `Idempotency-Key` и хранить
idempotency state вместе с соответствующим command/result contract. См.
`docs/decisions/0007-cookie-auth-csrf-and-idempotency.md`.

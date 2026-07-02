# 0007. Cookie Auth CSRF and Idempotency Policy

Date: 2026-06-18

## Status

Accepted

## Context

`public-api` and `ops-api` use server-side sessions carried by an `HttpOnly`,
`SameSite=Lax` cookie. This is the right base for browser sessions, but
`SameSite` is a defense-in-depth layer and must not be the only protection for
cookie-auth state-changing routes.

ElevenHouse is a product-grade production codebase. Booking, orders and
payments must be built on a consistent security policy from the first route,
not retrofitted after business workflows exist.

## Decision

`public-api` and `ops-api` each own a dedicated `SecurityModule` for browser
request security under their own runtime config namespace and cookie names.
Feature modules declare security requirements with route metadata; they do not
implement CSRF or idempotency checks locally.

Cookie-auth state-changing routes must use CSRF protection unless explicitly
documented as a webhook, internal endpoint, or unauthenticated auth entrypoint.
The CSRF mechanism is a signed double-submit cookie:

- session cookie remains `HttpOnly`;
- CSRF cookie is readable by frontend JavaScript;
- frontend sends the CSRF cookie value in `X-CSRF-Token`;
- backend requires header token and cookie token to match;
- backend verifies an HMAC signature bound to the session token hash;
- backend validates `Origin` or `Referer` against configured allowed origins.

Routes that create or mutate booking/order/payment state must also require an
`Idempotency-Key`. The initial shared layer enforces the route-level contract.
The result replay store is implemented together with the first concrete
booking/order/payment command because replay semantics depend on command scope,
request hash and persisted business result.

## Consequences

- `SameSite=Lax` and `HttpOnly` session cookies stay in place.
- `PUBLIC_API_CSRF_SECRET` / `PUBLIC_API_ALLOWED_ORIGINS` and
  `OPS_API_CSRF_SECRET` / `OPS_API_ALLOWED_ORIGINS` are required in production
  for their corresponding API apps.
- Existing passwordless unauthenticated entrypoints do not require CSRF.
- `POST /identity/logout` is protected by CSRF and clears both session and CSRF
  cookies.
- Future cookie-auth mutations must opt into route metadata instead of
  hand-rolled header checks.

## References

- OWASP Cross-Site Request Forgery Prevention Cheat Sheet.
- OWASP Session Management Cheat Sheet.
- MDN Set-Cookie reference.

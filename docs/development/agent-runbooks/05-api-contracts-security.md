# Runbook: API Contracts And Security

Используй этот ранбук для shared contracts, frontend/backend API integration,
auth/session routes, CSRF policy and idempotency.

## Цель

Не оставлять frontend/backend contracts неформальными и не внедрять security
checks ad hoc inside feature controllers.

## Contract Rules

- Shared schemas live in `packages/contracts/src/<module>.ts`.
- Each contract module should have focused tests.
- Frontend apps consume contract schemas or generated clients.
- Frontend apps must not duplicate backend DTOs manually.
- API responses should be parsed before UI trusts them.

## API Boundary Rules

- `public-api`: guest/client/direct-link/booking/checkout/client cabinet.
- `astrologer-api`: authenticated astrologer workspace.
- `admin-api`: internal moderator/admin/super_admin workflows.

If a route is admin/moderator/super_admin, stop before adding it to
`public-api` or `astrologer-api`; it belongs in `admin-api` with explicit
authorization and audit boundaries.

## Auth Rules

- Public registration grants only `client`.
- Astrologer role assignment is explicit astrologer onboarding or authorized
  internal workflow.
- Internal roles are never granted through public registration.
- Frontends must not infer authorization from app selection alone.

## CSRF Rules

Cookie-auth state-changing routes in `public-api`, `astrologer-api` and future
`admin-api` must declare CSRF policy through the app security layer.

Do not implement CSRF checks locally in feature controllers.

Use the existing route metadata/security module pattern. Logout and other
cookie-auth mutations need CSRF unless explicitly documented as an unauthenticated
auth entrypoint, webhook or internal endpoint.

## Idempotency Rules

Commands that create or mutate booking/order/payment state must require
`Idempotency-Key` and persist command/result replay state appropriate to that
workflow.

Examples:

- booking intent creation;
- slot selection/hold;
- order creation;
- checkout/payment initiation;
- refund commands;
- payment webhook processing.

Do not add payment or booking status transitions as plain controller mutations.

## Пошаговая процедура

1. Read `docs/api/api-boundaries.md`.
2. Read `docs/decisions/0007-cookie-auth-csrf-and-idempotency.md`.
3. Add/update contract schemas in `packages/contracts/src/<module>.ts`.
4. Export contracts from `packages/contracts/src/index.ts`.
5. Add contract tests:

   ```bash
   pnpm test packages/contracts/src/<module>.test.ts
   ```

6. Wire backend route/service to parse request and return contract-shaped
   response.
7. Wire frontend API wrapper to parse response schema.
8. Add CSRF/idempotency metadata where required.
9. Add e2e/service tests for security behavior when route policy changed.

## Sensitive Data Rules

- Birth-data processing follows the registration legal policy; it has no
  separate consent, grant or revoke workflow. Recordings and use of anonymized
  data retain their own explicit consent records.
- Recordings require recording consent before capture.
- KYC/legal identity fields are not ordinary profile fields.
- Verification status is protected workflow state.

## Stop Conditions

- Frontend would call backend internals directly.
- DTOs are copied manually in frontend.
- Route mutates booking/order/payment without idempotency design.
- Controller implements local CSRF logic.
- Caller can self-assign protected roles or workflow statuses.

## Done Checklist

- Contract schema and tests exist.
- Contract is exported.
- Frontend parses response through shared contract.
- API surface is correct.
- CSRF and idempotency policies are explicit.
- Sensitive/protected fields cannot be caller-controlled.

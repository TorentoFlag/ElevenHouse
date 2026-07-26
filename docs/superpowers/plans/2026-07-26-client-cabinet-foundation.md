# Client Cabinet Foundation

## Purpose / Big Picture

Implement the first production slice of the ElevenHouse client cabinet in
`apps/client-web` and `apps/public-api`. The client reaches ElevenHouse only
through a direct astrologer link, then sees only astrologers with an explicit
relationship. The `/me` route becomes a real cabinet foundation instead of a
plain profile page.

## Progress

- 2026-07-26: Research and product analysis completed. Accepted invariant:
  direct-link only, no catalog/search/recommendations/cross-promo.
- 2026-07-26: First implementation scope selected: cabinet shell, related
  astrologers, overview read model, birth profiles, honest empty/loading/error
  states. Booking/order/payment UI remains a later slice over existing backend
  POST contours.
- 2026-07-26: Implemented contracts, domain use cases, DB schema/adapter,
  public-api routes and client-web `/me` foundation for related astrologers,
  overview and multi birth profiles.

## Surprises & Discoveries

- Current `client_birth_data` has a unique client index, so multiple client birth
  profiles require a DB/domain/contract change, not frontend state.
- `public-api` already has first POST contours for booking holds, orders and
  payment checkout, but `client-web` lacks the read models and UX to expose them.

## Decision Log

- 2026-07-26: Keep direct-link relationship creation as the only way to connect
  a client to an astrologer. The cabinet selector shows existing relationships
  only.
- 2026-07-26: Hide messaging/discovery/unlink/destructive actions until their
  backend and access semantics exist.
- 2026-07-26: Keep legacy `/me/birth-data` as the primary profile compatibility
  route while adding a multi-profile contour.

## Outcomes & Retrospective

Implemented:

- `client_birth_data` supports multiple rows per client with a partial unique
  primary-profile index.
- Legacy `/me/birth-data` remains a primary-profile compatibility route.
- New `/me/overview`, `/me/birth-profiles`, `POST /me/birth-profiles` and
  `PUT /me/birth-profiles/:birthDataId` are owner-scoped client routes.
- `client-web` `/me` now renders a direct-link-only cabinet foundation with
  related astrologers, honest summary counters and saved birth-profile
  management.

Remaining client-cabinet contours:

- Booking/order/payment UX over the existing backend POST contours.
- Read models and UI for sessions, materials, feed, subscriptions, journal,
  notifications, disputes and client-visible calculation delivery.

Verification run:

- `pnpm test packages/contracts/src/clients.test.ts packages/domain/src/clients/index.test.ts packages/db/src/adapters/clients/drizzle-client-store.test.ts packages/db/src/schema.test.ts apps/public-api/src/modules/client-profile/client-profile.service.test.ts apps/public-api/src/modules/client-profile/client-profile.controller.test.ts apps/client-web/src/features/client-profile/api/clientProfileApi.test.ts apps/client-web/src/pages/me/MePageView.test.tsx`
- `pnpm --filter @elevenhouse/contracts typecheck`
- `pnpm --filter @elevenhouse/domain typecheck`
- `pnpm --filter @elevenhouse/db typecheck`
- `pnpm --filter @elevenhouse/public-api typecheck`
- `pnpm --filter @elevenhouse/client-web typecheck`
- `pnpm --filter @elevenhouse/astrologer-api typecheck`
- `pnpm test apps/astrologer-api/src/modules/clients/clients.service.test.ts apps/astrologer-api/src/modules/charts/charts.service.test.ts apps/astrologer-api/src/modules/human-design/human-design.service.test.ts apps/astrologer-api/src/modules/matrix/matrix.service.test.ts apps/astrologer-api/src/modules/numerology/numerology.service.test.ts`
- `pnpm test apps/astrologer-api/src/modules/clients/clients.e2e.test.ts apps/astrologer-api/src/modules/charts/charts.e2e.test.ts apps/astrologer-api/src/modules/human-design/human-design.e2e.test.ts apps/astrologer-api/src/modules/matrix/matrix.e2e.test.ts apps/astrologer-api/src/modules/numerology/numerology.e2e.test.ts`

## Context and Orientation

Relevant production files:

- `apps/client-web/src/pages/me/MePage.tsx`
- `apps/client-web/src/features/client-profile/api/clientProfileApi.ts`
- `apps/public-api/src/modules/client-profile/*`
- `packages/contracts/src/clients.ts`
- `packages/domain/src/clients/*`
- `packages/db/src/schema/clients/client-birth-data.schema.ts`
- `packages/db/src/adapters/clients/*`

Reference files:

- `ElevenHouseDesign/app/client.jsx`
- `ElevenHouseDesign/app/client-data.jsx`
- `ElevenHouseDesign/screenshots/01-clhome.png`

## Interfaces and Dependencies

The production contour is:

`/me` route -> client-web feature APIs -> shared contracts -> public-api
`client-profile` module -> domain client ports/use cases -> db client adapter.

Apps import packages. Domain does not import DB. Frontend parses shared
contracts. State-changing routes use existing public session/CSRF policy.

## Plan of Work

1. Add failing contract tests for a client overview response and birth-profile
   list/create/update response shapes.
2. Add domain tests for multiple birth profiles owned by one client.
3. Update DB schema/adapters for multiple profiles and primary-profile
   compatibility.
4. Add public-api controller/service tests and routes.
5. Add client-web API/model tests and rebuild `/me` as the cabinet foundation.
6. Update design inventory/backend module docs only where current state changes.
7. Run targeted tests, typechecks and diff checks.

## Concrete Steps

Commands are run from `/Users/anton/Finext/ElevenHouse`.

- `pnpm test packages/contracts/src/clients.test.ts`
- `pnpm test packages/domain/src/clients/index.test.ts`
- `pnpm test packages/db/src/schema.test.ts packages/db/src/adapters/clients/drizzle-client-store.test.ts`
- `pnpm test apps/public-api/src/modules/client-profile/client-profile.service.test.ts`
- `pnpm --filter @elevenhouse/client-web test`
- `pnpm --filter @elevenhouse/client-web typecheck`

DB schema changes require `pnpm db:generate`. `pnpm db:reset` is destructive and
requires confirming the target local DB before running.

## Validation and Acceptance

Automated:

- Contract schemas parse/normalize accepted data and reject invalid shapes.
- Domain tests prove multiple profiles per client and primary compatibility.
- API service/controller tests prove owner-scoped reads/mutations.
- Frontend tests prove loading, empty, success and direct-link-only relationship
  messaging.

Runtime and visual:

- Browser acceptance is required before claiming visible completion. If existing
  services or browser surface are unavailable, mark runtime/design acceptance as
  blocked rather than passed.

## Idempotence and Recovery

All writes are client-owner scoped. Direct-link relationship creation remains
the existing join-intent flow. Legacy `/me/birth-data` remains supported by
updating the primary profile.

## Artifacts and Notes

Evidence will be added under `.design-qa/client-cabinet-foundation-2026-07-26/`
if browser/runtime verification is available.

# Astrologer Profile Foundation Design

Date: 2026-07-03

## Context

Products/Product Constructor is the current active vertical slice. The next durable product dependency is an authenticated astrologer profile foundation. It unlocks onboarding, shell profile summary, future public direct-link rendering, and later availability/booking readiness without adding client/public workflows too early.

This slice follows the documented app boundaries:

- Management routes live in `apps/astrologer-api`.
- Public direct-link reads will later live in `apps/public-api`.
- Domain rules live in `packages/domain`.
- Database schema and Drizzle adapters live in `packages/db`.
- Shared request/response schemas live in `packages/contracts`.
- The frontend consumes contracts through feature APIs and React Query.

## Scope

Implement the first production-backed `AstrologerProfile` module for authenticated astrologers.

Included:

- Domain types, store port, validation-oriented use cases, and errors for the current astrologer's profile.
- Contract schemas for reading and updating the current astrologer profile.
- Drizzle schema and adapter for persisted astrologer profile records.
- `apps/astrologer-api` feature module under `src/modules/astrologer-profile/`.
- Authenticated `GET /astrologer-profile/me` and CSRF-protected `PUT /astrologer-profile/me`.
- Tests for contracts, domain rules, DB adapter behavior, API service/controller behavior, and exports.

Excluded from this slice:

- `public-api GET /a/:handle`.
- `client-web` public astrologer page rendering.
- Full onboarding wizard UI.
- Media upload/storage.
- Verification, payout setup, platform plans, schedule setup, and readiness gates outside profile fields.
- Availability, booking, orders, payments, wallet, notifications, and analytics workflows.

## Data Model

Create an `astrologer_profiles` table owned by `packages/db`.

Fields:

- `owner_user_id uuid primary key references users(id) on delete cascade`
- `public_handle text not null`
- `public_name text not null`
- `headline text`
- `bio text`
- `timezone text not null`
- `locale text not null`
- `avatar_media_id text`
- `cover_media_id text`
- `consultation_languages jsonb not null`
- `is_public_page_enabled boolean not null default false`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints and indexes:

- Unique `public_handle`.
- Check `public_handle` format: lowercase latin letters, digits, and hyphens; length 3-64; no leading or trailing hyphen.
- Check `public_name` trimmed length 2-200.
- Check `headline` trimmed length at most 240 when present.
- Check `bio` trimmed length at most 4000 when present.
- Check `timezone` and `locale` are non-empty text values.
- Index for future public lookup by `public_handle`.

`displayName` remains in `user_profiles`. `publicName` is the public-facing astrologer name and can differ from the account display name.

## Domain

Add `packages/domain/src/astrologer-profile/`.

Types:

- `AstrologerProfile`
- `AstrologerProfileCreateInput`
- `AstrologerProfileUpdatePatch`
- `AstrologerProfileStore`

Use cases:

- `getAstrologerProfile({ store, ownerUserId })`
- `upsertAstrologerProfile({ store, ownerUserId, input, now })`
- `updateAstrologerProfile({ store, ownerUserId, patch, now })`

Rules:

- `ownerUserId` is always taken from the authenticated session, never from request body.
- `publicHandle` is normalized to lowercase and trimmed.
- Empty optional strings normalize to `null`.
- `consultationLanguages` is a unique, non-empty list of BCP-47-like language tags for this slice.
- Profile updates are partial; omitted fields are unchanged.
- A missing profile returns `null` for reads and is created by the upsert command.
- Handle collisions raise a domain-specific conflict error.

## Contracts

Add `packages/contracts/src/astrologer-profile.ts`.

Schemas:

- `astrologerProfileResponseSchema`
- `getAstrologerProfileResponseSchema`
- `upsertAstrologerProfileRequestSchema`
- `updateAstrologerProfileRequestSchema`

The response returns `profile: AstrologerProfileResponse | null` for `GET /astrologer-profile/me`.

Update request fields are partial and strict. It must not accept `ownerUserId`, role fields, verification state, payout state, or public-page block configuration.

## Astrologer API

Add `apps/astrologer-api/src/modules/astrologer-profile/`.

Files:

- `astrologer-profile.module.ts`
- `astrologer-profile.controller.ts`
- `astrologer-profile.service.ts`
- `astrologer-profile.tokens.ts`
- focused unit/e2e tests following the existing Products and Dictionary style

Routes:

- `GET /astrologer-profile/me`
- `PUT /astrologer-profile/me`

Security:

- Both routes require `AstrologerSessionAuthGuard`.
- `PUT` requires `@RequireCsrf()`.
- No idempotency key is required because this command does not create booking, order, or payment state.

Composition:

- The module injects a Drizzle adapter created from `PostgresRuntimeService`.
- The root `AppModule` imports `AstrologerProfileModule`.
- Controllers stay thin and delegate contract parsing and domain error mapping to the service layer, matching the existing Products pattern.

## Frontend Follow-Up

The first implementation pass can stop at backend/contracts if needed. The next frontend pass should add:

- `apps/astrologer-web/src/features/astrologer-profile/` API and React Query hooks.
- Header profile summary backed by `GET /astrologer-profile/me`, falling back to current identity display name only when no profile exists.
- A minimal settings/profile form backed by `PUT /astrologer-profile/me`.

The full onboarding wizard remains a later feature that composes this profile module with Products, Availability, Verification, Payouts, and PlatformPlans rather than storing a single generic onboarding blob.

## Testing

Run focused tests before broader package validation:

- Contract schema tests for valid responses, strict request parsing, normalization, and forbidden fields.
- Domain tests for handle normalization, partial updates, unique language validation, and conflict mapping.
- DB adapter tests for create/update/read, unique handle conflicts, owner isolation, and cascade behavior where practical.
- API tests for auth requirement, CSRF on mutation, response shape, update behavior, invalid body handling, and handle conflict response.
- Export tests for `packages/domain`, `packages/contracts`, and `packages/db`.

Expected broader verification:

- `pnpm --filter @elevenhouse/domain test`
- `pnpm --filter @elevenhouse/contracts test`
- `pnpm --filter @elevenhouse/db test`
- `pnpm --filter @elevenhouse/astrologer-api test`
- relevant typecheck/build commands for touched packages/apps

## Acceptance Criteria

- `AstrologerProfile` exists as a real domain module, not API-local CRUD.
- `astrologer-api` exposes authenticated profile read/update endpoints with shared contracts.
- DB persistence enforces owner identity and handle uniqueness.
- No public/client surface is added in this slice.
- No admin, booking, order, payment, wallet, notification, or analytics workflow is introduced.
- Existing Products and Dictionary surfaces remain untouched except for shared exports if necessary.

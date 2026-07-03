# Astrologer Profile Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the authenticated `AstrologerProfile` backend foundation for astrologers.

**Architecture:** Add a domain module, shared contract schemas, Drizzle persistence, and an `astrologer-api` feature module. Keep public direct-link reads, onboarding UI, media uploads, payments, booking, and admin workflows out of this slice.

**Tech Stack:** TypeScript, Zod contracts, Nest.js feature modules, Drizzle ORM, PostgreSQL, Vitest.

---

## File Structure

- Create `packages/contracts/src/astrologer-profile.ts` for request/response schemas and inferred types.
- Modify `packages/contracts/src/index.ts` and `packages/contracts/src/index.test.ts` to export the contract.
- Create `packages/contracts/src/astrologer-profile.test.ts` for schema behavior.
- Create `packages/domain/src/astrologer-profile/` with domain types, store port, errors, use cases, and tests.
- Modify `packages/domain/src/index.ts` to export the domain module.
- Create `packages/db/src/schema/astrologer-profile/` with table schema and exports.
- Modify `packages/db/src/schema/index.ts`, `packages/db/src/schema.test.ts`, `packages/db/package.json`, and migration files for schema/export coverage.
- Create `packages/db/src/adapters/astrologer-profile/` with the Drizzle adapter and tests.
- Create `apps/astrologer-api/src/modules/astrologer-profile/` with Nest module, tokens, service, controller, and tests.
- Modify `apps/astrologer-api/src/app.module.ts` to import the feature module.

## Tasks

### Task 1: Contracts

**Files:**
- Create: `packages/contracts/src/astrologer-profile.ts`
- Create: `packages/contracts/src/astrologer-profile.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/index.test.ts`

- [ ] Write failing tests for response parsing, strict update parsing, handle normalization, and forbidden `ownerUserId`.
- [ ] Run `pnpm test packages/contracts/src/astrologer-profile.test.ts packages/contracts/src/index.test.ts`.
- [ ] Implement contract schemas and exports.
- [ ] Re-run the focused contract tests.
- [ ] Commit with `feat: add astrologer profile contracts`.

### Task 2: Domain

**Files:**
- Create: `packages/domain/src/astrologer-profile/astrologer-profile-types.ts`
- Create: `packages/domain/src/astrologer-profile/astrologer-profile-store.ts`
- Create: `packages/domain/src/astrologer-profile/astrologer-profile-errors.ts`
- Create: `packages/domain/src/astrologer-profile/astrologer-profile-use-cases.ts`
- Create: `packages/domain/src/astrologer-profile/index.ts`
- Create: `packages/domain/src/astrologer-profile/index.test.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] Write failing tests for handle normalization, optional string normalization, unique consultation languages, partial updates, and conflict propagation.
- [ ] Run `pnpm test packages/domain/src/astrologer-profile/index.test.ts`.
- [ ] Implement types, errors, store port, and use cases.
- [ ] Re-run focused domain tests.
- [ ] Commit with `feat: add astrologer profile domain`.

### Task 3: DB Schema And Adapter

**Files:**
- Create: `packages/db/src/schema/astrologer-profile/astrologer-profiles.schema.ts`
- Create: `packages/db/src/schema/astrologer-profile/index.ts`
- Create: `packages/db/src/adapters/astrologer-profile/drizzle-astrologer-profile-store.ts`
- Create: `packages/db/src/adapters/astrologer-profile/index.ts`
- Create: `packages/db/src/adapters/astrologer-profile/drizzle-astrologer-profile-store.integration.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/schema.test.ts`
- Modify: `packages/db/package.json`
- Modify: `packages/db/drizzle/0000_dazzling_metal_master.sql`
- Modify: `packages/db/drizzle/meta/0000_snapshot.json`

- [ ] Write failing schema/export tests and adapter integration tests.
- [ ] Run `pnpm test packages/db/src/schema.test.ts packages/db/src/adapters/astrologer-profile/drizzle-astrologer-profile-store.integration.ts`.
- [ ] Implement schema, migration, package exports, and Drizzle adapter.
- [ ] Re-run focused DB tests.
- [ ] Commit with `feat: persist astrologer profiles`.

### Task 4: Astrologer API Module

**Files:**
- Create: `apps/astrologer-api/src/modules/astrologer-profile/astrologer-profile.tokens.ts`
- Create: `apps/astrologer-api/src/modules/astrologer-profile/astrologer-profile.module.ts`
- Create: `apps/astrologer-api/src/modules/astrologer-profile/astrologer-profile.service.ts`
- Create: `apps/astrologer-api/src/modules/astrologer-profile/astrologer-profile.controller.ts`
- Create: `apps/astrologer-api/src/modules/astrologer-profile/astrologer-profile.service.test.ts`
- Modify: `apps/astrologer-api/src/app.module.ts`

- [ ] Write failing service/controller tests for authenticated read, CSRF-protected update wiring, invalid body handling, and handle conflict mapping.
- [ ] Run `pnpm test apps/astrologer-api/src/modules/astrologer-profile/astrologer-profile.service.test.ts`.
- [ ] Implement module, service, controller, tokens, and root module import.
- [ ] Re-run focused API tests.
- [ ] Commit with `feat: expose astrologer profile api`.

### Task 5: Final Verification

**Files:**
- All touched files.

- [ ] Run `pnpm test packages/contracts/src/astrologer-profile.test.ts packages/domain/src/astrologer-profile/index.test.ts packages/db/src/schema.test.ts packages/db/src/adapters/astrologer-profile/drizzle-astrologer-profile-store.integration.ts apps/astrologer-api/src/modules/astrologer-profile/astrologer-profile.service.test.ts`.
- [ ] Run `pnpm --filter @elevenhouse/contracts typecheck`.
- [ ] Run `pnpm --filter @elevenhouse/domain typecheck`.
- [ ] Run `pnpm --filter @elevenhouse/db typecheck`.
- [ ] Run `pnpm --filter @elevenhouse/astrologer-api typecheck`.
- [ ] Run relevant builds for touched packages/apps.
- [ ] Inspect `git status --short` and `git log --oneline -5`.

## Self-Review

- The plan covers the approved spec: contracts, domain, DB, API, tests, exports, and verification.
- The plan deliberately excludes public-api, client-web, onboarding wizard UI, media upload, booking, payment, admin, wallet, notification, and analytics work.
- Type names and route names match the spec.
- Each task can be verified independently.

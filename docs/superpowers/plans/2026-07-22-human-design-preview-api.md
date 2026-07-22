# Human Design Preview API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first server-owned Human Design preview boundary that validates resolved planetary longitudes, calculates an individual base result through `packages/domain`, and returns a strict shared contract from `astrologer-api`.

**Architecture:** Human Design arithmetic remains in `packages/domain`; `packages/contracts` owns DTO schemas; `apps/astrologer-api` owns authenticated route parsing and error translation. This slice is read-only and does not persist calculations, hydrate CRM birth data, call chart-worker, generate AI text, render PDFs, or create UI.

**Tech Stack:** TypeScript, NestJS feature module pattern, `@elevenhouse/validation`/Zod, Vitest.

## Global Constraints

- Work in the existing `main` checkout; do not create a worktree, switch branches, stash, rebase, or reset.
- Preserve unowned dirty changes in `docs/api/api-boundaries.md`, `docs/architecture/backend-modules.md`, `packages/contracts/src/index.ts`, `packages/domain/src/index.ts`, DB files, and messaging files.
- `POST /human-design/preview` is authenticated and read-only; it must not require CSRF and must not write calculation, participant-link, AI, artifact, outbox, or DB rows.
- Frontend/browser birth-data entry and ephemeris resolution are out of scope for this slice; the request accepts provider-resolved personality/design longitudes only.
- No frontend UI completion claim is allowed in this slice.

---

## Research

Question:
What is the safest first API/contract boundary for Human Design without introducing persistence or browser-side calculation?

Decision affected:
Shared contract and `astrologer-api` module shape for Human Design preview.

Accessed: 2026-07-22

### Sources

- `docs/api/api-boundaries.md` - repository API truth: read-only numerology/matrix preview routes are authenticated POST endpoints without CSRF, while state-changing routes require CSRF.
- `docs/architecture/backend-modules.md` - repository architecture truth: calculations are domain/module-owned; controllers orchestrate and must not hold workflow logic.
- `docs/decisions/0003-nestjs-modular-backend.md` - accepted ADR: Nest backend logic uses feature modules and thin controllers.
- `docs/decisions/0007-cookie-auth-csrf-and-idempotency.md` - accepted ADR: cookie-auth state-changing routes require route security metadata; read-only previews do not mutate state.
- `packages/contracts/src/charts.ts` and `packages/contracts/src/numerology.ts` - current implementation evidence for shared Zod schemas and safe input/result separation.
- `packages/domain/src/human-design/*` - current implementation evidence for deterministic Human Design base result from resolved longitudes.

### Findings

- Repository evidence: preview contracts already live in `packages/contracts` as strict Zod schemas and backend services parse unknown request bodies before invoking domain logic.
- Repository evidence: `POST /numerology/preview` and `POST /matrix/preview` are authenticated read-only endpoints and do not require CSRF.
- Repository evidence: chart calculation request separates browser-facing request from private provider input snapshot; Human Design should not accept raw birth data until ephemeris resolution is wired server-side.
- Inference: The first Human Design API should accept only resolved longitudes so the frontend cannot become the arithmetic authority and later chart-worker/provider integration can replace the input source without changing result semantics.

### Options

1. Contracts-only slice: lowest risk, but no observable API boundary for downstream integration.
2. Authenticated resolved-longitude preview route: small production boundary, testable without DB/process lifecycle, preserves server authority.
3. Full CRM birth-data and ephemeris route: closer to final product but prematurely mixes Charts, BirthData, queue/provider behavior, persistence, and Human Design result concerns.

### Recommendation

Implement option 2 now. It gives a strict server/API seam for frontend and future chart-worker integration while keeping this commit read-only and deterministic.

### Rejected alternatives

- Contracts-only: rejected because the next consumer still would not have an API behavior to call.
- Full CRM/provider route: rejected for this slice because it requires chart-worker/ephemeris input ownership and DB/client hydration decisions that should be implemented as separate tested slices.

### User decisions

none

## Progress

- [x] 2026-07-22: Domain Human Design base engine exists and is committed through input fingerprint/checksum.
- [x] 2026-07-22: Add shared preview request/response contracts.
- [x] 2026-07-22: Add astrologer-api Human Design preview service/controller/module.
- [x] 2026-07-22: Wire module into `AstrologerApi` root module.
- [x] 2026-07-22: Run targeted contract/API/domain checks and commit only owned paths.

## Outcomes & Retrospective

Implemented in this slice:

- Shared Human Design preview request/response schemas in `packages/contracts`.
- Authenticated read-only `POST /human-design/preview` in `astrologer-api`.
- Canonical docs updated for route, backend module ownership and design inventory readiness.
- Service and HTTP route tests cover validation, auth requirement, CSRF-exempt preview behavior and schema-valid deterministic domain result.

Remaining future contours:

- CRM birth-data hydration and ephemeris/provider resolution.
- Persistence through `Calculations`.
- Compatibility, transits, AI interpretation, PDF export and visible frontend.

## Context and Orientation

`packages/domain/src/human-design/individual.ts` exposes `buildHumanDesignIndividualBaseResult(input)` where `input` is `{ personality, design }` and both sides contain base longitudes for `sun`, `moon`, `north_node`, `mercury`, `venus`, `mars`, `jupiter`, `saturn`, `uranus`, `neptune`, and `pluto`. Earth and South Node are derived inside domain.

The new contract file should be `packages/contracts/src/human-design.ts`; tests should live in `packages/contracts/src/human-design.test.ts`. The API files should live under `apps/astrologer-api/src/modules/human-design/`.

## Interfaces and Dependencies

- Consumes: `buildHumanDesignIndividualBaseResult(input: BuildHumanDesignActivationsInput): HumanDesignIndividualBaseResult` from `@elevenhouse/domain`.
- Produces: `humanDesignPreviewRequestSchema`, `humanDesignIndividualResultSchema`, `humanDesignPreviewResponseSchema`, `type HumanDesignPreviewRequest`, and `type HumanDesignPreviewResponse`.
- Produces: `HumanDesignService.preview(body, request): Promise<HumanDesignPreviewResponse>`.
- Produces: `POST /human-design/preview`.

## Plan of Work

### Task 1: Shared contracts

**Files:**
- Create: `packages/contracts/src/human-design.ts`
- Create: `packages/contracts/src/human-design.test.ts`
- Modify: `packages/contracts/src/index.ts` only for the Human Design export hunk if safe

- [ ] Write a failing test that accepts a complete resolved-longitudes preview request and strict full response shape.
- [ ] Run `pnpm exec vitest run --config vitest.config.ts packages/contracts/src/human-design.test.ts` and confirm the missing-schema failure.
- [ ] Implement strict Zod schemas for longitudes, activations, defined gates/channels/centers, mechanics, profile, checksums, and preview response.
- [ ] Add the public barrel export with hunk staging only, preserving existing `messaging` export.
- [ ] Re-run the targeted contract test.

### Task 2: Astrologer API preview module

**Files:**
- Create: `apps/astrologer-api/src/modules/human-design/human-design-http-errors.ts`
- Create: `apps/astrologer-api/src/modules/human-design/human-design.service.ts`
- Create: `apps/astrologer-api/src/modules/human-design/human-design.controller.ts`
- Create: `apps/astrologer-api/src/modules/human-design/human-design.module.ts`
- Create: `apps/astrologer-api/src/modules/human-design/human-design.service.test.ts`
- Modify: `apps/astrologer-api/src/app.module.ts`

- [ ] Write a failing service test that `preview` validates the request, requires an astrologer session, calculates through domain, and returns a schema-valid response.
- [ ] Run `pnpm exec vitest run --config vitest.config.ts apps/astrologer-api/src/modules/human-design/human-design.service.test.ts` and confirm missing-module failure.
- [ ] Implement thin controller, service, error mapper, and feature module.
- [ ] Import `HumanDesignModule` in `apps/astrologer-api/src/app.module.ts`.
- [ ] Re-run the targeted service test.

## Concrete Steps

Run commands from `/Users/anton/Finext/ElevenHouse`.

1. `git branch --show-current && git status --short && git diff --cached --name-status`
2. `pnpm exec vitest run --config vitest.config.ts packages/contracts/src/human-design.test.ts`
3. `pnpm exec vitest run --config vitest.config.ts apps/astrologer-api/src/modules/human-design/human-design.service.test.ts`
4. `pnpm --filter @elevenhouse/contracts typecheck`
5. `pnpm --filter @elevenhouse/astrologer-api typecheck`
6. `pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design packages/contracts/src/human-design.test.ts apps/astrologer-api/src/modules/human-design/human-design.service.test.ts`
7. `pnpm docs:check:test`
8. `pnpm docs:check`
9. `git diff --check -- <owned paths>`

## Validation and Acceptance

- Contract tests prove strict request/response parsing and rejection of browser-supplied birth data fields.
- Service tests prove authentication requirement, validation error translation, and deterministic response schema from domain.
- Typecheck proves contracts and API compile together.
- Runtime/browser/design parity are not applicable in this slice because no visible UI is created and no service lifecycle authority was requested.

## Idempotence and Recovery

All new behavior is read-only. If a test fails, inspect the failing contract/API file and re-run only the targeted command before broad verification. Do not reset, stash, or unstage unrelated work.

## Artifacts and Notes

Owned paths are limited to Human Design contract/API files, this plan, and exact Human Design export/import hunks.

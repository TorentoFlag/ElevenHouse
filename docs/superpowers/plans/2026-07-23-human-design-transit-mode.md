# Human Design Transit Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the next Human Design end-state mode: `Транзиты` as a read-only
overlay for one owner-scoped saved individual Human Design calculation at a
selected/current instant.

**Architecture:** Reuse the existing individual result as natal authority.
Resolve one transit moment through the chart-engine positions endpoint, map
those longitudes to Human Design gates/lines without a Design side, and derive
transit-completed channels plus temporarily defined centers in
`packages/domain/src/human-design`. The first API contour is authenticated and
side-effect free: no saved transit records, no browser arithmetic and no
third-party Human Design runtime.

**Tech Stack:** TypeScript, Zod contracts, NestJS `astrologer-api`,
`@elevenhouse/domain`, chart-engine positions provider, React Query, Vitest,
authenticated Chrome verification when `astrologer-api` is live.

## Research

Accessed: 2026-07-23.

Sources:

- `docs/superpowers/specs/2026-07-21-human-design-production-design.md` -
  approved end-state: one selected instant, no Design side for transit,
  transit-completed channels and temporarily defined centers.
- https://roxyapi.com/products/human-design-api - provider docs describe
  today's planetary overlay and channels temporarily completed by transit.
- https://www.geneticmatrix.com/learn-hub/transits/index.html - transit
  overview describes current planetary field activating gates, lines, channels
  and temporary definition.
- https://humandesign-api.com/pt/guides/human-design-transit/ - API guide
  treats transit data as current/selected planetary positions mapped onto the
  bodygraph and personalized by overlaying the natal chart.
- https://www.mybodygraph.com/ - product surface exposes current transit and
  forecast tools as a separate mode from natal charts.

Findings:

- Repository evidence: chart-engine already exposes `/v1/positions`, and the
  Human Design pipeline already maps base planetary longitudes to gates/lines.
- Repository evidence: the Human Design spec explicitly says transit overlay
  has no Design side.
- Sourced fact: external providers and products treat transits as a separate
  overlay mode, not as a persisted natal chart variant.
- Inference: v1 should not store transit calculations as
  `calculation_records`; it should compute from the current saved individual
  checksum and return a typed read model.

## Progress

- [x] 2026-07-23: Plan created after compatibility slice; runtime visual QA for
  compatibility is blocked by stopped local `astrologer-api`, but transit domain
  and contract work can proceed with tests.
- [x] 2026-07-23: Task 1 domain transit overlay implemented with transit-only
  activations, completed channels, temporary centers, stable input fingerprint
  and result checksum.
- [x] 2026-07-23: Task 2 shared contracts and read-only `astrologer-api`
  transit route implemented with focused service and HTTP e2e coverage.
- [x] 2026-07-23: Task 3 frontend API/query foundation added for read-only
  transit overlay fetch; visual controller/view mode is next.

## Decision Log

- 2026-07-23, agent: Implement `Транзиты` before PDF/AI/presentation/client
  delivery because it is a true Human Design mode and reuses the existing
  chart-engine positions boundary.
- 2026-07-23, agent: Keep transit v1 read-only and non-persisted. Persisting
  recurring daily transit history is out of scope until product retention and
  notification requirements are approved.

## Plan of Work

### Task 1: Domain Transit Overlay

**Files:**

- Create: `packages/domain/src/human-design/transit.ts`
- Create: `packages/domain/src/human-design/transit.test.ts`
- Modify: `packages/domain/src/human-design/index.ts`

**Interfaces:**

- Consumes: `HumanDesignIndividualBaseResult` and one
  `HumanDesignBasePlanetaryLongitudes` object for the selected transit instant.
- Produces: `HumanDesignTransitResult` with transit activations,
  completed channels, temporarily defined centers, input fingerprint and result
  checksum.

- [x] **Step 1: Red tests for no-design-side overlay**

Cover:

- transit activations are side `transit`, one per active body;
- the result does not add `design` activations for transit;
- a natal hanging gate plus a transit opposite gate creates a completed channel;
- a completed channel can temporarily define a natal-undefined center;
- checksum/fingerprint are stable for the same natal checksum and transit
  snapshot.

Observed 2026-07-23: focused transit test first failed with
`Cannot find module './transit'`.

- [x] **Step 2: Implement pure domain builder**

Add:

```ts
buildHumanDesignTransitResult({
  natal,
  transit,
  transitSnapshot
})
```

where `transitSnapshot` is explicit server-side date/time/timezone/location
metadata, not browser-local state.

- [x] **Step 3: Verify domain surface**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design/transit.test.ts
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design
pnpm --filter @elevenhouse/domain typecheck
```

Observed 2026-07-23: `packages/domain/src/human-design/transit.test.ts`
passed with 2 tests; the full Human Design domain suite passed with 18 files
and 56 tests; `@elevenhouse/domain typecheck` passed.

### Task 2: Contract And Read-Only API

**Files:**

- Modify: `packages/contracts/src/human-design.ts`
- Modify: `packages/contracts/src/human-design.test.ts`
- Modify: `apps/astrologer-api/src/modules/human-design/human-design.controller.ts`
- Modify: `apps/astrologer-api/src/modules/human-design/human-design.service.ts`
- Modify: `apps/astrologer-api/src/modules/human-design/human-design.service.test.ts`
- Modify: `apps/astrologer-api/src/modules/human-design/human-design.e2e.test.ts`

Route:

```text
GET /human-design/calculations/:calculationId/transits?instant=...
```

The route is authenticated, owner-scoped, side-effect free and only accepts
current non-archived saved `mode = individual` Human Design calculations.

Observed 2026-07-23: `humanDesignTransitQuerySchema`,
`humanDesignTransitResultSchema` and `humanDesignTransitResponseSchema` added
without adding transit to persisted `humanDesignResultSchema`. `GET
/human-design/calculations/:calculationId/transits?instant=...` is
authenticated, CSRF-exempt, owner-scoped, uses saved individual result as natal
authority, resolves only transit positions through chart-engine and does not
create or replace calculation records. Focused contracts/service/e2e tests
passed with 3 files and 36 tests; `@elevenhouse/contracts typecheck` and
`@elevenhouse/astrologer-api typecheck` passed.

### Task 3: Frontend Transit Mode

**Files:**

- Modify: `apps/astrologer-web/src/pages/human-design/HumanDesignPageView.tsx`
- Modify: `apps/astrologer-web/src/pages/human-design/useHumanDesignPageController.ts`
- Modify: `apps/astrologer-web/src/features/human-design/api/humanDesignApi.ts`
- Modify: `apps/astrologer-web/src/features/human-design/model/humanDesignViewModel.ts`
- Modify: focused tests under `apps/astrologer-web/src/features/human-design`
  and `apps/astrologer-web/src/pages/human-design`.

The first UI state enables the `Транзиты` tab only after an individual result is
loaded or saved, exposes selected instant controls, fetches read-only transit
data and renders completed channels/temporary centers without browser
calculation.

Observed 2026-07-23: `getHumanDesignTransit` validates `calculationId` and
optional `instant`, calls `GET
/human-design/calculations/:calculationId/transits`, parses
`humanDesignTransitResponseSchema`, and is exposed through a React Query
mutation for on-demand read-only fetches. Focused frontend API/query tests pass.

### Task 4: Runtime And Visual Evidence

Run only when `astrologer-api` is listening on `3002`:

- authenticated `/human-design` individual calculation;
- open `Транзиты`;
- fetch transit overlay;
- desktop/mobile screenshots;
- no horizontal overflow;
- console/network clean.

## Acceptance

- Domain transit result is deterministic and tested.
- API route is read-only, authenticated and owner-scoped.
- UI does not compute transit mechanics in browser.
- Runtime visual acceptance remains blocked until the local API process is
  running again.

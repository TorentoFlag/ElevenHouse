# Human Design Resolved Input Provider Implementation Plan

> **For agentic workers:** This plan is self-contained for the chart-worker
> slice that binds chart-engine positions to the Human Design Design-moment
> solver. Continue in shared `main`; do not create branches/worktrees or stage
> unrelated dirty files.

**Goal:** Build the internal worker-level resolver that turns a calculation-ready
birth snapshot into the `personality` and `design` longitude input consumed by
the Human Design domain engine.

**Architecture:** `packages/chart-engine-client` binds provider I/O to domain
math. It calls chart-engine `/v1/positions` for the birth moment, injects
chart-engine Sun longitudes into `resolveHumanDesignDesignMoment`, then calls
`/v1/positions` again for the resolved Design moment. `packages/domain` remains
the Human Design mechanics authority; `apps/chart-engine` remains the ephemeris
provider runtime; deployable apps consume the shared package instead of
importing each other.

**Tech Stack:** TypeScript, Vitest, `Intl.DateTimeFormat`, existing contracts and
domain package.

## Global Constraints

- Work only in owned paths for this slice.
- Do not add DB persistence, queue jobs, public/browser API or UI in this slice.
- Do not approximate the Design side as 88 calendar days; use the domain
  solar-arc solver.
- Keep provider settings explicit: tropical zodiac and true node by default.
- Preserve the birth timezone when asking chart-engine for the Design moment.
- Current chart snapshots are minute-granular (`HH:mm`), so this binding uses a
  one-minute solver tolerance until a future instant/seconds provider contract
  is approved.

---

## Research

Question:
How should chart-worker bind arbitrary-moment chart-engine positions to the
Human Design Design-moment solver without collapsing birth timezone semantics?

Decision affected:
Worker/provider boundary for Human Design resolved-longitude input.

Accessed: 2026-07-22

### Sources

- `docs/superpowers/plans/2026-07-22-human-design-positions-provider.md` -
  repository evidence for the private `/v1/positions` contract.
- `docs/superpowers/plans/2026-07-22-human-design-design-moment-solver.md` -
  repository evidence for the injected Sun longitude solver.
- `packages/contracts/src/charts.ts` - repository evidence that
  `ChartInputSnapshot.birthTime` is `HH:mm`.
- `packages/domain/src/human-design/activations.ts` - repository evidence that
  Human Design domain expects only 11 base body longitudes and derives Earth and
  South Node.
- [MDN `Intl.DateTimeFormat`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/DateTimeFormat) -
  official JavaScript documentation for IANA `timeZone` formatting options.
- [MDN `formatToParts`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/formatToParts) -
  official JavaScript documentation for extracting locale-aware date/time parts.

### Findings

- Repository evidence: chart-engine positions already accepts the same
  calculation-ready local birth snapshot used by natal charts.
- Repository evidence: Human Design domain accepts an injected Sun longitude
  provider, so chart-worker can bind provider I/O without importing app/runtime
  code into domain.
- Repository evidence: current `ChartInputSnapshot.birthTime` cannot represent
  seconds; a five-second provider-level search would imply precision the current
  contract cannot carry.
- Sourced fact: JavaScript `Intl.DateTimeFormat` supports formatting dates for a
  requested IANA time zone, and `formatToParts()` returns structured date/time
  parts usable for canonical `YYYY-MM-DD` and `HH:mm` snapshots.
- Inference: a bounded local-minute scan avoids adding a new time library to
  chart-worker while preserving IANA timezone and DST fold semantics at the
  current minute-level contract.

### Options

1. Bind solver in `astrologer-api`: simpler first API integration, but it puts
   repeated provider calls in an authenticated request path and couples API to
   ephemeris search mechanics.
2. Bind solver in `apps/chart-worker`: matches existing provider/async boundary,
   keeps domain pure and prepares persisted recalculation jobs.
3. Extend chart-engine contract to accept ISO instants now: best long-term
   precision, but it changes provider contract across TypeScript and Python and
   is larger than the current slice.

### Recommendation

Use option 2 now, with explicit one-minute tolerance. It creates the production
composition seam needed by future API and persisted calculations while keeping
the contract honest about current precision.

### Rejected alternatives

- API-owned resolver: rejected for now because Human Design will need durable
  calculation jobs and provider retries, which belong in worker/provider
  boundaries.
- ISO-instant contract in this slice: rejected because it is a separate
  cross-runtime contract change; keep it as the next precision upgrade before
  variables/tone/color/base.

### User decisions

none

## Progress

- [x] 2026-07-22: Write failing worker test for resolved personality/design
  longitudes through chart-engine positions.
- [x] 2026-07-22: Implement chart-worker resolver with default tropical/true-node
  settings.
- [x] 2026-07-22: Preserve birth timezone when converting a resolved Design
  instant back into a chart-engine input snapshot.
- [x] 2026-07-22: Run targeted checks and commit only owned paths.
- [x] 2026-07-22: Extract chart-engine HTTP client and Human Design resolver
  into `packages/chart-engine-client` so API and worker can share the provider
  boundary without app-to-app imports.
- [x] 2026-07-22: Wire `POST /human-design/preview` to accept owner-scoped CRM
  `clientId`, hydrate ready birth data and resolve positions through the shared
  chart-engine provider package.
- [x] 2026-07-22: Complete local browser E2E for the individual CRM-client
  flow after restarting the stale chart-engine process: preview, persist,
  saved-list reopen and recalculation all returned successful network responses.

## Context and Orientation

Owned files for this slice:

- `packages/chart-engine-client/src/chart-engine-client.ts`
- `packages/chart-engine-client/src/chart-engine-client.test.ts`
- `packages/chart-engine-client/src/human-design-resolved-input.ts`
- `packages/chart-engine-client/src/human-design-resolved-input.test.ts`
- `packages/chart-engine-client/src/index.ts`
- `packages/chart-engine-client/package.json`
- `packages/chart-engine-client/tsconfig.json`
- `packages/chart-engine-client/tsconfig.build.json`
- `apps/astrologer-api/src/modules/human-design/human-design.service.ts`
- `apps/astrologer-api/src/modules/human-design/human-design.service.test.ts`
- `apps/astrologer-api/src/modules/human-design/human-design.e2e.test.ts`
- `apps/astrologer-api/src/modules/human-design/human-design.module.ts`
- `apps/astrologer-api/src/modules/human-design/human-design.tokens.ts`
- `apps/astrologer-api/src/modules/human-design/human-design-resolved-input.provider.ts`
- `apps/astrologer-api/src/config/runtime-config.ts`
- `apps/astrologer-api/src/config/runtime-config.test.ts`
- `apps/astrologer-api/package.json`
- `packages/contracts/src/human-design.ts`
- `packages/contracts/src/human-design.test.ts`
- `apps/chart-worker/src/main.ts`
- `apps/chart-worker/src/chart-jobs.processor.ts`
- `apps/chart-worker/src/chart-jobs.processor.test.ts`
- `apps/chart-worker/package.json`
- `pnpm-lock.yaml`
- `vitest.config.ts`
- `docs/superpowers/plans/2026-07-22-human-design-resolved-input-provider.md`

Existing unowned dirty files in docs/contracts/db/domain/frontend must remain
unstaged unless this slice explicitly touches them.

## Interfaces and Dependencies

Produces:

- `@elevenhouse/chart-engine-client`
- `ChartEngineHttpClient`
- `resolveHumanDesignResolvedInput(input)`
- `HumanDesignPositionsChartEngine`
- `HumanDesignResolvedInput`
- `POST /human-design/preview` CRM request shape:
  `{ mode, methodCode, source: "client", clientId }`

Consumes:

- `ChartPlanetaryPositionsRequestInput`
- `ChartPlanetaryPositionsResponse`
- `resolveHumanDesignDesignMoment`
- `BuildHumanDesignActivationsInput`

## Plan of Work

1. Add worker unit coverage for UTC and non-UTC birth snapshots.
2. Implement provider request orchestration and base-body mapping.
3. Add canonical local-minute timezone conversion helpers.
4. Verify worker tests, affected chart-engine client/domain tests and typecheck
   where possible.
5. Commit exact owned paths only.

## Validation and Acceptance

- Resolver test proves two output sides are assembled from provider-backed
  positions.
- Resolver test proves Design moment positions preserve the original birth
  timezone.
- Existing chart-engine client tests continue to prove `/v1/positions` request
  and response parsing.
- Domain Design-moment tests continue to prove solar-arc search behavior.

## Idempotence and Recovery

This slice is read-only and has no DB, queue or external side effects. Re-run
targeted tests after any resolver, chart contract or solver change. If a future
seconds/instant contract is added, reduce resolver tolerance and replace the
minute snapshot formatter with an instant-capable provider request.

## Artifacts and Notes

Next slice should expose this resolver to the API/job orchestration boundary so
Human Design preview can hydrate CRM birth data instead of accepting manual
resolved longitudes.

## Outcomes & Retrospective

Implemented in this slice:

- `packages/chart-engine-client/src/human-design-resolved-input.ts` now
  composes the chart-engine positions provider with the Human Design 88-degree
  solar-arc solver.
- `apps/chart-worker` now imports `ChartEngineHttpClient` and
  `ChartEnginePermanentError` from `@elevenhouse/chart-engine-client`.
- `apps/astrologer-api` now wires `POST /human-design/preview` to owner-scoped
  CRM birth data via `ClientStore`, validates readiness with the chart birth
  data readiness guard and calls the shared chart-engine provider package.
- The preview route remains authenticated, read-only and CSRF-exempt; raw
  browser birth date/time/timezone/place fields remain rejected by the contract.
- The resolver returns the exact `BuildHumanDesignActivationsInput` shape used
  by the domain engine plus provider evidence for the personality and design
  calls.
- UTC and Europe/Moscow tests prove that the Design moment request preserves the
  original birth timezone and remains minute-granular under the current chart
  snapshot contract.
- Local browser E2E on `/human-design` with astrologer
  `c6b1c066-c65d-41f1-918f-e5149519729d` and CRM client
  `22222222-2222-4222-8222-222222222222` produced persisted calculation
  `d114b7d4-f221-4173-be4c-5f26e72a5161`. Network evidence showed
  `POST /api/human-design/preview` -> `200`,
  `POST /api/human-design/calculations` -> `201` and
  `POST /api/human-design/calculations/:id/recalculate` -> `200`. The saved DB
  record is `module = human_design`, `mode = individual`,
  `method_code = human_design_classic`, `status = linked`, with result summary
  `projector`, `2/5`, `emotional`, `split`.

Remaining future contours:

- Add an instant/seconds-capable positions contract before implementing
  variables, tone, color or base.
- External fixture comparison against trusted Human Design calculators before
  treating method accuracy as product-complete across edge dates.
- Mobile/responsive visual QA and screenshot evidence for the authenticated
  production route. The 2026-07-22 Chrome DevTools MCP attempt could inspect
  network/DOM/console, but file screenshot writes were blocked by the MCP
  workspace-root configuration.
- AI interpretation, PDF export, compatibility and transit contours.

# Human Design Positions Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the internal planetary positions provider boundary needed by Human Design birth/design moment resolution.

**Architecture:** `apps/chart-engine` owns provider-backed arbitrary-moment longitudes through a private `/v1/positions` endpoint. `packages/contracts/src/charts.ts` owns the TypeScript request/response schema, and `apps/chart-worker` gets a typed HTTP client method. Human Design domain remains the only bodygraph mechanics authority; this slice does not solve the 88-degree solar arc yet.

**Tech Stack:** Python FastAPI/Pydantic/Kerykeion, TypeScript Zod contracts, Vitest.

## Global Constraints

- Work in shared `main` checkout and do not touch unowned messaging/DB/design QA changes.
- Return only Human Design base bodies: Sun, Moon, North Node, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune and Pluto.
- Do not return houses, aspects, Ascendant, Midheaven, Earth or South Node from this positions endpoint.
- Do not persist, enqueue or expose this as a public/browser API in this slice.

---

## Research

Question:
What provider boundary should support future Human Design birth and Design-side longitude resolution?

Decision affected:
Internal chart-engine and chart-worker contract for arbitrary-moment planetary positions.

Accessed: 2026-07-22

### Sources

- `docs/superpowers/specs/2026-07-21-human-design-production-design.md` - selected architecture: Human Design engine over ephemeris provider, exact 88-degree solar arc, chart-engine positions provider.
- `apps/chart-engine/src/chart_engine/kerykeion_adapter.py` - current repository evidence for Kerykeion-backed natal calculations.
- `apps/chart-worker/src/chart-engine-client.ts` - current repository evidence for typed private chart-engine HTTP calls.
- `packages/contracts/src/charts.ts` - current repository evidence for shared chart request/result schemas.

### Findings

- Repository evidence: natal chart calculation already returns points, houses, aspects and chart render metadata through `/v1/natal`.
- Repository evidence: Human Design needs only base planetary longitudes for a given instant; Earth and South Node are derived in `packages/domain/src/human-design`.
- Inference: a narrow `/v1/positions` endpoint avoids overloading natal chart render payloads and keeps Human Design provider resolution independent from chart UI render data.

### Options

1. Reuse `/v1/natal` and extract points in worker: lower code change but couples Human Design to chart render output and unnecessary houses/aspects.
2. Add `/v1/positions`: small dedicated provider boundary, explicit payload, reusable for Human Design birth/design moments and future transits.
3. Call Kerykeion directly from TypeScript worker: bypasses existing private chart-engine boundary and duplicates provider/runtime concerns.

### Recommendation

Use option 2. It preserves the existing Python provider runtime and gives Human Design an explicit, narrow, testable source of longitudes.

### Rejected alternatives

- `/v1/natal` extraction: rejected because it returns non-required chart render data and hides the positions contract inside a broader payload.
- Direct worker Kerykeion use: rejected because it violates the existing chart-engine runtime boundary.

### User decisions

none

## Progress

- [x] 2026-07-22: Add shared TypeScript positions request/response contracts.
- [x] 2026-07-22: Add chart-worker HTTP client method for `/v1/positions`.
- [x] 2026-07-22: Add FastAPI `/v1/positions` endpoint backed by Kerykeion.
- [x] 2026-07-22: Run targeted checks and commit only owned paths.

## Outcomes & Retrospective

Implemented in this slice:

- `packages/contracts/src/charts.ts` now defines `chart-positions-request.v1` and `chart-positions-result.v1`.
- `apps/chart-worker` can call the private `/v1/positions` endpoint and treats invalid provider JSON as permanent.
- `apps/chart-engine` exposes `/v1/positions` and returns only the 11 Human Design base bodies.

Remaining future contours:

- 88-degree solar arc Design moment solver.
- Worker orchestration that calls `/v1/positions` for both birth and Design moments.
- API preview request that hydrates CRM birth data instead of accepting resolved longitudes.

## Context and Orientation

`/v1/positions` receives the same calculation-ready birth instant/location snapshot shape as the natal chart endpoint plus a narrow `{ zodiac: "tropical", nodeType: "true" | "mean" }` settings object. It returns provider metadata, the echoed input snapshot and exactly the Human Design base positions.

## Interfaces and Dependencies

- Produces: `chartPlanetaryPositionsRequestSchema`.
- Produces: `chartPlanetaryPositionsResponseSchema`.
- Produces: `ChartEngineHttpClient.calculatePlanetaryPositions(payload)`.
- Produces: `POST /v1/positions` in `apps/chart-engine`.

## Validation and Acceptance

- Contract tests reject responses without required base bodies.
- Chart-worker tests validate private HTTP route, response parsing and permanent invalid-provider JSON failures.
- Chart-engine tests call the real FastAPI route through `TestClient` and assert the exact base body set.

## Idempotence and Recovery

The endpoint is read-only and has no external side effects beyond in-process Kerykeion calculation during tests. Re-run targeted tests after any schema or adapter change.

## Artifacts and Notes

Next slice should add the 88-degree solar arc Design moment solver and combine two `/v1/positions` payloads into `BuildHumanDesignActivationsInput`.

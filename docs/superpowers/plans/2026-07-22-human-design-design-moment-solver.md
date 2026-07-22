# Human Design Design Moment Solver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the deterministic 88-degree solar arc Design moment solver required before resolving Human Design Design-side longitudes.

**Architecture:** `packages/domain/src/human-design` owns the solver, but the solver receives Sun longitude data through an injected provider function. This keeps ephemeris I/O in chart-engine/worker boundaries and keeps Human Design math independently testable.

**Tech Stack:** TypeScript, Vitest, existing Human Design longitude normalization helpers.

## Global Constraints

- The solver must not import apps, DB, chart-worker or chart-engine.
- The solver must not approximate Design side as 88 calendar days; it searches for Sun longitude exactly 88 degrees behind the birth Sun longitude.
- The solver must handle zodiac wrap-around.
- Provider data that does not bracket the target must fail observably.

---

## Research

Question:
Where should the 88-degree solar arc solver live?

Decision affected:
Human Design domain/provider split.

Accessed: 2026-07-22

### Sources

- `docs/superpowers/specs/2026-07-21-human-design-production-design.md` - requires exact 88-degree solar arc and ephemeris/provider boundary.
- `packages/domain/src/human-design/gate-wheel.ts` - existing canonical longitude normalization.
- `apps/chart-engine/src/chart_engine/main.py` - internal provider endpoint now returns arbitrary-moment planetary positions.

### Findings

- Repository evidence: Human Design domain already owns mechanics and checksum/fingerprint logic.
- Repository evidence: chart-engine now owns provider-backed arbitrary-moment positions.
- Inference: the solver belongs in domain as deterministic orchestration over a `getSunLongitudeAt` port, while chart-worker/API will later bind the port to `/v1/positions`.

### Recommendation

Implement the solver in `packages/domain/src/human-design/design-moment.ts` with an injected Sun longitude provider.

### User decisions

none

## Progress

- [x] 2026-07-22: Add failing tests for exact 88-degree solution, wrap-around and non-bracketing failure.
- [x] 2026-07-22: Implement binary-search solver with five-second default tolerance.
- [ ] Run targeted checks and commit only owned paths.

## Interfaces and Dependencies

- Produces: `resolveHumanDesignDesignMoment(input)`.
- Produces: `HumanDesignSunLongitudeProvider`.
- Produces: `HumanDesignDesignMomentResolution`.

## Validation and Acceptance

- Domain tests cover normal and wrap-around longitude cases.
- Domain typecheck proves exported solver contracts compile.

## Outcomes & Retrospective

Remaining future contour:

- Bind this solver to chart-worker `/v1/positions` calls and build a full Human Design resolved-input provider for API/worker use.

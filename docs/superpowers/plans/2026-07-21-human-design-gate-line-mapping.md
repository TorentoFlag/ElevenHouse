# Human Design Gate Line Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic Human Design `longitude -> gate/line` mapping to the domain engine foundation.

**Architecture:** The mapping is pure domain code in `packages/domain/src/human-design/gate-wheel.ts`. It consumes tropical ecliptic longitude in degrees from a future ephemeris provider and returns a typed gate, line and normalized offsets. The chart-engine remains responsible only for planetary positions; frontend and API do not calculate gates.

**Tech Stack:** TypeScript 6, Vitest 4, `@elevenhouse/domain`.

## Global Constraints

- Work in the existing checkout on `main`; do not create a branch, worktree, stash, rebase or switch.
- Do not start, stop or restart local services.
- Do not commit, push, deploy or mutate external state unless the user explicitly asks.
- Frontend never calculates Human Design values.
- Server/domain is the Human Design arithmetic authority.
- External Human Design APIs and libraries are benchmark/reference sources only.
- Planetary longitudes come from an ephemeris/provider boundary, not handwritten astrology math.
- The Design side must be solved from the exact 88-degree solar arc before birth, not an 88-calendar-day approximation.
- `human_design_classic` is the initial method code.
- Gate/line mapping uses tropical zodiac longitude in `[0, 360)` degrees and normalizes equivalent wrapped values.
- Gate boundaries are start-inclusive and end-exclusive.

---

## Current Baseline

- Previous commit: `1b72288 feat(human-design): add domain foundation`.
- Existing Human Design domain files:
  - `packages/domain/src/human-design/human-design-types.ts`
  - `packages/domain/src/human-design/catalog.ts`
  - `packages/domain/src/human-design/method-passport.ts`
  - `packages/domain/src/human-design/definition.ts`
  - `packages/domain/src/human-design/index.ts`
- Known unowned dirty paths at plan creation include messaging docs/contracts/domain and `.design-qa/*`; they are out of scope.

## Research Notes

- Barney + flo(w), accessed 2026-07-21, lists gate zodiac degree ranges. Examples:
  - Gate 41: `02*00'00'' - 07*37'30'' Aquarius`.
  - Gate 25: `28*15'00'' Pisces - 03*52'30'' Aries`.
  - Gate 20: `00*07'30'' - 05*45'00'' Gemini`.
- The same sequence is referenced by an open-source Human Design calculator README as its gate sequence source; that project also describes design date as solar arc 88 degrees before birth Sun.
- Inference: for our first deterministic method, set gate 41 start to absolute tropical longitude `302` degrees and each gate span to `360 / 64 = 5.625` degrees. Each line span is `5.625 / 6 = 0.9375` degrees.

## Progress

- 2026-07-21: Plan created for domain-only gate/line mapping.
- 2026-07-21: Task 1 completed; gate wheel constants, normalization and `longitude -> gate/line` mapping pass targeted tests.
- 2026-07-21: Task 2 completed; method passport includes gate wheel metadata and Human Design suite passes.

## Decision Log

- 2026-07-21: Use start-inclusive/end-exclusive segments to avoid duplicate gates at exact boundaries.
- 2026-07-21: Normalize longitude modulo 360 before mapping, so `-58`, `302` and `662` can resolve consistently.
- 2026-07-21: Include method passport wheel metadata so result checksums can later include gate wheel version and offset.

## Interfaces and Dependencies

Task 1 produces:

```ts
export const HUMAN_DESIGN_GATE_WHEEL_VERSION = "rave-mandala-gate-wheel.v1" as const;
export const HUMAN_DESIGN_GATE_SPAN_DEGREES = 5.625 as const;
export const HUMAN_DESIGN_LINE_SPAN_DEGREES = 0.9375 as const;
export const HUMAN_DESIGN_GATE_41_START_LONGITUDE = 302 as const;
export const HUMAN_DESIGN_GATE_WHEEL_SEQUENCE = [41, 19, 13, 49, 30, 55, 37, 63, 22, 36, 25, 17, 21, 51, 42, 3, 27, 24, 2, 23, 8, 20, 16, 35, 45, 12, 15, 52, 39, 53, 62, 56, 31, 33, 7, 4, 29, 59, 40, 64, 47, 6, 46, 18, 48, 57, 32, 50, 28, 44, 1, 43, 14, 34, 9, 5, 26, 11, 10, 58, 38, 54, 61, 60] as const;
export type HumanDesignGateLine = {
  readonly longitude: number;
  readonly normalizedLongitude: number;
  readonly gate: HumanDesignGateNumber;
  readonly line: HumanDesignLineNumber;
  readonly gateIndex: number;
  readonly gateStartLongitude: number;
  readonly degreesIntoGate: number;
  readonly degreesIntoLine: number;
};
export function normalizeHumanDesignLongitude(longitude: number): number;
export function mapLongitudeToHumanDesignGateLine(longitude: number): HumanDesignGateLine;
```

Task 2 updates:

```ts
export type HumanDesignMethodPassport = {
  readonly gateWheel: {
    readonly version: typeof HUMAN_DESIGN_GATE_WHEEL_VERSION;
    readonly gate41StartLongitude: typeof HUMAN_DESIGN_GATE_41_START_LONGITUDE;
    readonly gateSpanDegrees: typeof HUMAN_DESIGN_GATE_SPAN_DEGREES;
    readonly lineSpanDegrees: typeof HUMAN_DESIGN_LINE_SPAN_DEGREES;
    readonly sequence: typeof HUMAN_DESIGN_GATE_WHEEL_SEQUENCE;
  };
};
```

## Concrete Steps

### Task 1: Gate Wheel Mapping

**Files:**
- Create: `packages/domain/src/human-design/gate-wheel.test.ts`
- Create: `packages/domain/src/human-design/gate-wheel.ts`
- Modify: `packages/domain/src/human-design/index.ts`

**Interfaces:**
- Consumes: `HumanDesignGateNumber`, `HumanDesignLineNumber`.
- Produces: `mapLongitudeToHumanDesignGateLine(longitude: number): HumanDesignGateLine`.

- [x] **Step 1: Write the failing gate wheel test**

Create `packages/domain/src/human-design/gate-wheel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  HUMAN_DESIGN_GATE_41_START_LONGITUDE,
  HUMAN_DESIGN_GATE_SPAN_DEGREES,
  HUMAN_DESIGN_GATE_WHEEL_SEQUENCE,
  HUMAN_DESIGN_GATE_WHEEL_VERSION,
  HUMAN_DESIGN_LINE_SPAN_DEGREES,
  mapLongitudeToHumanDesignGateLine,
  normalizeHumanDesignLongitude
} from "./gate-wheel";

describe("Human Design gate wheel", () => {
  it("locks the classic gate wheel constants", () => {
    expect(HUMAN_DESIGN_GATE_WHEEL_VERSION).toBe("rave-mandala-gate-wheel.v1");
    expect(HUMAN_DESIGN_GATE_41_START_LONGITUDE).toBe(302);
    expect(HUMAN_DESIGN_GATE_SPAN_DEGREES).toBe(5.625);
    expect(HUMAN_DESIGN_LINE_SPAN_DEGREES).toBe(0.9375);
    expect(HUMAN_DESIGN_GATE_WHEEL_SEQUENCE).toHaveLength(64);
    expect(HUMAN_DESIGN_GATE_WHEEL_SEQUENCE.slice(0, 6)).toEqual([41, 19, 13, 49, 30, 55]);
    expect(HUMAN_DESIGN_GATE_WHEEL_SEQUENCE.slice(-4)).toEqual([38, 54, 61, 60]);
  });

  it("normalizes longitudes into the 0-360 degree range", () => {
    expect(normalizeHumanDesignLongitude(302)).toBe(302);
    expect(normalizeHumanDesignLongitude(662)).toBe(302);
    expect(normalizeHumanDesignLongitude(-58)).toBe(302);
    expect(normalizeHumanDesignLongitude(360)).toBe(0);
  });

  it("maps gate and line using start-inclusive end-exclusive boundaries", () => {
    expect(mapLongitudeToHumanDesignGateLine(302)).toMatchObject({
      normalizedLongitude: 302,
      gate: 41,
      line: 1,
      gateIndex: 0,
      gateStartLongitude: 302,
      degreesIntoGate: 0,
      degreesIntoLine: 0
    });
    expect(mapLongitudeToHumanDesignGateLine(302 + 0.9375)).toMatchObject({
      gate: 41,
      line: 2
    });
    expect(mapLongitudeToHumanDesignGateLine(307.625)).toMatchObject({
      gate: 19,
      line: 1,
      gateIndex: 1,
      gateStartLongitude: 307.625
    });
  });

  it("maps zodiac wrap examples from the researched degree table", () => {
    expect(mapLongitudeToHumanDesignGateLine(0)).toMatchObject({
      gate: 25,
      line: 2,
      gateStartLongitude: 358.25
    });
    expect(mapLongitudeToHumanDesignGateLine(60.125)).toMatchObject({
      gate: 20,
      line: 1,
      gateStartLongitude: 60.125
    });
    expect(mapLongitudeToHumanDesignGateLine(242)).toMatchObject({
      gate: 34,
      line: 3,
      gateStartLongitude: 240.125
    });
  });

  it("rejects non-finite longitude input", () => {
    expect(() => mapLongitudeToHumanDesignGateLine(Number.NaN)).toThrow(
      "Human Design longitude must be a finite number"
    );
    expect(() => mapLongitudeToHumanDesignGateLine(Number.POSITIVE_INFINITY)).toThrow(
      "Human Design longitude must be a finite number"
    );
  });
});
```

- [x] **Step 2: Run the failing test**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design/gate-wheel.test.ts
```

Expected observation: FAIL because `gate-wheel.ts` does not exist.

- [x] **Step 3: Implement the gate wheel**

Create `packages/domain/src/human-design/gate-wheel.ts` with the constants and mapping function from the `Interfaces and Dependencies` section. Use integer-safe segment math:

```ts
const normalizedDistanceFromStart =
  normalizeHumanDesignLongitude(normalizedLongitude - HUMAN_DESIGN_GATE_41_START_LONGITUDE);
const gateIndex = Math.floor(normalizedDistanceFromStart / HUMAN_DESIGN_GATE_SPAN_DEGREES);
const degreesIntoGate =
  normalizedDistanceFromStart - gateIndex * HUMAN_DESIGN_GATE_SPAN_DEGREES;
const line = Math.floor(degreesIntoGate / HUMAN_DESIGN_LINE_SPAN_DEGREES) + 1;
```

Round public offset fields to 10 decimal places to avoid floating-point noise.

- [x] **Step 4: Export the gate wheel**

Append to `packages/domain/src/human-design/index.ts`:

```ts
export * from "./gate-wheel";
```

- [x] **Step 5: Run the targeted test**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design/gate-wheel.test.ts
```

Expected observation: PASS.

### Task 2: Method Passport Gate Wheel Metadata

**Files:**
- Modify: `packages/domain/src/human-design/method-passport.test.ts`
- Modify: `packages/domain/src/human-design/method-passport.ts`

**Interfaces:**
- Consumes: gate wheel constants from Task 1.
- Produces: method passport metadata that later checksums and result snapshots can persist.

- [x] **Step 1: Write failing passport metadata assertion**

Update `packages/domain/src/human-design/method-passport.test.ts` inside `locks the selected production method choices`:

```ts
expect(HUMAN_DESIGN_METHOD_PASSPORT.gateWheel).toMatchObject({
  version: "rave-mandala-gate-wheel.v1",
  gate41StartLongitude: 302,
  gateSpanDegrees: 5.625,
  lineSpanDegrees: 0.9375
});
expect(HUMAN_DESIGN_METHOD_PASSPORT.gateWheel.sequence).toHaveLength(64);
expect(HUMAN_DESIGN_METHOD_PASSPORT.gateWheel.sequence[0]).toBe(41);
```

- [x] **Step 2: Run the failing passport test**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design/method-passport.test.ts
```

Expected observation: FAIL because `gateWheel` is missing from `HUMAN_DESIGN_METHOD_PASSPORT`.

- [x] **Step 3: Add gate wheel metadata to the passport**

Update `packages/domain/src/human-design/method-passport.ts` to import gate wheel constants and add the `gateWheel` property described in `Interfaces and Dependencies`.

- [x] **Step 4: Run targeted Human Design tests**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design
```

Expected observation: PASS.

## Validation and Acceptance

- `pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design`
- `pnpm --filter @elevenhouse/domain typecheck`
- `pnpm docs:check:test`
- `pnpm docs:check`
- `git diff --check -- packages/domain/src/human-design docs/superpowers/plans/2026-07-21-human-design-gate-line-mapping.md`

No runtime E2E or design parity is claimed; this is domain-only arithmetic foundation.

## Idempotence and Recovery

- Re-running tests is side-effect free.
- No service lifecycle, DB migration, external API call, commit, push or deploy is part of this plan unless separately requested.
- If another agent edits `packages/domain/src/human-design/**`, reread current files and resolve the combined state before patching.

## Artifacts and Notes

- Prior foundation commit: `1b72288`.
- Research sources:
  - https://www.barneyandflow.com/gate-zodiac-degrees
  - https://github.com/geodetheseeker/human-design-py

## Outcomes & Retrospective

- Completed: deterministic gate wheel constants and `mapLongitudeToHumanDesignGateLine` are implemented.
- Completed: method passport includes gate wheel version, start longitude, segment spans and sequence.
- Not included: planetary position provider, 88-degree solar arc solver, full activation builder, type/authority/profile derivation, API, UI and PDF remain for later slices.

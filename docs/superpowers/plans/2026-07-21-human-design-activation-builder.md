# Human Design Activation Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert personality/design planetary longitudes into the 26 Human Design activations used by the bodygraph engine.

**Architecture:** `packages/domain/src/human-design/activations.ts` is pure domain code. It accepts provider-produced tropical longitudes for non-derived bodies, derives Earth from Sun + 180 degrees and South Node from North Node + 180 degrees, then maps every active body through the gate wheel. The future chart-engine integration will only supply longitudes; this module owns Human Design activation semantics.

**Tech Stack:** TypeScript 6, Vitest 4, `@elevenhouse/domain`.

## Global Constraints

- Work in the existing checkout on `main`; do not create a branch, worktree, stash, rebase or switch.
- Do not start, stop or restart local services.
- Do not commit, push, deploy or mutate external state unless the user explicitly asks.
- Frontend never calculates Human Design values.
- Server/domain is the Human Design arithmetic authority.
- Planetary longitudes come from an ephemeris/provider boundary, not handwritten astrology math.
- Earth longitude is derived as Sun longitude + 180 degrees.
- South Node longitude is derived as North Node longitude + 180 degrees.
- Activation order must follow `HUMAN_DESIGN_ACTIVE_BODIES` for each side.

---

## Current Baseline

- Prior commits:
  - `1b72288 feat(human-design): add domain foundation`
  - `df6a65c feat(human-design): map longitudes to gates`
- Existing relevant files:
  - `packages/domain/src/human-design/human-design-types.ts`
  - `packages/domain/src/human-design/gate-wheel.ts`
  - `packages/domain/src/human-design/definition.ts`
  - `packages/domain/src/human-design/index.ts`

## Progress

- 2026-07-21: Plan created for domain-only activation builder.
- 2026-07-21: Task 1 completed; activation builder derives Earth/South Node and emits 26 ordered activations.

## Decision Log

- 2026-07-21: Provider input excludes derived `earth` and `south_node`; the domain derives them so all result checksums use one method.
- 2026-07-21: Keep activation builder independent of birth data and Design moment solving; it consumes already-resolved personality/design position sets.

## Interfaces and Dependencies

Task 1 produces:

```ts
export type HumanDesignBasePlanetaryLongitudes = {
  readonly sun: number;
  readonly moon: number;
  readonly north_node: number;
  readonly mercury: number;
  readonly venus: number;
  readonly mars: number;
  readonly jupiter: number;
  readonly saturn: number;
  readonly uranus: number;
  readonly neptune: number;
  readonly pluto: number;
};

export type BuildHumanDesignActivationsInput = {
  readonly personality: HumanDesignBasePlanetaryLongitudes;
  readonly design: HumanDesignBasePlanetaryLongitudes;
};

export function deriveOppositeLongitude(longitude: number): number;

export function buildHumanDesignActivations(
  input: BuildHumanDesignActivationsInput
): readonly HumanDesignActivation[];
```

## Concrete Steps

### Task 1: Activation Builder

**Files:**
- Create: `packages/domain/src/human-design/activations.test.ts`
- Create: `packages/domain/src/human-design/activations.ts`
- Modify: `packages/domain/src/human-design/index.ts`

**Interfaces:**
- Consumes: `HUMAN_DESIGN_ACTIVE_BODIES`, `HumanDesignActivation`, `mapLongitudeToHumanDesignGateLine`.
- Produces: `buildHumanDesignActivations(input)` and `deriveOppositeLongitude(longitude)`.

- [x] **Step 1: Write the failing activation builder test**

Create `packages/domain/src/human-design/activations.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildHumanDesignActivations, deriveOppositeLongitude } from "./activations";
import type { HumanDesignBasePlanetaryLongitudes } from "./activations";

const longitudes = (overrides: Partial<HumanDesignBasePlanetaryLongitudes> = {}) => ({
  sun: 302,
  moon: 307.625,
  north_node: 60.125,
  mercury: 0,
  venus: 10,
  mars: 20,
  jupiter: 30,
  saturn: 40,
  uranus: 50,
  neptune: 60,
  pluto: 70,
  ...overrides
});

describe("Human Design activation builder", () => {
  it("derives opposite longitudes for Earth and South Node", () => {
    expect(deriveOppositeLongitude(302)).toBe(122);
    expect(deriveOppositeLongitude(190)).toBe(10);
    expect(deriveOppositeLongitude(350)).toBe(170);
  });

  it("builds 26 activations in side and active-body order", () => {
    const activations = buildHumanDesignActivations({
      personality: longitudes({ sun: 302, north_node: 60.125 }),
      design: longitudes({ sun: 240.125, north_node: 0 })
    });

    expect(activations).toHaveLength(26);
    expect(activations.slice(0, 5)).toMatchObject([
      { side: "personality", body: "sun", longitude: 302, gate: 41, line: 1 },
      { side: "personality", body: "earth", longitude: 122, gate: 31, line: 1 },
      { side: "personality", body: "moon", longitude: 307.625, gate: 19, line: 1 },
      { side: "personality", body: "north_node", longitude: 60.125, gate: 20, line: 1 },
      { side: "personality", body: "south_node", longitude: 240.125, gate: 34, line: 1 }
    ]);
    expect(activations[13]).toMatchObject({
      side: "design",
      body: "sun",
      longitude: 240.125,
      gate: 34,
      line: 1
    });
    expect(activations[14]).toMatchObject({
      side: "design",
      body: "earth",
      longitude: 60.125,
      gate: 20,
      line: 1
    });
  });
});
```

- [x] **Step 2: Run the failing test**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design/activations.test.ts
```

Expected observation: FAIL because `activations.ts` does not exist.

- [x] **Step 3: Implement activation builder**

Create `packages/domain/src/human-design/activations.ts` using `mapLongitudeToHumanDesignGateLine` for every emitted activation. Build each side in this body order:

```ts
["sun", "earth", "moon", "north_node", "south_node", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"]
```

- [x] **Step 4: Export activation builder**

Append to `packages/domain/src/human-design/index.ts`:

```ts
export * from "./activations";
```

- [x] **Step 5: Run targeted Human Design tests**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design
pnpm --filter @elevenhouse/domain typecheck
```

Expected observation: PASS.

## Validation and Acceptance

- `pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design`
- `pnpm --filter @elevenhouse/domain typecheck`
- `pnpm docs:check:test`
- `pnpm docs:check`
- `git diff --check -- packages/domain/src/human-design docs/superpowers/plans/2026-07-21-human-design-activation-builder.md`

No runtime E2E or design parity is claimed; this is domain-only arithmetic foundation.

## Idempotence and Recovery

- Re-running tests is side-effect free.
- No service lifecycle, DB migration, external API call, commit, push or deploy is part of this plan unless separately requested.
- If another agent edits `packages/domain/src/human-design/**`, reread current files and resolve the combined state before patching.

## Outcomes & Retrospective

- Completed: `deriveOppositeLongitude` and `buildHumanDesignActivations` are implemented.
- Completed: Human Design activation order follows `HUMAN_DESIGN_ACTIVE_BODIES` for personality and design sides.
- Not included: provider integration, 88-degree solar arc solver, full result assembly, API, UI and PDF remain for later slices.

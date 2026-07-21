# Human Design Individual Base Result Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Assemble provider-resolved personality/design longitudes into a deterministic individual Human Design base result.

**Architecture:** `packages/domain/src/human-design/individual.ts` composes existing pure domain helpers: activation builder, definition derivation and method constants. It does not call chart-engine, DB, API or frontend code. Complex type/authority/profile-text interpretation remains separate; this slice only assembles mechanics already supported by earlier domain slices plus numeric profile.

**Tech Stack:** TypeScript 6, Vitest 4, `@elevenhouse/domain`.

## Global Constraints

- Work in the existing checkout on `main`; do not create a branch, worktree, stash, rebase or switch.
- Do not start, stop or restart local services.
- Do not commit, push, deploy or mutate external state unless the user explicitly asks.
- Frontend never calculates Human Design values.
- Server/domain is the Human Design arithmetic authority.
- Planetary longitudes come from an ephemeris/provider boundary, not handwritten astrology math.
- This slice does not implement type, strategy, authority, definition kind, incarnation cross, transits, compatibility, API, DB, UI or PDF.
- Human Design profile is `personality Sun line / design Sun line`.

---

## Current Baseline

- Prior Human Design commits:
  - `1b72288 feat(human-design): add domain foundation`
  - `df6a65c feat(human-design): map longitudes to gates`
  - `4fab081 feat(human-design): build activations from longitudes`
- Existing relevant files:
  - `packages/domain/src/human-design/activations.ts`
  - `packages/domain/src/human-design/definition.ts`
  - `packages/domain/src/human-design/human-design-types.ts`
  - `packages/domain/src/human-design/index.ts`

## Research Notes

- Sources accessed 2026-07-21:
  - https://nicolacloherty.com/blog/human-design-profile-lines/
  - https://humandesigntools.com/human-design-profile-6-lines/
- Sourced fact: profile lines come from conscious/personality Sun and unconscious/design Sun lines.
- Inference: because Earth is exactly opposite Sun, Sun and Earth share the same line. Use Sun activation lines directly for profile metadata.

## Progress

- 2026-07-21: Plan created for domain-only individual base result assembly.
- 2026-07-21: Task 1 completed; individual base result assembly passes targeted tests.

## Interfaces and Dependencies

Task 1 produces:

```ts
export type HumanDesignProfile = {
  readonly personalityLine: HumanDesignLineNumber;
  readonly designLine: HumanDesignLineNumber;
  readonly code: `${HumanDesignLineNumber}/${HumanDesignLineNumber}`;
};

export type HumanDesignDefinedGate = {
  readonly gate: HumanDesignGateNumber;
  readonly activatedBy: readonly {
    readonly side: HumanDesignActivationSide;
    readonly body: HumanDesignCelestialBody;
    readonly line: HumanDesignLineNumber;
  }[];
};

export type HumanDesignIndividualBaseResult = {
  readonly methodCode: typeof HUMAN_DESIGN_METHOD_CODE;
  readonly engineRevision: typeof HUMAN_DESIGN_ENGINE_REVISION;
  readonly schemaVersion: typeof HUMAN_DESIGN_SCHEMA_VERSION;
  readonly mode: "individual";
  readonly activations: readonly HumanDesignActivation[];
  readonly definedGates: readonly HumanDesignDefinedGate[];
  readonly definedChannels: readonly HumanDesignDefinedChannel[];
  readonly definedCenters: readonly HumanDesignDefinedCenter[];
  readonly profile: HumanDesignProfile;
};

export function buildHumanDesignIndividualBaseResult(
  input: BuildHumanDesignActivationsInput
): HumanDesignIndividualBaseResult;
```

## Concrete Steps

### Task 1: Individual Base Result

**Files:**
- Create: `packages/domain/src/human-design/individual.test.ts`
- Create: `packages/domain/src/human-design/individual.ts`
- Modify: `packages/domain/src/human-design/index.ts`

**Interfaces:**
- Consumes: `buildHumanDesignActivations`, `deriveDefinedChannels`, `deriveDefinedCenters`.
- Produces: `buildHumanDesignIndividualBaseResult(input)`.

- [x] **Step 1: Write the failing individual result test**

Create `packages/domain/src/human-design/individual.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildHumanDesignIndividualBaseResult } from "./individual";
import type { HumanDesignBasePlanetaryLongitudes } from "./activations";

const longitudes = (
  overrides: Partial<HumanDesignBasePlanetaryLongitudes> = {}
): HumanDesignBasePlanetaryLongitudes => ({
  sun: 302,
  moon: 307.625,
  north_node: 60.125,
  mercury: 240.125,
  venus: 10,
  mars: 20,
  jupiter: 30,
  saturn: 40,
  uranus: 50,
  neptune: 60,
  pluto: 70,
  ...overrides
});

describe("Human Design individual base result", () => {
  it("assembles deterministic mechanics from personality and design longitudes", () => {
    const result = buildHumanDesignIndividualBaseResult({
      personality: longitudes({ sun: 302, mercury: 240.125 }),
      design: longitudes({ sun: 240.125 })
    });

    expect(result).toMatchObject({
      methodCode: "human_design_classic",
      engineRevision: 1,
      schemaVersion: "human-design-result.v1",
      mode: "individual",
      profile: { personalityLine: 1, designLine: 1, code: "1/1" }
    });
    expect(result.activations).toHaveLength(26);
    expect(result.definedChannels).toContainEqual({
      code: "20-34",
      gates: [20, 34],
      centers: ["throat", "sacral"],
      circuit: "integration"
    });
    expect(result.definedCenters).toEqual([
      { code: "throat", definedByChannels: ["20-34"] },
      { code: "sacral", definedByChannels: ["20-34"] }
    ]);
    expect(result.definedGates.find((gate) => gate.gate === 34)).toEqual({
      gate: 34,
      activatedBy: [
        { side: "personality", body: "mercury", line: 1 },
        { side: "design", body: "sun", line: 1 }
      ]
    });
  });
});
```

- [x] **Step 2: Run the failing test**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design/individual.test.ts
```

Expected observation: FAIL because `individual.ts` does not exist.

- [x] **Step 3: Implement individual result assembly**

Create `packages/domain/src/human-design/individual.ts`. Build activations first, then:

- `definedChannels = deriveDefinedChannels(activations)`;
- `definedCenters = deriveDefinedCenters(definedChannels)`;
- `definedGates` sorted ascending by gate number;
- `profile` from personality Sun line and design Sun line.

- [x] **Step 4: Export individual result assembly**

Append to `packages/domain/src/human-design/index.ts`:

```ts
export * from "./individual";
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
- `git diff --check -- packages/domain/src/human-design docs/superpowers/plans/2026-07-21-human-design-individual-base-result.md`

No runtime E2E or design parity is claimed; this is domain-only result assembly.

## Idempotence and Recovery

- Re-running tests is side-effect free.
- No service lifecycle, DB migration, external API call, commit, push or deploy is part of this plan unless separately requested.
- If another agent edits `packages/domain/src/human-design/**`, reread current files and resolve the combined state before patching.

## Outcomes & Retrospective

- Completed: `buildHumanDesignIndividualBaseResult` assembles activations, defined gates, defined channels, defined centers and numeric profile.
- Not included: type, strategy, authority, definition kind, incarnation cross, transits, compatibility, API, DB, UI and PDF remain for later slices.

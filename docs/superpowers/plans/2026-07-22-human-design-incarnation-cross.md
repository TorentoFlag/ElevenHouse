# Human Design Incarnation Cross Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Derive Human Design incarnation cross mechanics from Personality/Design Sun and Earth activations and include it in the individual base result.

**Architecture:** `packages/domain/src/human-design/incarnation-cross.ts` is pure domain logic over already built activations. It extracts Personality Sun/Earth and Design Sun/Earth, derives the cross angle from the profile pair, and returns typed gates/lines plus basis evidence. This slice deliberately does not add a full 192-cross name catalog yet; it creates the deterministic foundation that the catalog can attach to.

**Tech Stack:** TypeScript 6, Vitest 4, `@elevenhouse/domain`.

## Global Constraints

- Work in the existing checkout on `main`; do not create a branch, worktree, stash, rebase or switch.
- Do not start, stop or restart local services.
- Do not commit, push, deploy or mutate external state unless the user explicitly asks.
- Frontend never calculates Human Design values.
- Server/domain is the Human Design arithmetic authority.
- External Human Design APIs and libraries are benchmark/reference sources only.
- This slice does not implement the full incarnation cross name catalog, variables, transits, compatibility, API, DB, UI or PDF.

---

## Research

Question: what deterministic data is required to derive an incarnation cross foundation?

Decision affected: individual Human Design result contract and future left-rail property display.

Accessed: 2026-07-22.

### Sources

- https://humandesign.tools/hd-types/incarnation-crosses/ - incarnation cross is based on conscious/unconscious Sun and Earth gates.
- https://www.geneticmatrix.com/human-design-incarnation-crosses/ - incarnation cross listing and Right Angle/Left Angle/Juxtaposition naming pattern.
- https://www.puregenerators.com/blog/human-design-incarnation-cross - cross as four gates: conscious Sun/Earth and unconscious Sun/Earth.
- https://humdes.info/incarnation-cross/ - Right Angle, Juxtaposition and Left Angle categories.
- https://humandesign.tools/hd-types/profiles/ - profile pairs and profile list used to validate angle mapping.

### Findings

- Sourced fact: Incarnation Cross is determined by the four gates of Personality Sun, Personality Earth, Design Sun and Design Earth.
- Sourced fact: Incarnation Cross names include angle classes: Right Angle, Juxtaposition and Left Angle.
- Sourced fact: The profile pair constrains the angle class; `4/1` is the Juxtaposition profile, early profiles are Right Angle and later transpersonal profiles are Left Angle.
- Repository evidence: `packages/domain/src/human-design/activations.ts` already derives Earth from Sun + 180 degrees for both Personality and Design sides.
- Repository evidence: `packages/domain/src/human-design/individual.ts` already derives profile from Personality Sun line and Design Sun line.
- Inference: The safe first implementation is a typed cross foundation with angle and four gate/line placements. The full name catalog should attach later as a lookup table, not be guessed.

### Options

1. Implement full named cross catalog now. Higher user-facing completeness, but high catalog-entry risk without a verified source table and fixture comparison.
2. Implement deterministic cross foundation now, then add verified name catalog as the next catalog slice. Lower risk and immediately useful for contracts/API/UI.

### Recommendation

Use option 2. It preserves correctness and avoids guessing 192 names while still exposing the core incarnation cross mechanics.

### Rejected alternatives

- UI-side cross derivation: rejected because frontend is not calculation authority.
- External provider cross name string as runtime authority: rejected because external APIs are benchmark/reference only.
- Guessing missing cross names: rejected because incorrect spiritual/domain labels are worse than an explicit foundation-only result.

### User decisions

None for this slice. The later full name catalog may need fixture comparison before acceptance.

## Progress

- 2026-07-22: Plan created for incarnation cross foundation derivation.
- 2026-07-22: Task 1 completed; incarnation cross foundation extracts Personality/Design Sun/Earth and maps Right Angle, Juxtaposition and Left Angle profile pairs.
- 2026-07-22: Task 2 completed; individual base result now exposes `incarnationCross`.

## Interfaces and Dependencies

Task 1 produces:

```ts
export type HumanDesignIncarnationCrossAngle =
  | "right_angle"
  | "juxtaposition"
  | "left_angle";

export type HumanDesignIncarnationCrossActivation = {
  readonly gate: HumanDesignGateNumber;
  readonly line: HumanDesignLineNumber;
};

export type HumanDesignIncarnationCross = {
  readonly angle: HumanDesignIncarnationCrossAngle;
  readonly profileCode: `${HumanDesignLineNumber}/${HumanDesignLineNumber}`;
  readonly gates: {
    readonly personalitySun: HumanDesignIncarnationCrossActivation;
    readonly personalityEarth: HumanDesignIncarnationCrossActivation;
    readonly designSun: HumanDesignIncarnationCrossActivation;
    readonly designEarth: HumanDesignIncarnationCrossActivation;
  };
  readonly gateSequence: readonly [
    HumanDesignGateNumber,
    HumanDesignGateNumber,
    HumanDesignGateNumber,
    HumanDesignGateNumber
  ];
};

export function deriveHumanDesignIncarnationCross(
  activations: readonly HumanDesignActivation[]
): HumanDesignIncarnationCross;
```

## Concrete Steps

### Task 1: Incarnation Cross Foundation

**Files:**
- Create: `packages/domain/src/human-design/incarnation-cross.test.ts`
- Create: `packages/domain/src/human-design/incarnation-cross.ts`
- Modify: `packages/domain/src/human-design/index.ts`

**Interfaces:**
- Consumes: `HumanDesignActivation` from `human-design-types.ts`.
- Produces: `deriveHumanDesignIncarnationCross(activations)`.

- [x] **Step 1: Write failing incarnation cross tests**

Create tests for Right Angle, Juxtaposition, Left Angle and unsupported profile guard.

- [x] **Step 2: Run the failing tests**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design/incarnation-cross.test.ts
```

Expected observation: FAIL because `incarnation-cross.ts` does not exist.

- [x] **Step 3: Implement cross extraction and angle mapping**

Find the four required activations and map profile code:

- Right Angle: `1/3`, `1/4`, `2/4`, `2/5`, `3/5`, `3/6`, `4/6`;
- Juxtaposition: `4/1`;
- Left Angle: `5/1`, `5/2`, `6/2`, `6/3`.

- [x] **Step 4: Export incarnation cross derivation**

Append:

```ts
export * from "./incarnation-cross";
```

- [x] **Step 5: Run targeted tests**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design
```

Expected observation: PASS.

### Task 2: Include Incarnation Cross In Individual Result

**Files:**
- Modify: `packages/domain/src/human-design/individual.test.ts`
- Modify: `packages/domain/src/human-design/individual.ts`

**Interfaces:**
- Consumes: `deriveHumanDesignIncarnationCross(activations)`.
- Produces top-level `incarnationCross` in `HumanDesignIndividualBaseResult`.

- [x] **Step 1: Write failing individual result expectation**

Update the existing individual fixture to a valid `1/3` profile and expect a Right Angle incarnation cross.

- [x] **Step 2: Run the failing test**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design/individual.test.ts
```

Expected observation: FAIL because individual result does not expose incarnation cross.

- [x] **Step 3: Compose `deriveHumanDesignIncarnationCross` in `individual.ts`**

Call `deriveHumanDesignIncarnationCross(activations)` and map it into `HumanDesignIndividualBaseResult`.

- [x] **Step 4: Run targeted tests**

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
- `git diff --check -- packages/domain/src/human-design docs/superpowers/plans/2026-07-22-human-design-incarnation-cross.md`

No runtime E2E or design parity is claimed; this is domain-only mechanics.

## Idempotence and Recovery

- Re-running tests is side-effect free.
- No service lifecycle, DB migration, external API call, commit, push or deploy is part of this plan unless separately requested.
- If another agent edits `packages/domain/src/human-design/**`, reread current files and resolve the combined state before patching.

## Outcomes & Retrospective

- Completed: Human Design incarnation cross foundation is deterministic domain logic over the four Sun/Earth activations.
- Completed: `buildHumanDesignIndividualBaseResult` includes `incarnationCross`.
- Not included: full incarnation cross name catalog, variables, transits, compatibility, API, DB, UI and PDF remain for later slices.

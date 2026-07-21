# Human Design Type Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Derive Human Design type, strategy, signature and not-self theme from defined channels and include them in the individual base result.

**Architecture:** `packages/domain/src/human-design/type.ts` is pure graph logic over existing defined channel data. It does not calculate astrology, call providers, use DB, expose API or render UI. `individual.ts` composes the new derivation so future contracts/API/UI receive type mechanics from the same domain authority as activations and definition.

**Tech Stack:** TypeScript 6, Vitest 4, `@elevenhouse/domain`.

## Global Constraints

- Work in the existing checkout on `main`; do not create a branch, worktree, stash, rebase or switch.
- Do not start, stop or restart local services.
- Do not commit, push, deploy or mutate external state unless the user explicitly asks.
- Frontend never calculates Human Design values.
- Server/domain is the Human Design arithmetic authority.
- External Human Design APIs and libraries are benchmark/reference sources only.
- This slice does not implement authority, split definition, incarnation cross, transits, compatibility, API, DB, UI or PDF.

---

## Research

Question: how should ElevenHouse derive Human Design type and strategy from the bodygraph mechanics already available in domain?

Decision affected: deterministic result contract and future front-end/API semantics.

Accessed: 2026-07-21.

### Sources

- https://jovianarchive.com/pages/type-and-strategy-in-human-design - type/strategy overview, type list and strategies.
- https://www.geneticmatrix.com/learn-hub/types/manifestor.html - Manifestor mechanics and type metadata.
- https://humandesigncollective.com/human-design-essentials/types/manifesting-generators/ - Manifesting Generator mechanics over Sacral and motor-to-Throat connection.
- https://www.anasaldamando.com/blog/what-it-means-to-be-a-projector-in-human-design - Projector technical distinction by open Sacral and no motor-to-Throat connection.

### Findings

- Sourced fact: Human Design type is determined by BodyGraph configuration rather than personality text.
- Sourced fact: Generator and Manifesting Generator share a defined Sacral foundation and the "wait to respond" strategy.
- Sourced fact: Manifesting Generators have a defined Sacral plus a motor connection to Throat.
- Sourced fact: Manifestors have an undefined Sacral and a motor connection to Throat; their strategy is to inform before acting.
- Sourced fact: Projectors have undefined/open Sacral and no motor-to-Throat connection; their strategy is to wait for the invitation.
- Sourced fact: Reflectors have no defined centers; their strategy is to wait a lunar cycle.
- Repository evidence: `packages/domain/src/human-design/definition.ts` already returns defined channels and centers from active gates.
- Inference: A channel graph over defined centers is sufficient for this slice. Direct and indirect motor-to-Throat paths should both classify as motor-to-Throat connection because a defined channel network represents continuous definition.

### Options

1. Derive type directly in `individual.ts`. Lower file count, but mixes result assembly and mechanics.
2. Add focused `type.ts` and compose it in `individual.ts`. Slightly more structure, but keeps mechanics testable and reusable for compatibility/transits.

### Recommendation

Use option 2. It matches the existing decomposition (`gate-wheel`, `activations`, `definition`, `individual`) and keeps future API/contract work from duplicating graph logic.

### Rejected alternatives

- UI-side type derivation: rejected because frontend is not calculation authority.
- Provider-specific type strings: rejected because external APIs are benchmarks, not runtime authority.
- Adding localized descriptions now: rejected because this slice only needs deterministic mechanics.

### User decisions

None. This is inside the already approved "own Human Design engine" boundary.

## Progress

- 2026-07-21: Plan created for type/strategy domain derivation.
- 2026-07-21: Task 1 completed; type graph derivation covers Reflector, Generator, Manifesting Generator, Manifestor, Projector and indirect motor-to-Throat paths.
- 2026-07-21: Task 2 completed; individual base result now exposes `type`, `strategy`, `signature`, `notSelfTheme` and `typeBasis`.

## Interfaces and Dependencies

Task 1 produces:

```ts
export type HumanDesignTypeCode =
  | "manifestor"
  | "generator"
  | "manifesting_generator"
  | "projector"
  | "reflector";

export type HumanDesignStrategyCode =
  | "inform_before_acting"
  | "wait_to_respond"
  | "wait_for_invitation"
  | "wait_lunar_cycle";

export type HumanDesignSignatureCode =
  | "peace"
  | "satisfaction"
  | "success"
  | "surprise";

export type HumanDesignNotSelfThemeCode =
  | "anger"
  | "frustration"
  | "bitterness"
  | "disappointment";

export type HumanDesignTypeMechanics = {
  readonly type: HumanDesignTypeCode;
  readonly strategy: HumanDesignStrategyCode;
  readonly signature: HumanDesignSignatureCode;
  readonly notSelfTheme: HumanDesignNotSelfThemeCode;
  readonly basis: {
    readonly definedCenterCount: number;
    readonly sacralDefined: boolean;
    readonly throatDefined: boolean;
    readonly throatConnectedMotorCenters: readonly HumanDesignCenterCode[];
  };
};

export function deriveHumanDesignType(
  definedChannels: readonly HumanDesignDefinedChannel[]
): HumanDesignTypeMechanics;
```

## Concrete Steps

### Task 1: Type And Strategy Derivation

**Files:**
- Create: `packages/domain/src/human-design/type.test.ts`
- Create: `packages/domain/src/human-design/type.ts`
- Modify: `packages/domain/src/human-design/index.ts`

**Interfaces:**
- Consumes: `HumanDesignDefinedChannel` from `definition.ts`.
- Produces: `deriveHumanDesignType(definedChannels)`.

- [x] **Step 1: Write failing type derivation tests**

Create tests that cover Reflector, Generator, Manifesting Generator, Manifestor and Projector.

- [x] **Step 2: Run the failing tests**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design/type.test.ts
```

Expected observation: FAIL because `type.ts` does not exist.

- [x] **Step 3: Implement minimal graph derivation**

Use defined channel endpoints as graph edges. Motor centers are `sacral`, `root`, `solar_plexus` and `heart`. Derive:

- no defined centers -> Reflector;
- Sacral defined + Throat connected to any motor -> Manifesting Generator;
- Sacral defined -> Generator;
- Sacral open + Throat connected to `root`, `solar_plexus` or `heart` -> Manifestor;
- otherwise -> Projector.

- [x] **Step 4: Export type derivation**

Append:

```ts
export * from "./type";
```

- [x] **Step 5: Run targeted tests**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design
```

Expected observation: PASS.

### Task 2: Include Type Mechanics In Individual Result

**Files:**
- Modify: `packages/domain/src/human-design/individual.test.ts`
- Modify: `packages/domain/src/human-design/individual.ts`

**Interfaces:**
- Consumes: `deriveHumanDesignType(definedChannels)`.
- Produces top-level `type`, `strategy`, `signature`, `notSelfTheme` and `typeBasis` in `HumanDesignIndividualBaseResult`.

- [x] **Step 1: Write failing individual result expectation**

Update the existing individual test to expect `manifesting_generator`, `wait_to_respond`, `satisfaction`, `frustration` and type basis for the `20-34` fixture.

- [x] **Step 2: Run the failing test**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design/individual.test.ts
```

Expected observation: FAIL because individual result does not expose type mechanics.

- [x] **Step 3: Compose `deriveHumanDesignType` in `individual.ts`**

Call `deriveHumanDesignType(definedChannels)` once and map its result into `HumanDesignIndividualBaseResult`.

- [x] **Step 4: Run targeted tests**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design
```

Expected observation: PASS.

## Validation and Acceptance

- `pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design`
- scoped Human Design TypeScript check
- `pnpm docs:check:test`
- `pnpm docs:check`
- `git diff --check -- packages/domain/src/human-design docs/superpowers/plans/2026-07-21-human-design-type-strategy.md`

No runtime E2E or design parity is claimed; this is domain-only mechanics.

## Idempotence and Recovery

- Re-running tests is side-effect free.
- No service lifecycle, DB migration, external API call, commit, push or deploy is part of this plan unless separately requested.
- If another agent edits `packages/domain/src/human-design/**`, reread current files and resolve the combined state before patching.

## Outcomes & Retrospective

- Completed: Human Design type derivation is deterministic domain logic over defined channels.
- Completed: `buildHumanDesignIndividualBaseResult` includes type, strategy, signature, not-self theme and type basis.
- Not included: authority, split definition, incarnation cross, transits, compatibility, API, DB, UI and PDF remain for later slices.

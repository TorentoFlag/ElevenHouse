# Human Design Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Derive Human Design authority from defined channels and include it in the individual base result.

**Architecture:** `packages/domain/src/human-design/authority.ts` is pure domain logic over existing defined channel data. It applies an authority priority order and returns typed mechanics plus basis evidence for downstream API/UI display. `individual.ts` composes authority after channels are derived; chart-engine, DB, API and frontend stay out of this slice.

**Tech Stack:** TypeScript 6, Vitest 4, `@elevenhouse/domain`.

## Global Constraints

- Work in the existing checkout on `main`; do not create a branch, worktree, stash, rebase or switch.
- Do not start, stop or restart local services.
- Do not commit, push, deploy or mutate external state unless the user explicitly asks.
- Frontend never calculates Human Design values.
- Server/domain is the Human Design arithmetic authority.
- External Human Design APIs and libraries are benchmark/reference sources only.
- This slice does not implement split definition, incarnation cross, variables, transits, compatibility, API, DB, UI or PDF.

---

## Research

Question: how should ElevenHouse derive Human Design authority from bodygraph definition?

Decision affected: deterministic individual result contract and future Human Design UI/API fields.

Accessed: 2026-07-21.

### Sources

- https://jobcannon.io/blog/human-design-inner-authority-types - authority hierarchy and single-authority priority.
- https://christieinge.com/human-design-authority/ - authority hierarchy and self-projected mechanics.
- https://www.humdes.com/en/kb/authority/ - Projector authority variants and self-projected channel examples.
- https://www.interiorcreature.com/interior-creature-human-design/2018/6/5/an-intro-to-human-design-the-seven-authorities-self-projected-heart-environmental-lunar-authority - manifested heart/ego authority via Heart-to-Throat mechanics.

### Findings

- Sourced fact: authority is determined by defined centers and follows a hierarchy, so a higher-priority authority wins when multiple centers are defined.
- Sourced fact: Emotional authority is selected when Solar Plexus is defined.
- Sourced fact: Sacral authority follows when Sacral is defined and Solar Plexus is not.
- Sourced fact: Splenic authority applies for non-sacral/non-emotional charts with Spleen definition.
- Sourced fact: Ego authority is tied to Heart/Will definition, including Heart-to-Throat manifestation mechanics.
- Sourced fact: Self-projected authority requires defined G and Throat centers through defined G-Throat channels, with Solar Plexus, Sacral, Spleen and Heart not taking priority.
- Sourced fact: Mental/environmental authority is a Projector no-inner-authority state; Reflectors use Lunar authority because they have no defined centers.
- Repository evidence: `packages/domain/src/human-design/definition.ts` already returns defined channels and centers.
- Inference: A graph over defined channel endpoints is sufficient for this slice. We expose `basis` so later fixture review can audit why an authority was selected.

### Options

1. Derive authority directly in `individual.ts`. Lower indirection, but mixes result assembly with hierarchy logic.
2. Add focused `authority.ts` and compose it in `individual.ts`. More testable and reusable for compatibility/transits.

### Recommendation

Use option 2. It keeps Human Design mechanics modular and follows the existing pattern established by `definition.ts` and `type.ts`.

### Rejected alternatives

- UI-side authority derivation: rejected because frontend is not calculation authority.
- Provider-returned authority strings: rejected because external APIs are benchmark/reference only.
- Localized authority descriptions now: rejected because this slice only needs deterministic codes and basis evidence.

### User decisions

None. This is inside the approved domain-engine scope.

## Progress

- 2026-07-21: Plan created for authority domain derivation.
- 2026-07-21: Task 1 completed; authority derivation covers Emotional, Sacral, Splenic, Ego, Self-Projected, Mental and Lunar.
- 2026-07-21: Task 2 completed; individual base result now exposes `authority` and `authorityBasis`.

## Interfaces and Dependencies

Task 1 produces:

```ts
export type HumanDesignAuthorityCode =
  | "emotional"
  | "sacral"
  | "splenic"
  | "ego"
  | "self_projected"
  | "mental"
  | "lunar";

export type HumanDesignAuthorityBasis = {
  readonly definedCenters: readonly HumanDesignCenterCode[];
  readonly priority: readonly HumanDesignAuthorityCode[];
  readonly selectedBy: string;
};

export type HumanDesignAuthorityMechanics = {
  readonly authority: HumanDesignAuthorityCode;
  readonly basis: HumanDesignAuthorityBasis;
};

export function deriveHumanDesignAuthority(
  definedChannels: readonly HumanDesignDefinedChannel[]
): HumanDesignAuthorityMechanics;
```

## Concrete Steps

### Task 1: Authority Derivation

**Files:**
- Create: `packages/domain/src/human-design/authority.test.ts`
- Create: `packages/domain/src/human-design/authority.ts`
- Modify: `packages/domain/src/human-design/index.ts`

**Interfaces:**
- Consumes: `HumanDesignDefinedChannel` from `definition.ts`.
- Produces: `deriveHumanDesignAuthority(definedChannels)`.

- [x] **Step 1: Write failing authority derivation tests**

Create tests that cover Emotional, Sacral, Splenic, Ego, Self-Projected, Mental and Lunar.

- [x] **Step 2: Run the failing tests**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design/authority.test.ts
```

Expected observation: FAIL because `authority.ts` does not exist.

- [x] **Step 3: Implement authority hierarchy**

Apply this order:

1. Solar Plexus defined -> `emotional`;
2. Sacral defined -> `sacral`;
3. Spleen defined -> `splenic`;
4. Heart defined -> `ego`;
5. G and Throat connected by definition -> `self_projected`;
6. Any centers defined -> `mental`;
7. No centers defined -> `lunar`.

- [x] **Step 4: Export authority derivation**

Append:

```ts
export * from "./authority";
```

- [x] **Step 5: Run targeted tests**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design
```

Expected observation: PASS.

### Task 2: Include Authority In Individual Result

**Files:**
- Modify: `packages/domain/src/human-design/individual.test.ts`
- Modify: `packages/domain/src/human-design/individual.ts`

**Interfaces:**
- Consumes: `deriveHumanDesignAuthority(definedChannels)`.
- Produces top-level `authority` and `authorityBasis` in `HumanDesignIndividualBaseResult`.

- [x] **Step 1: Write failing individual result expectation**

Update the existing individual test to expect `authority: "sacral"` for the `20-34` fixture.

- [x] **Step 2: Run the failing test**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design/individual.test.ts
```

Expected observation: FAIL because individual result does not expose authority.

- [x] **Step 3: Compose `deriveHumanDesignAuthority` in `individual.ts`**

Call `deriveHumanDesignAuthority(definedChannels)` once and map its result into `HumanDesignIndividualBaseResult`.

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
- `git diff --check -- packages/domain/src/human-design docs/superpowers/plans/2026-07-21-human-design-authority.md`

No runtime E2E or design parity is claimed; this is domain-only mechanics.

## Idempotence and Recovery

- Re-running tests is side-effect free.
- No service lifecycle, DB migration, external API call, commit, push or deploy is part of this plan unless separately requested.
- If another agent edits `packages/domain/src/human-design/**`, reread current files and resolve the combined state before patching.

## Outcomes & Retrospective

- Completed: Human Design authority derivation is deterministic domain logic over defined channels.
- Completed: `buildHumanDesignIndividualBaseResult` includes authority and authority basis.
- Not included: split definition, incarnation cross, variables, transits, compatibility, API, DB, UI and PDF remain for later slices.

# Human Design Definition Kind Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Derive Human Design definition kind from connected groups of defined centers and include it in the individual base result.

**Architecture:** `packages/domain/src/human-design/definition-kind.ts` is pure graph logic over existing defined channels. It classifies the connected components of defined centers into `no_definition`, `single`, `split`, `triple_split` or `quadruple_split`, and exposes component evidence for downstream contracts/UI. `individual.ts` composes the derivation after channels are available.

**Tech Stack:** TypeScript 6, Vitest 4, `@elevenhouse/domain`.

## Global Constraints

- Work in the existing checkout on `main`; do not create a branch, worktree, stash, rebase or switch.
- Do not start, stop or restart local services.
- Do not commit, push, deploy or mutate external state unless the user explicitly asks.
- Frontend never calculates Human Design values.
- Server/domain is the Human Design arithmetic authority.
- External Human Design APIs and libraries are benchmark/reference sources only.
- This slice does not implement incarnation cross, variables, transits, compatibility, API, DB, UI or PDF.

---

## Research

Question: how should ElevenHouse derive the Human Design "definition" field from channels and centers?

Decision affected: deterministic individual result contract and future left-rail property display.

Accessed: 2026-07-22.

### Sources

- https://jovianarchive.com/pages/understanding-definition-in-human-design - definition as connected or separated defined centers; Split Definition example.
- https://www.puregenerators.com/blog/human-design-definition-single-split-triple-split-quadruple-split - definition variants and split groupings.
- https://wholeandunleashed.com/human-design/human-design-definition/ - definition as how defined centers connect.
- https://www.hillarymcveigh.com/blog-education/definition-in-human-design-how-you-process-the-world - concise list of Single, Split, Triple, Quadruple and No Definition.
- https://loveyourhumandesign.com/what-does-split-definition-mean/ - no definition and split definition summary.

### Findings

- Sourced fact: Single Definition means all defined centers are connected.
- Sourced fact: Split Definition means two separate groups of defined centers are not connected.
- Sourced fact: Triple Split and Quadruple Split mean three or four separate groups of defined centers.
- Sourced fact: No Definition applies when no centers are defined, which corresponds to Reflector mechanics.
- Repository evidence: `packages/domain/src/human-design/definition.ts` already returns defined channels and centers.
- Inference: Definition kind is exactly a connected-components problem over defined channel endpoints.

### Options

1. Extend `definition.ts`. Lower file count, but it mixes center/channel derivation with a higher-level bodygraph property.
2. Add focused `definition-kind.ts`. Slightly more structure, but matches the existing modular mechanics files: `type.ts`, `authority.ts`.

### Recommendation

Use option 2. It keeps graph classification independently testable and reusable.

### Rejected alternatives

- UI-side definition derivation: rejected because frontend is not calculation authority.
- Provider-returned definition strings: rejected because external APIs are benchmark/reference only.
- Localized labels now: rejected because this slice only needs deterministic codes and evidence.

### User decisions

None. This is inside the approved domain-engine scope.

## Progress

- 2026-07-22: Plan created for definition kind derivation.
- 2026-07-22: Task 1 completed; definition kind derivation covers no definition, single, split, triple split and quadruple split.
- 2026-07-22: Task 2 completed; individual base result now exposes `definition`, `definitionComponents` and `definitionBasis`.

## Interfaces and Dependencies

Task 1 produces:

```ts
export type HumanDesignDefinitionKindCode =
  | "no_definition"
  | "single"
  | "split"
  | "triple_split"
  | "quadruple_split";

export type HumanDesignDefinitionComponent = {
  readonly centers: readonly HumanDesignCenterCode[];
  readonly channels: readonly HumanDesignChannelCode[];
};

export type HumanDesignDefinitionKindMechanics = {
  readonly definition: HumanDesignDefinitionKindCode;
  readonly components: readonly HumanDesignDefinitionComponent[];
  readonly basis: {
    readonly definedCenterCount: number;
    readonly componentCount: number;
  };
};

export function deriveHumanDesignDefinitionKind(
  definedChannels: readonly HumanDesignDefinedChannel[]
): HumanDesignDefinitionKindMechanics;
```

## Concrete Steps

### Task 1: Definition Kind Derivation

**Files:**
- Create: `packages/domain/src/human-design/definition-kind.test.ts`
- Create: `packages/domain/src/human-design/definition-kind.ts`
- Modify: `packages/domain/src/human-design/index.ts`

**Interfaces:**
- Consumes: `HumanDesignDefinedChannel` from `definition.ts`.
- Produces: `deriveHumanDesignDefinitionKind(definedChannels)`.

- [x] **Step 1: Write failing definition kind tests**

Create tests covering No Definition, Single Definition, Split Definition, Triple Split and Quadruple Split.

- [x] **Step 2: Run the failing tests**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design/definition-kind.test.ts
```

Expected observation: FAIL because `definition-kind.ts` does not exist.

- [x] **Step 3: Implement connected-components derivation**

Build an undirected graph from channel centers and traverse connected components. Map component count to definition kind.

- [x] **Step 4: Export definition kind derivation**

Append:

```ts
export * from "./definition-kind";
```

- [x] **Step 5: Run targeted tests**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design
```

Expected observation: PASS.

### Task 2: Include Definition Kind In Individual Result

**Files:**
- Modify: `packages/domain/src/human-design/individual.test.ts`
- Modify: `packages/domain/src/human-design/individual.ts`

**Interfaces:**
- Consumes: `deriveHumanDesignDefinitionKind(definedChannels)`.
- Produces top-level `definition` and `definitionBasis` in `HumanDesignIndividualBaseResult`.

- [x] **Step 1: Write failing individual result expectation**

Update the existing individual test to expect `definition: "single"` and component count `1` for the `20-34` fixture.

- [x] **Step 2: Run the failing test**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design/individual.test.ts
```

Expected observation: FAIL because individual result does not expose definition.

- [x] **Step 3: Compose `deriveHumanDesignDefinitionKind` in `individual.ts`**

Call `deriveHumanDesignDefinitionKind(definedChannels)` once and map its result into `HumanDesignIndividualBaseResult`.

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
- `git diff --check -- packages/domain/src/human-design docs/superpowers/plans/2026-07-22-human-design-definition-kind.md`

No runtime E2E or design parity is claimed; this is domain-only mechanics.

## Idempotence and Recovery

- Re-running tests is side-effect free.
- No service lifecycle, DB migration, external API call, commit, push or deploy is part of this plan unless separately requested.
- If another agent edits `packages/domain/src/human-design/**`, reread current files and resolve the combined state before patching.

## Outcomes & Retrospective

- Completed: Human Design definition kind derivation is deterministic domain logic over connected groups of defined centers.
- Completed: `buildHumanDesignIndividualBaseResult` includes definition kind, components and basis evidence.
- Not included: incarnation cross, variables, transits, compatibility, API, DB, UI and PDF remain for later slices.

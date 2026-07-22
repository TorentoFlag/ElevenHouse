# Human Design Result Checksum Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic SHA-256 result checksum to the Human Design individual result.

**Architecture:** `packages/domain/src/human-design/result-checksum.ts` owns stable JSON canonicalization and checksum generation. `individual.ts` builds the result without checksum first, hashes that canonical payload, then returns the same result with `resultChecksum`. This is domain-only groundwork for future persistence, stale guards, AI/PDF checksum checks and deduplication.

**Tech Stack:** TypeScript 6, Vitest 4, Node `crypto`, `@elevenhouse/domain`.

## Global Constraints

- Work in the existing checkout on `main`; do not create a branch, worktree, stash, rebase or switch.
- Do not start, stop or restart local services.
- Do not commit, push, deploy or mutate external state unless the user explicitly asks.
- Frontend never calculates Human Design values.
- Server/domain is the Human Design arithmetic authority.
- External Human Design APIs and libraries are benchmark/reference sources only.
- This slice does not implement input fingerprints, DB persistence, API, AI, PDF, UI, transits or compatibility.

---

## Research

Question: how should Human Design produce a stable result checksum compatible with existing ElevenHouse calculation lifecycle patterns?

Decision affected: saved calculation deduplication, stale detection and future checksum guards.

Accessed: 2026-07-22.

### Sources

- Repository evidence: `docs/superpowers/specs/2026-07-21-human-design-production-design.md` requires typed Human Design result plus checksum and checksum guards.
- Repository evidence: `docs/api/api-boundaries.md` documents existing checksum-safe calculation/report flows.
- Repository evidence: `docs/architecture/backend-modules.md` describes checksum-bound calculations, reports and PDFs.
- Inference: Result checksum should be deterministic from canonical result JSON, exclude itself, and use the same `sha256:<hex>` shape already expected by calculation APIs.

### Options

1. Add checksum only in future API/DB layer. Lower domain work now, but risks duplicate checksum implementations.
2. Add checksum in domain result builder. Keeps arithmetic authority and checksum authority together, and gives API/DB one reusable value.

### Recommendation

Use option 2. Domain already owns deterministic Human Design mechanics and should own the checksum of that mechanics payload.

### Rejected alternatives

- Browser checksum: rejected because frontend is not calculation authority.
- Raw `JSON.stringify` checksum: rejected because object key order can drift.
- Including checksum inside its own payload: rejected because it creates recursive instability.

### User decisions

None. This is inside the approved checksum-safe calculation scope.

## Progress

- 2026-07-22: Plan created for result checksum derivation.
- 2026-07-22: Task 1 completed; stable JSON canonicalization and SHA-256 checksum utility implemented.
- 2026-07-22: Task 2 completed; individual base result now exposes `resultChecksum`.

## Interfaces and Dependencies

Task 1 produces:

```ts
export type HumanDesignResultChecksum = {
  readonly algorithm: "sha256";
  readonly canonicalization: "json-stable-v1";
  readonly value: `sha256:${string}`;
};

export function canonicalizeHumanDesignChecksumPayload(payload: unknown): string;
export function createHumanDesignResultChecksum(payload: unknown): HumanDesignResultChecksum;
```

Task 2 adds:

```ts
readonly resultChecksum: HumanDesignResultChecksum;
```

to `HumanDesignIndividualBaseResult`.

## Concrete Steps

### Task 1: Result Checksum Utility

**Files:**
- Create: `packages/domain/src/human-design/result-checksum.test.ts`
- Create: `packages/domain/src/human-design/result-checksum.ts`
- Modify: `packages/domain/src/human-design/index.ts`

**Interfaces:**
- Produces stable checksum utilities.

- [x] **Step 1: Write failing checksum utility tests**

Create tests for stable object-key ordering, array order sensitivity, ignoring existing checksum fields and rejecting non-finite numbers.

- [x] **Step 2: Run the failing tests**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design/result-checksum.test.ts
```

Expected observation: FAIL because `result-checksum.ts` does not exist.

- [x] **Step 3: Implement stable canonicalization and SHA-256 checksum**

Use sorted object keys, preserve array order, omit `resultChecksum`, reject unsupported values and return `sha256:<hex>`.

- [x] **Step 4: Export checksum utilities**

Append:

```ts
export * from "./result-checksum";
```

- [x] **Step 5: Run targeted tests**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design/result-checksum.test.ts
```

Expected observation: PASS.

### Task 2: Include Checksum In Individual Result

**Files:**
- Modify: `packages/domain/src/human-design/individual.test.ts`
- Modify: `packages/domain/src/human-design/individual.ts`

**Interfaces:**
- Consumes: `createHumanDesignResultChecksum(resultWithoutChecksum)`.
- Produces `resultChecksum` in `HumanDesignIndividualBaseResult`.

- [x] **Step 1: Write failing individual checksum expectation**

Update the existing individual test to assert `resultChecksum.algorithm`, `canonicalization` and `sha256:<64 hex>` value.

- [x] **Step 2: Run the failing test**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design/individual.test.ts
```

Expected observation: FAIL because individual result does not expose checksum.

- [x] **Step 3: Compute checksum in `individual.ts`**

Build `resultWithoutChecksum`, then return `{ ...resultWithoutChecksum, resultChecksum: createHumanDesignResultChecksum(resultWithoutChecksum) }`.

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
- `git diff --check -- packages/domain/src/human-design docs/superpowers/plans/2026-07-22-human-design-result-checksum.md`

No runtime E2E or design parity is claimed; this is domain-only mechanics.

## Idempotence and Recovery

- Re-running tests is side-effect free.
- No service lifecycle, DB migration, external API call, commit, push or deploy is part of this plan unless separately requested.
- If another agent edits `packages/domain/src/human-design/**`, reread current files and resolve the combined state before patching.

## Outcomes & Retrospective

- Completed: Human Design result checksum is deterministic over stable canonical JSON and excludes its own `resultChecksum` field.
- Completed: `buildHumanDesignIndividualBaseResult` includes `resultChecksum`.
- Not included: input fingerprints, DB persistence, API, AI, PDF, UI, transits and compatibility remain for later slices.

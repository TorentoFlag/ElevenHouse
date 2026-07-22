# Human Design Input Fingerprint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic fingerprint for provider-resolved Human Design individual inputs.

**Architecture:** `packages/domain/src/human-design/input-fingerprint.ts` fingerprints the exact Personality/Design longitudes that enter the current domain engine. It reuses stable JSON canonicalization from `result-checksum.ts`, includes method/schema/engine/mode metadata, and is composed into `buildHumanDesignIndividualBaseResult`. This is not the future CRM birth-data request fingerprint; it is the domain-level resolved-input fingerprint used after chart-engine/provider output is known.

**Tech Stack:** TypeScript 6, Vitest 4, Node `crypto`, `@elevenhouse/domain`.

## Global Constraints

- Work in the existing checkout on `main`; do not create a branch, worktree, stash, rebase or switch.
- Do not start, stop or restart local services.
- Do not commit, push, deploy or mutate external state unless the user explicitly asks.
- Frontend never calculates Human Design values.
- Server/domain is the Human Design arithmetic authority.
- External Human Design APIs and libraries are benchmark/reference sources only.
- This slice does not implement birth-data request fingerprinting, DB persistence, API, AI, PDF, UI, transits or compatibility.

---

## Research

Question: what should the first Human Design input fingerprint cover?

Decision affected: future exact-result reuse and idempotency after provider-resolved longitudes are available.

Accessed: 2026-07-22.

### Sources

- Repository evidence: `docs/superpowers/specs/2026-07-21-human-design-production-design.md` says repeated same method, mode, participant snapshot, input settings and result fingerprint should reuse existing calculations.
- Repository evidence: `docs/superpowers/specs/2026-07-20-chart-engine-natal-design.md` describes exact business replay semantics through fingerprints.
- Repository evidence: `packages/domain/src/human-design/activations.ts` currently accepts provider-resolved longitudes as the domain engine input.
- Inference: Before CRM/API/DB layers exist, the useful domain fingerprint is scoped to resolved longitudes plus method/schema/engine/mode metadata. Birth-data request fingerprinting belongs in the API/service slice that owns CRM snapshots and calculation settings.

### Options

1. Wait for API/DB layer and do all fingerprints there. Lower domain surface, but duplicates canonical hashing rules later.
2. Add resolved-input fingerprint now and leave request fingerprint for API/DB. Gives immediate deterministic domain provenance without pretending to own CRM snapshots.

### Recommendation

Use option 2. It is scoped, deterministic and aligned with the current domain engine boundary.

### Rejected alternatives

- Hash only raw input object: rejected because metadata changes would not invalidate fingerprints.
- Include generated result in input fingerprint: rejected because result checksum already covers output.
- Add CRM request fingerprint now: rejected because CRM birth-data hydration/API settings are not implemented in this domain-only contour.

### User decisions

None. This is inside the approved checksum/fingerprint-safe calculation scope.

## Progress

- 2026-07-22: Plan created for resolved input fingerprint derivation.
- 2026-07-22: Task 1 completed; resolved input fingerprint includes method/schema/engine/mode metadata and provider-resolved longitudes.
- 2026-07-22: Task 2 completed; individual base result now exposes `inputFingerprint`.

## Interfaces and Dependencies

Task 1 produces:

```ts
export type HumanDesignResolvedInputFingerprint = {
  readonly algorithm: "sha256";
  readonly canonicalization: "json-stable-v1";
  readonly scope: "human-design-individual-resolved-input.v1";
  readonly value: `sha256:${string}`;
};

export function buildHumanDesignResolvedInputFingerprintPayload(
  input: BuildHumanDesignActivationsInput
): unknown;

export function createHumanDesignResolvedInputFingerprint(
  input: BuildHumanDesignActivationsInput
): HumanDesignResolvedInputFingerprint;
```

Task 2 adds:

```ts
readonly inputFingerprint: HumanDesignResolvedInputFingerprint;
```

to `HumanDesignIndividualBaseResult`.

## Concrete Steps

### Task 1: Resolved Input Fingerprint Utility

**Files:**
- Create: `packages/domain/src/human-design/input-fingerprint.test.ts`
- Create: `packages/domain/src/human-design/input-fingerprint.ts`
- Modify: `packages/domain/src/human-design/index.ts`

**Interfaces:**
- Consumes: `BuildHumanDesignActivationsInput`.
- Produces stable resolved-input fingerprint utilities.

- [x] **Step 1: Write failing input fingerprint tests**

Create tests for stable object order, metadata coverage and longitude-change sensitivity.

- [x] **Step 2: Run the failing tests**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design/input-fingerprint.test.ts
```

Expected observation: FAIL because `input-fingerprint.ts` does not exist.

- [x] **Step 3: Implement resolved input fingerprint**

Build a payload containing method code, schema version, engine revision, mode and resolved longitudes. Hash it through stable canonicalization.

- [x] **Step 4: Export input fingerprint utilities**

Append:

```ts
export * from "./input-fingerprint";
```

- [x] **Step 5: Run targeted tests**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design/input-fingerprint.test.ts
```

Expected observation: PASS.

### Task 2: Include Input Fingerprint In Individual Result

**Files:**
- Modify: `packages/domain/src/human-design/individual.test.ts`
- Modify: `packages/domain/src/human-design/individual.ts`

**Interfaces:**
- Consumes: `createHumanDesignResolvedInputFingerprint(input)`.
- Produces `inputFingerprint` in `HumanDesignIndividualBaseResult`.

- [x] **Step 1: Write failing individual input fingerprint expectation**

Update the existing individual test to assert `inputFingerprint.scope`, `canonicalization`, `algorithm` and `sha256:<64 hex>` value.

- [x] **Step 2: Run the failing test**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design/individual.test.ts
```

Expected observation: FAIL because individual result does not expose input fingerprint.

- [x] **Step 3: Compose input fingerprint in `individual.ts`**

Call `createHumanDesignResolvedInputFingerprint(input)` and add it to the result payload before checksum generation.

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
- `git diff --check -- packages/domain/src/human-design docs/superpowers/plans/2026-07-22-human-design-input-fingerprint.md`

No runtime E2E or design parity is claimed; this is domain-only mechanics.

## Idempotence and Recovery

- Re-running tests is side-effect free.
- No service lifecycle, DB migration, external API call, commit, push or deploy is part of this plan unless separately requested.
- If another agent edits `packages/domain/src/human-design/**`, reread current files and resolve the combined state before patching.

## Outcomes & Retrospective

- Completed: Human Design resolved input fingerprint is deterministic over method/schema/engine/mode metadata and provider-resolved longitudes.
- Completed: `buildHumanDesignIndividualBaseResult` includes `inputFingerprint`, and `resultChecksum` covers that provenance.
- Not included: birth-data request fingerprinting, DB persistence, API, AI, PDF, UI, transits and compatibility remain for later slices.

# Human Design Engine Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first production-safe Human Design foundation: method passport, static catalogs, typed domain contracts and deterministic tests without UI, API persistence or external-provider writes.

**Architecture:** Human Design derivation lives in `packages/domain/src/human-design`. The first slice introduces owned domain types and catalogs only; planetary positions remain an explicit input contract that will be wired to `apps/chart-engine` in the next slice. This keeps frontend and API free of arithmetic while giving later tasks a stable method boundary.

**Tech Stack:** TypeScript 6, Vitest 4, `@elevenhouse/domain`, existing workspace scripts.

## Global Constraints

- Work in the existing checkout on `main`; do not create a branch, worktree, stash, rebase or switch.
- Do not start, stop or restart local services.
- Do not commit, push, deploy or mutate external state without explicit user authority.
- Frontend never calculates Human Design values.
- Server/domain is the Human Design arithmetic authority.
- External Human Design APIs and libraries are benchmark/reference sources only.
- Planetary longitudes come from an ephemeris/provider boundary, not handwritten astrology math.
- The Design side must be solved from the exact 88-degree solar arc before birth, not an 88-calendar-day approximation.
- Initial production participants are owner-scoped CRM clients; manual participants require separate product approval.
- `birthTimePrecision = unknown` blocks calculation; `approximate` can calculate only with visible warnings in later API/UI slices.
- `human_design_classic` is the initial method code.
- Advanced variables (`color`, `tone`, `base`, arrows/PHS/Rave Psychology) remain in the end-state model but are not rendered as authoritative until fixture confidence and birth-time precision policy are confirmed.

---

## Current Baseline

- Branch: `main`.
- Existing DB/calculation support: `CalculationModule` already includes `human_design`; no migration is needed for this foundation slice.
- Existing sibling patterns:
  - `packages/domain/src/matrix/*` for method code, engine revision, registry and pure deterministic domain tests.
  - `packages/domain/src/numerology/methods/pythagorean-ru/*` for self-contained method files.
  - `packages/domain/src/charts/*` for chart-engine/provider boundary concepts.
- Owned paths for this plan:
  - `docs/superpowers/plans/2026-07-21-human-design-engine-foundation.md`
  - `packages/domain/src/human-design/**`
  - `packages/domain/src/index.ts`
- Known unowned dirty paths at plan creation:
  - `docs/api/api-boundaries.md`
  - `docs/architecture/backend-modules.md`
  - `docs/architecture/design-reference-inventory.md`
  - `.design-qa/astro-calendar-analysis/`
  - `.design-qa/chart-engine-dependency-analysis/`
  - `.design-qa/chart-engine-frontend/`
  - `docs/decisions/0010-messaging-channel-architecture.md`
  - `docs/superpowers/plans/2026-07-21-messaging-foundation-realtime-telegram-business.md`
  - `docs/superpowers/specs/2026-07-21-clients-messaging-telegram-architecture-design.md`
  - `docs/superpowers/specs/2026-07-21-human-design-production-design.md`

## Progress

- 2026-07-21: Spec reviewed. No product blocker for starting foundation slice.
- 2026-07-21: Plan created. First implementation package scoped to domain-only foundation.
- 2026-07-21: Task 1 completed; method constants, base activation types and feature index pass targeted tests.
- 2026-07-21: Task 2 completed; centers/channels catalog and lookup helpers pass targeted tests.
- 2026-07-21: Task 3 completed; method passport and resolver pass targeted tests.
- 2026-07-21: Task 4 completed; defined channel and center derivation helpers pass targeted tests.
- 2026-07-21: Task 5 completed; Human Design foundation exports from the root domain index and passes targeted foundation verification.

## Surprises & Discoveries

- `calculation_records.module = human_design` already exists in DB snapshot and domain calculation types, so this slice should not touch migrations.
- Current Human Design reference implementation in `ElevenHouseDesign/app/hd-data.jsx` is demo-seeded and must not be used as arithmetic authority.
- Production licensing for the ephemeris provider remains a required decision before production activation, but it does not block creating provider-agnostic domain contracts and catalogs.

## Decision Log

- 2026-07-21, user and agent: Build our own Human Design engine; external APIs/libraries are research and fixture sources only.
- 2026-07-21, agent: Start with domain foundation, not UI/API, because it creates the smallest testable production boundary and avoids browser/runtime dependencies.
- 2026-07-21, agent: No commit steps in this plan because commit/push authority has not been granted.

## Context and Orientation

`packages/domain/src/human-design` will own deterministic Human Design derivation. In this foundation plan it will not yet calculate a full result from birth data, because that requires the next provider slice for arbitrary-moment planetary positions and the 88-degree solar-arc solver.

Definitions:

- Gate: one of 64 Human Design gates.
- Line: one of 6 lines inside a gate.
- Activation: a planetary body mapped to gate and line.
- Center: one of the 9 Human Design centers.
- Channel: one of the 36 channels connecting two gates and two centers.
- Defined channel: both gates in that channel are active.
- Defined center: a center connected by at least one defined channel.
- Method passport: immutable method metadata needed to make result checksums reproducible.

## Interfaces and Dependencies

Task 1 produces:

```ts
export const HUMAN_DESIGN_METHOD_CODE = "human_design_classic" as const;
export const HUMAN_DESIGN_ENGINE_REVISION = 1 as const;
export const HUMAN_DESIGN_GATE_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64] as const;
export const HUMAN_DESIGN_LINE_NUMBERS = [1, 2, 3, 4, 5, 6] as const;
export type HumanDesignMethodCode = typeof HUMAN_DESIGN_METHOD_CODE;
export type HumanDesignGateNumber = (typeof HUMAN_DESIGN_GATE_NUMBERS)[number];
export type HumanDesignLineNumber = (typeof HUMAN_DESIGN_LINE_NUMBERS)[number];
export type HumanDesignCenterCode =
  | "head"
  | "ajna"
  | "throat"
  | "g"
  | "heart"
  | "spleen"
  | "sacral"
  | "solar_plexus"
  | "root";
export type HumanDesignChannelCode = (typeof HUMAN_DESIGN_CHANNEL_CODES)[number];
export type HumanDesignCelestialBody =
  | "sun"
  | "earth"
  | "moon"
  | "north_node"
  | "south_node"
  | "mercury"
  | "venus"
  | "mars"
  | "jupiter"
  | "saturn"
  | "uranus"
  | "neptune"
  | "pluto";
export type HumanDesignActivationSide = "personality" | "design";
export type HumanDesignActivation = {
  readonly side: HumanDesignActivationSide;
  readonly body: HumanDesignCelestialBody;
  readonly longitude: number;
  readonly gate: HumanDesignGateNumber;
  readonly line: HumanDesignLineNumber;
};
```

Task 2 produces:

```ts
export const HUMAN_DESIGN_CENTERS: readonly HumanDesignCenterDefinition[];
export const HUMAN_DESIGN_CHANNELS: readonly HumanDesignChannelDefinition[];
export function getHumanDesignChannel(code: HumanDesignChannelCode): HumanDesignChannelDefinition;
export function getHumanDesignCenter(code: HumanDesignCenterCode): HumanDesignCenterDefinition;
```

Task 3 produces:

```ts
export const HUMAN_DESIGN_METHOD_PASSPORT: HumanDesignMethodPassport;
export function resolveHumanDesignMethod(code: string): HumanDesignMethodPassport;
```

Task 4 produces:

```ts
export function deriveDefinedChannels(
  activations: readonly HumanDesignActivation[]
): readonly HumanDesignDefinedChannel[];

export function deriveDefinedCenters(
  channels: readonly HumanDesignDefinedChannel[]
): readonly HumanDesignDefinedCenter[];
```

Task 5 produces public package exports through `packages/domain/src/index.ts`.

## Plan of Work

1. Create failing domain type/catalog tests.
2. Add Human Design type constants and static center/channel catalog.
3. Add method passport and resolver.
4. Add pure derivation helpers for defined channels and defined centers.
5. Export the module and run targeted verification.

## Concrete Steps

### Task 1: Domain Types And Constants

**Files:**
- Create: `packages/domain/src/human-design/human-design-types.ts`
- Create: `packages/domain/src/human-design/human-design-types.test.ts`
- Create: `packages/domain/src/human-design/index.ts`

**Interfaces:**
- Consumes: no new internal interfaces.
- Produces: method constants, gate/line/center/channel/body/activation/result base types for all later tasks.

- [x] **Step 1: Write failing tests for method constants and activation shape**

Create `packages/domain/src/human-design/human-design-types.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  HUMAN_DESIGN_ACTIVE_BODIES,
  HUMAN_DESIGN_ENGINE_REVISION,
  HUMAN_DESIGN_METHOD_CODE,
  HUMAN_DESIGN_SCHEMA_VERSION,
  type HumanDesignActivation
} from "./human-design-types";

describe("Human Design domain types", () => {
  it("locks the initial method identity and active body order", () => {
    expect(HUMAN_DESIGN_METHOD_CODE).toBe("human_design_classic");
    expect(HUMAN_DESIGN_ENGINE_REVISION).toBe(1);
    expect(HUMAN_DESIGN_SCHEMA_VERSION).toBe("human-design-result.v1");
    expect(HUMAN_DESIGN_ACTIVE_BODIES).toEqual([
      "sun",
      "earth",
      "moon",
      "north_node",
      "south_node",
      "mercury",
      "venus",
      "mars",
      "jupiter",
      "saturn",
      "uranus",
      "neptune",
      "pluto"
    ]);
  });

  it("represents a deterministic activation without frontend-owned fields", () => {
    const activation: HumanDesignActivation = {
      side: "personality",
      body: "sun",
      longitude: 42.125,
      gate: 13,
      line: 2
    };

    expect(activation).toEqual({
      side: "personality",
      body: "sun",
      longitude: 42.125,
      gate: 13,
      line: 2
    });
  });
});
```

- [x] **Step 2: Run the failing test**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design/human-design-types.test.ts
```

Expected observation: FAIL because `packages/domain/src/human-design/human-design-types.ts` does not exist.

- [x] **Step 3: Add constants and base types**

Create `packages/domain/src/human-design/human-design-types.ts` with exported method constants, literal arrays and readonly TypeScript types listed in `Interfaces and Dependencies`.

- [x] **Step 4: Add module index**

Create `packages/domain/src/human-design/index.ts`:

```ts
export * from "./human-design-types";
```

- [x] **Step 5: Run the targeted test**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design/human-design-types.test.ts
```

Expected observation: PASS.

### Task 2: Static Centers And Channels Catalog

**Files:**
- Create: `packages/domain/src/human-design/catalog.ts`
- Create: `packages/domain/src/human-design/catalog.test.ts`
- Modify: `packages/domain/src/human-design/index.ts`

**Interfaces:**
- Consumes: `HumanDesignCenterCode`, `HumanDesignChannelCode`, `HumanDesignGateNumber`.
- Produces: validated center/channel catalogs and lookup helpers.

- [x] **Step 1: Write failing catalog tests**

Create `packages/domain/src/human-design/catalog.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  getHumanDesignCenter,
  getHumanDesignChannel,
  HUMAN_DESIGN_CENTERS,
  HUMAN_DESIGN_CHANNELS
} from "./catalog";

describe("Human Design catalog", () => {
  it("defines the 9 centers with stable codes", () => {
    expect(HUMAN_DESIGN_CENTERS.map((center) => center.code)).toEqual([
      "head",
      "ajna",
      "throat",
      "g",
      "heart",
      "spleen",
      "sacral",
      "solar_plexus",
      "root"
    ]);
  });

  it("defines all 36 channels with gate and center endpoints", () => {
    expect(HUMAN_DESIGN_CHANNELS).toHaveLength(36);
    expect(getHumanDesignChannel("20-34")).toEqual({
      code: "20-34",
      gateA: 20,
      gateB: 34,
      centerA: "throat",
      centerB: "sacral",
      circuit: "integration"
    });
    expect(getHumanDesignChannel("59-6")).toEqual({
      code: "59-6",
      gateA: 59,
      gateB: 6,
      centerA: "sacral",
      centerB: "solar_plexus",
      circuit: "tribal"
    });
  });

  it("rejects unsupported lookup codes", () => {
    expect(() => getHumanDesignCenter("unknown")).toThrow("Unsupported Human Design center");
    expect(() => getHumanDesignChannel("1-2")).toThrow("Unsupported Human Design channel");
  });
});
```

- [x] **Step 2: Run failing catalog tests**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design/catalog.test.ts
```

Expected observation: FAIL because `catalog.ts` does not exist.

- [x] **Step 3: Add catalog implementation**

Create `packages/domain/src/human-design/catalog.ts` with:

- the 9 centers in reference display order;
- the 36 canonical channels:

```ts
const channels = [
  ["64-47", 64, 47, "head", "ajna", "collective"],
  ["61-24", 61, 24, "head", "ajna", "individual"],
  ["63-4", 63, 4, "head", "ajna", "collective"],
  ["17-62", 17, 62, "ajna", "throat", "collective"],
  ["43-23", 43, 23, "ajna", "throat", "individual"],
  ["11-56", 11, 56, "ajna", "throat", "collective"],
  ["31-7", 31, 7, "throat", "g", "collective"],
  ["8-1", 8, 1, "throat", "g", "individual"],
  ["33-13", 33, 13, "throat", "g", "collective"],
  ["20-10", 20, 10, "throat", "g", "integration"],
  ["45-21", 45, 21, "throat", "heart", "tribal"],
  ["35-36", 35, 36, "throat", "solar_plexus", "collective"],
  ["12-22", 12, 22, "throat", "solar_plexus", "individual"],
  ["16-48", 16, 48, "throat", "spleen", "collective"],
  ["20-57", 20, 57, "throat", "spleen", "integration"],
  ["20-34", 20, 34, "throat", "sacral", "integration"],
  ["2-14", 2, 14, "g", "sacral", "individual"],
  ["15-5", 15, 5, "g", "sacral", "collective"],
  ["46-29", 46, 29, "g", "sacral", "collective"],
  ["10-34", 10, 34, "g", "sacral", "integration"],
  ["25-51", 25, 51, "g", "heart", "individual"],
  ["10-57", 10, 57, "g", "spleen", "integration"],
  ["40-37", 40, 37, "heart", "solar_plexus", "tribal"],
  ["26-44", 26, 44, "heart", "spleen", "tribal"],
  ["59-6", 59, 6, "sacral", "solar_plexus", "tribal"],
  ["34-57", 34, 57, "sacral", "spleen", "integration"],
  ["27-50", 27, 50, "sacral", "spleen", "tribal"],
  ["3-60", 3, 60, "sacral", "root", "individual"],
  ["42-53", 42, 53, "sacral", "root", "collective"],
  ["9-52", 9, 52, "sacral", "root", "collective"],
  ["32-54", 32, 54, "spleen", "root", "tribal"],
  ["28-38", 28, 38, "spleen", "root", "individual"],
  ["18-58", 18, 58, "spleen", "root", "collective"],
  ["30-41", 30, 41, "solar_plexus", "root", "collective"],
  ["55-39", 55, 39, "solar_plexus", "root", "individual"],
  ["49-19", 49, 19, "solar_plexus", "root", "tribal"]
] as const;
```

- channel endpoint gates and centers;
- a bounded `circuit` label: `"individual" | "collective" | "tribal" | "integration"`;
- lookup helpers that throw stable domain errors.

- [x] **Step 4: Export catalog**

Append to `packages/domain/src/human-design/index.ts`:

```ts
export * from "./catalog";
```

- [x] **Step 5: Run targeted tests**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design/catalog.test.ts packages/domain/src/human-design/human-design-types.test.ts
```

Expected observation: PASS.

### Task 3: Method Passport And Registry

**Files:**
- Create: `packages/domain/src/human-design/method-passport.ts`
- Create: `packages/domain/src/human-design/method-passport.test.ts`
- Modify: `packages/domain/src/human-design/index.ts`

**Interfaces:**
- Consumes: method constants, active bodies, catalogs.
- Produces: immutable method passport and resolver.

- [x] **Step 1: Write failing method passport tests**

Create `packages/domain/src/human-design/method-passport.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  HUMAN_DESIGN_METHOD_PASSPORT,
  resolveHumanDesignMethod
} from "./method-passport";

describe("Human Design method passport", () => {
  it("locks the selected production method choices", () => {
    expect(HUMAN_DESIGN_METHOD_PASSPORT).toMatchObject({
      methodCode: "human_design_classic",
      engineRevision: 1,
      zodiac: "tropical",
      designMoment: "exact_88_degree_solar_arc",
      earthCalculation: "sun_longitude_plus_180",
      nodeMode: "true_node_initial",
      supportedDepth: "gate_line"
    });
    expect(HUMAN_DESIGN_METHOD_PASSPORT.activeBodies).toHaveLength(13);
    expect(HUMAN_DESIGN_METHOD_PASSPORT.centers).toHaveLength(9);
    expect(HUMAN_DESIGN_METHOD_PASSPORT.channels).toHaveLength(36);
  });

  it("resolves only the supported method", () => {
    expect(resolveHumanDesignMethod("human_design_classic")).toBe(HUMAN_DESIGN_METHOD_PASSPORT);
    expect(() => resolveHumanDesignMethod("provider_default")).toThrow(
      "Unsupported Human Design method"
    );
  });
});
```

- [x] **Step 2: Run the failing method passport test**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design/method-passport.test.ts
```

Expected observation: FAIL because `method-passport.ts` does not exist.

- [x] **Step 3: Add method passport implementation**

Create `packages/domain/src/human-design/method-passport.ts` with an exported `HumanDesignMethodPassport` type, `HUMAN_DESIGN_METHOD_PASSPORT` object and `resolveHumanDesignMethod(code: string)`.

- [x] **Step 4: Export method passport**

Append to `packages/domain/src/human-design/index.ts`:

```ts
export * from "./method-passport";
```

- [x] **Step 5: Run targeted tests**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design/method-passport.test.ts packages/domain/src/human-design/catalog.test.ts packages/domain/src/human-design/human-design-types.test.ts
```

Expected observation: PASS.

### Task 4: Defined Channel And Center Derivation

**Files:**
- Create: `packages/domain/src/human-design/definition.ts`
- Create: `packages/domain/src/human-design/definition.test.ts`
- Modify: `packages/domain/src/human-design/index.ts`

**Interfaces:**
- Consumes: activation types and catalog.
- Produces: pure derivation helpers used by the later calculation engine.

- [x] **Step 1: Write failing definition tests**

Create `packages/domain/src/human-design/definition.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deriveDefinedCenters, deriveDefinedChannels } from "./definition";
import type { HumanDesignActivation } from "./human-design-types";

const activation = (gate: HumanDesignActivation["gate"]): HumanDesignActivation => ({
  side: "personality",
  body: "sun",
  longitude: gate,
  gate,
  line: 1
});

describe("Human Design definition derivation", () => {
  it("defines channels only when both endpoint gates are active", () => {
    const channels = deriveDefinedChannels([activation(34), activation(20), activation(59)]);

    expect(channels).toEqual([
      {
        code: "20-34",
        gates: [20, 34],
        centers: ["throat", "sacral"],
        circuit: "integration"
      }
    ]);
  });

  it("derives sorted unique centers from defined channels", () => {
    const centers = deriveDefinedCenters([
      {
        code: "20-34",
        gates: [20, 34],
        centers: ["throat", "sacral"],
        circuit: "integration"
      },
      {
        code: "59-6",
        gates: [59, 6],
        centers: ["sacral", "solar_plexus"],
        circuit: "tribal"
      }
    ]);

    expect(centers).toEqual([
      { code: "throat", definedByChannels: ["20-34"] },
      { code: "sacral", definedByChannels: ["20-34", "59-6"] },
      { code: "solar_plexus", definedByChannels: ["59-6"] }
    ]);
  });
});
```

- [x] **Step 2: Run failing definition tests**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design/definition.test.ts
```

Expected observation: FAIL because `definition.ts` does not exist.

- [x] **Step 3: Add definition implementation**

Create `packages/domain/src/human-design/definition.ts` with deterministic helpers:

- collect active gates across personality and design activations;
- emit channels in catalog order only;
- emit centers in center catalog order only;
- never infer type, authority or profile in this task.

- [x] **Step 4: Export definition helpers**

Append to `packages/domain/src/human-design/index.ts`:

```ts
export * from "./definition";
```

- [x] **Step 5: Run targeted tests**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design/definition.test.ts packages/domain/src/human-design/method-passport.test.ts packages/domain/src/human-design/catalog.test.ts packages/domain/src/human-design/human-design-types.test.ts
```

Expected observation: PASS.

### Task 5: Package Export And Foundation Gate

**Files:**
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Consumes: `packages/domain/src/human-design/index.ts`.
- Produces: public domain package export for later contract/API slices.

- [x] **Step 1: Add failing package export test**

Create or update `packages/domain/src/human-design/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  HUMAN_DESIGN_METHOD_CODE,
  HUMAN_DESIGN_METHOD_PASSPORT,
  deriveDefinedChannels
} from ".";

describe("Human Design module exports", () => {
  it("exports the foundation API from the feature index", () => {
    expect(HUMAN_DESIGN_METHOD_CODE).toBe("human_design_classic");
    expect(HUMAN_DESIGN_METHOD_PASSPORT.channels).toHaveLength(36);
    expect(typeof deriveDefinedChannels).toBe("function");
  });
});
```

- [x] **Step 2: Run failing export test**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design/index.test.ts
```

Expected observation: PASS for feature index; root package export is not checked yet.

- [x] **Step 3: Export Human Design from root domain index**

Append to `packages/domain/src/index.ts`:

```ts
export * from "./human-design";
```

- [x] **Step 4: Run foundation tests and typecheck**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design
pnpm --filter @elevenhouse/domain typecheck
```

Expected observation: PASS.

- [x] **Step 5: Run docs/checksum safety checks**

Run:

```bash
pnpm docs:check:test
pnpm docs:check
git diff --check -- docs/superpowers/plans/2026-07-21-human-design-engine-foundation.md docs/superpowers/specs/2026-07-21-human-design-production-design.md packages/domain/src/index.ts packages/domain/src/human-design
```

Expected observation: PASS.

## Validation and Acceptance

Foundation acceptance requires:

- `pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design`
- `pnpm --filter @elevenhouse/domain typecheck`
- `pnpm docs:check:test`
- `pnpm docs:check`
- `git diff --check -- docs/superpowers/plans/2026-07-21-human-design-engine-foundation.md docs/superpowers/specs/2026-07-21-human-design-production-design.md packages/domain/src/index.ts packages/domain/src/human-design`

No runtime E2E or design parity is claimed for this foundation slice because it creates no visible UI and no route.

## Idempotence and Recovery

- Re-running tests is safe and side-effect free.
- Re-running patches must start by reading current target files and `git diff -- <path>`.
- No DB migrations, service lifecycle changes, external API calls, commits, pushes or deployments are part of this plan.
- If another agent edits `packages/domain/src/index.ts` or `packages/domain/src/human-design/**`, stop and review the combined diff before continuing.

## Artifacts and Notes

- Spec: `docs/superpowers/specs/2026-07-21-human-design-production-design.md`
- Plan: `docs/superpowers/plans/2026-07-21-human-design-engine-foundation.md`
- External research sources are recorded in the spec, not repeated here.

## Outcomes & Retrospective

- Completed: Human Design method constants, active bodies, center/channel codes, static catalog, method passport, definition helpers and root domain exports are implemented.
- Completed: targeted HD tests, domain typecheck, documentation checks and owned-file whitespace checks pass.
- Not included: benchmark fixtures, provider integration, full birth-data calculation, type/authority/profile derivation, API, DB persistence, UI, PDF and client delivery remain for subsequent execution packages.
- Discovery: broad `pnpm test` currently includes unrelated messaging WIP (`packages/contracts/src/messaging.test.ts`) and is not clean evidence for this Human Design slice.

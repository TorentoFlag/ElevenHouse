# Human Design Compatibility Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the next Human Design end-state mode:
`Партнёрский разбор` for two owner-scoped CRM clients with deterministic
connection mechanics, saved calculations and an authenticated UI state.

**Architecture:** Reuse the proven individual Human Design pipeline twice:
CRM client birth data -> chart-engine resolved longitudes ->
`buildHumanDesignIndividualBaseResult`. A new pure domain layer derives a
versioned compatibility result from the two individual results. API, DB storage
and frontend consume the shared contract; no browser arithmetic and no
third-party Human Design runtime are introduced.

**Tech Stack:** TypeScript, Zod contracts, NestJS `astrologer-api`,
`@elevenhouse/domain`, shared `Calculations` store, React Query, Vitest,
authenticated browser verification for `/human-design`.

## Global Constraints

- `human_design_classic` remains the only enabled Human Design method.
- Compatibility requires exactly two distinct owner-scoped CRM clients.
- Manual or anonymous participants are out of scope for this slice.
- Frontend never calculates Human Design values or connection dynamics.
- External Human Design APIs and libraries are benchmark/reference sources only.
- Preview is read-only; persist/recalculate are CSRF-protected state changes.
- Persisted compatibility records use `module = human_design` and
  `mode = compatibility`.
- Recalculate keeps the original subject/partner CRM identities and reloads
  current CRM birth data explicitly.
- PDF, AI draft, presentation mode, transits and client delivery remain
  disabled until separate contours exist.
- Work in shared `main` and stage exact Human Design paths only.

---

## Research

Question:
What should Human Design compatibility v1 calculate and display without adding
a third-party runtime dependency or widening ElevenHouse's closed CRM model?

Decision affected:
Domain result shape, API contract and UI state for `Партнёрский разбор`.

Accessed: 2026-07-23.

### Sources

- `docs/superpowers/specs/2026-07-21-human-design-production-design.md` -
  approved product target and architecture boundary.
- `docs/superpowers/plans/2026-07-22-human-design-fixture-and-responsive-qa.md`
  - implemented individual fixture/runtime confidence gate.
- https://roxyapi.com/products/human-design-api - current product docs for
  Human Design connection charts and relationship dynamics.
- https://bodygraph.com/docs/ - BodyGraph API docs list relationship data as a
  dedicated endpoint family.
- https://bodygraph.com/human-design-api/ - BodyGraph API overview of
  structured Human Design chart output fields.
- https://humandesignhub.app/en/human-design-api - HumanDesignHub API overview
  lists transits, composites and group penta as separate calculation products.

### Findings

- Repository evidence: individual v1 already provides all inputs needed for a
  first compatibility result: active gates, defined channels, defined centers,
  type, authority, profile, definition and checksums for each participant.
- Repository evidence: the generic calculation store already accepts
  `module = human_design` and can persist `mode = compatibility` without a new
  table when the result contract is versioned.
- Sourced fact: RoxyAPI describes connection chart dynamics by channel category:
  electromagnetic, dominance, compromise and companionship.
- Sourced fact: BodyGraph exposes Human Design relationship data separately
  from individual chart data.
- Sourced fact: HumanDesignHub treats composites/compatibility and transits as
  separate API products rather than one overloaded individual chart response.
- Inference: ElevenHouse v1 should derive connection mechanics from two
  deterministic individual results, store both individual snapshots inside the
  compatibility result and avoid a new provider call beyond the two resolved
  individual inputs.
- Inference: The UI should expose two individual summary panels plus a
  connection section, not replace individual mechanics with a vague score.

### Options

1. **Internal domain compatibility over two individual results.** Benefits:
   deterministic, private, testable, reuses implemented pipeline, aligns with
   closed CRM model. Risks: requires careful categorical fixture coverage for
   channel dynamics.
2. **Runtime third-party connection API.** Benefits: broader proprietary field
   coverage quickly. Risks: privacy, availability, pricing, vendor lock, method
   opacity and violation of the existing "own the engine" decision.
3. **UI-only comparison of two individual charts.** Benefits: smaller UI
   change. Risks: no authoritative connection result, no saved checksum and no
   reusable API/PDF/AI foundation.

### Recommendation

Use option 1. It is the only direction that preserves ElevenHouse's domain
authority while creating a durable result that later PDF, AI and client
delivery contours can consume.

### Rejected alternatives

- Runtime third-party connection API: rejected for privacy, reliability,
  vendor-lock and method-versioning reasons.
- UI-only comparison: rejected because it would create browser-owned business
  semantics and no checksum-bound saved result.

### User decisions

none

## Progress

- [x] 2026-07-23: Documentation synced after individual v1 fixture/runtime
  completion.
- [x] 2026-07-23: Compatibility selected as the next Human Design end-state
  mode because it reuses the proven individual pipeline and does not require
  PDF/publication/AI/transit overlay prerequisites.
- [x] 2026-07-23: Task 1 domain connection mechanics implemented with
  deterministic dynamic classification, compatibility input fingerprint,
  result checksum and root domain export.
- [x] 2026-07-23: Task 2 shared contracts and `astrologer-api`
  preview/persist/recalculate support implemented with service and HTTP e2e
  coverage.

## Surprises & Discoveries

- `docs/api/api-boundaries.md` still described saved-calculation frontend
  rendering as future even though `/human-design` already reopens saved
  individual results through the generic calculations list.

## Decision Log

- 2026-07-23, agent: Implement `Партнёрский разбор` before `Транзиты`, `PDF`,
  `AI-разбор`, `Презентация` and `Клиенту`; it is the closest end-state mode to
  the verified individual result and has the lowest dependency blast radius.
- 2026-07-23, agent: Store compatibility as `module = human_design`,
  `mode = compatibility` in the generic calculation store, mirroring Numerology
  and Matrix mode handling.

## Outcomes & Retrospective

Partial implementation. The domain/API contour now produces and persists a
checksum-bound `human-design-compatibility-result.v1` from two owner-scoped CRM
clients. Frontend partner mode and browser evidence remain pending in Tasks
3-4.

## Context and Orientation

Current individual contour:

```text
apps/astrologer-web `/human-design`
  -> packages/contracts/src/human-design.ts
  -> apps/astrologer-api/src/modules/human-design
  -> packages/chart-engine-client
  -> apps/chart-engine `/v1/positions`
  -> packages/domain/src/human-design
  -> calculation_records / participants / client links
```

Compatibility contour:

```text
subject CRM client + partner CRM client
  -> resolve each client through the existing HumanDesignResolvedInputProvider
  -> build two HumanDesignIndividualBaseResult objects
  -> derive HumanDesignCompatibilityResult in domain
  -> persist one shared calculation with subject and partner participants
  -> render partner mode in `/human-design`
```

Defined terms:

- `electromagnetic`: each participant activates one opposite gate of a channel;
  together they define the channel.
- `companionship`: both participants already define the same channel.
- `dominance`: one participant defines a full channel and the other does not
  activate either gate of that channel.
- `compromise`: one participant defines a full channel and the other activates
  exactly one gate of that channel.
- `sharedDefinedCenter`: a center defined in both individual charts.
- `bridgedCenter`: a center defined only when the two charts are considered
  together through electromagnetic channels.

## Interfaces and Dependencies

New domain interfaces:

```ts
export type HumanDesignConnectionDynamicCode =
  | "electromagnetic"
  | "companionship"
  | "dominance"
  | "compromise";

export type HumanDesignCompatibilityParticipantRole = "subject" | "partner";

export type HumanDesignConnectionChannel = {
  readonly code: HumanDesignChannelCode;
  readonly gates: readonly [HumanDesignGateNumber, HumanDesignGateNumber];
  readonly centers: readonly [HumanDesignCenterCode, HumanDesignCenterCode];
  readonly circuit: HumanDesignCircuit;
  readonly dynamic: HumanDesignConnectionDynamicCode;
  readonly subjectGateState: "none" | "hanging" | "full";
  readonly partnerGateState: "none" | "hanging" | "full";
};

export type HumanDesignCompatibilityResult = {
  readonly methodCode: typeof HUMAN_DESIGN_METHOD_CODE;
  readonly engineRevision: typeof HUMAN_DESIGN_ENGINE_REVISION;
  readonly schemaVersion: "human-design-compatibility-result.v1";
  readonly mode: "compatibility";
  readonly participants: {
    readonly subject: HumanDesignIndividualBaseResult;
    readonly partner: HumanDesignIndividualBaseResult;
  };
  readonly connectionChannels: readonly HumanDesignConnectionChannel[];
  readonly dynamicCounts: Record<HumanDesignConnectionDynamicCode, number>;
  readonly sharedDefinedCenters: readonly HumanDesignCenterCode[];
  readonly bridgedCenters: readonly HumanDesignCenterCode[];
  readonly inputFingerprint: HumanDesignCompatibilityInputFingerprint;
  readonly resultChecksum: HumanDesignResultChecksum;
};

export type HumanDesignCompatibilityInputFingerprint = {
  readonly algorithm: "sha256";
  readonly canonicalization: "json-stable-v1";
  readonly scope: "human-design-compatibility-input.v1";
  readonly value: `sha256:${string}`;
};
```

Shared contract changes:

```ts
const humanDesignModeSchema = z.enum(["individual", "compatibility"]);
```

Preview request variants:

```ts
{
  mode: "compatibility",
  methodCode: "human_design_classic",
  source: "client_pair",
  subjectClientId: string,
  partnerClientId: string
}
```

Generic calculation participants:

```ts
[
  { role: "subject", source: "crm_client", clientId: subjectClientId },
  { role: "partner", source: "crm_client", clientId: partnerClientId }
]
```

## Plan of Work

### Task 1: Domain Connection Mechanics

**Files:**

- Create: `packages/domain/src/human-design/compatibility.ts`
- Create: `packages/domain/src/human-design/compatibility.test.ts`
- Modify: `packages/domain/src/human-design/index.ts`

**Interfaces:**

- Consumes: `HumanDesignIndividualBaseResult`,
  `HUMAN_DESIGN_CHANNELS`, `HumanDesignChannelCode`,
  `HumanDesignCenterCode`.
- Produces: `buildHumanDesignCompatibilityResult(input)`,
  `HumanDesignCompatibilityResult`, dynamic counts and center summaries.

- [x] **Step 1: Write failing dynamic-classification tests**

Create `packages/domain/src/human-design/compatibility.test.ts` with fixtures
that cover all four channel dynamics:

```ts
import { describe, expect, it } from "vitest";
import { buildHumanDesignCompatibilityResult } from "./compatibility";
import type { HumanDesignIndividualBaseResult } from "./individual";

describe("Human Design compatibility mechanics", () => {
  it("classifies electromagnetic, companionship, dominance and compromise channels", () => {
    const result = buildHumanDesignCompatibilityResult({
      subject: individualWithChannels(["31-7", "30-41"], [43]),
      partner: individualWithChannels(["31-7", "20-10"], [23, 41])
    });

    expect(result.mode).toBe("compatibility");
    expect(result.connectionChannels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "43-23", dynamic: "electromagnetic" }),
        expect.objectContaining({ code: "31-7", dynamic: "companionship" }),
        expect.objectContaining({ code: "20-10", dynamic: "dominance" }),
        expect.objectContaining({ code: "30-41", dynamic: "compromise" })
      ])
    );
    expect(result.dynamicCounts).toMatchObject({
      electromagnetic: 1,
      companionship: 1,
      dominance: 1,
      compromise: 1
    });
  });
});
```

Use a local `individualWithChannels()` helper that constructs the minimum valid
`HumanDesignIndividualBaseResult` shape from an existing individual fixture in
`individual.test.ts`.

- [x] **Step 2: Verify the test fails for missing implementation**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design/compatibility.test.ts
```

Expected observation: FAIL because `./compatibility` does not exist.

Observed 2026-07-23: FAIL with `Cannot find module './compatibility'`.

- [x] **Step 3: Implement pure domain derivation**

Create `packages/domain/src/human-design/compatibility.ts` with deterministic
helpers. The compatibility input fingerprint hashes only the method/mode and
the two participant individual input fingerprints in stable role order:

```ts
import { createHash } from "node:crypto";
import { canonicalizeHumanDesignChecksumPayload } from "./result-checksum";

function createHumanDesignCompatibilityInputFingerprint(input: {
  readonly subject: HumanDesignIndividualBaseResult;
  readonly partner: HumanDesignIndividualBaseResult;
}): HumanDesignCompatibilityInputFingerprint {
  const payload = canonicalizeHumanDesignChecksumPayload({
    scope: "human-design-compatibility-input.v1",
    methodCode: HUMAN_DESIGN_METHOD_CODE,
    mode: "compatibility",
    subject: input.subject.inputFingerprint.value,
    partner: input.partner.inputFingerprint.value
  });
  const digest = createHash("sha256").update(payload).digest("hex");
  return {
    algorithm: "sha256",
    canonicalization: "json-stable-v1",
    scope: "human-design-compatibility-input.v1",
    value: `sha256:${digest}`
  };
}

export function buildHumanDesignCompatibilityResult(input: {
  readonly subject: HumanDesignIndividualBaseResult;
  readonly partner: HumanDesignIndividualBaseResult;
}): HumanDesignCompatibilityResult {
  const connectionChannels = HUMAN_DESIGN_CHANNELS.flatMap((channel) =>
    classifyConnectionChannel(channel, input.subject, input.partner)
  );
  const dynamicCounts = countConnectionDynamics(connectionChannels);
  const sharedDefinedCenters = intersectCenters(
    input.subject.definedCenters,
    input.partner.definedCenters
  );
  const bridgedCenters = deriveBridgedCenters(connectionChannels, input.subject, input.partner);
  const withoutChecksum = {
    methodCode: HUMAN_DESIGN_METHOD_CODE,
    engineRevision: HUMAN_DESIGN_ENGINE_REVISION,
    schemaVersion: "human-design-compatibility-result.v1" as const,
    mode: "compatibility" as const,
    participants: input,
    connectionChannels,
    dynamicCounts,
    sharedDefinedCenters,
    bridgedCenters,
    inputFingerprint: createHumanDesignCompatibilityInputFingerprint(input)
  };

  return {
    ...withoutChecksum,
    resultChecksum: createHumanDesignResultChecksum(withoutChecksum)
  };
}
```

- [x] **Step 4: Export and run domain tests**

Append to `packages/domain/src/human-design/index.ts`:

```ts
export * from "./compatibility";
```

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design
```

Expected observation: PASS for the existing individual suite plus compatibility.

Observed 2026-07-23: PASS, 17 files and 54 tests.

### Task 2: Shared Contract And API Service

**Files:**

- Modify: `packages/contracts/src/human-design.ts`
- Modify: `packages/contracts/src/human-design.test.ts`
- Modify: `apps/astrologer-api/src/modules/human-design/human-design.service.ts`
- Modify: `apps/astrologer-api/src/modules/human-design/human-design.service.test.ts`
- Modify: `apps/astrologer-api/src/modules/human-design/human-design.e2e.test.ts`

**Interfaces:**

- Consumes: Task 1 `HumanDesignCompatibilityResult`.
- Produces: preview/persist/recalculate support for
  `mode = "compatibility"` and `source = "client_pair"`.

- [x] **Step 1: Add failing contract tests**

Add tests that prove:

```ts
humanDesignPreviewRequestSchema.parse({
  mode: "compatibility",
  methodCode: "human_design_classic",
  source: "client_pair",
  subjectClientId: subjectId,
  partnerClientId: partnerId
});
```

passes, while equal subject/partner client ids fail.

- [x] **Step 2: Extend contract schemas**

Update `humanDesignModeSchema`, add compatibility preview/persist request
schemas, add `humanDesignCompatibilityResultSchema`, and change
`humanDesignPreviewResponseSchema` / `humanDesignCalculationResponseSchema` to
accept `individual | compatibility` result unions.

- [x] **Step 3: Add failing service tests**

Prove that preview resolves both clients, rejects same-client pairs with
`400 HUMAN_DESIGN_VALIDATION_FAILED`, rejects unowned/missing partners with
`404 HUMAN_DESIGN_CLIENT_NOT_FOUND`, and creates no calculation rows on preview.

- [x] **Step 4: Implement service branching**

In `HumanDesignService`, branch by parsed mode:

```ts
if (parsedBody.mode === "compatibility") {
  const subject = await this.resolveClientInput({ ownerUserId, request: subjectRequest });
  const partner = await this.resolveClientInput({ ownerUserId, request: partnerRequest });
  return humanDesignPreviewResponseSchema.parse({
    result: buildHumanDesignCompatibilityResult({
      subject: buildHumanDesignIndividualBaseResult(subject.resolvedLongitudes),
      partner: buildHumanDesignIndividualBaseResult(partner.resolvedLongitudes)
    })
  });
}
```

Persist with two participants, `linkClientIds: [subject.clientId,
partner.clientId]`, stable title
`${subject.displayName} + ${partner.displayName} - Партнёрский Human Design`
and `mode: "compatibility"`.

- [x] **Step 5: Run contract and API tests**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/contracts/src/human-design.test.ts apps/astrologer-api/src/modules/human-design/human-design.service.test.ts apps/astrologer-api/src/modules/human-design/human-design.e2e.test.ts
```

Expected observation: PASS.

Observed 2026-07-23: PASS, 3 test files and 32 tests; contracts and
`astrologer-api` typecheck passed after rebuilding affected package
declarations.

### Task 3: Frontend Partner Mode

**Files:**

- Modify: `apps/astrologer-web/src/pages/human-design/HumanDesignPageView.tsx`
- Modify: `apps/astrologer-web/src/pages/human-design/useHumanDesignPageController.ts`
- Modify: `apps/astrologer-web/src/features/human-design/api/humanDesignApi.ts`
- Modify: `apps/astrologer-web/src/features/human-design/model/humanDesignSavedCalculationModel.ts`
- Modify: `apps/astrologer-web/src/features/human-design/model/humanDesignViewModel.ts`
- Modify: `apps/astrologer-web/src/pages/human-design/HumanDesignPageView.test.tsx`
- Modify: `apps/astrologer-web/src/features/human-design/model/humanDesignViewModel.test.ts`
- Modify: `apps/astrologer-web/src/pages/human-design/HumanDesignPage.module.css`

**Interfaces:**

- Consumes: compatibility contract result and existing bodygraph component.
- Produces: enabled `Партнёрский` mode with subject/partner client selectors,
  connection dynamics summary and saved compatibility reopen.

- [ ] **Step 1: Add failing frontend model tests**

Assert that a compatibility result produces:

```ts
expect(model.mode).toBe("compatibility");
expect(model.partnerSummary.name).toBe("Партнёр");
expect(model.connectionGroups.electromagnetic).toHaveLength(1);
expect(model.connectionGroups.companionship).toHaveLength(1);
expect(model.defaultDetailKey).toBe("compatibility:summary");
```

- [ ] **Step 2: Add controller tests**

Prove partner mode requires two distinct selected clients, sends
`source: "client_pair"`, persists the pair and filters saved calculations by
`mode = compatibility` when partner mode is active.

- [ ] **Step 3: Implement model/controller/UI**

Enable the partner tab, add a second `ClientSearchCombobox` labelled `Партнёр`,
keep `Транзиты`, `PDF`, `AI-разбор` and `Клиенту` disabled, and render
connection cards grouped by dynamic code. Reuse the existing bodygraph for the
subject and show partner mechanics as a compact second summary in this slice;
dual bodygraph layout can be refined after browser parity measurements.

- [ ] **Step 4: Run frontend tests**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts apps/astrologer-web/src/features/human-design/model/humanDesignViewModel.test.ts apps/astrologer-web/src/pages/human-design/HumanDesignPageView.test.tsx apps/astrologer-web/src/pages/human-design/useHumanDesignPageController.test.ts
```

Expected observation: PASS.

### Task 4: Runtime And Visual Evidence

**Files:**

- Modify: `docs/superpowers/plans/2026-07-23-human-design-compatibility-mode.md`
- Create: `.design-qa/human-design-compatibility-2026-07-23/`

**Interfaces:**

- Consumes: implemented API/frontend from Tasks 1-3.
- Produces: authenticated browser evidence and final plan outcomes.

- [ ] **Step 1: Read-only service check**

Run:

```bash
lsof -nP -iTCP:5173 -sTCP:LISTEN
lsof -nP -iTCP:3010 -sTCP:LISTEN
lsof -nP -iTCP:8012 -sTCP:LISTEN
```

Expected observation: required frontend/API/chart-engine ports are already
listening, or Runtime E2E is marked blocked without starting processes unless
the user authorizes lifecycle changes.

- [ ] **Step 2: Browser scenario**

In the authenticated Chrome surface, open `/human-design`, switch to
`Партнёрский`, select two CRM clients with ready birth data, preview, persist,
refresh saved list, reopen the saved compatibility calculation and recalculate.
Record network statuses:

```text
POST /api/human-design/preview -> 200
POST /api/human-design/calculations -> 201
GET /api/calculations?module=human_design... -> 200
POST /api/human-design/calculations/:id/recalculate -> 200
```

- [ ] **Step 3: Responsive and accessibility checks**

Capture desktop `1440x900` and mobile `390x844` screenshots, verify
`document.documentElement.scrollWidth === document.documentElement.clientWidth`,
exercise keyboard focus through mode tabs/client selectors/actions and inspect
console for unexpected errors.

- [ ] **Step 4: Final checks and commit**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design packages/contracts/src/human-design.test.ts apps/astrologer-api/src/modules/human-design apps/astrologer-web/src/features/human-design apps/astrologer-web/src/pages/human-design
git diff --check -- packages/domain/src/human-design packages/contracts/src/human-design.ts packages/contracts/src/human-design.test.ts apps/astrologer-api/src/modules/human-design apps/astrologer-web/src/features/human-design apps/astrologer-web/src/pages/human-design docs/superpowers/plans/2026-07-23-human-design-compatibility-mode.md
```

Expected observation: targeted tests and whitespace check pass.

## Validation and Acceptance

- Domain: all compatibility dynamics covered by deterministic tests.
- Contracts: invalid same-client pair rejected before service logic.
- API: preview read-only, persist/recalculate stateful, two owner-scoped
  participants linked and stable on recalculation.
- Frontend: partner mode sends/reads contract data and does not compute
  mechanics in browser.
- Runtime: authenticated network-backed browser flow passes for preview,
  persist, saved reopen and recalculate.
- Visual: desktop/mobile screenshots show no horizontal overflow and mode
  controls remain consistent with the Human Design reference visual language.

## Idempotence and Recovery

- Preview is safe to retry because it creates no rows.
- Persist deduplication uses the calculation store's fingerprint/checksum
  behavior for the current method/mode/pair.
- Recalculate is explicit and replaces the current saved result; it must not
  create result history.
- If chart-engine is unavailable, API returns observable provider failure and
  frontend shows a retryable error instead of fake compatibility output.
- If another agent edits the same Human Design files, reread full target files
  and `git diff -- <path>` before patching.

## Artifacts and Notes

- Spec: `docs/superpowers/specs/2026-07-21-human-design-production-design.md`
- Previous individual QA plan:
  `docs/superpowers/plans/2026-07-22-human-design-fixture-and-responsive-qa.md`
- Planned runtime artifacts:
  `.design-qa/human-design-compatibility-2026-07-23/`

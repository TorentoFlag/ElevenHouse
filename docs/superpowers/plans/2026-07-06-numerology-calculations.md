# Numerology Calculations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the production Numerology foundation with saved calculations, a complete Pythagorean engine, API contracts, persistence, and the first astrologer UI.

**Architecture:** Implement a shared `Calculations` lifecycle module and a separate deterministic `Numerology` module. Pythagorean ships first, while Vedic, Kabbalistic, Author, and future methods are added through versioned method profiles, engines, fixtures, and result block adapters without rewriting the page.

**Tech Stack:** TypeScript, Vitest, NestJS, Drizzle/PostgreSQL, Zod via `@elevenhouse/validation`, React 19, React Router, TanStack Query, ElevenHouse design system.

---

## Scope Check

This plan implements one product epic in safe vertical slices. Do not start with the UI. The durable order is:

1. Domain lifecycle and formula tests.
2. Contracts and persistence.
3. API.
4. Web UI.
5. Browser E2E and visual QA.

Client cabinet PDF/material generation remains behind the calculation artifact boundary unless the shared artifact pipeline is ready during implementation.

## File Structure

Create shared calculation lifecycle files:

- `packages/domain/src/calculations/calculation-types.ts`: lifecycle types, statuses, participants, versions, links, interpretations.
- `packages/domain/src/calculations/calculation-store.ts`: persistence port.
- `packages/domain/src/calculations/calculation-errors.ts`: domain errors.
- `packages/domain/src/calculations/calculation-use-cases.ts`: create, list, get, recalculate, link, save interpretation, approve interpretation, publish, archive.
- `packages/domain/src/calculations/index.ts`: public exports.
- `packages/domain/src/calculations/index.test.ts`: lifecycle tests with in-memory store.

Create numerology files:

- `packages/domain/src/numerology/numerology-types.ts`: method profile and result block types.
- `packages/domain/src/numerology/numerology-errors.ts`: validation and unsupported method errors.
- `packages/domain/src/numerology/name-normalization.ts`: name cleanup and Ё/Й policy.
- `packages/domain/src/numerology/number-reduction.ts`: reduction and master-number behavior.
- `packages/domain/src/numerology/pythagorean-profile.ts`: versioned Pythagorean profile.
- `packages/domain/src/numerology/pythagorean-engine.ts`: deterministic individual and compatibility calculations.
- `packages/domain/src/numerology/numerology-use-cases.ts`: validate request, calculate result, create calculation input for `Calculations`.
- `packages/domain/src/numerology/index.ts`: public exports.
- `packages/domain/src/numerology/*.test.ts`: formula and edge tests.

Create contracts:

- `packages/contracts/src/calculations.ts`: shared calculation response/list/link/publish/archive schemas.
- `packages/contracts/src/numerology.ts`: create/recalculate/AI draft schemas and response schemas.
- `packages/contracts/src/index.ts`: export new contracts.
- `packages/contracts/package.json`: add subpath exports `./calculations` and `./numerology`.

Create database schema and adapter:

- `packages/db/src/schema/calculations/calculation-values.ts`
- `packages/db/src/schema/calculations/calculation-records.schema.ts`
- `packages/db/src/schema/calculations/calculation-participants.schema.ts`
- `packages/db/src/schema/calculations/calculation-versions.schema.ts`
- `packages/db/src/schema/calculations/calculation-client-links.schema.ts`
- `packages/db/src/schema/calculations/calculation-interpretations.schema.ts`
- `packages/db/src/schema/calculations/calculation-artifacts.schema.ts`
- `packages/db/src/schema/calculations/relations.schema.ts`
- `packages/db/src/schema/calculations/index.ts`
- `packages/db/src/schema/index.ts`
- `packages/db/src/adapters/calculations/drizzle-calculation-store.ts`
- `packages/db/src/adapters/calculations/index.ts`
- `packages/db/package.json`: add `./calculations` and `./adapters/calculations` exports.

Create API modules:

- `apps/astrologer-api/src/modules/calculations/calculations.tokens.ts`
- `apps/astrologer-api/src/modules/calculations/calculations.service.ts`
- `apps/astrologer-api/src/modules/calculations/calculations.controller.ts`
- `apps/astrologer-api/src/modules/calculations/calculations.module.ts`
- `apps/astrologer-api/src/modules/calculations/calculations.service.test.ts`
- `apps/astrologer-api/src/modules/calculations/calculations.e2e.test.ts`
- `apps/astrologer-api/src/modules/numerology/numerology.service.ts`
- `apps/astrologer-api/src/modules/numerology/numerology.controller.ts`
- `apps/astrologer-api/src/modules/numerology/numerology.module.ts`
- `apps/astrologer-api/src/modules/numerology/numerology.service.test.ts`
- `apps/astrologer-api/src/modules/numerology/numerology.e2e.test.ts`
- `apps/astrologer-api/src/main.ts`: import new modules only if modules are currently assembled there.

Create astrologer web files:

- `apps/astrologer-web/src/features/calculations/api/calculationsApi.ts`
- `apps/astrologer-web/src/features/calculations/model/calculationStatus.ts`
- `apps/astrologer-web/src/features/calculations/components/SavedCalculationPicker.tsx`
- `apps/astrologer-web/src/features/numerology/api/numerologyApi.ts`
- `apps/astrologer-web/src/features/numerology/model/numerologyFormModel.ts`
- `apps/astrologer-web/src/features/numerology/model/numerologyResultModel.ts`
- `apps/astrologer-web/src/features/numerology/components/NumerologySetupModal.tsx`
- `apps/astrologer-web/src/features/numerology/components/PythagoreanMatrix.tsx`
- `apps/astrologer-web/src/features/numerology/components/NumerologyResultPanel.tsx`
- `apps/astrologer-web/src/features/numerology/components/NumerologyAiDraftPanel.tsx`
- `apps/astrologer-web/src/pages/numerology/NumerologyPage.tsx`
- `apps/astrologer-web/src/pages/numerology/NumerologyPageView.tsx`
- `apps/astrologer-web/src/pages/numerology/NumerologyPage.module.css`
- `apps/astrologer-web/src/pages/numerology/*.test.tsx`
- `apps/astrologer-web/src/router.tsx`
- `apps/astrologer-web/src/layouts/AstrologerNavigationDrawer/helpers/navigationDrawerItems.tsx`

## Task 1: Shared Calculations Domain

**Files:**
- Create: `packages/domain/src/calculations/calculation-types.ts`
- Create: `packages/domain/src/calculations/calculation-store.ts`
- Create: `packages/domain/src/calculations/calculation-errors.ts`
- Create: `packages/domain/src/calculations/calculation-use-cases.ts`
- Create: `packages/domain/src/calculations/index.ts`
- Create: `packages/domain/src/calculations/index.test.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Write failing lifecycle tests**

Create `packages/domain/src/calculations/index.test.ts` with tests for:

```ts
import { describe, expect, it } from "vitest";
import {
  archiveCalculation,
  createCalculation,
  linkCalculationToClient,
  publishCalculationToClient,
  saveCalculationInterpretation,
  approveCalculationInterpretation,
  recalculateCalculation
} from "./calculation-use-cases";
import type { CalculationRecord, CalculationStore } from "./calculation-store";

const ownerUserId = "00000000-0000-4000-8000-000000000001";
const clientId = "00000000-0000-4000-8000-000000000002";

function createMemoryStore(): CalculationStore {
  const records = new Map<string, CalculationRecord>();
  return {
    listByOwner: async () => ({ calculations: [...records.values()], total: records.size }),
    findByOwnerAndId: async ({ calculationId }) => records.get(calculationId) ?? null,
    create: async (input) => {
      const record: CalculationRecord = {
        id: input.idGenerator(),
        ownerUserId: input.ownerUserId,
        module: input.module,
        mode: input.mode,
        methodCode: input.methodCode,
        currentMethodVersion: input.methodVersion,
        title: input.title,
        status: "calculated",
        participants: input.participants,
        versions: [
          {
            id: input.versionIdGenerator(),
            versionNumber: 1,
            methodVersion: input.methodVersion,
            settingsSnapshot: input.settingsSnapshot,
            inputSnapshot: input.inputSnapshot,
            resultSnapshot: input.resultSnapshot,
            resultSummary: input.resultSummary,
            resultChecksum: input.resultChecksum,
            createdAt: input.now
          }
        ],
        links: [],
        interpretations: [],
        artifacts: [],
        createdAt: input.now,
        updatedAt: input.now
      };
      records.set(record.id, record);
      return record;
    },
    appendVersion: async (input) => {
      const current = records.get(input.calculationId);
      if (!current) return null;
      const next: CalculationRecord = {
        ...current,
        currentMethodVersion: input.methodVersion,
        versions: [
          ...current.versions,
          {
            id: input.versionIdGenerator(),
            versionNumber: current.versions.length + 1,
            methodVersion: input.methodVersion,
            settingsSnapshot: input.settingsSnapshot,
            inputSnapshot: input.inputSnapshot,
            resultSnapshot: input.resultSnapshot,
            resultSummary: input.resultSummary,
            resultChecksum: input.resultChecksum,
            createdAt: input.now
          }
        ],
        updatedAt: input.now
      };
      records.set(next.id, next);
      return next;
    },
    linkClient: async (input) => {
      const current = records.get(input.calculationId);
      if (!current) return null;
      const next: CalculationRecord = {
        ...current,
        status: "linked",
        links: [
          ...current.links,
          {
            clientId: input.clientId,
            visibility: "private_to_astrologer",
            linkedAt: input.now,
            publishedAt: null
          }
        ],
        updatedAt: input.now
      };
      records.set(next.id, next);
      return next;
    },
    publishClientLink: async (input) => {
      const current = records.get(input.calculationId);
      if (!current) return null;
      const next: CalculationRecord = {
        ...current,
        status: "published",
        links: current.links.map((link) =>
          link.clientId === input.clientId
            ? { ...link, visibility: "visible_to_client", publishedAt: input.now }
            : link
        ),
        updatedAt: input.now
      };
      records.set(next.id, next);
      return next;
    },
    saveInterpretation: async (input) => {
      const current = records.get(input.calculationId);
      if (!current) return null;
      const next: CalculationRecord = {
        ...current,
        interpretations: [
          ...current.interpretations,
          {
            id: input.interpretationIdGenerator(),
            versionId: input.versionId,
            source: input.source,
            status: "draft",
            text: input.text,
            modelId: input.modelId,
            promptVersion: input.promptVersion,
            approvedAt: null
          }
        ],
        updatedAt: input.now
      };
      records.set(next.id, next);
      return next;
    },
    approveInterpretation: async (input) => {
      const current = records.get(input.calculationId);
      if (!current) return null;
      const next: CalculationRecord = {
        ...current,
        interpretations: current.interpretations.map((interpretation) =>
          interpretation.id === input.interpretationId
            ? { ...interpretation, status: "approved", approvedAt: input.now }
            : interpretation
        ),
        updatedAt: input.now
      };
      records.set(next.id, next);
      return next;
    },
    archive: async (input) => {
      const current = records.get(input.calculationId);
      if (!current) return null;
      const next = { ...current, status: "archived" as const, updatedAt: input.now };
      records.set(next.id, next);
      return next;
    }
  };
}

describe("calculations lifecycle", () => {
  it("creates a calculated record with immutable version 1", async () => {
    const record = await createCalculation({
      store: createMemoryStore(),
      ownerUserId,
      module: "numerology",
      mode: "individual",
      methodCode: "pythagorean",
      methodVersion: "1.0.0",
      title: "Мария, Пифагор",
      participants: [
        {
          role: "subject",
          source: "manual",
          clientId: null,
          displayName: "Мария",
          birthDate: "1990-03-14",
          inputSnapshot: { fullName: "Мария" },
          manuallyOverridden: false
        }
      ],
      settingsSnapshot: { preserveMasterNumbers: ["11", "22", "33"] },
      inputSnapshot: { participants: 1 },
      resultSnapshot: { lifePath: 9 },
      resultSummary: { primaryLabel: "Путь 9" },
      resultChecksum: "sha256:fixture",
      idGenerator: () => "00000000-0000-4000-8000-000000000010",
      versionIdGenerator: () => "00000000-0000-4000-8000-000000000011",
      now: new Date("2026-07-06T10:00:00.000Z")
    });

    expect(record.status).toBe("calculated");
    expect(record.versions).toHaveLength(1);
    expect(record.versions[0]?.resultSnapshot).toEqual({ lifePath: 9 });
  });

  it("recalculates by appending a new version instead of overwriting version 1", async () => {
    const store = createMemoryStore();
    const created = await createCalculation({
      store,
      ownerUserId,
      module: "numerology",
      mode: "individual",
      methodCode: "pythagorean",
      methodVersion: "1.0.0",
      title: "Мария",
      participants: [],
      settingsSnapshot: {},
      inputSnapshot: { name: "Мария" },
      resultSnapshot: { lifePath: 9 },
      resultSummary: { primaryLabel: "Путь 9" },
      resultChecksum: "sha256:v1",
      idGenerator: () => "00000000-0000-4000-8000-000000000020",
      versionIdGenerator: () => "00000000-0000-4000-8000-000000000021",
      now: new Date("2026-07-06T10:00:00.000Z")
    });

    const updated = await recalculateCalculation({
      store,
      ownerUserId,
      calculationId: created.id,
      methodVersion: "1.0.0",
      settingsSnapshot: {},
      inputSnapshot: { name: "Мария Иванова" },
      resultSnapshot: { lifePath: 9, expression: 7 },
      resultSummary: { primaryLabel: "Путь 9" },
      resultChecksum: "sha256:v2",
      versionIdGenerator: () => "00000000-0000-4000-8000-000000000022",
      now: new Date("2026-07-06T11:00:00.000Z")
    });

    expect(updated.versions).toHaveLength(2);
    expect(updated.versions[0]?.resultSnapshot).toEqual({ lifePath: 9 });
    expect(updated.versions[1]?.resultSnapshot).toEqual({ lifePath: 9, expression: 7 });
  });

  it("does not publish until an interpretation is approved", async () => {
    const store = createMemoryStore();
    const created = await createCalculation({
      store,
      ownerUserId,
      module: "numerology",
      mode: "individual",
      methodCode: "pythagorean",
      methodVersion: "1.0.0",
      title: "CRM client",
      participants: [
        {
          role: "subject",
          source: "crm_client",
          clientId,
          displayName: "CRM Client",
          birthDate: "1990-03-14",
          inputSnapshot: {},
          manuallyOverridden: false
        }
      ],
      settingsSnapshot: {},
      inputSnapshot: {},
      resultSnapshot: {},
      resultSummary: {},
      resultChecksum: "sha256:v1",
      idGenerator: () => "00000000-0000-4000-8000-000000000030",
      versionIdGenerator: () => "00000000-0000-4000-8000-000000000031",
      now: new Date("2026-07-06T10:00:00.000Z")
    });

    const linked = await linkCalculationToClient({
      store,
      ownerUserId,
      calculationId: created.id,
      clientId,
      now: new Date("2026-07-06T11:00:00.000Z")
    });
    const draft = await saveCalculationInterpretation({
      store,
      ownerUserId,
      calculationId: created.id,
      versionId: created.versions[0]!.id,
      source: "manual",
      text: "Проверенная трактовка для клиента.",
      modelId: null,
      promptVersion: null,
      interpretationIdGenerator: () => "00000000-0000-4000-8000-000000000032",
      now: new Date("2026-07-06T11:10:00.000Z")
    });
    await expect(
      publishCalculationToClient({
        store,
        ownerUserId,
        calculationId: created.id,
        clientId,
        now: new Date("2026-07-06T11:30:00.000Z")
      })
    ).rejects.toThrow("Calculation requires approved interpretation before publishing");
    await approveCalculationInterpretation({
      store,
      ownerUserId,
      calculationId: created.id,
      interpretationId: draft.interpretations[0]!.id,
      now: new Date("2026-07-06T11:40:00.000Z")
    });
    const published = await publishCalculationToClient({
      store,
      ownerUserId,
      calculationId: created.id,
      clientId,
      now: new Date("2026-07-06T12:00:00.000Z")
    });

    expect(linked.links[0]?.visibility).toBe("private_to_astrologer");
    expect(published.links[0]?.visibility).toBe("visible_to_client");
  });

  it("archives a calculation without deleting versions", async () => {
    const store = createMemoryStore();
    const created = await createCalculation({
      store,
      ownerUserId,
      module: "numerology",
      mode: "individual",
      methodCode: "pythagorean",
      methodVersion: "1.0.0",
      title: "Archive me",
      participants: [],
      settingsSnapshot: {},
      inputSnapshot: {},
      resultSnapshot: {},
      resultSummary: {},
      resultChecksum: "sha256:v1",
      idGenerator: () => "00000000-0000-4000-8000-000000000040",
      versionIdGenerator: () => "00000000-0000-4000-8000-000000000041",
      now: new Date("2026-07-06T10:00:00.000Z")
    });

    const archived = await archiveCalculation({
      store,
      ownerUserId,
      calculationId: created.id,
      now: new Date("2026-07-06T12:00:00.000Z")
    });

    expect(archived.status).toBe("archived");
    expect(archived.versions).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
pnpm test packages/domain/src/calculations/index.test.ts
```

Expected: fail because `./calculation-use-cases` and related types do not exist.

- [ ] **Step 3: Implement calculation domain types and store port**

Create `calculation-types.ts` with:

```ts
export type CalculationModule = "numerology" | "chart" | "matrix" | "human_design";
export type CalculationMode = "individual" | "compatibility";
export type CalculationStatus = "calculated" | "linked" | "published" | "archived";
export type CalculationParticipantRole = "subject" | "partner";
export type CalculationParticipantSource = "crm_client" | "manual";
export type CalculationClientVisibility = "private_to_astrologer" | "visible_to_client";
export type CalculationInterpretationSource = "ai" | "manual";
export type CalculationInterpretationStatus = "draft" | "approved";

export type CalculationParticipant = {
  readonly role: CalculationParticipantRole;
  readonly source: CalculationParticipantSource;
  readonly clientId: string | null;
  readonly displayName: string;
  readonly birthDate: string | null;
  readonly inputSnapshot: unknown;
  readonly manuallyOverridden: boolean;
};

export type CalculationVersion = {
  readonly id: string;
  readonly versionNumber: number;
  readonly methodVersion: string;
  readonly settingsSnapshot: unknown;
  readonly inputSnapshot: unknown;
  readonly resultSnapshot: unknown;
  readonly resultSummary: unknown;
  readonly resultChecksum: string;
  readonly createdAt: string;
};

export type CalculationClientLink = {
  readonly clientId: string;
  readonly visibility: CalculationClientVisibility;
  readonly linkedAt: string;
  readonly publishedAt: string | null;
};

export type CalculationInterpretation = {
  readonly id: string;
  readonly versionId: string;
  readonly source: CalculationInterpretationSource;
  readonly status: CalculationInterpretationStatus;
  readonly text: string;
  readonly modelId: string | null;
  readonly promptVersion: string | null;
  readonly approvedAt: string | null;
};

export type CalculationArtifact = {
  readonly id: string;
  readonly versionId: string;
  readonly mediaAssetId: string;
  readonly artifactType: "pdf";
  readonly status: "generating" | "ready" | "failed";
};
```

Create `calculation-store.ts` with the `CalculationRecord`, `CalculationListResult`, and `CalculationStore` signatures used in the test.
Include `saveInterpretation` and `approveInterpretation` in the store port because publishing depends on an approved interpretation.

- [ ] **Step 4: Implement lifecycle use cases**

Create `calculation-errors.ts`:

```ts
export class CalculationNotFoundError extends Error {
  constructor() {
    super("Calculation was not found");
    this.name = "CalculationNotFoundError";
  }
}

export class CalculationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalculationValidationError";
  }
}
```

Create `calculation-use-cases.ts` with ownership checks and link validation:

```ts
import { normalizeRequiredString } from "../shared";
import { CalculationNotFoundError, CalculationValidationError } from "./calculation-errors";
import type { CalculationRecord, CalculationStore } from "./calculation-store";

export async function createCalculation(input: Parameters<CalculationStore["create"]>[0] & {
  readonly store: CalculationStore;
}): Promise<CalculationRecord> {
  return input.store.create({
    ...input,
    ownerUserId: normalizeRequiredString(input.ownerUserId, "Calculation owner user id is required"),
    title: normalizeRequiredString(input.title, "Calculation title is required")
  });
}

export async function recalculateCalculation(input: Parameters<CalculationStore["appendVersion"]>[0] & {
  readonly store: CalculationStore;
  readonly ownerUserId: string;
}): Promise<CalculationRecord> {
  await requireOwnedCalculation(input.store, input.ownerUserId, input.calculationId);
  const record = await input.store.appendVersion(input);
  if (!record) throw new CalculationNotFoundError();
  return record;
}

export async function linkCalculationToClient(input: {
  readonly store: CalculationStore;
  readonly ownerUserId: string;
  readonly calculationId: string;
  readonly clientId: string;
  readonly now: Date;
}): Promise<CalculationRecord> {
  const record = await requireOwnedCalculation(input.store, input.ownerUserId, input.calculationId);
  if (!record.participants.some((participant) => participant.source === "crm_client" && participant.clientId === input.clientId)) {
    throw new CalculationValidationError("Calculation can be linked only to a CRM participant");
  }
  const linked = await input.store.linkClient({
    calculationId: record.id,
    clientId: input.clientId,
    now: input.now.toISOString()
  });
  if (!linked) throw new CalculationNotFoundError();
  return linked;
}

export async function publishCalculationToClient(input: {
  readonly store: CalculationStore;
  readonly ownerUserId: string;
  readonly calculationId: string;
  readonly clientId: string;
  readonly now: Date;
}): Promise<CalculationRecord> {
  const record = await requireOwnedCalculation(input.store, input.ownerUserId, input.calculationId);
  if (!record.links.some((link) => link.clientId === input.clientId)) {
    throw new CalculationValidationError("Calculation must be linked before publishing");
  }
  if (!record.interpretations.some((interpretation) => interpretation.status === "approved")) {
    throw new CalculationValidationError("Calculation requires approved interpretation before publishing");
  }
  const published = await input.store.publishClientLink({
    calculationId: record.id,
    clientId: input.clientId,
    now: input.now.toISOString()
  });
  if (!published) throw new CalculationNotFoundError();
  return published;
}

export async function saveCalculationInterpretation(input: {
  readonly store: CalculationStore;
  readonly ownerUserId: string;
  readonly calculationId: string;
  readonly versionId: string;
  readonly source: "ai" | "manual";
  readonly text: string;
  readonly modelId: string | null;
  readonly promptVersion: string | null;
  readonly interpretationIdGenerator: () => string;
  readonly now: Date;
}): Promise<CalculationRecord> {
  await requireOwnedCalculation(input.store, input.ownerUserId, input.calculationId);
  const record = await input.store.saveInterpretation({
    calculationId: input.calculationId,
    versionId: input.versionId,
    source: input.source,
    text: normalizeRequiredString(input.text, "Calculation interpretation text is required"),
    modelId: input.modelId,
    promptVersion: input.promptVersion,
    interpretationIdGenerator: input.interpretationIdGenerator,
    now: input.now.toISOString()
  });
  if (!record) throw new CalculationNotFoundError();
  return record;
}

export async function approveCalculationInterpretation(input: {
  readonly store: CalculationStore;
  readonly ownerUserId: string;
  readonly calculationId: string;
  readonly interpretationId: string;
  readonly now: Date;
}): Promise<CalculationRecord> {
  await requireOwnedCalculation(input.store, input.ownerUserId, input.calculationId);
  const record = await input.store.approveInterpretation({
    calculationId: input.calculationId,
    interpretationId: normalizeRequiredString(input.interpretationId, "Calculation interpretation id is required"),
    now: input.now.toISOString()
  });
  if (!record) throw new CalculationNotFoundError();
  return record;
}

export async function archiveCalculation(input: {
  readonly store: CalculationStore;
  readonly ownerUserId: string;
  readonly calculationId: string;
  readonly now: Date;
}): Promise<CalculationRecord> {
  await requireOwnedCalculation(input.store, input.ownerUserId, input.calculationId);
  const archived = await input.store.archive({
    calculationId: input.calculationId,
    now: input.now.toISOString()
  });
  if (!archived) throw new CalculationNotFoundError();
  return archived;
}

async function requireOwnedCalculation(
  store: CalculationStore,
  ownerUserId: string,
  calculationId: string
): Promise<CalculationRecord> {
  const record = await store.findByOwnerAndId({
    ownerUserId: normalizeRequiredString(ownerUserId, "Calculation owner user id is required"),
    calculationId: normalizeRequiredString(calculationId, "Calculation id is required")
  });
  if (!record) throw new CalculationNotFoundError();
  return record;
}
```

- [ ] **Step 5: Export and verify**

Update `packages/domain/src/calculations/index.ts`:

```ts
export * from "./calculation-errors";
export * from "./calculation-store";
export * from "./calculation-types";
export * from "./calculation-use-cases";
```

Update `packages/domain/src/index.ts`:

```ts
export * from "./calculations";
```

Run:

```bash
pnpm test packages/domain/src/calculations/index.test.ts
pnpm --filter @elevenhouse/domain typecheck
```

Expected: both pass.

- [ ] **Step 6: Commit Task 1**

```bash
git add packages/domain/src/calculations packages/domain/src/index.ts
git commit -m "feat: add calculation lifecycle domain"
```

## Task 2: Pythagorean Numerology Engine

**Files:**
- Create: `packages/domain/src/numerology/numerology-types.ts`
- Create: `packages/domain/src/numerology/numerology-errors.ts`
- Create: `packages/domain/src/numerology/name-normalization.ts`
- Create: `packages/domain/src/numerology/name-normalization.test.ts`
- Create: `packages/domain/src/numerology/number-reduction.ts`
- Create: `packages/domain/src/numerology/number-reduction.test.ts`
- Create: `packages/domain/src/numerology/pythagorean-profile.ts`
- Create: `packages/domain/src/numerology/pythagorean-engine.ts`
- Create: `packages/domain/src/numerology/pythagorean-engine.test.ts`
- Create: `packages/domain/src/numerology/numerology-use-cases.ts`
- Create: `packages/domain/src/numerology/index.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Write failing formula tests**

Create `pythagorean-engine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calculatePythagoreanCompatibility, calculatePythagoreanIndividual } from "./pythagorean-engine";
import { pythagoreanProfileV1 } from "./pythagorean-profile";

describe("Pythagorean numerology engine", () => {
  it("calculates base numbers and psychomatrix for 14.03.1990", () => {
    const result = calculatePythagoreanIndividual({
      profile: pythagoreanProfileV1,
      participant: {
        fullName: "Мария Иванова",
        birthDate: "1990-03-14"
      },
      settings: {
        masterNumbers: { mode: "preserve_all" },
        nameNormalization: { yoPolicy: "separate", shortIpolicy: "separate" },
        includeNameNumbers: true,
        includePsychomatrix: true,
        includeStrengthLines: true,
        forecastDate: "2026-06-17"
      }
    });

    expect(result.keyNumbers.lifePath.value).toBe(9);
    expect(result.keyNumbers.birthday.value).toBe(5);
    expect(result.forecast?.personalYear.value).toBe(9);
    expect(result.forecast?.personalMonth.value).toBe(6);
    expect(result.forecast?.personalDay.value).toBe(5);
    expect(result.psychomatrix?.cells).toMatchObject({
      "1": "11",
      "2": "22",
      "3": "3",
      "4": "4",
      "5": "5",
      "6": "",
      "7": "77",
      "8": "",
      "9": "999"
    });
    expect(result.strengthLines.find((line) => line.code === "goal")?.value).toBe(5);
  });

  it("preserves master numbers when profile settings require it", () => {
    const result = calculatePythagoreanIndividual({
      profile: pythagoreanProfileV1,
      participant: { fullName: "Ааии", birthDate: "2009-01-01" },
      settings: {
        masterNumbers: { mode: "preserve_selected", values: [11] },
        nameNormalization: { yoPolicy: "separate", shortIpolicy: "separate" },
        includeNameNumbers: true,
        includePsychomatrix: false,
        includeStrengthLines: false
      }
    });

    expect(result.keyNumbers.expression?.value).toBe(11);
  });

  it("builds compatibility without requiring saved individual calculations", () => {
    const result = calculatePythagoreanCompatibility({
      profile: pythagoreanProfileV1,
      participants: [
        { fullName: "Мария Иванова", birthDate: "1990-03-14" },
        { fullName: "Иван Петров", birthDate: "1988-06-03" }
      ],
      settings: {
        masterNumbers: { mode: "preserve_all" },
        nameNormalization: { yoPolicy: "separate", shortIpolicy: "separate" },
        includeNameNumbers: true,
        includePsychomatrix: true,
        includeStrengthLines: true
      }
    });

    expect(result.pairNumber.value).toBeGreaterThanOrEqual(1);
    expect(result.keyNumberComparisons.length).toBeGreaterThan(0);
    expect(result.matrixComparisons.length).toBe(9);
    expect(result.strengthLineComparisons.length).toBe(8);
  });
});
```

- [ ] **Step 2: Write failing edge tests**

Create `name-normalization.test.ts` and `number-reduction.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeNumerologyName } from "./name-normalization";

describe("normalizeNumerologyName", () => {
  it("removes service symbols and keeps double names", () => {
    expect(
      normalizeNumerologyName(" Анна-Мария О'Коннор. ", {
        yoPolicy: "separate",
        shortIpolicy: "separate"
      })
    ).toBe("аннамарияоконнор");
  });

  it("can map Ё to Е and Й to И", () => {
    expect(
      normalizeNumerologyName("Семён Майский", {
        yoPolicy: "as_e",
        shortIpolicy: "as_i"
      })
    ).toBe("семенмаиский");
  });
});
```

```ts
import { describe, expect, it } from "vitest";
import { reduceNumber } from "./number-reduction";

describe("reduceNumber", () => {
  it("reduces to one digit by default", () => {
    expect(reduceNumber(29, { mode: "reduce_all" })).toBe(2);
  });

  it("preserves selected master numbers", () => {
    expect(reduceNumber(29, { mode: "preserve_selected", values: [11] })).toBe(11);
    expect(reduceNumber(33, { mode: "preserve_selected", values: [11, 22] })).toBe(6);
  });
});
```

Run:

```bash
pnpm test packages/domain/src/numerology
```

Expected: fail because numerology files do not exist.

- [ ] **Step 3: Implement method profile and helpers**

Create `numerology-types.ts` with profile, input, and result types. Include:

```ts
export type NumerologyMethodCode = "pythagorean" | "vedic" | "kabbalistic" | "author";
export type MasterNumberSettings =
  | { readonly mode: "preserve_all" }
  | { readonly mode: "reduce_all" }
  | { readonly mode: "preserve_selected"; readonly values: readonly number[] };

export type NameNormalizationSettings = {
  readonly yoPolicy: "separate" | "as_e";
  readonly shortIpolicy: "separate" | "as_i";
};

export type NumerologyParticipantInput = {
  readonly fullName: string;
  readonly birthDate: string;
};

export type PythagoreanSettings = {
  readonly masterNumbers: MasterNumberSettings;
  readonly nameNormalization: NameNormalizationSettings;
  readonly includeNameNumbers: boolean;
  readonly includePsychomatrix: boolean;
  readonly includeStrengthLines: boolean;
  readonly forecastDate?: string;
};

export type NumerologyMethodProfile = {
  readonly methodCode: NumerologyMethodCode;
  readonly methodVersion: string;
  readonly supportedModes: readonly ("individual" | "compatibility")[];
  readonly letterTable: Readonly<Record<string, number>>;
  readonly vowels: readonly string[];
  readonly strengthLines: readonly {
    readonly code: string;
    readonly label: string;
    readonly cells: readonly string[];
  }[];
};
```

Create `pythagorean-profile.ts` with the Russian letter table and eight lines from the Google Doc.

- [ ] **Step 4: Implement formula engine**

Implement `number-reduction.ts`, `name-normalization.ts`, and `pythagorean-engine.ts`. Required functions:

```ts
export function reduceNumber(value: number, settings: MasterNumberSettings): number;
export function normalizeNumerologyName(value: string, settings: NameNormalizationSettings): string;
export function calculatePythagoreanIndividual(input: {
  readonly profile: NumerologyMethodProfile;
  readonly participant: NumerologyParticipantInput;
  readonly settings: PythagoreanSettings;
}): PythagoreanIndividualResult;
export function calculatePythagoreanCompatibility(input: {
  readonly profile: NumerologyMethodProfile;
  readonly participants: readonly [NumerologyParticipantInput, NumerologyParticipantInput];
  readonly settings: PythagoreanSettings;
}): PythagoreanCompatibilityResult;
```

Use ISO dates in production inputs. Convert `1990-03-14` to digits `1,4,0,3,1,9,9,0` for formulas.

- [ ] **Step 5: Verify domain numerology**

Run:

```bash
pnpm test packages/domain/src/numerology
pnpm --filter @elevenhouse/domain typecheck
```

Expected: pass.

- [ ] **Step 6: Commit Task 2**

```bash
git add packages/domain/src/numerology packages/domain/src/index.ts
git commit -m "feat: add pythagorean numerology engine"
```

## Task 3: API Contracts

**Files:**
- Create: `packages/contracts/src/calculations.ts`
- Create: `packages/contracts/src/calculations.test.ts`
- Create: `packages/contracts/src/numerology.ts`
- Create: `packages/contracts/src/numerology.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/package.json`

- [ ] **Step 1: Write contract tests**

Create tests that parse a valid individual request, reject a future birth date, parse a compatibility request, and ensure response snapshots remain structured:

```ts
import { describe, expect, it } from "vitest";
import { createNumerologyCalculationRequestSchema } from "./numerology";

describe("numerology contracts", () => {
  it("parses a Pythagorean individual request", () => {
    expect(
      createNumerologyCalculationRequestSchema.parse({
        mode: "individual",
        methodCode: "pythagorean",
        title: "Мария",
        participants: [
          {
            role: "subject",
            source: "manual",
            clientId: null,
            displayName: "Мария",
            fullName: "Мария Иванова",
            birthDate: "1990-03-14"
          }
        ],
        settings: {
          masterNumbers: { mode: "preserve_all" },
          nameNormalization: { yoPolicy: "separate", shortIpolicy: "separate" },
          includeNameNumbers: true,
          includePsychomatrix: true,
          includeStrengthLines: true
        }
      }).methodCode
    ).toBe("pythagorean");
  });
});
```

- [ ] **Step 2: Implement schemas**

Use strict Zod objects and export inferred types. Required schema names:

```ts
export const calculationIdParamSchema = z.object({ calculationId: z.string().uuid() }).strict();
export const listCalculationsQuerySchema = z.object({
  module: z.enum(["all", "numerology", "chart", "matrix", "human_design"]).default("all"),
  status: z.enum(["all", "calculated", "linked", "published", "archived"]).default("all"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
}).strict();
export const createNumerologyCalculationRequestSchema = z.object({ ... }).strict();
export const numerologyCalculationResponseSchema = z.object({ ... }).strict();
```

Validation rules:

- individual mode requires exactly one participant with role `subject`;
- compatibility mode requires exactly two participants with roles `subject` and `partner`;
- manual participant requires `fullName` and `birthDate`;
- CRM participant requires `clientId`, `displayName`, `fullName`, and `birthDate`;
- birth date must be ISO date and not in the future relative to parser execution date;
- method code accepts inactive future values only for response/profile metadata, not create requests.

- [ ] **Step 3: Export and verify**

Update `packages/contracts/src/index.ts`:

```ts
export * from "./calculations";
export * from "./numerology";
```

Update `packages/contracts/package.json` exports:

```json
"./calculations": {
  "types": "./dist/calculations.d.ts",
  "import": "./dist/calculations.js",
  "require": "./dist/calculations.js"
},
"./numerology": {
  "types": "./dist/numerology.d.ts",
  "import": "./dist/numerology.js",
  "require": "./dist/numerology.js"
}
```

Run:

```bash
pnpm test packages/contracts/src/calculations.test.ts packages/contracts/src/numerology.test.ts
pnpm --filter @elevenhouse/contracts typecheck
```

Expected: pass.

- [ ] **Step 4: Commit Task 3**

```bash
git add packages/contracts/src/calculations.ts packages/contracts/src/calculations.test.ts packages/contracts/src/numerology.ts packages/contracts/src/numerology.test.ts packages/contracts/src/index.ts packages/contracts/package.json
git commit -m "feat: add calculation and numerology contracts"
```

## Task 4: Database Schema And Store Adapter

**Files:**
- Create calculation schema files listed in File Structure.
- Create: `packages/db/src/adapters/calculations/drizzle-calculation-store.ts`
- Create: `packages/db/src/adapters/calculations/index.ts`
- Create: `packages/db/src/adapters/calculations/drizzle-calculation-store.integration.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/package.json`
- Generated: `packages/db/drizzle/*.sql`
- Generated: `packages/db/drizzle/meta/*.json`

- [ ] **Step 1: Write adapter integration test**

Create `drizzle-calculation-store.integration.ts` asserting:

- create inserts record, participant, and version;
- `findByOwnerAndId` hydrates all children;
- recalculate appends version 2;
- link/publish changes only requested client link;
- archive keeps versions.

Use existing integration test setup patterns from `packages/db/src/adapters/products/drizzle-products-store.integration.ts`.

- [ ] **Step 2: Implement schema**

Use Drizzle tables with checks:

```ts
export const calculationModuleValues = ["numerology", "chart", "matrix", "human_design"] as const;
export const calculationModeValues = ["individual", "compatibility"] as const;
export const calculationStatusValues = ["calculated", "linked", "published", "archived"] as const;
export const calculationParticipantSourceValues = ["crm_client", "manual"] as const;
export const calculationClientVisibilityValues = ["private_to_astrologer", "visible_to_client"] as const;
```

Important constraints:

- `calculation_records.owner_user_id` references `users.id` cascade delete.
- participant `client_id` is nullable until CRM client table exists; keep the domain rule in use cases.
- `calculation_versions.result_snapshot`, `settings_snapshot`, and `input_snapshot` use `jsonb`.
- add indexes for owner/status/module/created and record/version.

- [ ] **Step 3: Implement Drizzle adapter**

Expose:

```ts
export function createDrizzleCalculationStore(database: ElevenHouseDatabase): CalculationStore;
```

Hydrate records in one adapter, not in API service. Preserve the domain model shape exactly.

- [ ] **Step 4: Generate migration and verify**

Run:

```bash
pnpm db:generate
pnpm test:integration packages/db/src/adapters/calculations/drizzle-calculation-store.integration.ts
pnpm --filter @elevenhouse/db typecheck
```

Expected: migration is generated and integration/typecheck pass.

- [ ] **Step 5: Commit Task 4**

```bash
git add packages/db/src/schema/calculations packages/db/src/schema/index.ts packages/db/src/adapters/calculations packages/db/package.json packages/db/drizzle
git commit -m "feat: persist saved calculations"
```

## Task 5: Astrologer API

**Files:**
- Create API modules listed in File Structure.
- Modify: `apps/astrologer-api/src/main.ts` or app module assembly file if new modules are registered there.

- [ ] **Step 1: Write service and e2e tests**

Tests must cover:

- `POST /numerology/calculations` creates Pythagorean individual calculation;
- `POST /numerology/calculations` creates compatibility calculation;
- manual-only calculation cannot link to client;
- CRM-linked calculation can link and publish;
- `POST /numerology/calculations/:id/recalculate` appends version;
- `GET /calculations` lists saved calculations for current owner only;
- invalid unsupported method returns 400.

- [ ] **Step 2: Implement `CalculationsModule`**

Provider wiring:

```ts
{
  provide: CALCULATION_STORE,
  useFactory: (postgresRuntime: PostgresRuntimeService) =>
    createDrizzleCalculationStore(postgresRuntime.database),
  inject: [PostgresRuntimeService]
}
```

Controllers:

```ts
@Controller("calculations")
@UseGuards(AstrologerSessionAuthGuard)
export class CalculationsController {
  @Get()
  listCalculations(@Query() query: unknown, @Req() request: AstrologerSessionRequest) {}

  @Get(":calculationId")
  getCalculation(@Param("calculationId") calculationId: string, @Req() request: AstrologerSessionRequest) {}

  @Post(":calculationId/link-client")
  @RequireCsrf()
  linkClient(@Param("calculationId") calculationId: string, @Body() body: unknown, @Req() request: AstrologerSessionRequest) {}

  @Post(":calculationId/publish")
  @RequireCsrf()
  publish(@Param("calculationId") calculationId: string, @Body() body: unknown, @Req() request: AstrologerSessionRequest) {}

  @Post(":calculationId/archive")
  @RequireCsrf()
  archive(@Param("calculationId") calculationId: string, @Req() request: AstrologerSessionRequest) {}
}
```

- [ ] **Step 3: Implement `NumerologyModule`**

Controller:

```ts
@Controller("numerology/calculations")
@UseGuards(AstrologerSessionAuthGuard)
export class NumerologyController {
  @Post()
  @RequireCsrf()
  createCalculation(@Body() body: unknown, @Req() request: AstrologerSessionRequest) {}

  @Post(":calculationId/recalculate")
  @RequireCsrf()
  recalculate(@Param("calculationId") calculationId: string, @Body() body: unknown, @Req() request: AstrologerSessionRequest) {}

  @Post(":calculationId/ai-draft")
  @RequireCsrf()
  createAiDraft(@Param("calculationId") calculationId: string, @Body() body: unknown, @Req() request: AstrologerSessionRequest) {}
}
```

AI draft can return 501-style controlled service error only if current AI prompt registry cannot support the required prompt yet. Do not fake interpretation text.

- [ ] **Step 4: Verify API**

Run:

```bash
pnpm test apps/astrologer-api/src/modules/calculations apps/astrologer-api/src/modules/numerology
pnpm --filter @elevenhouse/astrologer-api typecheck
```

Expected: pass.

- [ ] **Step 5: Commit Task 5**

```bash
git add apps/astrologer-api/src/modules/calculations apps/astrologer-api/src/modules/numerology apps/astrologer-api/src/main.ts
git commit -m "feat: expose numerology calculation API"
```

## Task 6: Astrologer Web Numerology Page

**Files:**
- Create web files listed in File Structure.
- Modify: `apps/astrologer-web/src/router.tsx`
- Modify: `apps/astrologer-web/src/layouts/AstrologerNavigationDrawer/helpers/navigationDrawerItems.tsx`
- Modify: `apps/astrologer-web/src/common/i18n/astrologerCopy.ts` if navigation labels are locale driven.

- [ ] **Step 1: Write frontend tests**

Tests must assert:

- route `/numerology` renders the page;
- setup modal validates required participant fields;
- individual calculation request includes Pythagorean method code and settings;
- compatibility mode requires two participants;
- saved calculation picker opens existing calculation without recalculating;
- manual-only result disables link action;
- CRM-linked result enables link action;
- publish action is disabled until linked and approved interpretation exists.

- [ ] **Step 2: Implement API clients**

Create `numerologyApi.ts`:

```ts
import type {
  CreateNumerologyCalculationRequest,
  NumerologyCalculationResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export function createNumerologyCalculation(
  input: CreateNumerologyCalculationRequest
): Promise<NumerologyCalculationResponse> {
  return application.http.post("/numerology/calculations", input, { csrf: true });
}
```

Use the same response parsing pattern as `features/products/api/createProduct.ts`: normalize the body with the contract schema before the request and parse the response schema after `application.http.post`.

- [ ] **Step 3: Implement form model**

Create pure functions:

```ts
export function createInitialNumerologyForm(): NumerologyFormState;
export function toCreateNumerologyRequest(state: NumerologyFormState): CreateNumerologyCalculationRequest;
export function getNumerologyFormErrors(state: NumerologyFormState): readonly string[];
```

Keep validation logic testable outside React components.

- [ ] **Step 4: Implement UI components**

Build from the design reference:

- top toolbar with client/search, create, compatibility, save/link/publish actions;
- setup modal with method selector and participant source fields;
- key number rail;
- psychomatrix grid;
- strength line list;
- interpretation side panel;
- compatibility comparison view;
- saved calculation picker.

Use existing design-system components. Do not copy `ElevenHouseDesign` runtime helpers or mock globals.

- [ ] **Step 5: Wire route and nav**

Update router:

```tsx
import { NumerologyPage } from "./pages/numerology/NumerologyPage";

{
  path: "/numerology",
  element: <NumerologyPage />
}
```

Update drawer item route if it exists only as a label today.

- [ ] **Step 6: Verify frontend**

Run:

```bash
pnpm test apps/astrologer-web/src/features/numerology apps/astrologer-web/src/pages/numerology apps/astrologer-web/src/router.test.tsx
pnpm --filter @elevenhouse/astrologer-web typecheck
```

Expected: pass.

- [ ] **Step 7: Commit Task 6**

```bash
git add apps/astrologer-web/src/features/calculations apps/astrologer-web/src/features/numerology apps/astrologer-web/src/pages/numerology apps/astrologer-web/src/router.tsx apps/astrologer-web/src/layouts/AstrologerNavigationDrawer/helpers/navigationDrawerItems.tsx apps/astrologer-web/src/common/i18n/astrologerCopy.ts
git commit -m "feat: add numerology workspace"
```

## Task 7: Verification, Browser E2E, And Documentation

**Files:**
- Modify or create browser E2E tests in the repo's existing E2E location if present.
- Modify: `docs/architecture/design-reference-inventory.md` if implementation status changes.
- Modify: `docs/product/full-functional-scope.md` only if product scope wording needs correction.

- [ ] **Step 1: Run full targeted verification**

Run:

```bash
pnpm test packages/domain/src/calculations packages/domain/src/numerology packages/contracts/src/calculations.test.ts packages/contracts/src/numerology.test.ts apps/astrologer-api/src/modules/calculations apps/astrologer-api/src/modules/numerology apps/astrologer-web/src/features/numerology apps/astrologer-web/src/pages/numerology
pnpm --filter @elevenhouse/domain typecheck
pnpm --filter @elevenhouse/contracts typecheck
pnpm --filter @elevenhouse/db typecheck
pnpm --filter @elevenhouse/astrologer-api typecheck
pnpm --filter @elevenhouse/astrologer-web typecheck
```

Expected: pass.

- [ ] **Step 2: Run local browser E2E through Chrome extension backend**

Follow `AGENTS.md` browser instructions. Start only services needed for `astrologer-web` and `astrologer-api` if not already running.

Browser scenarios:

- create individual Pythagorean calculation with manual participant;
- verify psychomatrix for 14.03.1990 shows `11`, `22`, `3`, `4`, `5`, empty `6`, `77`, empty `8`, `999`;
- create compatibility calculation with two manual participants;
- confirm link button is disabled for manual-only;
- create CRM-sourced fixture only if a real CRM/client selector exists;
- reopen saved calculation and confirm no recalculation request is made;
- edit and recalculate, then confirm version count increases;
- check mobile viewport for no overlapping toolbar/modal text.

- [ ] **Step 3: Update docs**

Update inventory status for Numerology from missing to partial/implemented according to actual delivered scope. Reference the implementation plan and keep the warning that future methods require fixtures.

- [ ] **Step 4: Final full check**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

If unrelated pre-existing failures appear, capture exact failing packages and keep the numerology targeted checks green.

- [ ] **Step 5: Commit Task 7**

```bash
git add docs apps packages
git commit -m "test: verify numerology calculation flow"
```

## Self-Review Notes

- Spec coverage: lifecycle, method profiles, Pythagorean formulas, compatibility, saved calculations, AI boundary, link/publish, and browser E2E are mapped to tasks.
- Future method readiness: covered by `NumerologyMethodProfile`, method versioning, fixtures requirement, and generic result adapters.
- No fake method behavior: create requests accept only `pythagorean` until additional method fixtures exist.
- Versioning conflict resolved: recalculation appends immutable versions and makes the latest version current.
- UI dependency risk: CRM linking is implemented at the calculation boundary; a real CRM selector should be wired only if the client module/API exists during implementation.

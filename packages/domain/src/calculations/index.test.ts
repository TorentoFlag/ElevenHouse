import { describe, expect, it } from "vitest";
import {
  approveCalculationInterpretation,
  archiveCalculation,
  createCalculation,
  getCalculation,
  linkCalculationToClient,
  listCalculations,
  publishCalculationToClient,
  recalculateCalculation,
  saveCalculationInterpretation
} from "./calculation-use-cases";
import { CalculationValidationError } from "./calculation-errors";
import type { CalculationRecord, CalculationStore } from "./calculation-store";

const ownerUserId = "00000000-0000-4000-8000-000000000001";
const otherOwnerUserId = "00000000-0000-4000-8000-000000000099";
const clientId = "00000000-0000-4000-8000-000000000002";
const now = new Date("2026-07-06T10:00:00.000Z");

type CreateCalculationInput = Omit<Parameters<typeof createCalculation>[0], "store">;
type MemoryStore = CalculationStore & {
  readonly calls: {
    readonly appendVersion: Parameters<CalculationStore["appendVersion"]>[0][];
    readonly linkClient: Parameters<CalculationStore["linkClient"]>[0][];
    readonly publishClientLink: Parameters<CalculationStore["publishClientLink"]>[0][];
    readonly saveInterpretation: Parameters<CalculationStore["saveInterpretation"]>[0][];
    readonly approveInterpretation: Parameters<CalculationStore["approveInterpretation"]>[0][];
    readonly archive: Parameters<CalculationStore["archive"]>[0][];
  };
};

function createMemoryStore(): MemoryStore {
  const records = new Map<string, CalculationRecord>();
  const calls: MemoryStore["calls"] = {
    appendVersion: [],
    linkClient: [],
    publishClientLink: [],
    saveInterpretation: [],
    approveInterpretation: [],
    archive: []
  };

  function findRecord(input: { readonly ownerUserId: string; readonly calculationId: string }) {
    const current = records.get(input.calculationId);
    if (!current || current.ownerUserId !== input.ownerUserId) return null;
    return current;
  }

  function findLatestVersion(record: CalculationRecord) {
    return record.versions.reduce<(typeof record.versions)[number] | null>((latest, version) => {
      if (!latest || version.versionNumber > latest.versionNumber) {
        return version;
      }
      return latest;
    }, null);
  }

  return {
    calls,
    listByOwner: async ({ ownerUserId, module, status, limit, offset }) => {
      const filtered = [...records.values()].filter(
        (record) =>
          record.ownerUserId === ownerUserId &&
          (module === "all" || record.module === module) &&
          (status === "all" || record.status === status)
      );
      const ordered = filtered.sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id)
      );
      return { calculations: ordered.slice(offset, offset + limit), total: ordered.length };
    },
    findByOwnerAndId: async (input) => findRecord(input),
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
      calls.appendVersion.push(input);
      const current = findRecord(input);
      if (!current) return null;
      const links = current.links.map((link) =>
        link.visibility === "visible_to_client"
          ? { ...link, visibility: "private_to_astrologer" as const, publishedAt: null }
          : link
      );
      const next: CalculationRecord = {
        ...current,
        currentMethodVersion: input.methodVersion,
        status: links.length > 0 ? "linked" : "calculated",
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
        links,
        updatedAt: input.now
      };
      records.set(next.id, next);
      return next;
    },
    linkClient: async (input) => {
      calls.linkClient.push(input);
      const current = findRecord(input);
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
      calls.publishClientLink.push(input);
      const current = findRecord(input);
      if (!current) return null;
      if (findLatestVersion(current)?.id !== input.expectedVersionId) return null;
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
      calls.saveInterpretation.push(input);
      const current = findRecord(input);
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
      calls.approveInterpretation.push(input);
      const current = findRecord(input);
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
      calls.archive.push(input);
      const current = findRecord(input);
      if (!current) return null;
      const next = { ...current, status: "archived" as const, updatedAt: input.now };
      records.set(next.id, next);
      return next;
    }
  };
}

function createTestCalculation(
  store: CalculationStore,
  overrides: Partial<CreateCalculationInput> = {}
) {
  return createCalculation({
    store,
    ownerUserId,
    module: "numerology",
    mode: "individual",
    methodCode: "pythagorean",
    methodVersion: "1.0.0",
    title: "Мария",
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
    inputSnapshot: { name: "Мария" },
    resultSnapshot: { lifePath: 9 },
    resultSummary: { primaryLabel: "Путь 9" },
    resultChecksum: "sha256:v1",
    idGenerator: () => "00000000-0000-4000-8000-000000000010",
    versionIdGenerator: () => "00000000-0000-4000-8000-000000000011",
    now,
    ...overrides
  });
}

async function saveAndApproveInterpretation(input: {
  readonly store: CalculationStore;
  readonly calculation: CalculationRecord;
  readonly versionId?: string;
}) {
  const draft = await saveCalculationInterpretation({
    store: input.store,
    ownerUserId,
    calculationId: input.calculation.id,
    versionId: input.versionId ?? input.calculation.versions[0]!.id,
    source: "manual",
    text: "Проверенная трактовка для клиента.",
    modelId: null,
    promptVersion: null,
    interpretationIdGenerator: () => "00000000-0000-4000-8000-000000000032",
    now: new Date("2026-07-06T11:10:00.000Z")
  });

  return approveCalculationInterpretation({
    store: input.store,
    ownerUserId,
    calculationId: input.calculation.id,
    interpretationId: draft.interpretations.at(-1)!.id,
    now: new Date("2026-07-06T11:40:00.000Z")
  });
}

describe("calculations lifecycle", () => {
  it("lists calculations by owner and status with total before pagination", async () => {
    const store = createMemoryStore();
    await createTestCalculation(store, {
      idGenerator: () => "00000000-0000-4000-8000-000000000101",
      title: "Owner active first"
    });
    await createTestCalculation(store, {
      idGenerator: () => "00000000-0000-4000-8000-000000000102",
      title: "Owner active second"
    });
    const archivedSource = await createTestCalculation(store, {
      idGenerator: () => "00000000-0000-4000-8000-000000000103",
      title: "Owner archived"
    });
    await archiveCalculation({
      store,
      ownerUserId,
      calculationId: archivedSource.id,
      now: new Date("2026-07-06T12:00:00.000Z")
    });
    await createTestCalculation(store, {
      ownerUserId: otherOwnerUserId,
      idGenerator: () => "00000000-0000-4000-8000-000000000104",
      title: "Other owner active"
    });

    const result = await listCalculations({
      store,
      ownerUserId,
      module: "all",
      status: "calculated",
      limit: 1,
      offset: 1
    });

    expect(result.total).toBe(2);
    expect(result.calculations).toHaveLength(1);
    expect(result.calculations[0]?.title).toBe("Owner active first");
  });

  it("filters calculation lists by module before pagination", async () => {
    const store = createMemoryStore();
    await createTestCalculation(store, {
      idGenerator: () => "00000000-0000-4000-8000-000000000201",
      title: "Numerology calculation"
    });
    await createTestCalculation(store, {
      idGenerator: () => "00000000-0000-4000-8000-000000000202",
      module: "chart",
      methodCode: "natal",
      title: "Chart calculation"
    });

    const result = await listCalculations({
      store,
      ownerUserId,
      module: "numerology",
      status: "all",
      limit: 10,
      offset: 0
    });

    expect(result.total).toBe(1);
    expect(result.calculations.map((calculation) => calculation.title)).toEqual([
      "Numerology calculation"
    ]);
  });

  it("orders calculation lists by updated date and id before pagination", async () => {
    const store = createMemoryStore();
    await createTestCalculation(store, {
      idGenerator: () => "00000000-0000-4000-8000-000000000301",
      title: "Older update",
      now: new Date("2026-07-06T09:00:00.000Z")
    });
    await createTestCalculation(store, {
      idGenerator: () => "00000000-0000-4000-8000-000000000302",
      title: "Same timestamp lower id",
      now: new Date("2026-07-06T10:00:00.000Z")
    });
    await createTestCalculation(store, {
      idGenerator: () => "00000000-0000-4000-8000-000000000303",
      title: "Same timestamp higher id",
      now: new Date("2026-07-06T10:00:00.000Z")
    });

    const result = await listCalculations({
      store,
      ownerUserId,
      module: "all",
      status: "all",
      limit: 2,
      offset: 1
    });

    expect(result.total).toBe(3);
    expect(result.calculations.map((calculation) => calculation.title)).toEqual([
      "Same timestamp lower id",
      "Older update"
    ]);
  });

  it("gets calculations owned by the requester", async () => {
    const store = createMemoryStore();
    const created = await createTestCalculation(store);

    const found = await getCalculation({
      store,
      ownerUserId,
      calculationId: created.id
    });

    expect(found.id).toBe(created.id);
  });

  it("rejects getting calculations owned by another user", async () => {
    const store = createMemoryStore();
    const created = await createTestCalculation(store);

    await expect(
      getCalculation({
        store,
        ownerUserId: otherOwnerUserId,
        calculationId: created.id
      })
    ).rejects.toThrow("Calculation was not found");
  });

  it("rejects invalid list pagination", async () => {
    const store = createMemoryStore();

    await expect(
      listCalculations({
        store,
        ownerUserId,
        module: "all",
        status: "all",
        limit: 0,
        offset: 0
      })
    ).rejects.toBeInstanceOf(CalculationValidationError);
    await expect(
      listCalculations({
        store,
        ownerUserId,
        module: "all",
        status: "all",
        limit: 10,
        offset: -1
      })
    ).rejects.toBeInstanceOf(CalculationValidationError);
  });

  it("creates a calculated record with immutable version 1", async () => {
    const record = await createTestCalculation(createMemoryStore(), {
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
      settingsSnapshot: { preserveMasterNumbers: ["11", "22", "33"] }
    });

    expect(record.status).toBe("calculated");
    expect(record.versions).toHaveLength(1);
    expect(record.versions[0]?.resultSnapshot).toEqual({ lifePath: 9 });
  });

  it("recalculates by appending a new version instead of overwriting version 1", async () => {
    const store = createMemoryStore();
    const created = await createTestCalculation(store);

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

  it("does not publish until the latest version interpretation is approved", async () => {
    const store = createMemoryStore();
    const created = await createTestCalculation(store);

    const linked = await linkCalculationToClient({
      store,
      ownerUserId,
      calculationId: created.id,
      clientId,
      now: new Date("2026-07-06T11:00:00.000Z")
    });
    const approved = await saveAndApproveInterpretation({ store, calculation: created });
    const published = await publishCalculationToClient({
      store,
      ownerUserId,
      calculationId: created.id,
      clientId,
      now: new Date("2026-07-06T12:00:00.000Z")
    });

    expect(linked.links[0]?.visibility).toBe("private_to_astrologer");
    expect(approved.interpretations[0]?.status).toBe("approved");
    expect(published.links[0]?.visibility).toBe("visible_to_client");
    expect(store.calls.publishClientLink[0]?.expectedVersionId).toBe(created.versions[0]!.id);
  });

  it("does not publish when the store sees a stale expected latest version", async () => {
    const store = createMemoryStore();
    const created = await createTestCalculation(store);
    await linkCalculationToClient({
      store,
      ownerUserId,
      calculationId: created.id,
      clientId,
      now: new Date("2026-07-06T11:00:00.000Z")
    });
    await saveAndApproveInterpretation({ store, calculation: created });

    const result = await store.publishClientLink({
      ownerUserId,
      calculationId: created.id,
      clientId,
      expectedVersionId: "00000000-0000-4000-8000-000000000099",
      now: new Date("2026-07-06T12:00:00.000Z").toISOString()
    });

    expect(result).toBeNull();
  });

  it("rejects publishing before the calculation is linked to the client", async () => {
    const store = createMemoryStore();
    const created = await createTestCalculation(store);
    await saveAndApproveInterpretation({ store, calculation: created });

    await expect(
      publishCalculationToClient({
        store,
        ownerUserId,
        calculationId: created.id,
        clientId,
        now: new Date("2026-07-06T12:00:00.000Z")
      })
    ).rejects.toThrow("Calculation must be linked before publishing");
  });

  it("rejects publishing a linked calculation without an approved interpretation", async () => {
    const store = createMemoryStore();
    const created = await createTestCalculation(store);
    await linkCalculationToClient({
      store,
      ownerUserId,
      calculationId: created.id,
      clientId,
      now: new Date("2026-07-06T11:00:00.000Z")
    });

    await expect(
      publishCalculationToClient({
        store,
        ownerUserId,
        calculationId: created.id,
        clientId,
        now: new Date("2026-07-06T12:00:00.000Z")
      })
    ).rejects.toThrow("Calculation requires approved interpretation before publishing");
  });

  it("rejects publishing when only an older version has an approved interpretation", async () => {
    const store = createMemoryStore();
    const created = await createTestCalculation(store);
    await linkCalculationToClient({
      store,
      ownerUserId,
      calculationId: created.id,
      clientId,
      now: new Date("2026-07-06T11:00:00.000Z")
    });
    await saveAndApproveInterpretation({ store, calculation: created });
    await recalculateCalculation({
      store,
      ownerUserId,
      calculationId: created.id,
      methodVersion: "1.0.1",
      settingsSnapshot: {},
      inputSnapshot: { name: "Мария Иванова" },
      resultSnapshot: { lifePath: 9, expression: 7 },
      resultSummary: { primaryLabel: "Путь 9" },
      resultChecksum: "sha256:v2",
      versionIdGenerator: () => "00000000-0000-4000-8000-000000000022",
      now: new Date("2026-07-06T11:30:00.000Z")
    });

    await expect(
      publishCalculationToClient({
        store,
        ownerUserId,
        calculationId: created.id,
        clientId,
        now: new Date("2026-07-06T12:00:00.000Z")
      })
    ).rejects.toThrow("Calculation requires approved interpretation before publishing");
  });

  it("demotes published client links when recalculating a published calculation", async () => {
    const store = createMemoryStore();
    const created = await createTestCalculation(store);
    await linkCalculationToClient({
      store,
      ownerUserId,
      calculationId: created.id,
      clientId,
      now: new Date("2026-07-06T11:00:00.000Z")
    });
    await saveAndApproveInterpretation({ store, calculation: created });
    const published = await publishCalculationToClient({
      store,
      ownerUserId,
      calculationId: created.id,
      clientId,
      now: new Date("2026-07-06T12:00:00.000Z")
    });

    const recalculated = await recalculateCalculation({
      store,
      ownerUserId,
      calculationId: created.id,
      methodVersion: "1.0.1",
      settingsSnapshot: {},
      inputSnapshot: { name: "Мария Иванова" },
      resultSnapshot: { lifePath: 9, expression: 7 },
      resultSummary: { primaryLabel: "Путь 9" },
      resultChecksum: "sha256:v2",
      versionIdGenerator: () => "00000000-0000-4000-8000-000000000022",
      now: new Date("2026-07-06T12:30:00.000Z")
    });

    expect(published.links[0]).toMatchObject({
      visibility: "visible_to_client",
      publishedAt: "2026-07-06T12:00:00.000Z"
    });
    expect(recalculated.versions).toHaveLength(2);
    expect(recalculated.status).toBe("linked");
    expect(recalculated.links[0]).toMatchObject({
      visibility: "private_to_astrologer",
      publishedAt: null
    });
    await expect(
      publishCalculationToClient({
        store,
        ownerUserId,
        calculationId: created.id,
        clientId,
        now: new Date("2026-07-06T13:00:00.000Z")
      })
    ).rejects.toThrow("Calculation requires approved interpretation before publishing");

    await saveAndApproveInterpretation({
      store,
      calculation: created,
      versionId: recalculated.versions.at(-1)!.id
    });
    const republished = await publishCalculationToClient({
      store,
      ownerUserId,
      calculationId: created.id,
      clientId,
      now: new Date("2026-07-06T13:30:00.000Z")
    });

    expect(republished.links[0]).toMatchObject({
      visibility: "visible_to_client",
      publishedAt: "2026-07-06T13:30:00.000Z"
    });
  });

  it("links only calculations with a matching CRM participant", async () => {
    const store = createMemoryStore();
    const created = await createTestCalculation(store, {
      title: "Manual participant",
      participants: [
        {
          role: "subject",
          source: "manual",
          clientId: null,
          displayName: "Manual Client",
          birthDate: "1990-03-14",
          inputSnapshot: {},
          manuallyOverridden: false
        }
      ]
    });

    await expect(
      linkCalculationToClient({
        store,
        ownerUserId,
        calculationId: created.id,
        clientId,
        now: new Date("2026-07-06T11:00:00.000Z")
      })
    ).rejects.toThrow("Calculation can be linked only to a CRM participant");
  });

  it("treats linking the same CRM client as idempotent", async () => {
    const store = createMemoryStore();
    const created = await createTestCalculation(store);

    const linked = await linkCalculationToClient({
      store,
      ownerUserId,
      calculationId: created.id,
      clientId,
      now: new Date("2026-07-06T11:00:00.000Z")
    });
    const linkedAgain = await linkCalculationToClient({
      store,
      ownerUserId,
      calculationId: created.id,
      clientId,
      now: new Date("2026-07-06T11:05:00.000Z")
    });

    expect(linked.links).toHaveLength(1);
    expect(linkedAgain.links).toHaveLength(1);
    expect(store.calls.linkClient).toHaveLength(1);
  });

  it("rejects interpretation drafts for unknown calculation versions", async () => {
    const store = createMemoryStore();
    const created = await createTestCalculation(store);

    await expect(
      saveCalculationInterpretation({
        store,
        ownerUserId,
        calculationId: created.id,
        versionId: "missing-version",
        source: "manual",
        text: "Проверенная трактовка для клиента.",
        modelId: null,
        promptVersion: null,
        interpretationIdGenerator: () => "00000000-0000-4000-8000-000000000032",
        now: new Date("2026-07-06T11:10:00.000Z")
      })
    ).rejects.toThrow("Calculation version was not found");
  });

  it("rejects approval for missing interpretations", async () => {
    const store = createMemoryStore();
    const created = await createTestCalculation(store);

    await expect(
      approveCalculationInterpretation({
        store,
        ownerUserId,
        calculationId: created.id,
        interpretationId: "missing-interpretation",
        now: new Date("2026-07-06T11:40:00.000Z")
      })
    ).rejects.toThrow("Calculation interpretation was not found");
  });

  it("does not expose or mutate calculations for another owner", async () => {
    const store = createMemoryStore();
    const created = await createTestCalculation(store);

    expect(
      await store.findByOwnerAndId({
        ownerUserId: otherOwnerUserId,
        calculationId: created.id
      })
    ).toBeNull();
    await expect(
      recalculateCalculation({
        store,
        ownerUserId: otherOwnerUserId,
        calculationId: created.id,
        methodVersion: "1.0.1",
        settingsSnapshot: {},
        inputSnapshot: {},
        resultSnapshot: {},
        resultSummary: {},
        resultChecksum: "sha256:v2",
        versionIdGenerator: () => "00000000-0000-4000-8000-000000000022",
        now: new Date("2026-07-06T11:00:00.000Z")
      })
    ).rejects.toThrow("Calculation was not found");

    expect(store.calls.appendVersion).toHaveLength(0);
  });

  it("passes owner id to every mutating store method", async () => {
    const store = createMemoryStore();
    const created = await createTestCalculation(store);
    const recalculated = await recalculateCalculation({
      store,
      ownerUserId,
      calculationId: created.id,
      methodVersion: "1.0.1",
      settingsSnapshot: {},
      inputSnapshot: { name: "Мария Иванова" },
      resultSnapshot: { lifePath: 9, expression: 7 },
      resultSummary: { primaryLabel: "Путь 9" },
      resultChecksum: "sha256:v2",
      versionIdGenerator: () => "00000000-0000-4000-8000-000000000022",
      now: new Date("2026-07-06T11:00:00.000Z")
    });
    await linkCalculationToClient({
      store,
      ownerUserId,
      calculationId: created.id,
      clientId,
      now: new Date("2026-07-06T11:05:00.000Z")
    });
    const latestVersionId = recalculated.versions.at(-1)!.id;
    await saveAndApproveInterpretation({ store, calculation: created, versionId: latestVersionId });
    await publishCalculationToClient({
      store,
      ownerUserId,
      calculationId: created.id,
      clientId,
      now: new Date("2026-07-06T12:00:00.000Z")
    });
    await archiveCalculation({
      store,
      ownerUserId,
      calculationId: created.id,
      now: new Date("2026-07-06T12:30:00.000Z")
    });

    expect(store.calls.appendVersion[0]?.ownerUserId).toBe(ownerUserId);
    expect(store.calls.linkClient[0]?.ownerUserId).toBe(ownerUserId);
    expect(store.calls.saveInterpretation[0]?.ownerUserId).toBe(ownerUserId);
    expect(store.calls.approveInterpretation[0]?.ownerUserId).toBe(ownerUserId);
    expect(store.calls.publishClientLink[0]?.ownerUserId).toBe(ownerUserId);
    expect(store.calls.archive[0]?.ownerUserId).toBe(ownerUserId);
  });

  it("rejects lifecycle changes after archive", async () => {
    const store = createMemoryStore();
    const created = await createTestCalculation(store);
    await linkCalculationToClient({
      store,
      ownerUserId,
      calculationId: created.id,
      clientId,
      now: new Date("2026-07-06T11:00:00.000Z")
    });
    const approved = await saveAndApproveInterpretation({ store, calculation: created });
    await archiveCalculation({
      store,
      ownerUserId,
      calculationId: created.id,
      now: new Date("2026-07-06T12:00:00.000Z")
    });

    await expect(
      recalculateCalculation({
        store,
        ownerUserId,
        calculationId: created.id,
        methodVersion: "1.0.1",
        settingsSnapshot: {},
        inputSnapshot: {},
        resultSnapshot: {},
        resultSummary: {},
        resultChecksum: "sha256:v2",
        versionIdGenerator: () => "00000000-0000-4000-8000-000000000022",
        now: new Date("2026-07-06T12:10:00.000Z")
      })
    ).rejects.toThrow("Archived calculation cannot be changed");
    await expect(
      linkCalculationToClient({
        store,
        ownerUserId,
        calculationId: created.id,
        clientId,
        now: new Date("2026-07-06T12:10:00.000Z")
      })
    ).rejects.toThrow("Archived calculation cannot be changed");
    await expect(
      saveCalculationInterpretation({
        store,
        ownerUserId,
        calculationId: created.id,
        versionId: created.versions[0]!.id,
        source: "manual",
        text: "Текст после архива.",
        modelId: null,
        promptVersion: null,
        interpretationIdGenerator: () => "00000000-0000-4000-8000-000000000033",
        now: new Date("2026-07-06T12:10:00.000Z")
      })
    ).rejects.toThrow("Archived calculation cannot be changed");
    await expect(
      approveCalculationInterpretation({
        store,
        ownerUserId,
        calculationId: created.id,
        interpretationId: approved.interpretations[0]!.id,
        now: new Date("2026-07-06T12:10:00.000Z")
      })
    ).rejects.toThrow("Archived calculation cannot be changed");
    await expect(
      publishCalculationToClient({
        store,
        ownerUserId,
        calculationId: created.id,
        clientId,
        now: new Date("2026-07-06T12:10:00.000Z")
      })
    ).rejects.toThrow("Archived calculation cannot be changed");
  });

  it("normalizes required calculation strings before persistence", async () => {
    const store = createMemoryStore();
    const created = await createTestCalculation(store, {
      methodCode: "  pythagorean  ",
      methodVersion: "  1.0.0  ",
      resultChecksum: "  sha256:v1  "
    });
    const recalculated = await recalculateCalculation({
      store,
      ownerUserId,
      calculationId: created.id,
      methodVersion: "  1.0.1  ",
      settingsSnapshot: {},
      inputSnapshot: {},
      resultSnapshot: {},
      resultSummary: {},
      resultChecksum: "  sha256:v2  ",
      versionIdGenerator: () => "00000000-0000-4000-8000-000000000022",
      now: new Date("2026-07-06T11:00:00.000Z")
    });

    expect(created.methodCode).toBe("pythagorean");
    expect(created.currentMethodVersion).toBe("1.0.0");
    expect(created.versions[0]?.resultChecksum).toBe("sha256:v1");
    expect(recalculated.currentMethodVersion).toBe("1.0.1");
    expect(recalculated.versions[1]?.resultChecksum).toBe("sha256:v2");
  });

  it("throws calculation validation errors for blank required strings", async () => {
    await expect(
      createTestCalculation(createMemoryStore(), {
        title: "   "
      })
    ).rejects.toBeInstanceOf(CalculationValidationError);
  });

  it("rejects calculations without participants", async () => {
    await expect(
      createTestCalculation(createMemoryStore(), {
        participants: []
      })
    ).rejects.toThrow("Calculation requires at least one participant");
  });

  it("rejects calculation participants with blank display names", async () => {
    await expect(
      createTestCalculation(createMemoryStore(), {
        participants: [
          {
            role: "subject",
            source: "manual",
            clientId: null,
            displayName: "   ",
            birthDate: null,
            inputSnapshot: {},
            manuallyOverridden: false
          }
        ]
      })
    ).rejects.toThrow("Calculation participant display name is required");
  });

  it("rejects CRM participants without client id", async () => {
    await expect(
      createTestCalculation(createMemoryStore(), {
        participants: [
          {
            role: "subject",
            source: "crm_client",
            clientId: null,
            displayName: "CRM Client",
            birthDate: null,
            inputSnapshot: {},
            manuallyOverridden: false
          }
        ]
      })
    ).rejects.toThrow("CRM calculation participant requires client id");
  });

  it("rejects manual participants with client id", async () => {
    await expect(
      createTestCalculation(createMemoryStore(), {
        participants: [
          {
            role: "subject",
            source: "manual",
            clientId,
            displayName: "Manual Client",
            birthDate: null,
            inputSnapshot: {},
            manuallyOverridden: false
          }
        ]
      })
    ).rejects.toThrow("Manual calculation participant cannot have client id");
  });

  it("rejects blank participant birth dates", async () => {
    await expect(
      createTestCalculation(createMemoryStore(), {
        participants: [
          {
            role: "subject",
            source: "manual",
            clientId: null,
            displayName: "Manual Client",
            birthDate: "   ",
            inputSnapshot: {},
            manuallyOverridden: false
          }
        ]
      })
    ).rejects.toThrow("Calculation participant birth date cannot be blank");
  });

  it("normalizes calculation participants before persistence", async () => {
    const record = await createTestCalculation(createMemoryStore(), {
      participants: [
        {
          role: "subject",
          source: "crm_client",
          clientId: `  ${clientId}  `,
          displayName: "  CRM Client  ",
          birthDate: "  1990-03-14  ",
          inputSnapshot: {},
          manuallyOverridden: false
        }
      ]
    });

    expect(record.participants[0]).toMatchObject({
      clientId,
      displayName: "CRM Client",
      birthDate: "1990-03-14"
    });
  });

  it("archives a calculation without deleting versions", async () => {
    const store = createMemoryStore();
    const created = await createTestCalculation(store, {
      title: "Archive me",
      idGenerator: () => "00000000-0000-4000-8000-000000000040",
      versionIdGenerator: () => "00000000-0000-4000-8000-000000000041"
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

  it("archives idempotently without mutating already archived records", async () => {
    const store = createMemoryStore();
    const created = await createTestCalculation(store);
    const archived = await archiveCalculation({
      store,
      ownerUserId,
      calculationId: created.id,
      now: new Date("2026-07-06T12:00:00.000Z")
    });

    const archivedAgain = await archiveCalculation({
      store,
      ownerUserId,
      calculationId: created.id,
      now: new Date("2026-07-06T13:00:00.000Z")
    });

    expect(store.calls.archive).toHaveLength(1);
    expect(archivedAgain.updatedAt).toBe(archived.updatedAt);
    expect(archivedAgain.versions).toEqual(archived.versions);
  });
});

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
import {
  CalculationAlreadyExistsError,
  CalculationParticipantMismatchError,
  CalculationValidationError
} from "./calculation-errors";
import type {
  CalculationRecord,
  CalculationStore,
  CalculationStoreCreateInput
} from "./calculation-store";

const ownerUserId = "00000000-0000-4000-8000-000000000001";
const otherOwnerUserId = "00000000-0000-4000-8000-000000000099";
const clientId = "00000000-0000-4000-8000-000000000002";
const partnerClientId = "00000000-0000-4000-8000-000000000003";
const now = new Date("2026-07-06T10:00:00.000Z");
const digest = (character: string) => `sha256:${character.repeat(64)}`;

type MemoryStore = CalculationStore & {
  readonly forceExactKeyConflict: () => void;
  readonly calls: {
    readonly replaceResult: Parameters<CalculationStore["replaceResult"]>[0][];
    readonly publishClientLink: Parameters<CalculationStore["publishClientLink"]>[0][];
  };
};

function createMemoryStore(): MemoryStore {
  const records = new Map<string, CalculationRecord>();
  let exactKeyConflict = false;
  const calls: MemoryStore["calls"] = { replaceResult: [], publishClientLink: [] };

  function owned(input: { readonly ownerUserId: string; readonly calculationId: string }) {
    const record = records.get(input.calculationId);
    return record?.ownerUserId === input.ownerUserId ? record : null;
  }

  function exact(input: {
    readonly ownerUserId: string;
    readonly module: CalculationRecord["module"];
    readonly mode: CalculationRecord["mode"];
    readonly methodCode: string;
    readonly requestFingerprint: string;
  }) {
    return (
      [...records.values()].find(
        (record) =>
          record.ownerUserId === input.ownerUserId &&
          record.module === input.module &&
          record.mode === input.mode &&
          record.methodCode === input.methodCode &&
          record.requestFingerprint === input.requestFingerprint
      ) ?? null
    );
  }

  function linkIds(record: CalculationRecord, clientIds: readonly string[], at: string) {
    const missing = clientIds.filter(
      (candidate) => !record.links.some((link) => link.clientId === candidate)
    );
    return missing.length === 0
      ? record
      : {
          ...record,
          status: "linked" as const,
          links: [
            ...record.links,
            ...missing.map((candidate) => ({
              clientId: candidate,
              visibility: "private_to_astrologer" as const,
              linkedAt: at,
              publishedAt: null
            }))
          ],
          updatedAt: at
        };
  }

  return {
    calls,
    forceExactKeyConflict: () => {
      exactKeyConflict = true;
    },
    listByOwner: async ({ ownerUserId: owner, module, status, limit, offset }) => {
      const ordered = [...records.values()]
        .filter(
          (record) =>
            record.ownerUserId === owner &&
            (module === "all" || record.module === module) &&
            (status === "all" || record.status === status)
        )
        .sort(
          (left, right) =>
            right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id)
        );
      return { calculations: ordered.slice(offset, offset + limit), total: ordered.length };
    },
    findByOwnerAndId: async (input) => owned(input),
    findExact: async (input) => exact(input),
    create: async (input: CalculationStoreCreateInput) => {
      const existing = exact(input);
      if (existing) return existing;
      const record: CalculationRecord = {
        id: input.idGenerator(),
        ownerUserId: input.ownerUserId,
        module: input.module,
        mode: input.mode,
        methodCode: input.methodCode,
        title: input.title,
        status: "calculated",
        requestFingerprint: input.requestFingerprint,
        inputData: input.inputData,
        resultData: input.resultData,
        resultSummary: input.resultSummary,
        resultChecksum: input.resultChecksum,
        participants: input.participants,
        links: [],
        interpretations: [],
        artifacts: [],
        createdAt: input.now,
        updatedAt: input.now
      };
      records.set(record.id, record);
      return record;
    },
    replaceResult: async (input) => {
      calls.replaceResult.push(input);
      const current = owned(input);
      if (!current) return { status: "not_found" as const };
      const duplicate = [...records.values()].find(
        (record) =>
          record.id !== current.id &&
          record.ownerUserId === current.ownerUserId &&
          record.module === current.module &&
          record.mode === current.mode &&
          record.methodCode === current.methodCode &&
          record.requestFingerprint === input.requestFingerprint
      );
      if (exactKeyConflict || duplicate) {
        exactKeyConflict = false;
        return { status: "exact_key_conflict" as const };
      }
      const record: CalculationRecord = {
        ...current,
        title: input.title ?? current.title,
        requestFingerprint: input.requestFingerprint,
        inputData: input.inputData,
        resultData: input.resultData,
        resultSummary: input.resultSummary,
        resultChecksum: input.resultChecksum,
        participants: input.participants,
        status: current.links.length > 0 ? "linked" : "calculated",
        links: current.links.map((link) => ({
          ...link,
          visibility: "private_to_astrologer",
          publishedAt: null
        })),
        interpretations: [],
        artifacts: [],
        updatedAt: input.now
      };
      records.set(record.id, record);
      return { status: "updated" as const, calculation: record };
    },
    ensureClientLinks: async (input) => {
      const current = owned(input);
      if (!current) return null;
      const record = linkIds(current, input.clientIds, input.now);
      records.set(record.id, record);
      return record;
    },
    linkClient: async (input) => {
      const current = owned(input);
      if (!current) return null;
      const record = linkIds(current, [input.clientId], input.now);
      records.set(record.id, record);
      return record;
    },
    publishClientLink: async (input) => {
      calls.publishClientLink.push(input);
      const current = owned(input);
      if (!current || current.resultChecksum !== input.expectedResultChecksum) return null;
      const record: CalculationRecord = {
        ...current,
        status: "published",
        links: current.links.map((link) =>
          link.clientId === input.clientId
            ? { ...link, visibility: "visible_to_client", publishedAt: input.now }
            : link
        ),
        updatedAt: input.now
      };
      records.set(record.id, record);
      return record;
    },
    saveInterpretation: async (input) => {
      const current = owned(input);
      if (!current) return null;
      const record: CalculationRecord = {
        ...current,
        interpretations: [
          ...current.interpretations,
          {
            id: input.interpretationIdGenerator(),
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
      records.set(record.id, record);
      return record;
    },
    approveInterpretation: async (input) => {
      const current = owned(input);
      if (!current) return null;
      const record: CalculationRecord = {
        ...current,
        interpretations: current.interpretations.map((interpretation) =>
          interpretation.id === input.interpretationId
            ? { ...interpretation, status: "approved", approvedAt: input.now }
            : interpretation
        ),
        updatedAt: input.now
      };
      records.set(record.id, record);
      return record;
    },
    archive: async (input) => {
      const current = owned(input);
      if (!current) return null;
      const record = { ...current, status: "archived" as const, updatedAt: input.now };
      records.set(record.id, record);
      return record;
    }
  };
}

function createTestCalculation(
  store: CalculationStore,
  overrides: Partial<Omit<Parameters<typeof createCalculation>[0], "store">> = {}
) {
  return createCalculation({
    store,
    ownerUserId,
    module: "numerology",
    mode: "individual",
    methodCode: "pythagorean",
    title: "Голубев Антон, психоматрица",
    participants: [
      {
        role: "subject",
        source: "crm_client",
        clientId,
        displayName: "Голубев Антон"
      }
    ],
    requestFingerprint: digest("a"),
    inputData: { participant: { calculationName: "Голубев Антон", birthDate: "2000-08-19" } },
    resultData: { lifePath: 2 },
    resultSummary: { lifePath: 2 },
    resultChecksum: digest("b"),
    linkClientIds: [],
    idGenerator: () => "00000000-0000-4000-8000-000000000010",
    now,
    ...overrides
  });
}

async function saveAndApprove(store: CalculationStore, calculation: CalculationRecord) {
  const draft = await saveCalculationInterpretation({
    store,
    ownerUserId,
    calculationId: calculation.id,
    source: "manual",
    text: "Проверенная трактовка.",
    modelId: null,
    promptVersion: null,
    interpretationIdGenerator: () => "00000000-0000-4000-8000-000000000032",
    now: new Date("2026-07-06T11:10:00.000Z")
  });
  return approveCalculationInterpretation({
    store,
    ownerUserId,
    calculationId: calculation.id,
    interpretationId: draft.interpretations.at(-1)!.id,
    now: new Date("2026-07-06T11:20:00.000Z")
  });
}

describe("current calculation lifecycle", () => {
  it("creates one current saved result without versions", async () => {
    const created = await createTestCalculation(createMemoryStore());

    expect(created.resultData).toEqual({ lifePath: 2 });
    expect(created.requestFingerprint).toBe(digest("a"));
    expect(created).not.toHaveProperty("versions");
    expect(created).not.toHaveProperty("currentMethodVersion");
  });

  it("replaces the current result and invalidates derived publication data", async () => {
    const store = createMemoryStore();
    const created = await createTestCalculation(store);
    await linkCalculationToClient({ store, ownerUserId, calculationId: created.id, clientId, now });
    await saveAndApprove(store, created);
    await publishCalculationToClient({
      store,
      ownerUserId,
      calculationId: created.id,
      clientId,
      expectedResultChecksum: created.resultChecksum,
      now: new Date("2026-07-06T11:30:00.000Z")
    });

    const replaced = await recalculateCalculation({
      store,
      ownerUserId,
      calculationId: created.id,
      title: "Голубев Антон, обновлённый расчёт",
      participants: created.participants,
      requestFingerprint: digest("c"),
      inputData: { participant: { calculationName: "Голубев Антон" } },
      resultData: { lifePath: 2, expression: 6 },
      resultSummary: { lifePath: 2, expression: 6 },
      resultChecksum: digest("d"),
      now: new Date("2026-07-06T12:00:00.000Z")
    });

    expect(replaced.resultData).toEqual({ lifePath: 2, expression: 6 });
    expect(replaced.title).toBe("Голубев Антон, обновлённый расчёт");
    expect(replaced.interpretations).toEqual([]);
    expect(replaced.artifacts).toEqual([]);
    expect(replaced.links.every((link) => link.visibility === "private_to_astrologer")).toBe(true);
    expect(replaced.status).toBe("linked");
  });

  it("rejects recalculation when CRM ids or participant roles change", async () => {
    const store = createMemoryStore();
    const created = await createTestCalculation(store);

    await expect(
      recalculateCalculation({
        store,
        ownerUserId,
        calculationId: created.id,
        participants: [{ ...created.participants[0]!, clientId: partnerClientId }],
        requestFingerprint: digest("c"),
        inputData: {},
        resultData: {},
        resultSummary: {},
        resultChecksum: digest("d"),
        now
      })
    ).rejects.toBeInstanceOf(CalculationParticipantMismatchError);
    await expect(
      recalculateCalculation({
        store,
        ownerUserId,
        calculationId: created.id,
        participants: [{ ...created.participants[0]!, role: "partner" }],
        requestFingerprint: digest("c"),
        inputData: {},
        resultData: {},
        resultSummary: {},
        resultChecksum: digest("d"),
        now
      })
    ).rejects.toBeInstanceOf(CalculationParticipantMismatchError);
  });

  it("leaves the current record untouched when replacement collides with another exact key", async () => {
    const store = createMemoryStore();
    const created = await createTestCalculation(store);
    store.forceExactKeyConflict();

    await expect(
      recalculateCalculation({
        store,
        ownerUserId,
        calculationId: created.id,
        participants: created.participants,
        requestFingerprint: digest("c"),
        inputData: {},
        resultData: { lifePath: 9 },
        resultSummary: {},
        resultChecksum: digest("d"),
        now
      })
    ).rejects.toBeInstanceOf(CalculationAlreadyExistsError);

    await expect(
      getCalculation({ store, ownerUserId, calculationId: created.id })
    ).resolves.toEqual(created);
  });

  it("binds publication to the current checksum and a current approved interpretation", async () => {
    const store = createMemoryStore();
    const created = await createTestCalculation(store);
    await linkCalculationToClient({ store, ownerUserId, calculationId: created.id, clientId, now });
    await saveAndApprove(store, created);
    const replaced = await recalculateCalculation({
      store,
      ownerUserId,
      calculationId: created.id,
      participants: created.participants,
      requestFingerprint: digest("c"),
      inputData: {},
      resultData: { lifePath: 2, expression: 6 },
      resultSummary: {},
      resultChecksum: digest("d"),
      now
    });

    await expect(
      publishCalculationToClient({
        store,
        ownerUserId,
        calculationId: created.id,
        clientId,
        expectedResultChecksum: created.resultChecksum,
        now
      })
    ).rejects.toThrow("current result checksum");
    await expect(
      publishCalculationToClient({
        store,
        ownerUserId,
        calculationId: created.id,
        clientId,
        expectedResultChecksum: replaced.resultChecksum,
        now
      })
    ).rejects.toThrow("approved interpretation");

    const approved = await saveAndApprove(store, replaced);
    const published = await publishCalculationToClient({
      store,
      ownerUserId,
      calculationId: created.id,
      clientId,
      expectedResultChecksum: approved.resultChecksum,
      now
    });
    expect(published.status).toBe("published");
    expect(store.calls.publishClientLink.at(-1)?.expectedResultChecksum).toBe(digest("d"));
  });

  it("links only CRM participants and does so idempotently", async () => {
    const store = createMemoryStore();
    const created = await createTestCalculation(store);
    const first = await linkCalculationToClient({
      store,
      ownerUserId,
      calculationId: created.id,
      clientId,
      now
    });
    const second = await linkCalculationToClient({
      store,
      ownerUserId,
      calculationId: created.id,
      clientId,
      now
    });
    expect(first.links).toHaveLength(1);
    expect(second.links).toHaveLength(1);

    await expect(
      linkCalculationToClient({
        store,
        ownerUserId,
        calculationId: created.id,
        clientId: partnerClientId,
        now
      })
    ).rejects.toBeInstanceOf(CalculationValidationError);
  });

  it("lists, owner-scopes and archives current records", async () => {
    const store = createMemoryStore();
    const created = await createTestCalculation(store);
    await expect(
      getCalculation({ store, ownerUserId: otherOwnerUserId, calculationId: created.id })
    ).rejects.toThrow("Calculation was not found");
    const listed = await listCalculations({
      store,
      ownerUserId,
      module: "numerology",
      status: "all",
      limit: 10,
      offset: 0
    });
    expect(listed.total).toBe(1);
    const archived = await archiveCalculation({
      store,
      ownerUserId,
      calculationId: created.id,
      now
    });
    expect(archived.status).toBe("archived");
  });
});

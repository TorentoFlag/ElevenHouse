import { describe, expect, it } from "vitest";
import {
  approveCalculationInterpretation,
  archiveCalculation,
  createCalculation,
  linkCalculationToClient,
  publishCalculationToClient,
  recalculateCalculation,
  saveCalculationInterpretation
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

  it("links only calculations with a matching CRM participant", async () => {
    const store = createMemoryStore();
    const created = await createCalculation({
      store,
      ownerUserId,
      module: "numerology",
      mode: "individual",
      methodCode: "pythagorean",
      methodVersion: "1.0.0",
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
      ],
      settingsSnapshot: {},
      inputSnapshot: {},
      resultSnapshot: {},
      resultSummary: {},
      resultChecksum: "sha256:v1",
      idGenerator: () => "00000000-0000-4000-8000-000000000050",
      versionIdGenerator: () => "00000000-0000-4000-8000-000000000051",
      now: new Date("2026-07-06T10:00:00.000Z")
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

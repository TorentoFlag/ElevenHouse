import { describe, expect, it } from "vitest";
import {
  chartMethodVersions,
  chartResultSchema,
  type ChartExecutionProfile,
  type ChartResult,
  type ReproducibleChartResult
} from "@elevenhouse/contracts";
import { buildChartResultReproducibilityFingerprint } from "../charts/chart-execution-profile";
import { sha256CanonicalJson, type CanonicalJson } from "./canonical-json";
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
import { calculationPdfDocumentFingerprint } from "./pdf";
import {
  CalculationAlreadyExistsError,
  CalculationInterpretationModeUnavailableError,
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
const expectedChartExecutionProfile: ChartExecutionProfile = {
  provider: "kerykeion",
  kerykeionVersion: "5.12.9",
  pyswissephVersion: "2.10.3.2",
  expectedEphemeris: "moshier",
  expectedEphemerisFlags: ["FLG_MOSEPH", "FLG_SPEED"],
  expectedEphemerisDataRevision: null
};

describe("calculations public barrel", () => {
  it("exports calculation PDF primitives", () => {
    expect(calculationPdfDocumentFingerprint).toBeTypeOf("function");
  });
});

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
        interpretationMode: input.interpretationMode ?? null,
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
      if (!current || current.resultChecksum !== input.expectedResultChecksum) return null;
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
            approvedAt: null,
            updatedAt: input.now
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
            ? {
                ...interpretation,
                status: "approved",
                approvedAt: input.now,
                updatedAt: input.now
              }
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
    expectedResultChecksum: calculation.resultChecksum,
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

  it("rejects an interpretation saved against a stale result checksum", async () => {
    const store = createMemoryStore();
    const created = await createTestCalculation(store);

    await expect(
      saveCalculationInterpretation({
        store,
        ownerUserId,
        calculationId: created.id,
        expectedResultChecksum: digest("c"),
        source: "manual",
        text: "Устаревшая трактовка",
        modelId: null,
        promptVersion: null,
        interpretationIdGenerator: () => "00000000-0000-4000-8000-000000000033",
        now
      })
    ).rejects.toThrow("Calculation changed while interpretation was being saved");

    await expect(
      store.findByOwnerAndId({ ownerUserId, calculationId: created.id })
    ).resolves.toMatchObject({ interpretations: [] });
  });

  it("treats repeated approval as a no-op and preserves the original approval time", async () => {
    const store = createMemoryStore();
    const created = await createTestCalculation(store);
    const draft = await saveCalculationInterpretation({
      store,
      ownerUserId,
      calculationId: created.id,
      expectedResultChecksum: created.resultChecksum,
      source: "manual",
      text: "Проверенная трактовка",
      modelId: null,
      promptVersion: null,
      interpretationIdGenerator: () => "00000000-0000-4000-8000-000000000034",
      now: new Date("2026-07-06T11:00:00.000Z")
    });
    const interpretationId = draft.interpretations[0]!.id;
    const first = await approveCalculationInterpretation({
      store,
      ownerUserId,
      calculationId: created.id,
      interpretationId,
      now: new Date("2026-07-06T11:10:00.000Z")
    });
    const replay = await approveCalculationInterpretation({
      store,
      ownerUserId,
      calculationId: created.id,
      interpretationId,
      now: new Date("2026-07-06T12:10:00.000Z")
    });

    expect(first.interpretations[0]?.approvedAt).toBe("2026-07-06T11:10:00.000Z");
    expect(replay.interpretations[0]?.approvedAt).toBe("2026-07-06T11:10:00.000Z");
    expect(replay.interpretations[0]?.updatedAt).toBe(first.interpretations[0]?.updatedAt);
    expect(replay.updatedAt).toBe(first.updatedAt);
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

  it.each(["link", "publish"] as const)(
    "fails closed when generic %s targets a valid legacy chart",
    async (operation) => {
      const store = createMemoryStore();
      const created = await createTestCalculation(store, {
        module: "chart",
        methodCode: "natal",
        resultData: chartNatalResult("chart-result.v1")
      });

      const failure = await (
        operation === "link"
          ? linkCalculationToClient({
              store,
              ownerUserId,
              calculationId: created.id,
              clientId,
              now
            })
          : publishCalculationToClient({
              store,
              ownerUserId,
              calculationId: created.id,
              clientId,
              expectedResultChecksum: created.resultChecksum,
              now
            })
      ).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(
        operation === "link"
          ? CalculationValidationError
          : CalculationInterpretationModeUnavailableError
      );
      expect(failure).toMatchObject(
        operation === "link"
          ? { message: "Legacy chart calculation must be recalculated before client exposure" }
          : { code: "CHART_INTERPRETATION_MODE_UNAVAILABLE" }
      );
      await expect(
        store.findByOwnerAndId({ ownerUserId, calculationId: created.id })
      ).resolves.toMatchObject({ links: [] });
      expect(store.calls.publishClientLink).toEqual([]);
    }
  );

  it("rejects creation-time linking for legacy charts but allows current v2 chart linking", async () => {
    await expect(
      createTestCalculation(createMemoryStore(), {
        module: "chart",
        methodCode: "natal",
        resultData: chartNatalResult("chart-result.v1"),
        linkClientIds: [clientId]
      })
    ).rejects.toThrow("recalculated before client exposure");

    const store = createMemoryStore();
    const currentResult = chartNatalResult("chart-result.v2");
    const current = await createTestCalculation(store, {
      module: "chart",
      methodCode: "natal",
      inputData: chartInputData(currentResult),
      resultData: currentResult,
      resultChecksum: sha256CanonicalJson(currentResult as unknown as CanonicalJson)
    });
    await expect(
      linkCalculationToClient({
        store,
        ownerUserId,
        calculationId: current.id,
        clientId,
        expectedChartExecutionProfile,
        now
      })
    ).resolves.toMatchObject({ links: [{ clientId }] });
  });

  it.each(["child", "legacy_unclassified"] as const)(
    "keeps %s natal charts private even after an interpretation is approved",
    async (interpretationMode) => {
      const store = createMemoryStore();
      const result = chartNatalResult("chart-result.v2");
      const created = await createTestCalculation(store, {
        module: "chart",
        methodCode: "natal",
        interpretationMode,
        inputData: chartInputData(result),
        resultData: result,
        resultChecksum: sha256CanonicalJson(result as unknown as CanonicalJson)
      });
      await linkCalculationToClient({
        store,
        ownerUserId,
        calculationId: created.id,
        clientId,
        expectedChartExecutionProfile,
        now
      });
      await saveAndApprove(store, created);

      const failure = await publishCalculationToClient({
        store,
        ownerUserId,
        calculationId: created.id,
        clientId,
        expectedResultChecksum: created.resultChecksum,
        expectedChartExecutionProfile,
        now: new Date("2026-07-06T11:30:00.000Z")
      }).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(CalculationInterpretationModeUnavailableError);
      expect(failure).toMatchObject({ code: "CHART_INTERPRETATION_MODE_UNAVAILABLE" });
      expect(store.calls.publishClientLink).toEqual([]);
      await expect(
        store.findByOwnerAndId({ ownerUserId, calculationId: created.id })
      ).resolves.toMatchObject({
        interpretationMode,
        links: [{ clientId, visibility: "private_to_astrologer", publishedAt: null }]
      });
    }
  );

  it("publishes an adult natal chart and preserves its interpretation mode on recalculation", async () => {
    const store = createMemoryStore();
    const result = chartNatalResult("chart-result.v2");
    const created = await createTestCalculation(store, {
      module: "chart",
      methodCode: "natal",
      interpretationMode: "adult_natal",
      inputData: chartInputData(result),
      resultData: result,
      resultChecksum: sha256CanonicalJson(result as unknown as CanonicalJson)
    });
    await linkCalculationToClient({
      store,
      ownerUserId,
      calculationId: created.id,
      clientId,
      expectedChartExecutionProfile,
      now
    });
    await saveAndApprove(store, created);

    await expect(
      publishCalculationToClient({
        store,
        ownerUserId,
        calculationId: created.id,
        clientId,
        expectedResultChecksum: created.resultChecksum,
        expectedChartExecutionProfile,
        now: new Date("2026-07-06T11:30:00.000Z")
      })
    ).resolves.toMatchObject({
      interpretationMode: "adult_natal",
      links: [{ clientId, visibility: "visible_to_client" }]
    });

    const recalculated = await recalculateCalculation({
      store,
      ownerUserId,
      calculationId: created.id,
      participants: created.participants,
      requestFingerprint: digest("c"),
      inputData: chartInputData(result),
      resultData: result,
      resultSummary: created.resultSummary,
      resultChecksum: created.resultChecksum,
      now: new Date("2026-07-06T11:40:00.000Z")
    });
    expect(recalculated.interpretationMode).toBe("adult_natal");
  });

  it.each(["create", "link", "publish"] as const)(
    "fails closed when generic %s exposure targets a v2 chart with a forged fingerprint",
    async (operation) => {
      const store = createMemoryStore();
      const current = chartNatalResult("chart-result.v2");
      const forged = {
        ...current,
        reproducibilityFingerprint: digest("0")
      };
      const existing =
        operation === "create"
          ? null
          : await createTestCalculation(store, {
              module: "chart",
              methodCode: "natal",
              interpretationMode: "adult_natal",
              resultData: forged
            });

      const failure = await (
        operation === "create"
          ? createTestCalculation(store, {
              module: "chart",
              methodCode: "natal",
              interpretationMode: "adult_natal",
              resultData: forged,
              linkClientIds: [clientId]
            })
          : operation === "link"
            ? linkCalculationToClient({
                store,
                ownerUserId,
                calculationId: existing!.id,
                clientId,
                now
              })
            : publishCalculationToClient({
                store,
                ownerUserId,
                calculationId: existing!.id,
                clientId,
                expectedResultChecksum: existing!.resultChecksum,
                now
              })
      ).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(CalculationValidationError);
      expect(failure).toMatchObject({
        message: "Chart calculation result is not eligible for client exposure"
      });
      expect(store.calls.publishClientLink).toEqual([]);
      if (existing) {
        await expect(
          store.findByOwnerAndId({ ownerUserId, calculationId: existing.id })
        ).resolves.toMatchObject({ links: [] });
      }
    }
  );

  it("rejects client exposure when a v2 render body no longer matches its stored checksum", async () => {
    const store = createMemoryStore();
    const current = chartNatalResult("chart-result.v2");
    const created = await createTestCalculation(store, {
      module: "chart",
      methodCode: "natal",
      inputData: chartInputData(current),
      resultData: current,
      resultChecksum: sha256CanonicalJson(current as unknown as CanonicalJson)
    });
    const mutated = {
      ...current,
      result: {
        ...current.result,
        points: [{ ...current.result.points[0]!, longitude: 42 }, ...current.result.points.slice(1)]
      }
    };
    await store.replaceResult({
      ownerUserId,
      calculationId: created.id,
      participants: created.participants,
      requestFingerprint: created.requestFingerprint,
      inputData: created.inputData,
      resultData: mutated,
      resultSummary: created.resultSummary,
      resultChecksum: created.resultChecksum,
      now: now.toISOString()
    });

    await expect(
      linkCalculationToClient({
        store,
        ownerUserId,
        calculationId: created.id,
        clientId,
        expectedChartExecutionProfile,
        now
      })
    ).rejects.toThrow("not eligible for client exposure");
  });

  it("rejects client exposure when a valid v2 result is from a non-current execution profile", async () => {
    const store = createMemoryStore();
    const current = chartNatalResult("chart-result.v2");
    const created = await createTestCalculation(store, {
      module: "chart",
      methodCode: "natal",
      inputData: chartInputData(current),
      resultData: current,
      resultChecksum: sha256CanonicalJson(current as unknown as CanonicalJson)
    });

    await expect(
      linkCalculationToClient({
        store,
        ownerUserId,
        calculationId: created.id,
        clientId,
        expectedChartExecutionProfile: {
          ...expectedChartExecutionProfile,
          expectedEphemeris: "swiss-ephemeris",
          expectedEphemerisFlags: ["FLG_SWIEPH", "FLG_SPEED"],
          expectedEphemerisDataRevision: `sha256:${"f".repeat(64)}`
        },
        now
      })
    ).rejects.toThrow("not eligible for client exposure");
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

type NatalChartResultV1 = Extract<
  ChartResult,
  { readonly schemaVersion: "chart-result.v1"; readonly method: "natal" }
>;
type NatalChartResultV2 = Extract<ReproducibleChartResult, { readonly method: "natal" }>;

function chartNatalResult(schemaVersion: "chart-result.v1"): NatalChartResultV1;
function chartNatalResult(schemaVersion: "chart-result.v2"): NatalChartResultV2;
function chartNatalResult(
  schemaVersion: "chart-result.v1" | "chart-result.v2"
): NatalChartResultV1 | NatalChartResultV2 {
  const legacy = {
    schemaVersion: "chart-result.v1" as const,
    method: "natal" as const,
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: {
      zodiac: "tropical" as const,
      houseSystem: "placidus" as const,
      nodeType: "true" as const,
      aspectPreset: "major" as const,
      orbMultiplier: 1
    },
    inputSnapshot: {
      birthDate: "1990-07-15",
      birthTime: "10:30",
      timezone: "Europe/Rome",
      latitude: 41.9028,
      longitude: 12.4964,
      birthTimePrecision: "exact" as const
    },
    result: {
      points: [
        "sun",
        "moon",
        "mercury",
        "venus",
        "mars",
        "jupiter",
        "saturn",
        "uranus",
        "neptune",
        "pluto",
        "ascendant",
        "midheaven",
        "north_node",
        "south_node"
      ].map((id, index) => ({
        id,
        label: id,
        longitude: index * 20,
        sign: "aries",
        signDegree: index % 29,
        house: index < 12 ? index + 1 : null,
        retrograde: false
      })),
      houses: Array.from({ length: 12 }, (_, index) => ({
        number: index + 1,
        longitude: index * 30,
        sign: "aries",
        signDegree: 0
      })),
      aspects: [],
      distributions: {
        elements: { fire: 3, earth: 3, air: 2, water: 2 },
        modalities: { cardinal: 4, fixed: 3, mutable: 3 },
        polarity: { masculine: 5, feminine: 5 }
      },
      warnings: []
    }
  };
  if (schemaVersion === "chart-result.v1") {
    return chartResultSchema.parse(legacy) as NatalChartResultV1;
  }
  const candidate = chartResultSchema.parse({
    ...legacy,
    schemaVersion: "chart-result.v2",
    methodVersion: chartMethodVersions.natal,
    provider: {
      name: "kerykeion",
      version: "5.12.9",
      pyswissephVersion: "2.10.3.2",
      ephemeris: "moshier",
      ephemerisFlags: ["FLG_MOSEPH", "FLG_SPEED"],
      ephemerisDataRevision: null
    },
    reproducibilityFingerprint: digest("f")
  }) as NatalChartResultV2;
  return {
    ...candidate,
    reproducibilityFingerprint: buildChartResultReproducibilityFingerprint(candidate)
  };
}

function chartInputData(result: NatalChartResultV1 | NatalChartResultV2) {
  return { inputSnapshot: result.inputSnapshot, settings: result.settings };
}

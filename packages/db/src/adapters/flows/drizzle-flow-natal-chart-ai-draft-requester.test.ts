import { describe, expect, it, vi } from "vitest";
import {
  chartMethodVersions,
  chartNatalResultV2Schema,
  type ChartExecutionProfile,
  type ReproducibleChartResult
} from "@elevenhouse/contracts";
import {
  buildChartResultReproducibilityFingerprint,
  sha256CanonicalJson,
  type CalculationRecord,
  type CalculationStore,
  type ChartAiDraftCommandStore,
  type DictionaryStore
} from "@elevenhouse/domain";

import type { ElevenHouseDatabase } from "../../runtime";
import { createDrizzleFlowNatalChartAiDraftRequester } from "./drizzle-flow-natal-chart-ai-draft-requester";

const ownerUserId = "10000000-0000-4000-8000-000000000001";
const runId = "20000000-0000-4000-8000-000000000001";
const calculationId = "30000000-0000-4000-8000-000000000001";
const commandId = "40000000-0000-4000-8000-000000000001";
const profile: ChartExecutionProfile = {
  provider: "kerykeion",
  kerykeionVersion: "5.12.9",
  pyswissephVersion: "2.10.3.2",
  expectedEphemeris: "moshier",
  expectedEphemerisFlags: ["FLG_MOSEPH", "FLG_SPEED"],
  expectedEphemerisDataRevision: null
};

describe("Drizzle flow natal chart AI draft requester", () => {
  it("binds one generated draft to the consumed natal signal and returns immutable approval evidence", async () => {
    const result = natalResult();
    const initial = calculation(result, []);
    const generatedText = "Сохранённый AI-черновик трактовки.";
    const saved = calculation(result, [interpretation(commandId, generatedText)]);
    let current = initial;
    const saveInterpretation = vi.fn(async () => {
      current = saved;
      return saved;
    });
    const calculationStore = {
      findByOwnerAndId: vi.fn(async () => current),
      saveInterpretation
    } as unknown as CalculationStore;
    const generate = vi.fn(async () => ({
      text: generatedText,
      modelId: "gpt-test",
      promptVersion: "flow.natal-draft@1"
    }));
    const commandStore = {
      acquire: vi.fn(async () => ({ kind: "acquired", commandId })),
      completeSuccess: vi.fn(async () => ({
        kind: "success",
        calculationId,
        interpretationId: commandId
      }))
    } as unknown as ChartAiDraftCommandStore;
    const requester = createDrizzleFlowNatalChartAiDraftRequester(
      consumedSignalDatabase({
        calculationId,
        resultChecksum: initial.resultChecksum,
        method: "natal",
        status: "succeeded"
      }),
      {
        calculationStore,
        dictionaryStore: { listEntriesByCodes: vi.fn(async () => ({ entries: [], total: 0 })) } as unknown as DictionaryStore,
        commandStore,
        executionProfile: profile,
        getDictionaryCodes: () => ["natal.sun"],
        generate,
        now: () => new Date("2026-08-07T00:00:00.000Z")
      }
    );

    await expect(
      requester.prepare({
        ownerUserId,
        runId,
        tokenId: "50000000-0000-4000-8000-000000000001",
        nodeActivationSequence: 2n,
        chartRequestNodeId: "natal-chart",
        locale: "ru"
      })
    ).resolves.toMatchObject({
      calculationId,
      interpretationId: commandId,
      sourceChecksum: initial.resultChecksum,
      outputText: generatedText,
      preview: generatedText
    });
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId,
        calculationId,
        sourceChecksum: initial.resultChecksum,
        locale: "ru",
        dictionaryCodes: ["natal.sun"]
      })
    );
    expect(saveInterpretation).toHaveBeenCalledOnce();
    expect(commandStore.acquire).toHaveBeenCalledWith(
      expect.objectContaining({ key: `flow-ai-draft:${runId}:50000000-0000-4000-8000-000000000001:2` })
    );
  });

  it("rejects generation when the run has not consumed a successful natal chart signal", async () => {
    const requester = createDrizzleFlowNatalChartAiDraftRequester(consumedSignalDatabase(undefined), {
      calculationStore: {} as CalculationStore,
      dictionaryStore: {} as DictionaryStore,
      commandStore: {} as ChartAiDraftCommandStore,
      executionProfile: profile,
      getDictionaryCodes: () => [],
      generate: vi.fn()
    });

    await expect(
      requester.prepare({
        ownerUserId,
        runId,
        tokenId: "50000000-0000-4000-8000-000000000001",
        nodeActivationSequence: 2n,
        chartRequestNodeId: "natal-chart",
        locale: "ru"
      })
    ).rejects.toMatchObject({ code: "FLOW_TOKEN_RUNTIME_STATE_INVALID" });
  });
});

function consumedSignalDatabase(
  row:
    | {
        readonly calculationId: string;
        readonly resultChecksum: string;
        readonly method: "natal";
        readonly status: "succeeded";
      }
    | undefined
): ElevenHouseDatabase {
  const query = {
    from: () => query,
    innerJoin: () => query,
    where: () => query,
    orderBy: () => query,
    limit: async () => (row ? [row] : [])
  };
  return { select: () => query } as unknown as ElevenHouseDatabase;
}

function calculation(
  result: NatalResult,
  interpretations: CalculationRecord["interpretations"]
): CalculationRecord {
  return {
    id: calculationId,
    ownerUserId,
    module: "chart",
    mode: "individual",
    methodCode: "natal",
    title: "Natal chart",
    status: "calculated",
    interpretationMode: "adult_natal",
    requestFingerprint: `sha256:${"a".repeat(64)}`,
    inputData: { inputSnapshot: result.inputSnapshot, settings: result.settings },
    resultData: result,
    resultSummary: {},
    resultChecksum: sha256CanonicalJson(result),
    participants: [],
    links: [],
    interpretations,
    artifacts: [],
    createdAt: "2026-08-07T00:00:00.000Z",
    updatedAt: "2026-08-07T00:00:00.000Z"
  };
}

function interpretation(id: string, text: string): CalculationRecord["interpretations"][number] {
  return {
    id,
    source: "ai",
    status: "draft",
    text,
    modelId: "gpt-test",
    promptVersion: "flow.natal-draft@1",
    approvedAt: null,
    updatedAt: "2026-08-07T00:00:00.000Z"
  };
}

type NatalResult = Extract<ReproducibleChartResult, { readonly method: "natal" }>;

function natalResult(): NatalResult {
  const pointIds = [
    "sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto", "ascendant", "midheaven", "north_node", "south_node"
  ];
  const candidate = chartNatalResultV2Schema.parse({
    schemaVersion: "chart-result.v2",
    method: "natal",
    methodVersion: chartMethodVersions.natal,
    provider: {
      name: "kerykeion",
      version: "5.12.9",
      pyswissephVersion: "2.10.3.2",
      ephemeris: "moshier",
      ephemerisFlags: ["FLG_MOSEPH", "FLG_SPEED"],
      ephemerisDataRevision: null
    },
    reproducibilityFingerprint: `sha256:${"0".repeat(64)}`,
    settings: {
      zodiac: "tropical",
      houseSystem: "placidus",
      nodeType: "true",
      aspectPreset: "major",
      orbMultiplier: 1
    },
    inputSnapshot: {
      birthDate: "1990-07-15",
      birthTime: "10:30",
      timezone: "Europe/Rome",
      latitude: 41.9028,
      longitude: 12.4964,
      birthTimePrecision: "exact"
    },
    result: {
      points: pointIds.map((id, index) => ({
        id,
        label: id,
        longitude: index * 20,
        sign: "aries",
        signDegree: index,
        house: (index % 12) + 1,
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
  });
  return {
    ...candidate,
    reproducibilityFingerprint: buildChartResultReproducibilityFingerprint(candidate)
  } as NatalResult;
}

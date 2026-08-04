import { HttpException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import {
  humanDesignCalculationResponseSchema,
  humanDesignPreviewResponseSchema,
  humanDesignTransitResponseSchema
} from "@elevenhouse/contracts";
import type {
  CalculationRecord,
  CalculationStore,
  AstrologerProfileStore,
  ClientBirthData,
  ClientStore
} from "@elevenhouse/domain";
import type { AiGenerationService } from "../ai/ai-generation.service";
import { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { HumanDesignService } from "./human-design.service";
import type { HumanDesignResolvedInputProvider } from "./human-design.tokens";

const ownerUserId = "8e14390f-3db1-4d1c-9344-55679c778427";
const now = new Date("2026-07-22T10:00:00.000Z");

const longitudes = {
  sun: 302,
  moon: 60.125,
  north_node: 10,
  mercury: 240.125,
  venus: 10,
  mars: 20,
  jupiter: 30,
  saturn: 40,
  uranus: 50,
  neptune: 60,
  pluto: 70
} as const;

describe("HumanDesignService", () => {
  it("previews deterministic individual mechanics from resolved longitudes", async () => {
    const { service } = createService();
    const response = await service.preview(previewBody(), request());

    humanDesignPreviewResponseSchema.parse(response);
    expect(response.result).toMatchObject({
      methodCode: "human_design_classic",
      schemaVersion: "human-design-result.v1",
      mode: "individual",
      type: "manifesting_generator",
      strategy: "wait_to_respond",
      authority: "sacral",
      definition: "single",
      profile: { code: "1/3" },
      incarnationCross: {
        angle: "right_angle",
        gateSequence: [41, 31, 34, 20]
      }
    });
    expect(response.result.inputFingerprint.value).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(response.result.resultChecksum.value).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("previews deterministic individual mechanics from owner-scoped CRM birth data", async () => {
    const { service, clientStore, resolvedInputProvider } = createService();

    const response = await service.preview(
      {
        mode: "individual",
        methodCode: "human_design_classic",
        source: "client",
        clientId: clientUserId
      },
      request()
    );

    humanDesignPreviewResponseSchema.parse(response);
    expect(clientStore.getAstrologerClient).toHaveBeenCalledWith({
      astrologerUserId: ownerUserId,
      clientUserId
    });
    expect(resolvedInputProvider.resolve).toHaveBeenCalledWith({
      inputSnapshot: {
        birthDate: "1990-07-15",
        birthTime: "10:30",
        timezone: "Europe/Rome",
        latitude: 41.9,
        longitude: 12.49,
        birthTimePrecision: "exact"
      }
    });
    expect(response.result).toMatchObject({
      methodCode: "human_design_classic",
      type: "manifesting_generator",
      authority: "sacral"
    });
  });

  it("previews deterministic compatibility mechanics for two owner-scoped CRM clients", async () => {
    const { service, calculationStore, clientStore, resolvedInputProvider } = createService();

    const response = await service.preview(
      {
        mode: "compatibility",
        methodCode: "human_design_classic",
        source: "client_pair",
        subjectClientId: clientUserId,
        partnerClientId
      },
      request()
    );

    humanDesignPreviewResponseSchema.parse(response);
    expect(response.result).toMatchObject({
      methodCode: "human_design_classic",
      schemaVersion: "human-design-compatibility-result.v1",
      mode: "compatibility",
      dynamicCounts: expect.objectContaining({
        electromagnetic: expect.any(Number),
        companionship: expect.any(Number),
        dominance: expect.any(Number),
        compromise: expect.any(Number)
      })
    });
    expect(clientStore.getAstrologerClient).toHaveBeenCalledWith({
      astrologerUserId: ownerUserId,
      clientUserId
    });
    expect(clientStore.getAstrologerClient).toHaveBeenCalledWith({
      astrologerUserId: ownerUserId,
      clientUserId: partnerClientId
    });
    expect(resolvedInputProvider.resolve).toHaveBeenCalledTimes(2);
    expect(calculationStore.create).not.toHaveBeenCalled();
  });

  it("creates a linked owner-scoped CRM calculation", async () => {
    const { service, calculationStore } = createService();

    const response = await service.createCalculation(
      {
        mode: "individual",
        methodCode: "human_design_classic",
        source: "client",
        clientId: clientUserId
      },
      request()
    );

    humanDesignCalculationResponseSchema.parse(response);
    expect(response.calculation).toMatchObject({
      ownerUserId,
      module: "human_design",
      mode: "individual",
      methodCode: "human_design_classic",
      title: "Client — Дизайн человека",
      status: "linked",
      participants: [
        {
          role: "subject",
          source: "crm_client",
          clientId: clientUserId,
          displayName: "Client"
        }
      ],
      links: [
        {
          clientId: clientUserId,
          visibility: "private_to_astrologer",
          linkedAt: now.toISOString(),
          publishedAt: null
        }
      ]
    });
    expect(response.calculation.requestFingerprint).toBe(response.result.inputFingerprint.value);
    expect(response.calculation.resultChecksum).toBe(response.result.resultChecksum.value);
    expect(calculationStore.create).toHaveBeenCalledOnce();
  });

  it("creates a linked owner-scoped compatibility calculation for two CRM clients", async () => {
    const { service, calculationStore } = createService();

    const response = await service.createCalculation(
      {
        mode: "compatibility",
        methodCode: "human_design_classic",
        source: "client_pair",
        subjectClientId: clientUserId,
        partnerClientId
      },
      request()
    );

    humanDesignCalculationResponseSchema.parse(response);
    expect(response.result.mode).toBe("compatibility");
    expect(response.calculation).toMatchObject({
      ownerUserId,
      module: "human_design",
      mode: "compatibility",
      methodCode: "human_design_classic",
      title: "Client + Partner — Партнёрский Human Design",
      status: "linked",
      participants: [
        {
          role: "subject",
          source: "crm_client",
          clientId: clientUserId,
          displayName: "Client"
        },
        {
          role: "partner",
          source: "crm_client",
          clientId: partnerClientId,
          displayName: "Partner"
        }
      ],
      links: [
        {
          clientId: clientUserId,
          visibility: "private_to_astrologer",
          linkedAt: now.toISOString(),
          publishedAt: null
        },
        {
          clientId: partnerClientId,
          visibility: "private_to_astrologer",
          linkedAt: now.toISOString(),
          publishedAt: null
        }
      ]
    });
    expect(response.calculation.requestFingerprint).toBe(response.result.inputFingerprint.value);
    expect(response.calculation.resultChecksum).toBe(response.result.resultChecksum.value);
    expect(calculationStore.create).toHaveBeenCalledOnce();
  });

  it("dedupes repeated persisted Human Design requests by exact fingerprint", async () => {
    const { service, calculationStore } = createService();

    const first = await service.createCalculation(
      {
        mode: "individual",
        methodCode: "human_design_classic",
        source: "client",
        clientId: clientUserId
      },
      request()
    );
    const replay = await service.createCalculation(
      {
        mode: "individual",
        methodCode: "human_design_classic",
        source: "client",
        clientId: clientUserId
      },
      request()
    );

    expect(replay.calculation.id).toBe(first.calculation.id);
    expect(calculationStore.create).toHaveBeenCalledOnce();
    expect(calculationStore.ensureClientLinks).toHaveBeenCalledOnce();
  });

  it("recalculates an existing Human Design record from current CRM birth data", async () => {
    const { service, calculationStore, resolvedInputProvider } = createService();
    const saved = await service.createCalculation(
      {
        mode: "individual",
        methodCode: "human_design_classic",
        source: "client",
        clientId: clientUserId
      },
      request()
    );
    vi.mocked(resolvedInputProvider.resolve).mockResolvedValueOnce({
      personality: { ...longitudes, sun: 12 },
      design: { ...longitudes, sun: 222 }
    });

    const recalculated = await service.recalculate(saved.calculation.id, {}, request());

    expect(recalculated.calculation.id).toBe(saved.calculation.id);
    expect(recalculated.calculation.resultChecksum).not.toBe(saved.calculation.resultChecksum);
    expect(recalculated.result.mode).toBe("individual");
    if (recalculated.result.mode !== "individual") {
      throw new Error("Expected individual Human Design recalculation result");
    }
    expect(recalculated.result.activations).toContainEqual(
      expect.objectContaining({ side: "personality", body: "sun", longitude: 12 })
    );
    expect(calculationStore.replaceResult).toHaveBeenCalledOnce();
  });

  it("recalculates a compatibility record from the original CRM pair", async () => {
    const { service, calculationStore, resolvedInputProvider } = createService();
    const saved = await service.createCalculation(
      {
        mode: "compatibility",
        methodCode: "human_design_classic",
        source: "client_pair",
        subjectClientId: clientUserId,
        partnerClientId
      },
      request()
    );
    vi.mocked(resolvedInputProvider.resolve)
      .mockResolvedValueOnce({
        personality: { ...longitudes, sun: 12 },
        design: { ...longitudes, sun: 222 }
      })
      .mockResolvedValueOnce({
        personality: { ...longitudes, sun: 42 },
        design: { ...longitudes, sun: 202 }
      });

    const recalculated = await service.recalculate(saved.calculation.id, {}, request());

    expect(recalculated.calculation.id).toBe(saved.calculation.id);
    expect(recalculated.calculation.mode).toBe("compatibility");
    expect(recalculated.calculation.resultChecksum).not.toBe(saved.calculation.resultChecksum);
    expect(recalculated.result.mode).toBe("compatibility");
    expect(calculationStore.replaceResult).toHaveBeenCalledOnce();
  });

  it("returns a read-only transit overlay for a saved individual calculation", async () => {
    const { service, calculationStore, resolvedInputProvider } = createService();
    const saved = await service.createCalculation(
      {
        mode: "individual",
        methodCode: "human_design_classic",
        source: "client",
        clientId: clientUserId
      },
      request()
    );
    vi.mocked(calculationStore.create).mockClear();

    const response = await service.transits(
      saved.calculation.id,
      { instant: "2026-07-23T09:30:00.000Z" },
      request()
    );

    humanDesignTransitResponseSchema.parse(response);
    expect(response.result.schemaVersion).toBe("human-design-transit-result.v1");
    expect(response.result.mode).toBe("transit");
    expect(response.result.natal.mode).toBe("individual");
    expect(response.result.natal.resultChecksum.value).toBe(saved.result.resultChecksum.value);
    expect(response.result.transitSnapshot).toEqual({
      instant: "2026-07-23T09:30:00.000Z",
      date: "2026-07-23",
      time: "11:30",
      timezone: "Europe/Rome",
      latitude: 41.9,
      longitude: 12.49
    });
    expect(resolvedInputProvider.resolveTransit).toHaveBeenCalledWith({
      transitSnapshot: response.result.transitSnapshot
    });
    expect(calculationStore.create).not.toHaveBeenCalled();
    expect(calculationStore.replaceResult).not.toHaveBeenCalled();
  });

  it("creates a checksum-bound AI interpretation draft for a saved Human Design calculation", async () => {
    const { service, aiGeneration } = createService();
    const saved = await service.createCalculation(
      {
        mode: "individual",
        methodCode: "human_design_classic",
        source: "client",
        clientId: clientUserId
      },
      request()
    );

    const response = await service.createAiDraft(
      saved.calculation.id,
      { expectedResultChecksum: saved.calculation.resultChecksum },
      request()
    );
    if (saved.result.mode !== "individual") {
      throw new Error("Expected saved individual Human Design result");
    }

    expect(response.calculation.interpretations).toEqual([
      expect.objectContaining({
        status: "draft",
        text: expect.stringContaining("ОБЗОР")
      })
    ]);
    expect(aiGeneration.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId,
        feature: "humanDesign.interpretationDraft",
        input: expect.objectContaining({
          mode: "individual",
          resultChecksum: saved.calculation.resultChecksum,
          subject: expect.objectContaining({
            type: saved.result.type
          })
        })
      })
    );
    expect(JSON.stringify(vi.mocked(aiGeneration.generate).mock.calls[0]?.[0].input)).not.toContain(
      "longitude"
    );
  });

  it("creates a Human Design AI draft with server-resolved transit overlay context", async () => {
    const { service, aiGeneration, resolvedInputProvider } = createService();
    const saved = await service.createCalculation(
      {
        mode: "individual",
        methodCode: "human_design_classic",
        source: "client",
        clientId: clientUserId
      },
      request()
    );

    await service.createAiDraft(
      saved.calculation.id,
      {
        expectedResultChecksum: saved.calculation.resultChecksum,
        transitInstant: "2026-07-23T09:15:00.000Z"
      },
      request()
    );

    expect(resolvedInputProvider.resolveTransit).toHaveBeenCalledWith({
      transitSnapshot: expect.objectContaining({
        instant: "2026-07-23T09:15:00.000Z"
      })
    });
    expect(aiGeneration.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          mode: "individual",
          transit: expect.objectContaining({
            snapshot: expect.objectContaining({
              instant: "2026-07-23T09:15:00.000Z"
            }),
            summary: expect.objectContaining({
              transitActivationCount: 13
            })
          })
        })
      })
    );
    expect(JSON.stringify(vi.mocked(aiGeneration.generate).mock.calls[0]?.[0].input)).not.toContain(
      "longitude"
    );
  });

  it("rejects stale Human Design AI draft requests before calling AI", async () => {
    const { service, aiGeneration } = createService();
    const saved = await service.createCalculation(
      {
        mode: "individual",
        methodCode: "human_design_classic",
        source: "client",
        clientId: clientUserId
      },
      request()
    );

    await expectHttpCode(
      service.createAiDraft(
        saved.calculation.id,
        { expectedResultChecksum: `sha256:${"f".repeat(64)}` },
        request()
      ),
      409,
      "HUMAN_DESIGN_RESULT_INTEGRITY_FAILED"
    );
    expect(aiGeneration.generate).not.toHaveBeenCalled();
  });

  it("returns a stable not-found code when the CRM client has no birth data", async () => {
    const { service } = createService({ birthData: null });

    await expectHttpCode(
      service.preview(
        {
          mode: "individual",
          methodCode: "human_design_classic",
          source: "client",
          clientId: clientUserId
        },
        request()
      ),
      404,
      "HUMAN_DESIGN_CLIENT_NOT_FOUND"
    );
  });

  it("returns a stable readiness code when CRM birth data cannot be calculated", async () => {
    const { service } = createService({
      birthData: { ...readyBirthData(), birthTime: null, birthTimePrecision: "unknown" }
    });

    await expectHttpCode(
      service.preview(
        {
          mode: "individual",
          methodCode: "human_design_classic",
          source: "client",
          clientId: clientUserId
        },
        request()
      ),
      409,
      "HUMAN_DESIGN_BIRTH_DATA_NOT_READY"
    );
  });

  it("maps positions provider failures to a stable safe code", async () => {
    const { service } = createService({
      resolve: async () => {
        throw new Error("CHART_ENGINE_HTTP_503");
      }
    });

    await expectHttpCode(
      service.preview(
        {
          mode: "individual",
          methodCode: "human_design_classic",
          source: "client",
          clientId: clientUserId
        },
        request()
      ),
      502,
      "HUMAN_DESIGN_PROVIDER_FAILED"
    );
  });

  it("rejects invalid preview bodies with a stable safe error code", async () => {
    await expectHttpCode(
      createService().service.preview(
        {
          ...previewBody(),
          birthDate: "1990-07-15"
        },
        request()
      ),
      400,
      "HUMAN_DESIGN_VALIDATION_FAILED"
    );
  });

  it("requires an authenticated astrologer session", async () => {
    await expect(createService().service.preview(previewBody(), { headers: {} })).rejects.toThrow(
      UnauthorizedException
    );
  });
});

const clientUserId = "df3192f4-3d67-4b70-8c1a-6a14bd9a51af";
const partnerClientId = "4cbe9eea-6722-4a7f-8cc8-b403c04d1a8a";

function previewBody() {
  return {
    mode: "individual",
    methodCode: "human_design_classic",
    resolvedLongitudes: {
      personality: longitudes,
      design: { ...longitudes, sun: 242 }
    }
  };
}

function request(): AstrologerSessionRequest {
  return {
    headers: {},
    currentAstrologerAccount: {
      account: {
        id: ownerUserId,
        status: "active",
        roles: ["astrologer"]
      }
    }
  };
}

function createService(
  input: {
    readonly birthData?: ClientBirthData | null;
    readonly resolve?: HumanDesignResolvedInputProvider["resolve"];
    readonly resolveTransit?: HumanDesignResolvedInputProvider["resolveTransit"];
  } = {}
) {
  const calculationStore = createCalculationStore();
  const clientStore = createClientStore(input.birthData);
  const profileStore = createProfileStore();
  const aiGeneration = createAiGenerationService();
  const resolvedInputProvider: HumanDesignResolvedInputProvider = {
    resolve:
      input.resolve ??
      vi.fn(async () => ({
        personality: longitudes,
        design: { ...longitudes, sun: 242 }
      })),
    resolveTransit: input.resolveTransit ?? vi.fn(async () => longitudes)
  };
  return {
    service: new HumanDesignService(
      calculationStore,
      clientStore,
      profileStore,
      resolvedInputProvider,
      { now: vi.fn(() => now) } as unknown as SystemClock,
      aiGeneration
    ),
    calculationStore,
    clientStore,
    resolvedInputProvider,
    aiGeneration
  };
}

function createCalculationStore(): CalculationStore {
  const records: CalculationRecord[] = [];
  const store: CalculationStore = {
    listByOwner: vi.fn(async () => ({ calculations: records, total: records.length })),
    findByOwnerAndId: vi.fn(
      async (input) =>
        records.find(
          (record) => record.ownerUserId === input.ownerUserId && record.id === input.calculationId
        ) ?? null
    ),
    findExact: vi.fn(
      async (input) =>
        records.find(
          (record) =>
            record.ownerUserId === input.ownerUserId &&
            record.module === input.module &&
            record.mode === input.mode &&
            record.methodCode === input.methodCode &&
            record.requestFingerprint === input.requestFingerprint
        ) ?? null
    ),
    create: vi.fn(async (input) => {
      const record: CalculationRecord = {
        id: input.idGenerator(),
        ownerUserId: input.ownerUserId,
        module: input.module,
        mode: input.mode,
        interpretationMode: input.interpretationMode ?? null,
        methodCode: input.methodCode,
        title: input.title,
        status: input.linkClientIds.length ? "linked" : "calculated",
        participants: input.participants,
        links: input.linkClientIds.map((linkedClientId: string) => ({
          clientId: linkedClientId,
          visibility: "private_to_astrologer" as const,
          linkedAt: input.now,
          publishedAt: null
        })),
        interpretations: [],
        artifacts: [],
        requestFingerprint: input.requestFingerprint,
        inputData: input.inputData,
        resultData: input.resultData,
        resultSummary: input.resultSummary,
        resultChecksum: input.resultChecksum,
        createdAt: input.now,
        updatedAt: input.now
      };
      records.push(record);
      return record;
    }),
    replaceResult: vi.fn(async (input) => {
      const index = records.findIndex(
        (record) => record.ownerUserId === input.ownerUserId && record.id === input.calculationId
      );
      if (index < 0) return { status: "not_found" as const };
      const current = records[index]!;
      const updated: CalculationRecord = {
        ...current,
        ...(input.title === undefined ? {} : { title: input.title }),
        participants: input.participants,
        requestFingerprint: input.requestFingerprint,
        inputData: input.inputData,
        resultData: input.resultData,
        resultSummary: input.resultSummary,
        resultChecksum: input.resultChecksum,
        updatedAt: input.now
      };
      records[index] = updated;
      return { status: "updated" as const, calculation: updated };
    }),
    ensureClientLinks: vi.fn(
      async (input) =>
        records.find(
          (record) => record.ownerUserId === input.ownerUserId && record.id === input.calculationId
        ) ?? null
    ),
    linkClient: vi.fn(async () => null),
    publishClientLink: vi.fn(async () => null),
    saveInterpretation: vi.fn(async (input) => {
      const index = records.findIndex(
        (record) =>
          record.ownerUserId === input.ownerUserId &&
          record.id === input.calculationId &&
          record.resultChecksum === input.expectedResultChecksum
      );
      if (index < 0) return null;
      const current = records[index]!;
      const updated: CalculationRecord = {
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
      records[index] = updated;
      return updated;
    }),
    approveInterpretation: vi.fn(async () => null),
    archive: vi.fn(async () => null)
  };
  return store;
}

function createProfileStore(): AstrologerProfileStore {
  return {
    findByOwnerUserId: vi.fn(async () => ({ ownerUserId, locale: "ru" })),
    upsert: vi.fn(async () => raise())
  } as unknown as AstrologerProfileStore;
}

function createAiGenerationService(): AiGenerationService {
  return {
    generate: vi.fn(async () => ({
      output: {
        overview: "Обзор",
        mechanics: "Механика",
        sessionFocus: "Фокус",
        conditioningRisks: "Риски",
        relationshipFocus: null,
        transitFocus: null,
        reflectionQuestions: ["Первый?", "Второй?", "Третий?"],
        disclaimer: "Не заменяет профессиональную помощь."
      },
      provider: "openai",
      model: "gpt-5.5",
      finishReason: "completed"
    }))
  } as unknown as AiGenerationService;
}

function createClientStore(birthData: ClientBirthData | null = readyBirthData()): ClientStore {
  return {
    createJoinIntent: vi.fn(async () => raise()),
    findJoinIntentByTokenHash: vi.fn(async () => raise()),
    markJoinIntentClaimed: vi.fn(async () => raise()),
    ensureRelationship: vi.fn(async () => raise()),
    upsertClientProfile: vi.fn(async () => raise()),
    upsertClientBirthData: vi.fn(async () => raise()),
    listClientBirthDataProfiles: vi.fn(async () => []),
    createClientBirthDataProfile: vi.fn(async () => raise()),
    updateClientBirthDataProfile: vi.fn(async () => raise()),
    listAstrologerClients: vi.fn(async () => raise()),
    getAstrologerClient: vi.fn(async (input) => ({
      clientUserId: input.clientUserId,
      displayName: input.clientUserId === partnerClientId ? "Partner" : "Client",
      relationshipStatus: "active" as const,
      firstLinkedAt: "2026-01-01T00:00:00.000Z",
      lastLinkedAt: "2026-01-01T00:00:00.000Z",
      birthData
    }))
  };
}

function readyBirthData(): ClientBirthData {
  return {
    id: "birth-data-1",
    clientUserId,
    label: "Natal",
    birthDate: "1990-07-15",
    birthTime: "10:30",
    birthTimePrecision: "exact",
    birthPlaceText: "Rome, Italy",
    birthCountryCode: "IT",
    birthCity: "Rome",
    birthRegion: null,
    birthTimezone: "Europe/Rome",
    birthTimeDstOccurrence: null,
    birthLatitude: 41.9,
    birthLongitude: 12.49,
    source: "manual",
    isPrimary: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function raise(): never {
  throw new Error("Unexpected test dependency call");
}

async function expectHttpCode(
  promise: Promise<unknown>,
  status: number,
  code: string
): Promise<void> {
  try {
    await promise;
    throw new Error("Expected promise to reject");
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    const exception = error as HttpException;
    expect(exception.getStatus()).toBe(status);
    expect(exception.getResponse()).toMatchObject({ code });
  }
}

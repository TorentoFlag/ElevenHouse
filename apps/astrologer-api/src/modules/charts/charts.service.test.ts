import { describe, expect, it, vi } from "vitest";
import type {
  AstrologerProfileStore,
  CalculationRecord,
  CalculationStore,
  ChartCalculationCommandStore,
  ChartCalculationJobStore,
  ClientBirthData,
  ClientStore,
  DictionaryStore
} from "@elevenhouse/domain";
import type { AiGenerationService } from "../ai/ai-generation.service";
import type { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { ChartsService } from "./charts.service";

const now = new Date("2026-07-20T12:00:00.000Z");
const ownerUserId = "11111111-1111-4111-8111-111111111111";
const clientId = "22222222-2222-4222-8222-222222222222";
const jobId = "33333333-3333-4333-8333-333333333333";
const partnerClientId = "44444444-4444-4444-8444-444444444444";

describe("ChartsService", () => {
  it("hydrates birth data from CRM and never accepts browser birth data", async () => {
    const clientStore = createClientStore();
    const commandStore = createCommandStore();
    const service = createService({ clientStore, commandStore });

    await service.createNatalJob(
      {
        clientId,
        settings: settings()
      },
      request()
    );

    expect(clientStore.getAstrologerClient).toHaveBeenCalledWith({
      astrologerUserId: ownerUserId,
      clientUserId: clientId
    });
    expect(commandStore.createOrReuseNatalJobAndRequestCalculation).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId,
        clientId,
        inputSnapshot: expect.objectContaining({ birthDate: "1990-07-15" })
      })
    );
  });

  it("creates transit jobs with resolved natal-backed transit snapshot", async () => {
    const commandStore = createCommandStore();
    const service = createService({ commandStore });

    await service.createTransitJob(
      {
        clientId,
        settings: settings(),
        transit: {
          date: "2026-07-22",
          time: "14:30"
        }
      },
      request()
    );

    expect(commandStore.createOrReuseChartJobAndRequestCalculation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "transit",
        ownerUserId,
        clientId,
        inputSnapshot: {
          inputSnapshot: expect.objectContaining({
            birthDate: "1990-07-15",
            timezone: "Europe/Rome"
          }),
          transitSnapshot: {
            date: "2026-07-22",
            time: "14:30",
            timezone: "Europe/Rome",
            latitude: 41.9028,
            longitude: 12.4964
          }
        }
      })
    );
  });

  it("allows an explicit transit timezone and coordinates", async () => {
    const commandStore = createCommandStore();
    const service = createService({ commandStore });

    await service.createTransitJob(
      {
        clientId,
        settings: settings(),
        transit: {
          date: "2026-07-22",
          time: "14:30",
          timezone: "Europe/Moscow",
          latitude: 55.7558,
          longitude: 37.6173
        }
      },
      request()
    );

    expect(commandStore.createOrReuseChartJobAndRequestCalculation).toHaveBeenCalledWith(
      expect.objectContaining({
        inputSnapshot: expect.objectContaining({
          transitSnapshot: {
            date: "2026-07-22",
            time: "14:30",
            timezone: "Europe/Moscow",
            latitude: 55.7558,
            longitude: 37.6173
          }
        })
      })
    );
  });

  it("creates synastry jobs from two owner-scoped CRM birth data snapshots", async () => {
    const clientStore = createClientStore({
      clients: {
        [clientId]: readyBirthData({ clientUserId: clientId, birthDate: "1990-07-15" }),
        [partnerClientId]: readyBirthData({
          clientUserId: partnerClientId,
          birthDate: "1992-08-11",
          birthTime: "08:15",
          birthTimezone: "Europe/Moscow",
          birthLatitude: 55.7558,
          birthLongitude: 37.6173
        })
      }
    });
    const commandStore = createCommandStore();
    const service = createService({ clientStore, commandStore });

    await service.createSynastryJob(
      {
        clientId,
        partnerClientId,
        settings: settings()
      },
      request()
    );

    expect(clientStore.getAstrologerClient).toHaveBeenCalledWith({
      astrologerUserId: ownerUserId,
      clientUserId: clientId
    });
    expect(clientStore.getAstrologerClient).toHaveBeenCalledWith({
      astrologerUserId: ownerUserId,
      clientUserId: partnerClientId
    });
    expect(commandStore.createOrReuseChartJobAndRequestCalculation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "synastry",
        ownerUserId,
        clientId,
        inputSnapshot: {
          inputSnapshot: expect.objectContaining({
            birthDate: "1990-07-15",
            timezone: "Europe/Rome"
          }),
          partnerInputSnapshot: expect.objectContaining({
            birthDate: "1992-08-11",
            timezone: "Europe/Moscow"
          }),
          relationshipSnapshot: {
            primaryClientId: clientId,
            partnerClientId
          }
        }
      })
    );
  });

  it("creates composite jobs from two owner-scoped CRM birth data snapshots", async () => {
    const clientStore = createClientStore({
      clients: {
        [clientId]: readyBirthData({ clientUserId: clientId, birthDate: "1990-07-15" }),
        [partnerClientId]: readyBirthData({
          clientUserId: partnerClientId,
          birthDate: "1992-08-11",
          birthTime: "08:15",
          birthTimezone: "Europe/Moscow",
          birthLatitude: 55.7558,
          birthLongitude: 37.6173
        })
      }
    });
    const commandStore = createCommandStore();
    const service = createService({ clientStore, commandStore });

    await service.createCompositeJob(
      {
        clientId,
        partnerClientId,
        settings: settings()
      },
      request()
    );

    expect(clientStore.getAstrologerClient).toHaveBeenCalledWith({
      astrologerUserId: ownerUserId,
      clientUserId: clientId
    });
    expect(clientStore.getAstrologerClient).toHaveBeenCalledWith({
      astrologerUserId: ownerUserId,
      clientUserId: partnerClientId
    });
    expect(commandStore.createOrReuseChartJobAndRequestCalculation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "composite",
        ownerUserId,
        clientId,
        inputSnapshot: {
          inputSnapshot: expect.objectContaining({
            birthDate: "1990-07-15",
            timezone: "Europe/Rome"
          }),
          partnerInputSnapshot: expect.objectContaining({
            birthDate: "1992-08-11",
            timezone: "Europe/Moscow"
          }),
          relationshipSnapshot: {
            primaryClientId: clientId,
            partnerClientId
          }
        }
      })
    );
  });

  it("creates solar return jobs with natal-backed return location", async () => {
    const commandStore = createCommandStore();
    const service = createService({ commandStore });

    await service.createSolarReturnJob(
      {
        clientId,
        year: 2026,
        settings: settings()
      },
      request()
    );

    expect(commandStore.createOrReuseChartJobAndRequestCalculation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "solar_return",
        ownerUserId,
        clientId,
        inputSnapshot: {
          inputSnapshot: expect.objectContaining({
            birthDate: "1990-07-15",
            timezone: "Europe/Rome"
          }),
          solarReturnSnapshot: {
            year: 2026,
            returnType: "solar",
            location: {
              timezone: "Europe/Rome",
              latitude: 41.9028,
              longitude: 12.4964
            }
          }
        }
      })
    );
  });

  it("creates secondary progression jobs from the owner-scoped CRM birth data snapshot", async () => {
    const commandStore = createCommandStore();
    const service = createService({ commandStore });

    await service.createProgressionJob(
      {
        clientId,
        targetDate: "2026-07-23",
        settings: settings()
      },
      request()
    );

    expect(commandStore.createOrReuseChartJobAndRequestCalculation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "progression",
        ownerUserId,
        clientId,
        inputSnapshot: {
          inputSnapshot: expect.objectContaining({
            birthDate: "1990-07-15",
            timezone: "Europe/Rome"
          }),
          progressionSnapshot: {
            targetDate: "2026-07-23",
            progressionType: "secondary"
          }
        }
      })
    );
  });

  it("creates horary jobs from a private question snapshot without requiring birth data", async () => {
    const clientStore = createClientStore({ birthData: null });
    const commandStore = createCommandStore();
    const service = createService({ clientStore, commandStore });

    await service.createHoraryJob(
      {
        clientId,
        question: horaryQuestion(),
        settings: settings()
      },
      request()
    );

    expect(clientStore.getAstrologerClient).toHaveBeenCalledWith({
      astrologerUserId: ownerUserId,
      clientUserId: clientId
    });
    expect(commandStore.createOrReuseChartJobAndRequestCalculation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "horary",
        ownerUserId,
        clientId,
        inputSnapshot: {
          questionSnapshot: horaryQuestion()
        },
        settingsSnapshot: expect.objectContaining(settings())
      })
    );
  });

  it("creates astrocartography jobs from owner-scoped CRM birth data", async () => {
    const clientStore = createClientStore();
    const commandStore = createCommandStore();
    const service = createService({ clientStore, commandStore });

    await service.createAstrocartographyJob(
      {
        clientId,
        settings: settings()
      },
      request()
    );

    expect(clientStore.getAstrologerClient).toHaveBeenCalledWith({
      astrologerUserId: ownerUserId,
      clientUserId: clientId
    });
    expect(commandStore.createOrReuseChartJobAndRequestCalculation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "astrocartography",
        ownerUserId,
        clientId,
        inputSnapshot: {
          inputSnapshot: expect.objectContaining({
            birthDate: "1990-07-15",
            birthTime: "10:30",
            timezone: "Europe/Rome"
          })
        },
        settingsSnapshot: expect.objectContaining(settings())
      })
    );
  });

  it("rejects browser-supplied birth data in astrocartography job requests", async () => {
    const commandStore = createCommandStore();
    const service = createService({ commandStore });

    await expect(
      service.createAstrocartographyJob(
        {
          clientId,
          birthDate: "1988-01-01",
          settings: settings()
        },
        request()
      )
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "CHART_VALIDATION_FAILED" })
    });
    expect(commandStore.createOrReuseChartJobAndRequestCalculation).not.toHaveBeenCalled();
  });

  it("reuses an existing astrocartography calculation result for an identical request", async () => {
    const calculationId = "77777777-7777-4777-8777-777777777777";
    const commandStore = createCommandStore({
      outcome: { kind: "existing_result", calculationId }
    });
    const jobStore = createJobStore({
      result: astrocartographyResult()
    });
    const service = createService({ commandStore, jobStore });

    await expect(
      service.createAstrocartographyJob(
        {
          clientId,
          settings: settings()
        },
        request()
      )
    ).resolves.toMatchObject({
      status: "succeeded",
      calculationId,
      result: { method: "astrocartography" }
    });
  });

  it("reuses an existing solar return calculation result for an identical request", async () => {
    const calculationId = "77777777-7777-4777-8777-777777777777";
    const commandStore = createCommandStore({
      outcome: { kind: "existing_result", calculationId }
    });
    const jobStore = createJobStore({
      result: solarReturnResult()
    });
    const service = createService({ commandStore, jobStore });

    await expect(
      service.createSolarReturnJob(
        {
          clientId,
          year: 2026,
          settings: settings()
        },
        request()
      )
    ).resolves.toMatchObject({
      status: "succeeded",
      calculationId,
      result: { method: "solar_return" }
    });
  });

  it("rejects synastry jobs for the same client", async () => {
    const commandStore = createCommandStore();
    const service = createService({ commandStore });

    await expect(
      service.createSynastryJob(
        { clientId, partnerClientId: clientId, settings: settings() },
        request()
      )
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "CHART_SYNASTRY_PARTNER_REQUIRED" })
    });
    expect(commandStore.createOrReuseChartJobAndRequestCalculation).not.toHaveBeenCalled();
  });

  it("rejects composite jobs for the same client", async () => {
    const commandStore = createCommandStore();
    const service = createService({ commandStore });

    await expect(
      service.createCompositeJob(
        { clientId, partnerClientId: clientId, settings: settings() },
        request()
      )
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "CHART_COMPOSITE_PARTNER_REQUIRED" })
    });
    expect(commandStore.createOrReuseChartJobAndRequestCalculation).not.toHaveBeenCalled();
  });

  it("rejects synastry jobs when the partner has no birth data", async () => {
    const clientStore = createClientStore({
      clients: {
        [clientId]: readyBirthData({ clientUserId: clientId }),
        [partnerClientId]: null
      }
    });
    const commandStore = createCommandStore();
    const service = createService({ clientStore, commandStore });

    await expect(
      service.createSynastryJob({ clientId, partnerClientId, settings: settings() }, request())
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "CHART_PARTNER_CLIENT_NOT_FOUND" })
    });
    expect(commandStore.createOrReuseChartJobAndRequestCalculation).not.toHaveBeenCalled();
  });

  it("maps unknown birth time to an actionable validation error", async () => {
    const clientStore = createClientStore({
      birthData: { ...readyBirthData(), birthTime: null, birthTimePrecision: "unknown" }
    });
    const service = createService({ clientStore });

    await expect(
      service.createNatalJob({ clientId, settings: settings() }, request())
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "CHART_BIRTH_TIME_REQUIRED" })
    });
  });

  it("returns persisted failure details for a failed chart job", async () => {
    const jobStore = createJobStore({
      job: {
        id: jobId,
        ownerUserId,
        clientId,
        resultCalculationId: null,
        method: "natal",
        status: "failed",
        inputFingerprint: "sha256:test",
        lastErrorCode: "retry_exhausted",
        lastErrorMessage: "CHART_ENGINE_HTTP_503"
      }
    });
    const service = createService({ jobStore });

    await expect(service.getJob(jobId, request())).resolves.toMatchObject({
      id: jobId,
      status: "failed",
      calculationId: null,
      failureCode: "retry_exhausted",
      failureMessage: "CHART_ENGINE_HTTP_503"
    });
  });

  it("generates and saves a checksum-bound natal chart AI draft", async () => {
    const calculation = chartCalculationRecord();
    const calculationStore = createCalculationStore(calculation);
    const dictionaryStore = createDictionaryStore();
    const aiGeneration = createAiGenerationService();
    const service = createService({
      calculationStore,
      dictionaryStore,
      aiGeneration,
      locale: "en"
    });

    const response = await service.createAiDraft(
      calculation.id,
      { expectedResultChecksum: calculation.resultChecksum },
      request()
    );

    expect(response.interpretations[0]).toMatchObject({
      status: "draft",
      text: expect.stringContaining("OVERVIEW")
    });
    expect(response.interpretations[0]?.text).not.toContain("IMPORTANT");
    expect(response.interpretations[0]?.text).not.toContain("ВАЖНО");
    expect(dictionaryStore.listEntriesByCodes).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId,
        locale: "en",
        codes: expect.arrayContaining(["sun_aries", "moon_house_2", "house_1"])
      })
    );
    expect(aiGeneration.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: "chart.interpretationDraft",
        ownerUserId,
        input: expect.objectContaining({
          locale: "en",
          methodCode: "natal",
          resultChecksum: calculation.resultChecksum
        })
      })
    );
    expect(JSON.stringify(vi.mocked(aiGeneration.generate).mock.calls[0]?.[0].input)).not.toContain(
      "birthDate"
    );
    expect(calculationStore.saveInterpretation).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedResultChecksum: calculation.resultChecksum,
        source: "ai",
        modelId: "gpt-test",
        promptVersion: "chart.interpretationDraft@2"
      })
    );
  });

  it("rejects stale chart AI draft requests before calling the provider", async () => {
    const calculation = chartCalculationRecord();
    const aiGeneration = createAiGenerationService();
    const service = createService({
      calculationStore: createCalculationStore(calculation),
      aiGeneration
    });

    await expect(
      service.createAiDraft(
        calculation.id,
        { expectedResultChecksum: `sha256:${"f".repeat(64)}` },
        request()
      )
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "CHART_RESULT_CHANGED" })
    });
    expect(aiGeneration.generate).not.toHaveBeenCalled();
  });

  it("rejects unsupported chart AI methods without calling the provider", async () => {
    const calculation = chartCalculationRecord({ methodCode: "transit" });
    const aiGeneration = createAiGenerationService();
    const service = createService({
      calculationStore: createCalculationStore(calculation),
      aiGeneration
    });

    await expect(
      service.createAiDraft(
        calculation.id,
        { expectedResultChecksum: calculation.resultChecksum },
        request()
      )
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "CHART_UNSUPPORTED_AI_METHOD" })
    });
    expect(aiGeneration.generate).not.toHaveBeenCalled();
  });
});

function createService(
  input: {
    readonly clientStore?: ClientStore;
    readonly commandStore?: ChartCalculationCommandStore;
    readonly jobStore?: ChartCalculationJobStore;
    readonly calculationStore?: CalculationStore;
    readonly dictionaryStore?: DictionaryStore;
    readonly profileStore?: AstrologerProfileStore;
    readonly aiGeneration?: AiGenerationService;
    readonly locale?: "ru" | "en";
  } = {}
): ChartsService {
  return new ChartsService(
    input.clientStore ?? createClientStore(),
    input.commandStore ?? createCommandStore(),
    input.jobStore ?? createJobStore(),
    input.calculationStore ?? createCalculationStore(null),
    input.dictionaryStore ?? createDictionaryStore(),
    input.profileStore ?? createProfileStore(input.locale ?? "ru"),
    { now: () => now } as SystemClock,
    input.aiGeneration ?? createAiGenerationService()
  );
}

function createCalculationStore(record: CalculationRecord | null): CalculationStore {
  return {
    listByOwner: vi.fn(async () => ({ calculations: record ? [record] : [], total: record ? 1 : 0 })),
    findByOwnerAndId: vi.fn(async (input) => {
      if (!record) return null;
      return record.ownerUserId === input.ownerUserId && record.id === input.calculationId
        ? record
        : null;
    }),
    findExact: vi.fn(async () => null),
    create: vi.fn(async () => raise()),
    replaceResult: vi.fn(async () => ({ status: "not_found" as const })),
    ensureClientLinks: vi.fn(async () => null),
    linkClient: vi.fn(async () => null),
    publishClientLink: vi.fn(async () => null),
    saveInterpretation: vi.fn(async (input) => {
      if (!record || input.expectedResultChecksum !== record.resultChecksum) return null;
      return {
        ...record,
        interpretations: [
          {
            id: input.interpretationIdGenerator(),
            source: input.source,
            status: "draft" as const,
            text: input.text,
            modelId: input.modelId,
            promptVersion: input.promptVersion,
            approvedAt: null,
            updatedAt: input.now
          }
        ],
        updatedAt: input.now
      };
    }),
    approveInterpretation: vi.fn(async () => null),
    archive: vi.fn(async () => null)
  };
}

function createDictionaryStore(): DictionaryStore {
  return {
    listCategories: vi.fn(async () => ({ categories: [], total: 0 })),
    listEntries: vi.fn(async () => ({ entries: [], total: 0, counts: sourceCounts() })),
    listEntriesByCodes: vi.fn(async (query) => ({
      entries: query.codes.slice(0, 4).map((code: string) => ({
        id: `entry-${code}`,
        categoryId: "category-chart",
        categoryCode: code.startsWith("house_") ? "house_meanings" : "planets_in_signs",
        code,
        locale: query.locale,
        source: "platform" as const,
        title: code,
        content: `Grounding for ${code}`,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      })),
      total: query.codes.length,
      counts: sourceCounts()
    })),
    createCustomEntry: vi.fn(async () => raise()),
    updateCustomEntry: vi.fn(async () => raise()),
    upsertPlatformEntryOverride: vi.fn(async () => raise()),
    deleteAstrologerEntry: vi.fn(async () => raise()),
    resetAstrologerEntries: vi.fn(async () => raise()),
    resetPlatformEntryOverride: vi.fn(async () => raise())
  };
}

function sourceCounts() {
  return { sources: { all: 0, platform: 0, modified: 0, custom: 0 } };
}

function createProfileStore(locale: "ru" | "en"): AstrologerProfileStore {
  return {
    findByOwnerUserId: vi.fn(async () => ({
      ownerUserId,
      publicHandle: "qa",
      publicName: "QA",
      headline: null,
      bio: null,
      timezone: "Europe/Moscow",
      locale,
      avatarMediaId: null,
      coverMediaId: null,
      consultationLanguages: [locale],
      visibilityStatus: "draft" as const,
      professionalExperienceYears: null,
      professionalSchool: null,
      specializations: [],
      methods: [],
      socialLinks: { telegram: null, instagram: null, whatsapp: null, website: null },
      ownBirthData: { date: null, time: null, place: null, showOnPublicPage: false },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    })),
    upsert: vi.fn(async () => raise())
  };
}

function createAiGenerationService(): AiGenerationService {
  return {
    generate: vi.fn(async () => ({
      provider: "openai" as const,
      model: "gpt-test",
      finishReason: "stop" as const,
      output: {
        overview: "Overview.",
        coreThemes: "Core themes.",
        strengths: "Strengths.",
        growthEdges: "Growth edges.",
        sessionFocus: "Session focus.",
        reflectionQuestions: ["Question one?", "Question two?", "Question three?"]
      }
    }))
  } as unknown as AiGenerationService;
}

function createCommandStore(
  input: {
    readonly outcome?: Awaited<
      ReturnType<ChartCalculationCommandStore["createOrReuseChartJobAndRequestCalculation"]>
    >;
  } = {}
): ChartCalculationCommandStore {
  return {
    createOrReuseChartJobAndRequestCalculation: vi.fn(
      async () => input.outcome ?? ({ kind: "active_job", jobId } as const)
    ),
    createOrReuseNatalJobAndRequestCalculation: vi.fn(
      async () => ({ kind: "active_job", jobId }) as const
    )
  };
}

function createJobStore(
  input: {
    readonly job?: Awaited<ReturnType<ChartCalculationJobStore["getOwnerScopedJob"]>>;
    readonly result?: Awaited<ReturnType<ChartCalculationJobStore["getOwnerScopedResult"]>>;
  } = {}
): ChartCalculationJobStore {
  return {
    createOrReuseChartJob: vi.fn(async () => ({ kind: "active_job", jobId }) as const),
    createOrReuseNatalJob: vi.fn(async () => ({ kind: "active_job", jobId }) as const),
    getOwnerScopedJob: vi.fn(async () => input.job ?? null),
    getOwnerScopedResult: vi.fn(async () => input.result ?? null)
  };
}

function createClientStore(
  input: {
    readonly birthData?: ClientBirthData | null;
    readonly clients?: Record<string, ClientBirthData | null>;
  } = {}
): ClientStore {
  return {
    createJoinIntent: vi.fn(async () => raise()),
    findJoinIntentByTokenHash: vi.fn(async () => null),
    markJoinIntentClaimed: vi.fn(async () => null),
    ensureRelationship: vi.fn(async () => raise()),
    upsertClientProfile: vi.fn(async () => undefined),
    upsertClientBirthData: vi.fn(async () => raise()),
    listClientBirthDataProfiles: vi.fn(async () => []),
    createClientBirthDataProfile: vi.fn(async () => raise()),
    updateClientBirthDataProfile: vi.fn(async () => raise()),
    listAstrologerClients: vi.fn(async () => ({ clients: [], total: 0 })),
    getAstrologerClient: vi.fn(async ({ clientUserId }) => {
      const birthData = input.clients
        ? (input.clients[clientUserId] ?? null)
        : input.birthData === undefined
          ? readyBirthData({ clientUserId })
          : input.birthData;
      return {
        clientUserId,
        displayName: clientUserId === partnerClientId ? "Партнер" : "Мария Иванова",
        relationshipStatus: "active" as const,
        firstLinkedAt: now.toISOString(),
        lastLinkedAt: now.toISOString(),
        birthData
      };
    })
  };
}

function readyBirthData(input: Partial<ClientBirthData> = {}): ClientBirthData {
  return {
    id: input.id ?? "55555555-5555-4555-8555-555555555555",
    clientUserId: input.clientUserId ?? clientId,
    label: input.label ?? null,
    birthDate: input.birthDate ?? "1990-07-15",
    birthTime: input.birthTime ?? "10:30",
    birthTimePrecision: "exact",
    birthPlaceText: input.birthPlaceText ?? null,
    birthCountryCode: input.birthCountryCode ?? null,
    birthCity: input.birthCity ?? null,
    birthRegion: input.birthRegion ?? null,
    birthTimezone: input.birthTimezone ?? "Europe/Rome",
    birthTimeDstOccurrence: input.birthTimeDstOccurrence ?? null,
    birthLatitude: input.birthLatitude ?? 41.9028,
    birthLongitude: input.birthLongitude ?? 12.4964,
    source: input.source ?? "manual",
    isPrimary: input.isPrimary ?? true,
    createdAt: input.createdAt ?? now.toISOString(),
    updatedAt: input.updatedAt ?? now.toISOString()
  };
}

function settings() {
  return {
    houseSystem: "placidus",
    nodeType: "true",
    aspectPreset: "major",
    orbMultiplier: 1
  };
}

function horaryQuestion() {
  return {
    question: "Стоит ли принимать предложение?",
    category: "career",
    date: "2026-07-23",
    time: "14:30",
    timezone: "Europe/Moscow",
    latitude: 55.7558,
    longitude: 37.6173
  };
}

function chartCalculationRecord(
  input: Partial<Pick<CalculationRecord, "methodCode" | "resultData">> = {}
): CalculationRecord {
  const resultData = input.resultData ?? natalChartResult();
  return {
    id: "99999999-9999-4999-8999-999999999999",
    ownerUserId,
    module: "chart",
    mode: "individual",
    methodCode: input.methodCode ?? "natal",
    title: "QA Natal",
    status: "calculated",
    participants: [
      {
        role: "subject",
        source: "crm_client",
        clientId,
        displayName: "QA Missing Birth Data"
      }
    ],
    links: [],
    interpretations: [],
    artifacts: [],
    requestFingerprint: `sha256:${"e".repeat(64)}`,
    inputData: { method: "natal" },
    resultData,
    resultSummary: { method: "natal" },
    resultChecksum: `sha256:${"d".repeat(64)}`,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function natalChartResult() {
  return {
    schemaVersion: "chart-result.v1",
    method: "natal",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: { zodiac: "tropical" as const, ...settings() },
    inputSnapshot: {
      birthDate: "1991-07-10",
      birthTime: "13:10",
      timezone: "Europe/Saratov",
      latitude: 51.499947,
      longitude: 44.484581,
      birthTimePrecision: "exact" as const
    },
    result: {
      points: completePoints(),
      houses: completeHouses(),
      aspects: [
        {
          pointA: "sun",
          pointB: "moon",
          type: "trine",
          angle: 120,
          orb: 1.2,
          applying: true,
          strength: 0.9
        }
      ],
      distributions: {
        elements: { fire: 2, earth: 2, air: 4, water: 6 },
        modalities: { cardinal: 4, fixed: 5, mutable: 5 },
        polarity: { masculine: 6, feminine: 8 }
      },
      warnings: []
    }
  };
}

function solarReturnResult() {
  const inputSnapshot = {
    birthDate: "1990-07-15",
    birthTime: "10:30",
    timezone: "Europe/Rome",
    latitude: 41.9028,
    longitude: 12.4964,
    birthTimePrecision: "exact" as const
  };
  const chart = {
    points: completePoints(),
    houses: completeHouses(),
    aspects: [],
    distributions: {
      elements: { fire: 0, earth: 0, air: 0, water: 0 },
      modalities: { cardinal: 0, fixed: 0, mutable: 0 },
      polarity: { masculine: 0, feminine: 0 }
    },
    warnings: []
  };
  return {
    schemaVersion: "chart-result.v1",
    method: "solar_return",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: { zodiac: "tropical" as const, ...settings() },
    inputSnapshot,
    solarReturnSnapshot: {
      year: 2026,
      returnType: "solar" as const,
      location: {
        timezone: "Europe/Rome",
        latitude: 41.9028,
        longitude: 12.4964
      },
      resolvedAt: "2026-07-15T01:20:01.000Z"
    },
    result: {
      natal: chart,
      solarReturn: chart,
      aspectsToNatal: [],
      warnings: []
    }
  };
}

function astrocartographyResult() {
  const inputSnapshot = {
    birthDate: "1990-07-15",
    birthTime: "10:30",
    timezone: "Europe/Rome",
    latitude: 41.9028,
    longitude: 12.4964,
    birthTimePrecision: "exact" as const
  };
  return {
    schemaVersion: "chart-result.v1",
    method: "astrocartography",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: { zodiac: "tropical" as const, ...settings() },
    inputSnapshot,
    result: {
      lines: completeAstrocartographyLines(),
      warnings: []
    }
  };
}

function completeAstrocartographyLines() {
  const points = [
    "sun",
    "moon",
    "mercury",
    "venus",
    "mars",
    "jupiter",
    "saturn",
    "uranus",
    "neptune",
    "pluto"
  ];
  const angles = ["mc", "ic", "asc", "dsc"];
  return points.flatMap((point, pointIndex) =>
    angles.map((angle, angleIndex) => ({
      id: `${point}_${angle}`,
      point,
      angle,
      label: `${point} ${angle}`,
      path: [
        { latitude: -66, longitude: -80 + pointIndex * 8 + angleIndex },
        { latitude: 0, longitude: -80 + pointIndex * 8 + angleIndex },
        { latitude: 66, longitude: -80 + pointIndex * 8 + angleIndex }
      ]
    }))
  );
}

function completePoints() {
  return [
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
  }));
}

function completeHouses() {
  return Array.from({ length: 12 }, (_, index) => ({
    number: index + 1,
    longitude: index * 30,
    sign: "aries",
    signDegree: 0
  }));
}

function request(): AstrologerSessionRequest {
  return {
    currentAstrologerAccount: { account: { id: ownerUserId } }
  } as AstrologerSessionRequest;
}

function raise(): never {
  throw new Error("Unexpected dependency call");
}

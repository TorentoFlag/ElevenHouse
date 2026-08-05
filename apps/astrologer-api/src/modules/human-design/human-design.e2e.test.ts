import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { hashSessionToken } from "@elevenhouse/auth";
import {
  humanDesignCalculationResponseSchema,
  humanDesignPreviewResponseSchema,
  humanDesignTransitResponseSchema
} from "@elevenhouse/contracts";
import type {
  AuthSessionAuthenticationStore,
  AuthSessionRevocationUnitOfWork,
  CalculationRecord,
  CalculationStore,
  AstrologerProfileStore,
  ClientBirthData,
  ClientStore,
  PasswordlessAuthUnitOfWork,
  PasswordlessCustomerAccountRegistrationSessionUnitOfWork
} from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SystemClock } from "../clock/system-clock.service";
import { AiGenerationService } from "../ai/ai-generation.service";
import { createAiUsageRecorderStub } from "../ai/testing/ai-usage-recorder.stub";
import { AI_USAGE_RECORDER } from "../ai/ai.tokens";
import { ASTROLOGER_PROFILE_STORE } from "../astrologer-profile/astrologer-profile.tokens";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import {
  AUTH_SESSION_AUTHENTICATION_STORE,
  AUTH_SESSION_REVOCATION_UNIT_OF_WORK
} from "../identity/auth/identity-auth.tokens";
import { IdentityModule } from "../identity/identity.module";
import { ASTROLOGER_AUTH_CODE_GENERATOR } from "../identity/passwordless/identity-passwordless.handler";
import {
  PASSWORDLESS_AUTH_UNIT_OF_WORK,
  PASSWORDLESS_RATE_LIMITER
} from "../identity/passwordless/identity-passwordless.tokens";
import { CLIENT_STORE } from "../clients/clients.tokens";
import { CALCULATION_STORE } from "../calculations/calculations.tokens";
import { ASTROLOGER_REGISTRATION_SESSION_UNIT_OF_WORK } from "../identity/registration/identity-registration.tokens";
import { createIdentityConfigServiceStub } from "../identity/testing/identity-config-service.stub";
import { TestPasswordlessRateLimiter } from "../identity/testing/test-passwordless-rate-limiter";
import { PLATFORM_TARIFF_ENTITLEMENT_STORE } from "../platform-entitlements/platform-entitlements.tokens";
import { createActivePlatformTariffEntitlementStore } from "../platform-entitlements/testing/active-platform-tariff-entitlement-store";
import { RedisRuntimeService } from "../redis/redis-runtime.service";
import { AstrologerCsrfTokenService } from "../security/csrf/astrologer-csrf-token.service";
import { HumanDesignModule } from "./human-design.module";
import { HUMAN_DESIGN_RESOLVED_INPUT_PROVIDER } from "./human-design.tokens";

const now = new Date("2026-07-22T10:00:00.000Z");
const sessionCookieName = "elevenhouse_astrologer_session";
const csrfCookieName = "elevenhouse_astrologer_csrf";
const csrfHeaderName = "x-csrf-token";
const sessionToken = "human-design-session-token";
const ownerUserId = "8e14390f-3db1-4d1c-9344-55679c778427";
const clientUserId = "df3192f4-3d67-4b70-8c1a-6a14bd9a51af";
const partnerClientId = "4cbe9eea-6722-4a7f-8cc8-b403c04d1a8a";
let currentCsrfToken = "";
const passwordlessRateLimits = {
  requestCodeIdentifier: { limit: 5, windowSeconds: 3600 },
  requestCodeIp: { limit: 30, windowSeconds: 3600 },
  requestCodeIdentifierIp: { limit: 3, windowSeconds: 900 },
  verifyChallenge: { limit: 5, windowSeconds: 900 },
  verifyIp: { limit: 60, windowSeconds: 900 }
};

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

describe("Human Design HTTP routes", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let baseUrl: string;
  let calculationStore: CalculationStore;
  let clientStore: ClientStore;
  let resolvedInputProvider: {
    resolve: ReturnType<typeof vi.fn>;
    resolveTransit: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    calculationStore = createCalculationStore();
    clientStore = createClientStore();
    resolvedInputProvider = {
      resolve: vi.fn(async () => ({
        personality: longitudes,
        design: { ...longitudes, sun: 242 }
      })),
      resolveTransit: vi.fn(async () => longitudes)
    };
    moduleRef = await Test.createTestingModule({
      imports: [IdentityModule, HumanDesignModule]
    })
      .overrideProvider(PostgresRuntimeService)
      .useValue({ database: {} })
      .overrideProvider(ConfigService)
      .useValue(
        createIdentityConfigServiceStub({
          sessionCookieName,
          csrfCookieName,
          csrfHeaderName,
          passwordlessRateLimits
        })
      )
      .overrideProvider(PASSWORDLESS_AUTH_UNIT_OF_WORK)
      .useValue({ transact: async () => raise() } satisfies PasswordlessAuthUnitOfWork)
      .overrideProvider(AUTH_SESSION_AUTHENTICATION_STORE)
      .useValue(createAuthStore())
      .overrideProvider(AUTH_SESSION_REVOCATION_UNIT_OF_WORK)
      .useValue({ transact: async () => raise() } satisfies AuthSessionRevocationUnitOfWork)
      .overrideProvider(ASTROLOGER_REGISTRATION_SESSION_UNIT_OF_WORK)
      .useValue({
        transact: async () => raise()
      } satisfies PasswordlessCustomerAccountRegistrationSessionUnitOfWork)
      .overrideProvider(PASSWORDLESS_RATE_LIMITER)
      .useValue(new TestPasswordlessRateLimiter(passwordlessRateLimits, () => now))
      .overrideProvider(RedisRuntimeService)
      .useValue({ eval: vi.fn(async () => 0), quit: vi.fn(async () => undefined) })
      .overrideProvider(ASTROLOGER_AUTH_CODE_GENERATOR)
      .useValue({ generateCode: vi.fn(() => "123456") })
      .overrideProvider(SystemClock)
      .useValue({ now: vi.fn(() => now) })
      .overrideProvider(CALCULATION_STORE)
      .useValue(calculationStore)
      .overrideProvider(CLIENT_STORE)
      .useValue(clientStore)
      .overrideProvider(ASTROLOGER_PROFILE_STORE)
      .useValue(createProfileStore())
      .overrideProvider(AiGenerationService)
      .useValue(createAiGenerationService())
      .overrideProvider(AI_USAGE_RECORDER)
      .useValue(createAiUsageRecorderStub())
      .overrideProvider(HUMAN_DESIGN_RESOLVED_INPUT_PROVIDER)
      .useValue(resolvedInputProvider)
      .overrideProvider(PLATFORM_TARIFF_ENTITLEMENT_STORE)
      .useValue(createActivePlatformTariffEntitlementStore({ ownerUserId, features: ["ai", "hd"] }))
      .compile();

    currentCsrfToken = moduleRef.get(AstrologerCsrfTokenService).setCsrfCookie({
      response: { cookie: vi.fn() },
      sessionToken,
      sessionExpiresAt: "2026-07-29T10:00:00.000Z",
      now
    });
    app = moduleRef.createNestApplication();
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterEach(async () => {
    await app?.close();
    await moduleRef?.close();
  });

  it("keeps preview authenticated, read-only and CSRF-exempt", async () => {
    const unauthenticated = await postJson("/human-design/preview", previewBody());
    const authenticated = await postJson("/human-design/preview", previewBody(), {
      cookie: `${sessionCookieName}=${sessionToken}`
    });

    expect(unauthenticated.status).toBe(401);
    expect(authenticated.status).toBe(200);
    expect(humanDesignPreviewResponseSchema.parse(authenticated.body).result).toMatchObject({
      type: "manifesting_generator",
      authority: "sacral",
      profile: { code: "1/3" }
    });
  });

  it("previews from owner-scoped CRM birth data", async () => {
    const response = await postJson(
      "/human-design/preview",
      {
        mode: "individual",
        methodCode: "human_design_classic",
        source: "client",
        clientId: clientUserId
      },
      {
        cookie: `${sessionCookieName}=${sessionToken}`
      }
    );

    expect(response.status).toBe(200);
    expect(clientStore.getAstrologerClient).toHaveBeenCalledWith({
      astrologerUserId: ownerUserId,
      clientUserId
    });
    expect(resolvedInputProvider.resolve).toHaveBeenCalledWith({
      inputSnapshot: expect.objectContaining({
        birthDate: "1990-07-15",
        birthTime: "10:30",
        timezone: "Europe/Rome"
      })
    });
    expect(humanDesignPreviewResponseSchema.parse(response.body).result).toMatchObject({
      type: "manifesting_generator",
      authority: "sacral"
    });
  });

  it("previews compatibility from two owner-scoped CRM clients without CSRF writes", async () => {
    const response = await postJson(
      "/human-design/preview",
      {
        mode: "compatibility",
        methodCode: "human_design_classic",
        source: "client_pair",
        subjectClientId: clientUserId,
        partnerClientId
      },
      {
        cookie: `${sessionCookieName}=${sessionToken}`
      }
    );

    expect(response.status).toBe(200);
    expect(clientStore.getAstrologerClient).toHaveBeenCalledWith({
      astrologerUserId: ownerUserId,
      clientUserId
    });
    expect(clientStore.getAstrologerClient).toHaveBeenCalledWith({
      astrologerUserId: ownerUserId,
      clientUserId: partnerClientId
    });
    const result = humanDesignPreviewResponseSchema.parse(response.body).result;
    expect(result).toMatchObject({
      schemaVersion: "human-design-compatibility-result.v1",
      mode: "compatibility",
      dynamicCounts: expect.objectContaining({
        electromagnetic: expect.any(Number),
        companionship: expect.any(Number),
        dominance: expect.any(Number),
        compromise: expect.any(Number)
      })
    });
    expect(calculationStore.create).not.toHaveBeenCalled();
  });

  it("creates a linked CRM-backed calculation only with CSRF", async () => {
    const withoutCsrf = await postJson("/human-design/calculations", persistBody(), {
      cookie: `${sessionCookieName}=${sessionToken}`
    });
    const withCsrf = await postJson("/human-design/calculations", persistBody(), csrfHeaders());

    expect(withoutCsrf.status).toBe(403);
    expect(withCsrf.status).toBe(201);
    const body = humanDesignCalculationResponseSchema.parse(withCsrf.body);
    expect(body.calculation).toMatchObject({
      ownerUserId,
      module: "human_design",
      mode: "individual",
      methodCode: "human_design_classic",
      status: "linked",
      links: [
        {
          clientId: clientUserId,
          visibility: "private_to_astrologer",
          linkedAt: now.toISOString(),
          publishedAt: null
        }
      ]
    });
    expect(calculationStore.create).toHaveBeenCalledOnce();
  });

  it("creates a linked CRM-backed compatibility calculation only with CSRF", async () => {
    const withoutCsrf = await postJson("/human-design/calculations", persistPairBody(), {
      cookie: `${sessionCookieName}=${sessionToken}`
    });
    const withCsrf = await postJson("/human-design/calculations", persistPairBody(), csrfHeaders());

    expect(withoutCsrf.status).toBe(403);
    expect(withCsrf.status).toBe(201);
    const body = humanDesignCalculationResponseSchema.parse(withCsrf.body);
    expect(body.result.mode).toBe("compatibility");
    expect(body.calculation).toMatchObject({
      ownerUserId,
      module: "human_design",
      mode: "compatibility",
      methodCode: "human_design_classic",
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
  });

  it("recalculates a saved Human Design calculation with CSRF", async () => {
    const created = await postJson("/human-design/calculations", persistBody(), csrfHeaders());
    const createdBody = humanDesignCalculationResponseSchema.parse(created.body);
    resolvedInputProvider.resolve.mockResolvedValueOnce({
      personality: { ...longitudes, sun: 12 },
      design: { ...longitudes, sun: 222 }
    });

    const response = await postJson(
      `/human-design/calculations/${createdBody.calculation.id}/recalculate`,
      {},
      csrfHeaders()
    );

    expect(response.status).toBe(200);
    const body = humanDesignCalculationResponseSchema.parse(response.body);
    expect(body.calculation.id).toBe(createdBody.calculation.id);
    expect(body.calculation.resultChecksum).not.toBe(createdBody.calculation.resultChecksum);
    expect(calculationStore.replaceResult).toHaveBeenCalledOnce();
  });

  it("returns a read-only transit overlay for a saved individual calculation", async () => {
    const unauthenticated = await getJson(
      `/human-design/calculations/11111111-1111-4111-8111-111111111111/transits?instant=2026-07-23T09%3A30%3A00.000Z`
    );
    const created = await postJson("/human-design/calculations", persistBody(), csrfHeaders());
    const createdBody = humanDesignCalculationResponseSchema.parse(created.body);
    vi.mocked(calculationStore.create).mockClear();

    const response = await getJson(
      `/human-design/calculations/${createdBody.calculation.id}/transits?instant=2026-07-23T09%3A30%3A00.000Z`,
      {
        cookie: `${sessionCookieName}=${sessionToken}`
      }
    );

    expect(unauthenticated.status).toBe(401);
    expect(response.status).toBe(200);
    const body = humanDesignTransitResponseSchema.parse(response.body);
    expect(body.result).toMatchObject({
      schemaVersion: "human-design-transit-result.v1",
      mode: "transit",
      transitSnapshot: {
        instant: "2026-07-23T09:30:00.000Z",
        date: "2026-07-23",
        time: "11:30",
        timezone: "Europe/Rome",
        latitude: 41.9,
        longitude: 12.49
      }
    });
    expect(resolvedInputProvider.resolveTransit).toHaveBeenCalledWith({
      transitSnapshot: body.result.transitSnapshot
    });
    expect(calculationStore.create).not.toHaveBeenCalled();
    expect(calculationStore.replaceResult).not.toHaveBeenCalled();
  });

  it("creates an AI draft for a saved Human Design calculation only with CSRF", async () => {
    const created = await postJson("/human-design/calculations", persistBody(), csrfHeaders());
    const createdBody = humanDesignCalculationResponseSchema.parse(created.body);
    const withoutCsrf = await postJson(
      `/human-design/calculations/${createdBody.calculation.id}/ai-draft`,
      { expectedResultChecksum: createdBody.calculation.resultChecksum },
      {
        cookie: `${sessionCookieName}=${sessionToken}`
      }
    );

    const response = await postJson(
      `/human-design/calculations/${createdBody.calculation.id}/ai-draft`,
      { expectedResultChecksum: createdBody.calculation.resultChecksum },
      csrfHeaders()
    );

    expect(withoutCsrf.status).toBe(403);
    expect(response.status).toBe(200);
    const body = humanDesignCalculationResponseSchema.parse(response.body);
    expect(body.calculation.interpretations).toEqual([
      expect.objectContaining({
        status: "draft",
        text: expect.stringContaining("ОБЗОР")
      })
    ]);
  });

  async function postJson(
    path: string,
    body: unknown,
    headers: Record<string, string> = {}
  ): Promise<{ status: number; body: unknown }> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  }

  async function getJson(
    path: string,
    headers: Record<string, string> = {}
  ): Promise<{ status: number; body: unknown }> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "GET",
      headers
    });
    return { status: response.status, body: await response.json() };
  }
});

function persistBody() {
  return {
    mode: "individual",
    methodCode: "human_design_classic",
    source: "client",
    clientId: clientUserId
  };
}

function persistPairBody() {
  return {
    mode: "compatibility",
    methodCode: "human_design_classic",
    source: "client_pair",
    subjectClientId: clientUserId,
    partnerClientId
  };
}

function csrfHeaders() {
  return {
    cookie: `${sessionCookieName}=${sessionToken}; ${csrfCookieName}=${currentCsrfToken}`,
    origin: "http://localhost:3000",
    [csrfHeaderName]: currentCsrfToken
  };
}

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

function createAuthStore(): AuthSessionAuthenticationStore {
  const tokenHash = hashSessionToken(sessionToken);
  return {
    findByTokenHash: vi.fn(async (candidateTokenHash: string) =>
      candidateTokenHash === tokenHash
        ? {
            session: {
              id: "33333333-3333-4333-8333-333333333333",
              userId: ownerUserId,
              tokenHash,
              status: "active" as const,
              createdAt: now.toISOString(),
              expiresAt: "2026-07-29T10:00:00.000Z"
            },
            user: {
              id: ownerUserId,
              status: "active" as const,
              createdAt: now.toISOString(),
              updatedAt: now.toISOString()
            },
            roleAssignments: [
              {
                id: "44444444-4444-4444-8444-444444444444",
                userId: ownerUserId,
                role: "astrologer" as const,
                assignedAt: now.toISOString()
              }
            ]
          }
        : null
    )
  };
}

function createClientStore(): ClientStore {
  return {
    createJoinIntent: vi.fn(async () => raise()),
    findJoinIntentByTokenHash: vi.fn(async () => null),
    markJoinIntentClaimed: vi.fn(async () => null),
    ensureRelationship: vi.fn(async () => raise()),
    upsertClientProfile: vi.fn(async () => undefined),
    writeClientBirthProfile: vi.fn(async () => raise()),
    listAstrologerClients: vi.fn(async () => ({ clients: [], total: 0 })),
    getAstrologerClient: vi.fn(async (input) => ({
      clientUserId: input.clientUserId,
      displayName: input.clientUserId === partnerClientId ? "Partner" : "Client",
      relationshipStatus: "active" as const,
      firstLinkedAt: now.toISOString(),
      lastLinkedAt: now.toISOString(),
      birthData: readyBirthData()
    }))
  };
}

function createCalculationStore(): CalculationStore {
  const records: CalculationRecord[] = [];
  return {
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

function readyBirthData(): ClientBirthData {
  return {
    id: "55555555-5555-4555-8555-555555555555",
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
    revision: 1,
    lastEditedByUserId: ownerUserId,
    lastEditedByRole: "astrologer",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function raise(): never {
  throw new Error("Unexpected test dependency call");
}

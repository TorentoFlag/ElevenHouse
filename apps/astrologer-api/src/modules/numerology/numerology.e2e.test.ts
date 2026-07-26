import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { hashSessionToken } from "@elevenhouse/auth";
import {
  calculationPdfJobResponseSchema,
  numerologyCalculationResponseSchema,
  numerologyPreviewResponseSchema
} from "@elevenhouse/contracts";
import type {
  AstrologerProfileStore,
  AuthSessionAuthenticationStore,
  AuthSessionRevocationUnitOfWork,
  CalculationPdfJobStore,
  CalculationRecord,
  CalculationStore,
  ClientStore,
  PasswordlessAuthUnitOfWork,
  PasswordlessCustomerAccountRegistrationSessionUnitOfWork
} from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ASTROLOGER_PROFILE_STORE } from "../astrologer-profile/astrologer-profile.tokens";
import { SystemClock } from "../clock/system-clock.service";
import { CALCULATION_STORE } from "../calculations/calculations.tokens";
import { CalculationsModule } from "../calculations/calculations.module";
import { CALCULATION_PDF_JOB_STORE } from "../calculations/pdf/calculation-pdf.tokens";
import { CLIENT_STORE } from "../clients/clients.tokens";
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
import { ASTROLOGER_REGISTRATION_SESSION_UNIT_OF_WORK } from "../identity/registration/identity-registration.tokens";
import { createIdentityConfigServiceStub } from "../identity/testing/identity-config-service.stub";
import { TestPasswordlessRateLimiter } from "../identity/testing/test-passwordless-rate-limiter";
import { RedisRuntimeService } from "../redis/redis-runtime.service";
import { AstrologerCsrfTokenService } from "../security/csrf/astrologer-csrf-token.service";
import { AiGenerationService } from "../ai/ai-generation.service";
import { NumerologyModule } from "./numerology.module";

const now = new Date("2026-07-06T00:00:00.000Z");
const sessionCookieName = "elevenhouse_astrologer_session";
const csrfCookieName = "elevenhouse_astrologer_csrf";
const csrfHeaderName = "x-csrf-token";
const sessionToken = "raw-session-token";
const ownerUserId = "8e14390f-3db1-4d1c-9344-55679c778427";
const clientUserId = "3ab63db1-4f78-4d59-9b75-c21fc3ec9f6e";
let currentCsrfToken = "";

const defaultPasswordlessRateLimits = {
  requestCodeIdentifier: { limit: 5, windowSeconds: 3600 },
  requestCodeIp: { limit: 30, windowSeconds: 3600 },
  requestCodeIdentifierIp: { limit: 3, windowSeconds: 3600 },
  verifyChallenge: { limit: 5, windowSeconds: 900 },
  verifyIp: { limit: 60, windowSeconds: 900 }
};

describe("numerology HTTP routes", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let baseUrl: string;
  let calculationStore: CalculationStore;
  let calculationPdfJobStore: CalculationPdfJobStore;

  beforeEach(async () => {
    calculationStore = createCalculationStore();
    calculationPdfJobStore = createCalculationPdfJobStore();
    const passwordlessAuth: PasswordlessAuthUnitOfWork = {
      transact: async () => raise()
    };
    const authSessionRevocation: AuthSessionRevocationUnitOfWork = {
      transact: async () => raise()
    };
    const astrologerRegistration: PasswordlessCustomerAccountRegistrationSessionUnitOfWork = {
      transact: async () => raise()
    };

    moduleRef = await Test.createTestingModule({
      imports: [IdentityModule, CalculationsModule, NumerologyModule]
    })
      .overrideProvider(PostgresRuntimeService)
      .useValue({ database: {} })
      .overrideProvider(ConfigService)
      .useValue(
        createIdentityConfigServiceStub({
          sessionCookieName,
          csrfCookieName,
          csrfHeaderName,
          passwordlessRateLimits: defaultPasswordlessRateLimits
        })
      )
      .overrideProvider(PASSWORDLESS_AUTH_UNIT_OF_WORK)
      .useValue(passwordlessAuth)
      .overrideProvider(AUTH_SESSION_AUTHENTICATION_STORE)
      .useValue(createAuthStore())
      .overrideProvider(AUTH_SESSION_REVOCATION_UNIT_OF_WORK)
      .useValue(authSessionRevocation)
      .overrideProvider(ASTROLOGER_REGISTRATION_SESSION_UNIT_OF_WORK)
      .useValue(astrologerRegistration)
      .overrideProvider(PASSWORDLESS_RATE_LIMITER)
      .useValue(new TestPasswordlessRateLimiter(defaultPasswordlessRateLimits, () => now))
      .overrideProvider(RedisRuntimeService)
      .useValue({ eval: vi.fn(async () => 0), quit: vi.fn(async () => undefined) })
      .overrideProvider(ASTROLOGER_AUTH_CODE_GENERATOR)
      .useValue({ generateCode: vi.fn(() => "123456") })
      .overrideProvider(SystemClock)
      .useValue({ now: vi.fn(() => now) })
      .overrideProvider(CALCULATION_STORE)
      .useValue(calculationStore)
      .overrideProvider(CALCULATION_PDF_JOB_STORE)
      .useValue(calculationPdfJobStore)
      .overrideProvider(CLIENT_STORE)
      .useValue(createClientStore())
      .overrideProvider(ASTROLOGER_PROFILE_STORE)
      .useValue(createProfileStore())
      .overrideProvider(AiGenerationService)
      .useValue(createAiGeneration())
      .compile();

    currentCsrfToken = moduleRef.get(AstrologerCsrfTokenService).setCsrfCookie({
      response: { cookie: vi.fn() },
      sessionToken,
      sessionExpiresAt: "2026-07-13T00:00:00.000Z",
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

  it("keeps preview read-only and exempts it from CSRF while requiring authentication", async () => {
    const unauthenticated = await postJson("/numerology/preview", previewBody());
    const preview = await postJson("/numerology/preview", previewBody(), {
      cookie: sessionCookieHeader()
    });

    expect(unauthenticated.status).toBe(401);
    expect(preview.status).toBe(200);
    numerologyPreviewResponseSchema.parse(preview.body);
    expect(calculationStore.findExact).not.toHaveBeenCalled();
    expect(calculationStore.create).not.toHaveBeenCalled();
  });

  it("requires CSRF for persistence and returns structured method errors", async () => {
    const missingCsrf = await postJson("/numerology/calculations", persistBody(), {
      cookie: sessionCookieHeader()
    });
    const created = await postJson("/numerology/calculations", persistBody(), csrfHeaders());
    const unsupported = await postJson(
      "/numerology/calculations",
      { ...persistBody(), methodCode: "vedic" },
      csrfHeaders()
    );
    const manualOnly = await postJson(
      "/numerology/calculations",
      manualPersistBody(),
      csrfHeaders()
    );

    expect(missingCsrf.status).toBe(403);
    expect(created.status).toBe(201);
    numerologyCalculationResponseSchema.parse(created.body);
    expect(unsupported.status).toBe(422);
    expect(unsupported.body).toMatchObject({ code: "UNSUPPORTED_NUMEROLOGY_METHOD" });
    expect(manualOnly.status).toBe(400);
    expect(manualOnly.body).toMatchObject({ code: "NUMEROLOGY_VALIDATION_FAILED" });
  });

  it("creates a checksum-bound AI draft without exposing internal metadata", async () => {
    const created = numerologyCalculationResponseSchema.parse(
      (await postJson("/numerology/calculations", persistBody(), csrfHeaders())).body
    );
    const missingCsrf = await postJson(
      `/numerology/calculations/${created.calculation.id}/ai-draft`,
      { expectedResultChecksum: created.calculation.resultChecksum },
      { cookie: sessionCookieHeader() }
    );
    const generated = await postJson(
      `/numerology/calculations/${created.calculation.id}/ai-draft`,
      { expectedResultChecksum: created.calculation.resultChecksum },
      csrfHeaders()
    );

    expect(missingCsrf.status).toBe(403);
    expect(generated.status).toBe(201);
    const response = numerologyCalculationResponseSchema.parse(generated.body);
    expect(response.calculation.interpretations[0]).toMatchObject({
      status: "draft",
      text: expect.stringContaining("ОБЗОР")
    });
    expect(response.calculation.interpretations[0]).not.toHaveProperty("source");
    expect(response.calculation.interpretations[0]).not.toHaveProperty("modelId");
    expect(response.calculation.interpretations[0]).not.toHaveProperty("promptVersion");
  });

  it("serves locale-scoped PDF lifecycle routes for individual and compatibility calculations", async () => {
    const unauthenticated = await getJson(
      "/numerology/calculations/00000000-0000-4000-8000-000000000001/report/pdf?locale=ru"
    );
    const individual = numerologyCalculationResponseSchema.parse(
      (await postJson("/numerology/calculations", persistBody(), csrfHeaders())).body
    ).calculation;
    const pdfPath = `/numerology/calculations/${individual.id}/report/pdf`;
    const invalidQuery = await getJson(pdfPath, { cookie: sessionCookieHeader() });
    const missingCsrf = await postJson(
      pdfPath,
      { expectedResultChecksum: individual.resultChecksum, locale: "ru" },
      { cookie: sessionCookieHeader() }
    );
    const invalidLocale = await postJson(
      pdfPath,
      { expectedResultChecksum: individual.resultChecksum, locale: "de" },
      csrfHeaders()
    );
    const enqueued = await postJson(
      pdfPath,
      { expectedResultChecksum: individual.resultChecksum, locale: "ru" },
      csrfHeaders()
    );
    const parsedEnqueued = calculationPdfJobResponseSchema.parse(enqueued.body);
    const latest = await getJson(`${pdfPath}?locale=ru`, {
      cookie: sessionCookieHeader()
    });

    const compatibility = numerologyCalculationResponseSchema.parse(
      (await postJson("/numerology/calculations", compatibilityPersistBody(), csrfHeaders())).body
    ).calculation;
    const compatibilityEnqueued = await postJson(
      `/numerology/calculations/${compatibility.id}/report/pdf`,
      { expectedResultChecksum: compatibility.resultChecksum, locale: "en" },
      csrfHeaders()
    );

    expect(unauthenticated.status).toBe(401);
    expect(invalidQuery.status).toBe(400);
    expect(missingCsrf.status).toBe(403);
    expect(invalidLocale.status).toBe(400);
    expect(enqueued.status).toBe(202);
    expect(parsedEnqueued.job).toMatchObject({ status: "queued", locale: "ru" });
    expect(latest.status).toBe(200);
    expect(calculationPdfJobResponseSchema.parse(latest.body).job?.id).toBe(parsedEnqueued.job?.id);
    expect(compatibilityEnqueued.status).toBe(202);
    expect(calculationPdfJobResponseSchema.parse(compatibilityEnqueued.body).job).toMatchObject({
      calculationId: compatibility.id,
      locale: "en",
      status: "queued"
    });
  });

  it("rejects stale PDF requests and downloads against the current checksum", async () => {
    const calculation = numerologyCalculationResponseSchema.parse(
      (await postJson("/numerology/calculations", persistBody(), csrfHeaders())).body
    ).calculation;
    const pdfPath = `/numerology/calculations/${calculation.id}/report/pdf`;
    const staleRequest = await postJson(
      pdfPath,
      { expectedResultChecksum: `sha256:${"f".repeat(64)}`, locale: "ru" },
      csrfHeaders()
    );
    const enqueued = calculationPdfJobResponseSchema.parse(
      (
        await postJson(
          pdfPath,
          { expectedResultChecksum: calculation.resultChecksum, locale: "ru" },
          csrfHeaders()
        )
      ).body
    );
    const current = await calculationStore.findByOwnerAndId({
      ownerUserId,
      calculationId: calculation.id
    });
    if (!current || !enqueued.job) throw new Error("Expected current calculation and PDF job");
    const changedCalculation = {
      ...current,
      resultChecksum: `sha256:${"e".repeat(64)}`
    };
    vi.mocked(calculationStore.findByOwnerAndId)
      .mockResolvedValueOnce(changedCalculation)
      .mockResolvedValueOnce(changedCalculation);
    const staleDownload = await getJson(`${pdfPath}/${enqueued.job.id}/download`, {
      cookie: sessionCookieHeader()
    });

    expect(staleRequest.status).toBe(409);
    expect(staleRequest.body).toMatchObject({ code: "CALCULATION_RESULT_CHANGED" });
    expect(staleDownload.status).toBe(409);
    expect(staleDownload.body).toMatchObject({ code: "CALCULATION_RESULT_CHANGED" });
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
    const response = await fetch(`${baseUrl}${path}`, { headers });
    return { status: response.status, body: await response.json() };
  }
});

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
    create: vi.fn(async (input: Parameters<CalculationStore["create"]>[0]) => {
      const record: CalculationRecord = {
        id: input.idGenerator(),
        ownerUserId: input.ownerUserId,
        module: input.module,
        mode: input.mode,
        methodCode: input.methodCode,
        title: input.title,
        status: input.linkClientIds.length > 0 ? "linked" : "calculated",
        participants: input.participants,
        requestFingerprint: input.requestFingerprint,
        inputData: input.inputData,
        resultData: input.resultData,
        resultSummary: input.resultSummary,
        resultChecksum: input.resultChecksum,
        links: input.linkClientIds.map((clientId) => ({
          clientId,
          visibility: "private_to_astrologer" as const,
          linkedAt: input.now,
          publishedAt: null
        })),
        interpretations: [],
        artifacts: [],
        createdAt: input.now,
        updatedAt: input.now
      };
      records.push(record);
      return record;
    }),
    replaceResult: vi.fn(async () => ({ status: "not_found" as const })),
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
        (record) => record.ownerUserId === input.ownerUserId && record.id === input.calculationId
      );
      const current = records[index];
      if (
        index < 0 ||
        !current ||
        current.status === "archived" ||
        current.resultChecksum !== input.expectedResultChecksum
      ) {
        return null;
      }
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

function createCalculationPdfJobStore(): CalculationPdfJobStore {
  const jobs = new Map<
    string,
    NonNullable<Awaited<ReturnType<CalculationPdfJobStore["findById"]>>>
  >();
  return {
    findLatestByCalculation: vi.fn(
      async (input) =>
        [...jobs.values()]
          .filter(
            (job) =>
              job.ownerUserId === input.ownerUserId &&
              job.calculationId === input.calculationId &&
              job.locale === input.locale
          )
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null
    ),
    findById: vi.fn(async (input) => {
      const job = jobs.get(input.jobId);
      if (!job) return null;
      return job.ownerUserId === input.ownerUserId && job.calculationId === input.calculationId
        ? job
        : null;
    }),
    findByJobId: vi.fn(async (input) => jobs.get(input.jobId) ?? null),
    enqueue: vi.fn(async (input) => {
      const job = {
        id: input.id,
        calculationId: input.calculationId,
        ownerUserId: input.ownerUserId,
        module: input.module,
        methodCode: input.methodCode,
        resultChecksum: input.resultChecksum,
        locale: input.locale,
        sourceLocator: input.sourceLocator,
        documentFingerprint: input.documentFingerprint,
        status: "queued" as const,
        artifactId: input.artifactId,
        mediaAssetId: input.mediaAssetId,
        failureCode: null,
        failureReason: null,
        pageCount: null,
        createdAt: input.now,
        updatedAt: input.now
      };
      jobs.set(job.id, job);
      return job;
    }),
    claimForRendering: vi.fn(async () => null),
    complete: vi.fn(async () => null),
    fail: vi.fn(async () => null)
  };
}

function createClientStore(): ClientStore {
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
    getAstrologerClient: vi.fn(async (input) =>
      input.astrologerUserId === ownerUserId && input.clientUserId === clientUserId
        ? {
            clientUserId,
            displayName: "Голубев Антон",
            relationshipStatus: "active" as const,
            firstLinkedAt: now.toISOString(),
            lastLinkedAt: now.toISOString(),
            birthData: {
              id: "4ab63db1-4f78-4d59-9b75-c21fc3ec9f6e",
              clientUserId,
              label: null,
              birthDate: "2000-08-19",
              birthTime: null,
              birthTimePrecision: "unknown" as const,
              birthPlaceText: null,
              birthCountryCode: null,
              birthCity: null,
              birthRegion: null,
              birthTimezone: null,
              birthTimeDstOccurrence: null,
              birthLatitude: null,
              birthLongitude: null,
              source: "manual" as const,
              isPrimary: true,
              createdAt: now.toISOString(),
              updatedAt: now.toISOString()
            }
          }
        : null
    )
  };
}

function createProfileStore(): AstrologerProfileStore {
  return {
    findByOwnerUserId: vi.fn(async () => null),
    upsert: vi.fn(async () => raise())
  };
}

function createAiGeneration(): AiGenerationService {
  return {
    generate: vi.fn(async () => ({
      provider: "openai" as const,
      model: "internal-secret-model",
      finishReason: "stop" as const,
      output: {
        overview: "Обзор.",
        strengths: "Сильные стороны.",
        growthAreas: "Зоны роста.",
        sessionFocus: "Фокус консультации.",
        periodFocus: "Фокус периода.",
        reflectionQuestions: ["Первый вопрос?", "Второй вопрос?", "Третий вопрос?"],
        disclaimer: "Только для рефлексии."
      }
    }))
  } as unknown as AiGenerationService;
}

function createAuthStore(): AuthSessionAuthenticationStore {
  const tokenHash = hashSessionToken(sessionToken);
  return {
    findByTokenHash: vi.fn(async (candidateTokenHash: string) =>
      candidateTokenHash === tokenHash
        ? {
            session: {
              id: "8624104d-6f9b-4983-958e-9dbec6f0473c",
              userId: ownerUserId,
              tokenHash,
              status: "active" as const,
              createdAt: now.toISOString(),
              expiresAt: "2026-07-13T00:00:00.000Z"
            },
            user: {
              id: ownerUserId,
              status: "active" as const,
              createdAt: now.toISOString(),
              updatedAt: now.toISOString()
            },
            roleAssignments: [
              {
                id: "f7e4d8ea-7d14-4e54-a19a-9412307b3e8d",
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

function previewBody(): Record<string, unknown> {
  const preview = { ...manualPersistBody() };
  delete preview.title;
  return preview;
}

function persistBody(): Record<string, unknown> {
  return {
    mode: "individual",
    methodCode: "pythagorean",
    title: "Голубев Антон",
    participants: [{ role: "subject", source: "crm_client", clientId: clientUserId }],
    periodRequest: { kind: "explicit", personalYear: { year: 2026 } }
  };
}

function compatibilityPersistBody(): Record<string, unknown> {
  return {
    mode: "compatibility",
    methodCode: "pythagorean",
    title: "Голубев Антон + Кошкина Яна Владимировна",
    participants: [
      ...(persistBody().participants as Array<Record<string, unknown>>),
      {
        role: "partner",
        source: "manual",
        clientId: null,
        displayName: "Кошкина Яна Владимировна",
        calculationName: "Кошкина Яна Владимировна",
        calculationNameSource: "manual_entry",
        birthDate: "2002-03-16"
      }
    ],
    periodRequest: { kind: "explicit", personalYear: { year: 2026 } }
  };
}

function manualPersistBody(): Record<string, unknown> {
  return {
    mode: "individual",
    methodCode: "pythagorean",
    title: "Мария Иванова",
    participants: [
      {
        role: "subject",
        source: "manual",
        clientId: null,
        displayName: "Мария Иванова",
        calculationName: "Мария Иванова",
        calculationNameSource: "manual_entry",
        birthDate: "1990-03-14"
      }
    ],
    periodRequest: { kind: "explicit", personalYear: { year: 2026 } }
  };
}

function sessionCookieHeader(): string {
  return `${sessionCookieName}=${sessionToken}`;
}

function csrfHeaders(): Record<string, string> {
  return {
    cookie: `${sessionCookieHeader()}; ${csrfCookieName}=${currentCsrfToken}`,
    origin: "http://localhost:3000",
    [csrfHeaderName]: currentCsrfToken
  };
}

function raise(): never {
  throw new Error("Unexpected dependency call");
}

import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { hashSessionToken } from "@elevenhouse/auth";
import {
  calculationPdfJobResponseSchema,
  chartMethodVersions,
  chartNatalResultV2Schema
} from "@elevenhouse/contracts";
import {
  buildChartResultReproducibilityFingerprint,
  canonicalChartAiConsentNoticeHashes,
  ChartAiDraftIdempotencyKeyReuseError,
  currentChartAiConsentPolicy,
  sha256CanonicalJson,
  type CanonicalJson
} from "@elevenhouse/domain";
import type {
  AuthSessionAuthenticationStore,
  AuthSessionRevocationUnitOfWork,
  AstrologerClientListItem,
  CalculationPdfJobStore,
  CalculationRecord,
  CalculationStore,
  ChartCalculationCommandStore,
  ChartCalculationJobStore,
  ChartAiDraftCommandStore,
  ClientConsentStore,
  ClientBirthData,
  ClientStore,
  PasswordlessAuthUnitOfWork,
  PasswordlessCustomerAccountRegistrationSessionUnitOfWork
} from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiGenerationService } from "../ai/ai-generation.service";
import { ASTROLOGER_PROFILE_STORE } from "../astrologer-profile/astrologer-profile.tokens";
import { SystemClock } from "../clock/system-clock.service";
import { CALCULATION_STORE } from "../calculations/calculations.tokens";
import { CALCULATION_PDF_JOB_STORE } from "../calculations/pdf/calculation-pdf.tokens";
import { CLIENT_STORE } from "../clients/clients.tokens";
import { DICTIONARY_STORE } from "../dictionary/dictionary.tokens";
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
import {
  CHART_AI_CONFIG,
  CHART_AI_DRAFT_COMMAND_STORE,
  CHART_CLIENT_CONSENT_STORE,
  CHART_COMMAND_STORE,
  CHART_JOB_STORE
} from "./charts.tokens";
import { ChartsModule } from "./charts.module";

const now = new Date("2026-07-20T12:00:00.000Z");
const sessionCookieName = "elevenhouse_astrologer_session";
const csrfCookieName = "elevenhouse_astrologer_csrf";
const csrfHeaderName = "x-csrf-token";
const sessionToken = "chart-session-token";
const ownerUserId = "11111111-1111-4111-8111-111111111111";
const clientId = "22222222-2222-4222-8222-222222222222";
const partnerClientId = "44444444-4444-4444-8444-444444444444";
const calculationId = "77777777-7777-4777-8777-777777777777";
const checksum = sha256CanonicalJson(currentNatalResult() as unknown as CanonicalJson);
let currentCsrfToken = "";
const limits = {
  requestCodeIdentifier: { limit: 5, windowSeconds: 3600 },
  requestCodeIp: { limit: 30, windowSeconds: 3600 },
  requestCodeIdentifierIp: { limit: 3, windowSeconds: 900 },
  verifyChallenge: { limit: 5, windowSeconds: 900 },
  verifyIp: { limit: 60, windowSeconds: 900 }
};

describe("charts HTTP routes", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let baseUrl: string;
  let currentCalculation: CalculationRecord;
  let consentState: "granted" | "missing";
  let aiGenerate: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    currentCalculation = calculation();
    consentState = "missing";
    aiGenerate = vi.fn(async () => ({
      provider: "openai" as const,
      model: "gpt-test",
      finishReason: "completed" as const,
      output: {
        overview: "Overview.",
        coreThemes: "Core themes.",
        strengths: "Strengths.",
        growthEdges: "Growth edges.",
        sessionFocus: "Session focus.",
        reflectionQuestions: ["One?", "Two?", "Three?"]
      }
    }));
    moduleRef = await Test.createTestingModule({
      imports: [IdentityModule, ChartsModule]
    })
      .overrideProvider(PostgresRuntimeService)
      .useValue({ database: {} })
      .overrideProvider(ConfigService)
      .useValue(
        createIdentityConfigServiceStub({
          sessionCookieName,
          csrfCookieName,
          csrfHeaderName,
          passwordlessRateLimits: limits
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
      .useValue(new TestPasswordlessRateLimiter(limits, () => now))
      .overrideProvider(RedisRuntimeService)
      .useValue({ eval: vi.fn(async () => 0), quit: vi.fn(async () => undefined) })
      .overrideProvider(ASTROLOGER_AUTH_CODE_GENERATOR)
      .useValue({ generateCode: vi.fn(() => "123456") })
      .overrideProvider(SystemClock)
      .useValue({ now: vi.fn(() => now) })
      .overrideProvider(CALCULATION_STORE)
      .useValue(
        createCalculationStore(
          () => currentCalculation,
          (calculation) => {
            currentCalculation = calculation;
          }
        )
      )
      .overrideProvider(CALCULATION_PDF_JOB_STORE)
      .useValue(createCalculationPdfJobStore())
      .overrideProvider(CLIENT_STORE)
      .useValue(createClientStore())
      .overrideProvider(ASTROLOGER_PROFILE_STORE)
      .useValue({ findByOwnerUserId: vi.fn(async () => ({ locale: "ru" })) })
      .overrideProvider(DICTIONARY_STORE)
      .useValue({
        listEntriesByCodes: vi.fn(async () => ({ entries: [], total: 0 }))
      })
      .overrideProvider(CHART_COMMAND_STORE)
      .useValue(createCommandStore())
      .overrideProvider(CHART_JOB_STORE)
      .useValue(createJobStore())
      .overrideProvider(CHART_CLIENT_CONSENT_STORE)
      .useValue(createConsentStore(() => consentState))
      .overrideProvider(CHART_AI_CONFIG)
      .useValue({
        enabled: true,
        processingAuthorityVersion: "verified-test-authority.v1"
      })
      .overrideProvider(CHART_AI_DRAFT_COMMAND_STORE)
      .useValue(createAiDraftCommandStore(() => currentCalculation))
      .overrideProvider(AiGenerationService)
      .useValue({ generate: aiGenerate })
      .compile();

    currentCsrfToken = moduleRef.get(AstrologerCsrfTokenService).setCsrfCookie({
      response: { cookie: vi.fn() },
      sessionToken,
      sessionExpiresAt: "2026-07-27T12:00:00.000Z",
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

  it("rejects authenticated cookie chart mutations without CSRF", async () => {
    const createResponse = await postJson("/charts/natal/jobs", validBody(), {
      cookie: `${sessionCookieName}=${sessionToken}`
    });
    const transitResponse = await postJson("/charts/transits/jobs", validTransitBody(), {
      cookie: `${sessionCookieName}=${sessionToken}`
    });
    const synastryResponse = await postJson("/charts/synastry/jobs", validSynastryBody(), {
      cookie: `${sessionCookieName}=${sessionToken}`
    });
    const compositeResponse = await postJson("/charts/composite/jobs", validSynastryBody(), {
      cookie: `${sessionCookieName}=${sessionToken}`
    });
    const solarReturnResponse = await postJson(
      "/charts/solar-return/jobs",
      validSolarReturnBody(),
      {
        cookie: `${sessionCookieName}=${sessionToken}`
      }
    );
    const progressionResponse = await postJson(
      "/charts/progressions/jobs",
      validProgressionBody(),
      {
        cookie: `${sessionCookieName}=${sessionToken}`
      }
    );
    const horaryResponse = await postJson("/charts/horary/jobs", validHoraryBody(), {
      cookie: `${sessionCookieName}=${sessionToken}`
    });
    const astrocartographyResponse = await postJson("/charts/astrocartography/jobs", validBody(), {
      cookie: `${sessionCookieName}=${sessionToken}`
    });
    const pdfResponse = await postJson(
      "/charts/calculations/77777777-7777-4777-8777-777777777777/report/pdf",
      { expectedResultChecksum: `sha256:${"a".repeat(64)}`, locale: "ru" },
      { cookie: `${sessionCookieName}=${sessionToken}` }
    );

    expect(createResponse.status).toBe(403);
    expect(transitResponse.status).toBe(403);
    expect(synastryResponse.status).toBe(403);
    expect(compositeResponse.status).toBe(403);
    expect(solarReturnResponse.status).toBe(403);
    expect(progressionResponse.status).toBe(403);
    expect(horaryResponse.status).toBe(403);
    expect(astrocartographyResponse.status).toBe(403);
    expect(pdfResponse.status).toBe(403);
  });

  it("requires explicit adult or child interpretation authority for new natal jobs", async () => {
    const missing = await postJson("/charts/natal/jobs", validBody(), csrfHeaders());
    const adult = await postJson(
      "/charts/natal/jobs",
      { ...validBody(), interpretationMode: "adult_natal" },
      csrfHeaders()
    );
    const child = await postJson(
      "/charts/natal/jobs",
      { ...validBody(), interpretationMode: "child" },
      csrfHeaders()
    );

    expect(missing).toMatchObject({
      status: 400,
      body: { code: "CHART_VALIDATION_FAILED" }
    });
    expect(adult).toMatchObject({ status: 201, body: { status: "calculating" } });
    expect(child).toMatchObject({ status: 201, body: { status: "calculating" } });
  });

  it("returns persisted natal authority regardless of a conflicting URL mode", async () => {
    const adult = await getJson(`/charts/calculations/${calculationId}?mode=child_chart`, {
      cookie: sessionCookieHeader()
    });
    currentCalculation = { ...currentCalculation, interpretationMode: "child" };
    const child = await getJson(`/charts/calculations/${calculationId}?mode=natal`, {
      cookie: sessionCookieHeader()
    });

    expect(adult).toMatchObject({
      status: 200,
      body: {
        calculationId,
        interpretationMode: "adult_natal",
        capabilities: ["view_current", "recalculate", "link", "publish", "ai_draft", "pdf"]
      }
    });
    expect(child).toMatchObject({
      status: 200,
      body: {
        calculationId,
        interpretationMode: "child",
        capabilities: ["view_current", "recalculate", "link"]
      }
    });
  });

  it("fails chart AI closed over HTTP before provider work when consent is missing", async () => {
    const response = await postJson(
      `/charts/calculations/${calculationId}/ai-draft`,
      { expectedResultChecksum: checksum },
      aiDraftHeaders("chart-ai:test-missing-consent")
    );

    expect(response).toMatchObject({
      status: 403,
      body: { code: "CHART_AI_CONSENT_REQUIRED" }
    });
    expect(aiGenerate).not.toHaveBeenCalled();
  });

  it.each(["child", "legacy_unclassified"] as const)(
    "blocks %s natal AI and PDF over HTTP before downstream work",
    async (interpretationMode) => {
      currentCalculation = { ...currentCalculation, interpretationMode };
      consentState = "granted";

      const aiResponse = await postJson(
        `/charts/calculations/${calculationId}/ai-draft`,
        { expectedResultChecksum: checksum },
        aiDraftHeaders(`chart-ai:test-${interpretationMode}`)
      );
      const pdfResponse = await postJson(
        `/charts/calculations/${calculationId}/report/pdf`,
        { expectedResultChecksum: checksum, locale: "ru" },
        csrfHeaders()
      );

      expect(aiResponse).toMatchObject({
        status: 409,
        body: { code: "CHART_INTERPRETATION_MODE_UNAVAILABLE" }
      });
      expect(pdfResponse).toMatchObject({
        status: 409,
        body: { code: "CHART_INTERPRETATION_MODE_UNAVAILABLE" }
      });
      expect(aiGenerate).not.toHaveBeenCalled();
    }
  );

  it("generates and conditionally saves a consent-bound chart AI draft over HTTP", async () => {
    consentState = "granted";

    const response = await postJson(
      `/charts/calculations/${calculationId}/ai-draft`,
      { expectedResultChecksum: checksum },
      aiDraftHeaders("chart-ai:test-success")
    );

    expect(response).toMatchObject({
      status: 201,
      body: {
        id: calculationId,
        interpretations: [
          expect.objectContaining({ status: "draft", text: expect.stringContaining("ОБЗОР") })
        ]
      }
    });
    expect(aiGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        consentAuthorizations: [
          {
            consentRecordId: "88888888-8888-4888-8888-888888888888",
            clientUserId: clientId,
            astrologerUserId: ownerUserId
          }
        ],
        usageEvidence: {
          processingAuthorityVersion: "verified-test-authority.v1",
          resourceEvidence: {
            resourceType: "chart_calculation",
            resourceId: calculationId,
            sourceChecksum: checksum
          }
        }
      })
    );
  });

  it("requires Idempotency-Key before chart AI controller or provider work", async () => {
    consentState = "granted";

    const response = await postJson(
      `/charts/calculations/${calculationId}/ai-draft`,
      { expectedResultChecksum: checksum },
      csrfHeaders()
    );

    expect(response).toMatchObject({ status: 400 });
    expect(aiGenerate).not.toHaveBeenCalled();
  });

  it("replays one chart AI draft and rejects cross-request key reuse over HTTP", async () => {
    consentState = "granted";
    const key = "chart-ai:test-http-replay";
    const first = await postJson(
      `/charts/calculations/${calculationId}/ai-draft`,
      { expectedResultChecksum: checksum },
      aiDraftHeaders(key)
    );
    const replay = await postJson(
      `/charts/calculations/${calculationId}/ai-draft`,
      { expectedResultChecksum: checksum },
      aiDraftHeaders(key)
    );

    expect(first.status).toBe(201);
    const firstBody = first.body as { interpretations: readonly { id: string }[] };
    expect(replay).toMatchObject({
      status: 201,
      body: {
        interpretations: [expect.objectContaining({ id: firstBody.interpretations[0]?.id })]
      }
    });
    expect(aiGenerate).toHaveBeenCalledOnce();

    const otherCalculationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    currentCalculation = { ...currentCalculation, id: otherCalculationId };
    const mismatched = await postJson(
      `/charts/calculations/${otherCalculationId}/ai-draft`,
      { expectedResultChecksum: checksum },
      aiDraftHeaders(key)
    );
    expect(mismatched).toMatchObject({
      status: 409,
      body: { code: "CHART_AI_DRAFT_IDEMPOTENCY_KEY_REUSED" }
    });
    expect(aiGenerate).toHaveBeenCalledOnce();
  });

  it("returns typed 409 to a concurrent duplicate while the first provider call is live", async () => {
    consentState = "granted";
    let releaseProvider: (() => void) | undefined;
    const providerGate = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    aiGenerate.mockImplementationOnce(async () => {
      await providerGate;
      return {
        provider: "openai" as const,
        model: "gpt-test",
        finishReason: "completed" as const,
        output: {
          overview: "Overview.",
          coreThemes: "Core themes.",
          strengths: "Strengths.",
          growthEdges: "Growth edges.",
          sessionFocus: "Session focus.",
          reflectionQuestions: ["One?", "Two?", "Three?"]
        }
      };
    });
    const key = "chart-ai:test-http-concurrent";

    const firstResponse = postJson(
      `/charts/calculations/${calculationId}/ai-draft`,
      { expectedResultChecksum: checksum },
      aiDraftHeaders(key)
    );
    await vi.waitFor(() => expect(aiGenerate).toHaveBeenCalledOnce());
    const duplicate = await postJson(
      `/charts/calculations/${calculationId}/ai-draft`,
      { expectedResultChecksum: checksum },
      aiDraftHeaders(key)
    );

    expect(duplicate).toMatchObject({
      status: 409,
      body: { code: "CHART_AI_DRAFT_IN_PROGRESS" }
    });
    releaseProvider?.();
    await expect(firstResponse).resolves.toMatchObject({ status: 201 });
    expect(aiGenerate).toHaveBeenCalledOnce();
  });

  it("creates authenticated transit jobs through the CSRF-protected route", async () => {
    const response = await postJson("/charts/transits/jobs", validTransitBody(), csrfHeaders());

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      status: "calculating",
      jobId: "66666666-6666-4666-8666-666666666666"
    });
  });

  it("creates authenticated synastry jobs through the CSRF-protected route", async () => {
    const response = await postJson("/charts/synastry/jobs", validSynastryBody(), csrfHeaders());

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      status: "calculating",
      jobId: "66666666-6666-4666-8666-666666666666"
    });
  });

  it("creates authenticated composite jobs through the CSRF-protected route", async () => {
    const response = await postJson("/charts/composite/jobs", validSynastryBody(), csrfHeaders());

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      status: "calculating",
      jobId: "66666666-6666-4666-8666-666666666666"
    });
  });

  it("creates authenticated solar return jobs through the CSRF-protected route", async () => {
    const response = await postJson(
      "/charts/solar-return/jobs",
      validSolarReturnBody(),
      csrfHeaders()
    );

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      status: "calculating",
      jobId: "66666666-6666-4666-8666-666666666666"
    });
  });

  it("creates authenticated progression jobs through the CSRF-protected route", async () => {
    const response = await postJson(
      "/charts/progressions/jobs",
      validProgressionBody(),
      csrfHeaders()
    );

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      status: "calculating",
      jobId: "66666666-6666-4666-8666-666666666666"
    });
  });

  it("creates authenticated horary jobs through the CSRF-protected route", async () => {
    const response = await postJson("/charts/horary/jobs", validHoraryBody(), csrfHeaders());

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      status: "calculating",
      jobId: "66666666-6666-4666-8666-666666666666"
    });
  });

  it("creates authenticated astrocartography jobs through the CSRF-protected route", async () => {
    const response = await postJson("/charts/astrocartography/jobs", validBody(), csrfHeaders());

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      status: "calculating",
      jobId: "66666666-6666-4666-8666-666666666666"
    });
  });

  it("rejects invalid horary question snapshots", async () => {
    const response = await postJson(
      "/charts/horary/jobs",
      {
        ...validHoraryBody(),
        question: {
          ...validHoraryQuestion(),
          question: ""
        }
      },
      csrfHeaders()
    );

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: "CHART_VALIDATION_FAILED" });
  });

  it("rejects stale chart PDF requests and downloads against the current checksum", async () => {
    const pdfPath = `/charts/calculations/${calculationId}/report/pdf`;
    const staleRequest = await postJson(
      pdfPath,
      { expectedResultChecksum: `sha256:${"f".repeat(64)}`, locale: "ru" },
      csrfHeaders()
    );
    const enqueueResponse = await postJson(
      pdfPath,
      { expectedResultChecksum: checksum, locale: "ru" },
      csrfHeaders()
    );
    expect(enqueueResponse).toMatchObject({ status: 202 });
    const enqueued = calculationPdfJobResponseSchema.parse(enqueueResponse.body);
    if (!enqueued.job) throw new Error("Expected queued chart PDF job");

    const changedResult = changedNatalResult();
    const changedChecksum = sha256CanonicalJson(changedResult as unknown as CanonicalJson);
    currentCalculation = {
      ...currentCalculation,
      inputData: {
        inputSnapshot: changedResult.inputSnapshot,
        settings: changedResult.settings
      },
      resultData: changedResult,
      resultChecksum: changedChecksum
    };
    const latest = calculationPdfJobResponseSchema.parse(
      (
        await getJson(`${pdfPath}?locale=ru`, {
          cookie: sessionCookieHeader()
        })
      ).body
    );
    const staleDownload = await getJson(`${pdfPath}/${enqueued.job.id}/download`, {
      cookie: sessionCookieHeader()
    });

    expect(staleRequest.status).toBe(409);
    expect(staleRequest.body).toMatchObject({ code: "CHART_RESULT_CHANGED" });
    expect(latest).toMatchObject({
      job: null,
      currentResultChecksum: changedChecksum
    });
    expect(staleDownload.status).toBe(409);
    expect(staleDownload.body).toMatchObject({ code: "CHART_RESULT_CHANGED" });
  });

  it("rejects legacy chart PDF requests before enqueueing work", async () => {
    currentCalculation = { ...currentCalculation, resultData: legacyNatalResult() };

    const response = await postJson(
      `/charts/calculations/${calculationId}/report/pdf`,
      { expectedResultChecksum: checksum, locale: "ru" },
      csrfHeaders()
    );

    expect(response).toMatchObject({
      status: 409,
      body: { code: "CHART_RECALCULATION_REQUIRED" }
    });
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

function createCalculationStore(
  current: () => CalculationRecord,
  update: (calculation: CalculationRecord) => void
): CalculationStore {
  return {
    listByOwner: vi.fn(async () => ({ calculations: [], total: 0 })),
    findByOwnerAndId: vi.fn(async (input) =>
      input.ownerUserId === ownerUserId && input.calculationId === current().id ? current() : null
    ),
    findExact: vi.fn(async () => null),
    create: vi.fn(async () => raise()),
    saveInterpretation: vi.fn(async (input) => {
      const saved = {
        ...current(),
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
      update(saved);
      return saved;
    }),
    updateInterpretationDraft: vi.fn(async () => raise()),
    approveInterpretation: vi.fn(async () => raise()),
    publish: vi.fn(async () => raise()),
    archive: vi.fn(async () => raise())
  } as unknown as CalculationStore;
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
              expiresAt: "2026-07-27T12:00:00.000Z"
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
    upsertClientBirthData: vi.fn(async () => raise()),
    listClientBirthDataProfiles: vi.fn(async () => []),
    createClientBirthDataProfile: vi.fn(async () => raise()),
    updateClientBirthDataProfile: vi.fn(async () => raise()),
    listAstrologerClients: vi.fn(async () => ({ clients: [], total: 0 })),
    getAstrologerClient: vi.fn(
      async (): Promise<AstrologerClientListItem> => ({
        clientUserId: clientId,
        displayName: "Мария Иванова",
        relationshipStatus: "active" as const,
        firstLinkedAt: now.toISOString(),
        lastLinkedAt: now.toISOString(),
        birthData: {
          id: "55555555-5555-4555-8555-555555555555",
          clientUserId: clientId,
          label: null,
          birthDate: "1990-07-15",
          birthTime: "10:30",
          birthTimePrecision: "exact",
          birthPlaceText: null,
          birthCountryCode: null,
          birthCity: null,
          birthRegion: null,
          birthTimezone: "Europe/Rome",
          birthTimeDstOccurrence: null,
          birthLatitude: 41.9028,
          birthLongitude: 12.4964,
          source: "manual",
          isPrimary: true,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString()
        } satisfies ClientBirthData
      })
    )
  };
}

function createConsentStore(state: () => "granted" | "missing"): ClientConsentStore {
  return {
    listRelationshipConsentsForClient: vi.fn(async () => []),
    grantConsentAtomically: vi.fn(async () => ({ status: "relationship_not_found" as const })),
    revokeConsentAtomically: vi.fn(async () => ({ status: "not_found" as const })),
    findChartAiConsentEvidence: vi.fn(async ({ astrologerUserId, clientUserIds }) =>
      clientUserIds.map((clientUserId: string) => ({
        relationship: {
          id: "99999999-9999-4999-8999-999999999999",
          clientUserId,
          astrologerUserId,
          status: "active" as const
        },
        consent:
          state() === "granted"
            ? {
                id: "88888888-8888-4888-8888-888888888888",
                relationshipId: "99999999-9999-4999-8999-999999999999",
                clientUserId,
                astrologerUserId,
                purpose: currentChartAiConsentPolicy.purpose,
                policyVersion: currentChartAiConsentPolicy.policyVersion,
                processorCode: currentChartAiConsentPolicy.processorCode,
                noticeLocale: "ru" as const,
                noticeSha256: canonicalChartAiConsentNoticeHashes.ru,
                grantedAt: now.toISOString(),
                revokedAt: null
              }
            : null
      }))
    )
  };
}

function createCommandStore(): ChartCalculationCommandStore {
  return {
    createOrReuseChartJobAndRequestCalculation: vi.fn(
      async () =>
        ({
          kind: "active_job",
          jobId: "66666666-6666-4666-8666-666666666666"
        }) as const
    ),
    createOrReuseNatalJobAndRequestCalculation: vi.fn(
      async () =>
        ({
          kind: "active_job",
          jobId: "66666666-6666-4666-8666-666666666666"
        }) as const
    )
  };
}

function createAiDraftCommandStore(current: () => CalculationRecord): ChartAiDraftCommandStore {
  const commands = new Map<
    string,
    {
      readonly id: string;
      readonly requestHash: string;
      result: Awaited<ReturnType<ChartAiDraftCommandStore["completeKnownFailure"]>> | null;
    }
  >();
  let sequence = 0;
  const findById = (commandId: string) =>
    [...commands.values()].find(({ id }) => id === commandId) ?? null;
  return {
    acquire: vi.fn(async (input) => {
      const commandKey = `${input.actorUserId}:${input.key}`;
      const existing = commands.get(commandKey);
      if (existing) {
        if (existing.requestHash !== input.requestHash) {
          throw new ChartAiDraftIdempotencyKeyReuseError();
        }
        return existing.result
          ? { kind: "completed" as const, commandId: existing.id, result: existing.result }
          : {
              kind: "processing" as const,
              commandId: existing.id,
              updatedAt: input.now
            };
      }
      sequence += 1;
      const id = `bbbbbbbb-bbbb-4bbb-8bbb-${sequence.toString().padStart(12, "0")}`;
      commands.set(commandKey, { id, requestHash: input.requestHash, result: null });
      return { kind: "acquired" as const, commandId: id };
    }),
    completeSuccess: vi.fn(async (input) => {
      const command = findById(input.commandId);
      if (!command) throw new Error("Missing chart AI command");
      const hasInterpretation = current().interpretations.some(
        ({ id, source }) => id === input.commandId && source === "ai"
      );
      if (!hasInterpretation) return null;
      command.result = {
        schemaVersion: "chart-ai-draft-command-result.v1",
        kind: "success",
        calculationId: input.calculationId,
        interpretationId: input.commandId
      };
      return command.result;
    }),
    completeKnownFailure: vi.fn(async (input) => {
      const command = findById(input.commandId);
      if (!command) throw new Error("Missing chart AI command");
      const completed = {
        schemaVersion: "chart-ai-draft-command-result.v1",
        kind: "known_failure" as const,
        ...input.failure
      };
      command.result = completed;
      return completed;
    }),
    completeUnknownOutcome: vi.fn(async (input) => {
      const command = findById(input.commandId);
      if (!command) throw new Error("Missing chart AI command");
      command.result = {
        schemaVersion: "chart-ai-draft-command-result.v1",
        kind: "unknown_outcome",
        code: "CHART_AI_DRAFT_OUTCOME_UNKNOWN",
        message: "Chart AI draft provider outcome requires reconciliation"
      };
      return command.result;
    }),
    reconcileExpiredProcessing: vi.fn(async () => 0)
  };
}

function createJobStore(): ChartCalculationJobStore {
  return {
    createOrReuseChartJob: vi.fn(
      async () =>
        ({
          kind: "active_job",
          jobId: "66666666-6666-4666-8666-666666666666"
        }) as const
    ),
    createOrReuseNatalJob: vi.fn(
      async () =>
        ({
          kind: "active_job",
          jobId: "66666666-6666-4666-8666-666666666666"
        }) as const
    ),
    getOwnerScopedJob: vi.fn(async () => null),
    getOwnerScopedResult: vi.fn(async () => null)
  };
}

function calculation(): CalculationRecord {
  const result = currentNatalResult();
  return {
    id: calculationId,
    ownerUserId,
    module: "chart",
    mode: "individual",
    interpretationMode: "adult_natal",
    methodCode: "natal",
    title: "Мария Иванова",
    status: "linked",
    participants: [
      {
        role: "subject",
        source: "crm_client",
        clientId,
        displayName: "Мария Иванова"
      }
    ],
    requestFingerprint: `sha256:${"b".repeat(64)}`,
    inputData: { inputSnapshot: result.inputSnapshot, settings: result.settings },
    resultData: result,
    resultSummary: {},
    resultChecksum: checksum,
    links: [],
    interpretations: [],
    artifacts: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function changedNatalResult() {
  const current = currentNatalResult();
  const candidate = {
    ...current,
    inputSnapshot: { ...current.inputSnapshot, birthDate: "1990-07-16" }
  };
  return {
    ...candidate,
    reproducibilityFingerprint: buildChartResultReproducibilityFingerprint(candidate)
  };
}

function currentNatalResult() {
  const pointIds = [
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
    reproducibilityFingerprint: `sha256:${"c".repeat(64)}`,
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
  });
  return {
    ...candidate,
    reproducibilityFingerprint: buildChartResultReproducibilityFingerprint(candidate)
  };
}

function legacyNatalResult() {
  const current = currentNatalResult();
  return {
    schemaVersion: "chart-result.v1",
    method: "natal",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings: current.settings,
    inputSnapshot: current.inputSnapshot,
    result: current.result
  };
}

function validBody(): Record<string, unknown> {
  return {
    clientId,
    settings: {
      houseSystem: "placidus",
      nodeType: "true",
      aspectPreset: "major",
      orbMultiplier: 1
    }
  };
}

function validTransitBody(): Record<string, unknown> {
  return {
    ...validBody(),
    transit: {
      date: "2026-07-22",
      time: "14:30"
    }
  };
}

function validSynastryBody(): Record<string, unknown> {
  return {
    ...validBody(),
    partnerClientId
  };
}

function validSolarReturnBody(): Record<string, unknown> {
  return {
    ...validBody(),
    year: 2026
  };
}

function validProgressionBody(): Record<string, unknown> {
  return {
    ...validBody(),
    targetDate: "2026-07-23"
  };
}

function validHoraryBody(): Record<string, unknown> {
  return {
    ...validBody(),
    question: validHoraryQuestion()
  };
}

function validHoraryQuestion(): Record<string, unknown> {
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

function csrfHeaders(): Record<string, string> {
  return {
    cookie: sessionCookieHeader(),
    origin: "http://localhost:3000",
    [csrfHeaderName]: currentCsrfToken
  };
}

function aiDraftHeaders(idempotencyKey: string): Record<string, string> {
  return { ...csrfHeaders(), "idempotency-key": idempotencyKey };
}

function sessionCookieHeader(): string {
  return `${sessionCookieName}=${sessionToken}; ${csrfCookieName}=${currentCsrfToken}`;
}

function raise(): never {
  throw new Error("Unexpected dependency call");
}

import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { hashSessionToken } from "@elevenhouse/auth";
import { calculationPdfJobResponseSchema } from "@elevenhouse/contracts";
import type {
  AuthSessionAuthenticationStore,
  AuthSessionRevocationUnitOfWork,
  AstrologerClientListItem,
  CalculationPdfJobStore,
  CalculationRecord,
  CalculationStore,
  ChartCalculationCommandStore,
  ChartCalculationJobStore,
  ClientBirthData,
  ClientStore,
  PasswordlessAuthUnitOfWork,
  PasswordlessCustomerAccountRegistrationSessionUnitOfWork
} from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SystemClock } from "../clock/system-clock.service";
import { CALCULATION_STORE } from "../calculations/calculations.tokens";
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
import { CHART_COMMAND_STORE, CHART_JOB_STORE } from "./charts.tokens";
import { ChartsModule } from "./charts.module";

const now = new Date("2026-07-20T12:00:00.000Z");
const sessionCookieName = "elevenhouse_astrologer_session";
const csrfCookieName = "elevenhouse_astrologer_csrf";
const csrfHeaderName = "x-csrf-token";
const sessionToken = "chart-session-token";
const ownerUserId = "11111111-1111-4111-8111-111111111111";
const clientId = "22222222-2222-4222-8222-222222222222";
const calculationId = "77777777-7777-4777-8777-777777777777";
const checksum = `sha256:${"a".repeat(64)}`;
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

  beforeEach(async () => {
    currentCalculation = calculation();
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
      .useValue(createCalculationStore(() => currentCalculation))
      .overrideProvider(CALCULATION_PDF_JOB_STORE)
      .useValue(createCalculationPdfJobStore())
      .overrideProvider(CLIENT_STORE)
      .useValue(createClientStore())
      .overrideProvider(CHART_COMMAND_STORE)
      .useValue(createCommandStore())
      .overrideProvider(CHART_JOB_STORE)
      .useValue(createJobStore())
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
    const pdfResponse = await postJson(
      "/charts/calculations/77777777-7777-4777-8777-777777777777/report/pdf",
      { expectedResultChecksum: `sha256:${"a".repeat(64)}`, locale: "ru" },
      { cookie: `${sessionCookieName}=${sessionToken}` }
    );

    expect(createResponse.status).toBe(403);
    expect(pdfResponse.status).toBe(403);
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

    currentCalculation = {
      ...currentCalculation,
      resultChecksum: `sha256:${"e".repeat(64)}`
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
      currentResultChecksum: `sha256:${"e".repeat(64)}`
    });
    expect(staleDownload.status).toBe(409);
    expect(staleDownload.body).toMatchObject({ code: "CHART_RESULT_CHANGED" });
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

function createCalculationStore(current: () => CalculationRecord): CalculationStore {
  return {
    listByOwner: vi.fn(async () => ({ calculations: [], total: 0 })),
    findByOwnerAndId: vi.fn(async (input) =>
      input.ownerUserId === ownerUserId && input.calculationId === calculationId ? current() : null
    ),
    findExact: vi.fn(async () => null),
    create: vi.fn(async () => raise()),
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
    listAstrologerClients: vi.fn(async () => ({ clients: [], total: 0 })),
    getAstrologerClient: vi.fn(async (): Promise<AstrologerClientListItem> => ({
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
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      } satisfies ClientBirthData
    }))
  };
}

function createCommandStore(): ChartCalculationCommandStore {
  return {
    createOrReuseNatalJobAndRequestCalculation: vi.fn(async () => ({
      kind: "active_job",
      jobId: "66666666-6666-4666-8666-666666666666"
    } as const))
  };
}

function createJobStore(): ChartCalculationJobStore {
  return {
    createOrReuseNatalJob: vi.fn(async () => ({
      kind: "active_job",
      jobId: "66666666-6666-4666-8666-666666666666"
    } as const)),
    getOwnerScopedJob: vi.fn(async () => null),
    getOwnerScopedResult: vi.fn(async () => null)
  };
}

function calculation(): CalculationRecord {
  return {
    id: calculationId,
    ownerUserId,
    module: "chart",
    mode: "individual",
    methodCode: "natal",
    title: "Мария Иванова",
    status: "linked",
    participants: [],
    requestFingerprint: `sha256:${"b".repeat(64)}`,
    inputData: {},
    resultData: {},
    resultSummary: {},
    resultChecksum: checksum,
    links: [],
    interpretations: [],
    artifacts: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
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

function csrfHeaders(): Record<string, string> {
  return {
    cookie: sessionCookieHeader(),
    origin: "http://localhost:3000",
    [csrfHeaderName]: currentCsrfToken
  };
}

function sessionCookieHeader(): string {
  return `${sessionCookieName}=${sessionToken}; ${csrfCookieName}=${currentCsrfToken}`;
}

function raise(): never {
  throw new Error("Unexpected dependency call");
}

import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { hashSessionToken } from "@elevenhouse/auth";
import {
  calculationRecordResponseSchema,
  listCalculationsResponseSchema,
  numerologyCalculationResponseSchema
} from "@elevenhouse/contracts";
import type {
  AuthSessionAuthenticationStore,
  AuthSessionRevocationUnitOfWork,
  CalculationRecord,
  CalculationStore,
  PasswordlessAuthUnitOfWork,
  PasswordlessCustomerAccountRegistrationSessionUnitOfWork
} from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SystemClock } from "../clock/system-clock.service";
import { CALCULATION_STORE } from "../calculations/calculations.tokens";
import { CalculationsModule } from "../calculations/calculations.module";
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
import { NumerologyModule } from "./numerology.module";

const now = new Date("2026-07-06T00:00:00.000Z");
const sessionCookieName = "elevenhouse_astrologer_session";
const csrfCookieName = "elevenhouse_astrologer_csrf";
const csrfHeaderName = "x-csrf-token";
const sessionToken = "raw-session-token";
const ownerUserId = "8e14390f-3db1-4d1c-9344-55679c778427";
const otherOwnerUserId = "ca79ab01-e369-4b8f-a6a2-bcc0c2f99114";
const clientId = "3ab63db1-4f78-4d59-9b75-c21fc3ec9f6e";
const partnerClientId = "cf616b16-40a5-48bf-a82f-d180b13f0976";
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

  beforeEach(async () => {
    calculationStore = createCalculationStore();
    const passwordlessAuth: PasswordlessAuthUnitOfWork = {
      transact: async () => raise("Unexpected passwordless auth unit of work call")
    };
    const authSessionRevocation: AuthSessionRevocationUnitOfWork = {
      transact: async () => raise("Unexpected auth session revocation unit of work call")
    };
    const astrologerRegistration: PasswordlessCustomerAccountRegistrationSessionUnitOfWork = {
      transact: async () => raise("Unexpected astrologer registration unit of work call")
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
      .useValue({
        eval: vi.fn(async () => 0),
        quit: vi.fn(async () => undefined)
      })
      .overrideProvider(ASTROLOGER_AUTH_CODE_GENERATOR)
      .useValue({
        generateCode: vi.fn(() => "123456")
      })
      .overrideProvider(SystemClock)
      .useValue({
        now: vi.fn(() => now)
      })
      .overrideProvider(CALCULATION_STORE)
      .useValue(calculationStore)
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

  it("creates, recalculates, lists, links and publishes numerology calculations", async () => {
    const unauthenticatedResponse = await fetch(`${baseUrl}/calculations`);
    const missingCsrfResponse = await postJson("/numerology/calculations", manualIndividualBody(), {
      cookie: sessionCookieHeader()
    });
    const manualCreateResponse = await postJson(
      "/numerology/calculations",
      manualIndividualBody(),
      csrfHeaders()
    );
    const manualCalculationId = String(manualCreateResponse.body.calculation.id);
    const manualLinkResponse = await postJson(
      `/calculations/${manualCalculationId}/link-client`,
      { clientId },
      csrfHeaders()
    );

    const crmCreateResponse = await postJson(
      "/numerology/calculations",
      crmCompatibilityBody(),
      csrfHeaders()
    );
    const crmCalculationId = String(crmCreateResponse.body.calculation.id);
    const currentVersionId = String(crmCreateResponse.body.currentVersion.id);
    const linkResponse = await postJson(
      `/calculations/${crmCalculationId}/link-client`,
      { clientId },
      csrfHeaders()
    );
    const saveInterpretationResponse = await postJson(
      `/calculations/${crmCalculationId}/interpretations`,
      { versionId: currentVersionId, text: "Проверенная трактовка совместимости." },
      csrfHeaders()
    );
    const interpretationId = String(
      saveInterpretationResponse.body.interpretations.at(-1)?.id
    );
    const approveResponse = await postJson(
      `/calculations/${crmCalculationId}/interpretations/${interpretationId}/approve`,
      {},
      csrfHeaders()
    );
    const publishResponse = await postJson(
      `/calculations/${crmCalculationId}/publish`,
      { clientId },
      csrfHeaders()
    );
    const recalculateResponse = await postJson(
      `/numerology/calculations/${crmCalculationId}/recalculate`,
      {
        ...crmCompatibilityBody(),
        settings: {
          ...pythagoreanSettings(),
          forecastDate: "2026-01-01"
        }
      },
      csrfHeaders()
    );
    await calculationStore.create({
      ownerUserId: otherOwnerUserId,
      module: "numerology",
      mode: "individual",
      methodCode: "pythagorean",
      methodVersion: "1.0.0",
      title: "Other owner",
      participants: [
        {
          role: "subject",
          source: "manual",
          clientId: null,
          displayName: "Other",
          birthDate: "1990-01-01",
          inputSnapshot: {},
          manuallyOverridden: false
        }
      ],
      settingsSnapshot: {},
      inputSnapshot: {},
      resultSnapshot: { methodCode: "pythagorean" },
      resultSummary: {},
      resultChecksum: "other",
      idGenerator: () => "fc676401-ef9f-45d2-93af-3836a14f76ba",
      versionIdGenerator: () => "b4473b5e-2920-432c-9483-511ea5bebd8e",
      now: now.toISOString()
    });
    const listResponse = await getJson("/calculations?module=numerology&status=all");
    const unsupportedMethodResponse = await postJson(
      "/numerology/calculations",
      { ...manualIndividualBody(), methodCode: "vedic" },
      csrfHeaders()
    );
    const aiDraftResponse = await postJson(
      `/numerology/calculations/${crmCalculationId}/ai-draft`,
      { versionId: String(recalculateResponse.body.currentVersion.id) },
      csrfHeaders()
    );

    expect(unauthenticatedResponse.status).toBe(401);
    expect(missingCsrfResponse.status).toBe(403);
    expect(manualCreateResponse.status).toBe(201);
    numerologyCalculationResponseSchema.parse(manualCreateResponse.body);
    expect(manualCreateResponse.body.resultSnapshot).toMatchObject({
      methodCode: "pythagorean",
      keyNumbers: { lifePath: 9 }
    });
    expect(manualLinkResponse.status).toBe(400);
    expect(crmCreateResponse.status).toBe(201);
    numerologyCalculationResponseSchema.parse(crmCreateResponse.body);
    expect(crmCreateResponse.body.resultSnapshot).toMatchObject({
      methodCode: "pythagorean",
      pairNumber: expect.any(Number)
    });
    expect(linkResponse.status).toBe(201);
    expect(linkResponse.body).toMatchObject({ id: crmCalculationId, status: "linked" });
    expect(saveInterpretationResponse.status).toBe(201);
    expect(saveInterpretationResponse.body.interpretations.at(-1)).toMatchObject({
      status: "draft",
      source: "manual"
    });
    expect(approveResponse.status).toBe(201);
    expect(approveResponse.body.interpretations.at(-1)).toMatchObject({ status: "approved" });
    expect(publishResponse.status).toBe(201);
    calculationRecordResponseSchema.parse(publishResponse.body);
    expect(publishResponse.body).toMatchObject({ id: crmCalculationId, status: "published" });
    expect(recalculateResponse.status).toBe(201);
    expect(recalculateResponse.body.calculation).toMatchObject({
      id: crmCalculationId,
      status: "linked"
    });
    expect(recalculateResponse.body.calculation.versions).toHaveLength(2);
    expect(recalculateResponse.body.calculation.links[0]).toMatchObject({
      visibility: "private_to_astrologer",
      publishedAt: null
    });
    expect(listResponse.status).toBe(200);
    const parsedList = listCalculationsResponseSchema.parse(listResponse.body);
    expect(parsedList.total).toBe(2);
    expect(parsedList.calculations.map((calculation) => calculation.id)).not.toContain(
      "fc676401-ef9f-45d2-93af-3836a14f76ba"
    );
    expect(unsupportedMethodResponse.status).toBe(400);
    expect(aiDraftResponse.status).toBe(501);
  });

  async function getJson(path: string): Promise<HttpJsonResponse> {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        cookie: sessionCookieHeader()
      }
    });

    return readJsonResponse(response);
  }

  async function postJson(
    path: string,
    body: unknown,
    headers: Record<string, string> = {}
  ): Promise<HttpJsonResponse> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...headers
      },
      body: JSON.stringify(body)
    });

    return readJsonResponse(response);
  }
});

type HttpJsonResponse = {
  readonly status: number;
  readonly body: Record<string, any>;
};

async function readJsonResponse(response: Response): Promise<HttpJsonResponse> {
  return {
    status: response.status,
    body: (await response.json()) as Record<string, any>
  };
}

function sessionCookieHeader(): string {
  return `${sessionCookieName}=${sessionToken}`;
}

function authenticatedCookieHeader(): string {
  return `${sessionCookieHeader()}; ${csrfCookieName}=${currentCsrfToken}`;
}

function csrfHeaders(): Record<string, string> {
  return {
    cookie: authenticatedCookieHeader(),
    origin: "http://localhost:3000",
    [csrfHeaderName]: currentCsrfToken
  };
}

function createAuthStore(): AuthSessionAuthenticationStore {
  const tokenHash = hashSessionToken(sessionToken);

  return {
    findByTokenHash: vi.fn(async (candidateTokenHash: string) => {
      if (candidateTokenHash !== tokenHash) {
        return null;
      }

      return {
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
      };
    })
  };
}

function createCalculationStore(): CalculationStore {
  const records: CalculationRecord[] = [];

  return {
    listByOwner: vi.fn(async (query) => {
      const owned = records.filter((record) => record.ownerUserId === query.ownerUserId);
      const filtered = owned.filter(
        (record) =>
          (query.module === "all" || record.module === query.module) &&
          (query.status === "all" || record.status === query.status)
      );
      const ordered = [...filtered].sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id)
      );

      return {
        calculations: ordered.slice(query.offset, query.offset + query.limit),
        total: filtered.length
      };
    }),
    findByOwnerAndId: vi.fn(
      async (input) =>
        records.find(
          (record) =>
            record.ownerUserId === input.ownerUserId && record.id === input.calculationId
        ) ?? null
    ),
    create: vi.fn(async (input) => {
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
      records.unshift(record);
      return record;
    }),
    appendVersion: vi.fn(async (input) => {
      const index = findRecordIndex(records, input.ownerUserId, input.calculationId);
      if (index === -1) return null;
      const current = records[index] ?? raise("Expected calculation record");
      const next: CalculationRecord = {
        ...current,
        currentMethodVersion: input.methodVersion,
        status: current.links.length > 0 ? "linked" : "calculated",
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
        links: current.links.map((link) => ({
          ...link,
          visibility: "private_to_astrologer",
          publishedAt: null
        })),
        updatedAt: input.now
      };
      records[index] = next;
      return next;
    }),
    linkClient: vi.fn(async (input) => {
      const index = findRecordIndex(records, input.ownerUserId, input.calculationId);
      if (index === -1) return null;
      const current = records[index] ?? raise("Expected calculation record");
      if (current.links.some((link) => link.clientId === input.clientId)) {
        return current;
      }
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
      records[index] = next;
      return next;
    }),
    publishClientLink: vi.fn(async (input) => {
      const index = findRecordIndex(records, input.ownerUserId, input.calculationId);
      if (index === -1) return null;
      const current = records[index] ?? raise("Expected calculation record");
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
      records[index] = next;
      return next;
    }),
    saveInterpretation: vi.fn(async (input) => {
      const index = findRecordIndex(records, input.ownerUserId, input.calculationId);
      if (index === -1) return null;
      const current = records[index] ?? raise("Expected calculation record");
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
      records[index] = next;
      return next;
    }),
    approveInterpretation: vi.fn(async (input) => {
      const index = findRecordIndex(records, input.ownerUserId, input.calculationId);
      if (index === -1) return null;
      const current = records[index] ?? raise("Expected calculation record");
      const next: CalculationRecord = {
        ...current,
        interpretations: current.interpretations.map((interpretation) =>
          interpretation.id === input.interpretationId
            ? { ...interpretation, status: "approved", approvedAt: input.now }
            : interpretation
        ),
        updatedAt: input.now
      };
      records[index] = next;
      return next;
    }),
    archive: vi.fn(async (input) => {
      const index = findRecordIndex(records, input.ownerUserId, input.calculationId);
      if (index === -1) return null;
      const current = records[index] ?? raise("Expected calculation record");
      const next: CalculationRecord = { ...current, status: "archived", updatedAt: input.now };
      records[index] = next;
      return next;
    })
  };
}

function findRecordIndex(
  records: readonly CalculationRecord[],
  ownerUserId: string,
  calculationId: string
): number {
  return records.findIndex(
    (record) => record.ownerUserId === ownerUserId && record.id === calculationId
  );
}

function manualIndividualBody(): Record<string, unknown> {
  return {
    mode: "individual",
    methodCode: "pythagorean",
    title: "Мария, психоматрица",
    participants: [
      {
        role: "subject",
        source: "manual",
        clientId: null,
        fullName: "Мария Иванова",
        birthDate: "1990-03-14"
      }
    ],
    settings: pythagoreanSettings()
  };
}

function crmCompatibilityBody(): Record<string, unknown> {
  return {
    mode: "compatibility",
    methodCode: "pythagorean",
    title: "Мария и Алексей",
    participants: [
      {
        role: "subject",
        source: "crm_client",
        clientId,
        displayName: "Мария",
        fullName: "Мария Иванова",
        birthDate: "1990-03-14"
      },
      {
        role: "partner",
        source: "crm_client",
        clientId: partnerClientId,
        displayName: "Алексей",
        fullName: "Алексей Петров",
        birthDate: "1988-11-02"
      }
    ],
    settings: pythagoreanSettings()
  };
}

function pythagoreanSettings(): Record<string, unknown> {
  return {
    masterNumbers: { mode: "preserve_selected", values: [11, 22] },
    nameNormalization: { yoPolicy: "separate", shortIPolicy: "as_i" },
    includeNameNumbers: true,
    includePsychomatrix: true,
    includeStrengthLines: true
  };
}

function raise(message: string): never {
  throw new Error(message);
}

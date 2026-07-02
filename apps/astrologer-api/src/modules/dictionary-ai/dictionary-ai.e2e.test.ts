import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { hashSessionToken } from "@elevenhouse/auth";
import { createDictionaryAiDraftResponseSchema } from "@elevenhouse/contracts";
import type {
  AuthSessionAuthenticationStore,
  AuthSessionRevocationUnitOfWork,
  DictionaryStore,
  PasswordlessAuthUnitOfWork,
  PasswordlessCustomerAccountRegistrationSessionUnitOfWork
} from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiGenerationService } from "../ai/ai-generation.service";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { DICTIONARY_STORE } from "../dictionary/dictionary.tokens";
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
import { DictionaryAiModule } from "./dictionary-ai.module";

const now = new Date("2026-07-02T10:00:00.000Z");
const sessionCookieName = "elevenhouse_astrologer_session";
const csrfCookieName = "elevenhouse_astrologer_csrf";
const csrfHeaderName = "x-csrf-token";
const sessionToken = "raw-session-token";
const ownerUserId = "8e14390f-3db1-4d1c-9344-55679c778427";
const categoryId = "27f4dd55-1da2-4e58-90a1-ce10c2566b36";
let currentCsrfToken = "";
let currentAuthRoles: readonly ("client" | "astrologer")[] = ["astrologer"];
const defaultPasswordlessRateLimits = {
  requestCodeIdentifier: { limit: 5, windowSeconds: 3600 },
  requestCodeIp: { limit: 30, windowSeconds: 3600 },
  requestCodeIdentifierIp: { limit: 3, windowSeconds: 3600 },
  verifyChallenge: { limit: 5, windowSeconds: 900 },
  verifyIp: { limit: 60, windowSeconds: 900 }
};

describe("dictionary AI HTTP routes", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let baseUrl: string;
  let dictionaryStore: DictionaryStore;
  let aiGeneration: AiGenerationService;

  beforeEach(async () => {
    currentAuthRoles = ["astrologer"];
    dictionaryStore = createDictionaryStore();
    aiGeneration = createAiGeneration();
    const authStore = createAuthStore();
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
      imports: [IdentityModule, DictionaryAiModule]
    })
      .overrideProvider(PostgresRuntimeService)
      .useValue({ database: {} })
      .overrideProvider(ConfigService)
      .useValue(createConfigServiceStub())
      .overrideProvider(PASSWORDLESS_AUTH_UNIT_OF_WORK)
      .useValue(passwordlessAuth)
      .overrideProvider(AUTH_SESSION_AUTHENTICATION_STORE)
      .useValue(authStore)
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
      .overrideProvider(DICTIONARY_STORE)
      .useValue(dictionaryStore)
      .overrideProvider(AiGenerationService)
      .useValue(aiGeneration)
      .compile();

    currentCsrfToken = moduleRef.get(AstrologerCsrfTokenService).setCsrfCookie({
      response: { cookie: vi.fn() },
      sessionToken,
      sessionExpiresAt: "2026-07-07T10:00:00.000Z",
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

  it("requires authentication and CSRF for dictionary AI draft generation", async () => {
    const unauthenticatedResponse = await postJson("/dictionary/ai-draft", {
      categoryId,
      locale: "ru",
      title: "Солнце в Овне"
    });
    const missingCsrfResponse = await postJson(
      "/dictionary/ai-draft",
      {
        categoryId,
        locale: "ru",
        title: "Солнце в Овне"
      },
      { cookie: sessionCookieHeader() }
    );
    const createResponse = await postJson(
      "/dictionary/ai-draft",
      {
        categoryId,
        locale: "ru",
        title: "Солнце в Овне"
      },
      csrfHeaders()
    );

    expect(unauthenticatedResponse.status).toBe(401);
    expect(missingCsrfResponse.status).toBe(403);
    expect(createResponse.status).toBe(201);
    createDictionaryAiDraftResponseSchema.parse(createResponse.body);
    expect(createResponse.body).toMatchObject({
      content: "Generated content",
      provider: "openai",
      model: "gpt-5.4-mini",
      promptId: "dictionary.entryDraft",
      promptVersion: 1,
      finishReason: "completed"
    });
  });

  it("rejects invalid dictionary AI draft bodies before AI generation", async () => {
    const response = await postJson(
      "/dictionary/ai-draft",
      {
        categoryId,
        locale: "de",
        title: "Солнце в Овне"
      },
      csrfHeaders()
    );

    expect(response.status).toBe(400);
    expect(aiGeneration.generate).not.toHaveBeenCalled();
  });

  it("rejects authenticated client-only sessions before dictionary or AI calls", async () => {
    currentAuthRoles = ["client"];

    const response = await postJson(
      "/dictionary/ai-draft",
      {
        categoryId,
        locale: "ru",
        title: "Солнце в Овне"
      },
      csrfHeaders()
    );

    expect(response.status).toBe(401);
    expect(dictionaryStore.listCategories).not.toHaveBeenCalled();
    expect(aiGeneration.generate).not.toHaveBeenCalled();
  });

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
  readonly body: Record<string, unknown>;
};

async function readJsonResponse(response: Response): Promise<HttpJsonResponse> {
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>
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
          createdAt: "2026-07-02T09:00:00.000Z",
          expiresAt: "2026-07-07T10:00:00.000Z"
        },
        user: {
          id: ownerUserId,
          status: "active" as const,
          createdAt: "2026-07-02T09:00:00.000Z",
          updatedAt: "2026-07-02T09:00:00.000Z"
        },
        roleAssignments: currentAuthRoles.map((role) => ({
          id: "f7e4d8ea-7d14-4e54-a19a-9412307b3e8d",
          userId: ownerUserId,
          role,
          assignedAt: "2026-07-02T09:00:00.000Z"
        }))
      };
    })
  };
}

function createConfigServiceStub(): Pick<ConfigService, "getOrThrow"> {
  const identityConfigService = createIdentityConfigServiceStub({
    sessionCookieName,
    csrfCookieName,
    csrfHeaderName,
    passwordlessRateLimits: defaultPasswordlessRateLimits
  });

  return {
    getOrThrow: (key: string) => {
      if (key === "astrologerApi.ai") {
        return {
          enabled: true,
          rateLimitRedisKeyPrefix: "test:ai:",
          rateLimits: {
            userPerMinute: { limit: 3, windowSeconds: 60 },
            userPerHour: { limit: 30, windowSeconds: 3600 },
            userPerDay: { limit: 150, windowSeconds: 86400 }
          }
        };
      }

      return identityConfigService.getOrThrow(key);
    }
  };
}

function createDictionaryStore(): DictionaryStore {
  return {
    listCategories: vi.fn(async () => ({
      categories: [
        {
          id: categoryId,
          code: "planets_in_signs",
          name: "Планеты в знаках",
          order: 10,
          count: 4,
          createdAt: "2026-07-02T09:00:00.000Z",
          updatedAt: "2026-07-02T09:00:00.000Z"
        }
      ],
      total: 1
    })),
    listEntries: vi.fn(async () => ({
      entries: [],
      total: 0,
      counts: {
        sources: {
          all: 0,
          platform: 0,
          modified: 0,
          custom: 0
        }
      }
    })),
    createCustomEntry: vi.fn(async () => raise("Unexpected create custom entry call")),
    updateCustomEntry: vi.fn(async () => raise("Unexpected update custom entry call")),
    upsertPlatformEntryOverride: vi.fn(async () => raise("Unexpected override call")),
    deleteAstrologerEntry: vi.fn(async () => raise("Unexpected delete call")),
    resetAstrologerEntries: vi.fn(async () => raise("Unexpected reset astrologer entries call")),
    resetPlatformEntryOverride: vi.fn(async () => raise("Unexpected reset override call"))
  };
}

function createAiGeneration(): AiGenerationService {
  return {
    generate: vi.fn(async () => ({
      output: { content: "Generated content" },
      provider: "openai",
      model: "gpt-5.4-mini",
      finishReason: "completed",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 }
    }))
  } as unknown as AiGenerationService;
}

function raise(message: string): never {
  throw new Error(message);
}

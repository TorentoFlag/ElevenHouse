import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { hashSessionToken } from "@elevenhouse/auth";
import {
  dictionaryAstrologerEntryResponseSchema,
  dictionaryCategoriesResponseSchema,
  dictionaryEntriesResponseSchema
} from "@elevenhouse/contracts";
import type {
  AuthSessionAuthenticationStore,
  AuthSessionRevocationUnitOfWork,
  DictionaryStore,
  PasswordlessAuthUnitOfWork,
  PasswordlessCustomerAccountRegistrationSessionUnitOfWork
} from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { RedisRuntimeService } from "../redis/redis-runtime.service";
import { AstrologerCsrfTokenService } from "../security/csrf/astrologer-csrf-token.service";
import { SystemClock } from "../clock/system-clock.service";
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
import { DictionaryModule } from "./dictionary.module";
import { DICTIONARY_STORE } from "./dictionary.tokens";

const now = new Date("2026-06-30T10:00:00.000Z");
const sessionCookieName = "elevenhouse_astrologer_session";
const csrfCookieName = "elevenhouse_astrologer_csrf";
const csrfHeaderName = "x-csrf-token";
const sessionToken = "raw-session-token";
const ownerUserId = "8e14390f-3db1-4d1c-9344-55679c778427";
const categoryId = "27f4dd55-1da2-4e58-90a1-ce10c2566b36";
const platformEntryId = "73cb0e88-e485-4ca2-94de-8c734047f268";
const astrologerEntryId = "6fd8c491-0292-4921-8fb3-e4ca3b9cb073";
let currentCsrfToken = "";
let currentAuthRoles: readonly ("client" | "astrologer")[] = ["astrologer"];
const defaultPasswordlessRateLimits = {
  requestCodeIdentifier: { limit: 5, windowSeconds: 3600 },
  requestCodeIp: { limit: 30, windowSeconds: 3600 },
  requestCodeIdentifierIp: { limit: 3, windowSeconds: 3600 },
  verifyChallenge: { limit: 5, windowSeconds: 900 },
  verifyIp: { limit: 60, windowSeconds: 900 }
};

describe("dictionary HTTP routes", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let baseUrl: string;
  let dictionaryStore: DictionaryStore;

  beforeEach(async () => {
    currentAuthRoles = ["astrologer"];
    dictionaryStore = createDictionaryStore();
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
      imports: [IdentityModule, DictionaryModule]
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
      .overrideProvider(SystemClock)
      .useValue({
        now: vi.fn(() => now)
      })
      .overrideProvider(DICTIONARY_STORE)
      .useValue(dictionaryStore)
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

  it("serves dictionary reads for authenticated astrologers", async () => {
    const categoriesResponse = await getJson("/dictionary/categories?locale=ru");
    const entriesResponse = await getJson("/dictionary/entries?locale=ru&source=custom");

    expect(categoriesResponse.status).toBe(200);
    dictionaryCategoriesResponseSchema.parse(categoriesResponse.body);
    expect(categoriesResponse.body).toMatchObject({
      total: 4,
      categories: [expect.objectContaining({ id: categoryId, count: 4 })]
    });
    expect(entriesResponse.status).toBe(200);
    dictionaryEntriesResponseSchema.parse(entriesResponse.body);
    expect(entriesResponse.body).toMatchObject({
      total: 1,
      counts: {
        sources: {
          all: 4,
          platform: 2,
          modified: 1,
          custom: 1
        }
      }
    });
    expect(dictionaryStore.listCategories).toHaveBeenCalledWith({
      ownerUserId,
      locale: "ru"
    });
    expect(dictionaryStore.listEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId,
        locale: "ru",
        source: "custom"
      })
    );
  });

  it("requires authentication and CSRF for dictionary writes", async () => {
    const unauthenticatedResponse = await postJson("/dictionary/custom-entries", {
      categoryId,
      locale: "ru",
      title: "Custom note",
      content: "Custom content"
    });
    const missingCsrfResponse = await postJson(
      "/dictionary/custom-entries",
      {
        categoryId,
        locale: "ru",
        title: "Custom note",
        content: "Custom content"
      },
      {
        cookie: sessionCookieHeader()
      }
    );
    const createResponse = await postJson(
      "/dictionary/custom-entries",
      {
        categoryId,
        locale: "ru",
        title: "Custom note",
        content: "Custom content"
      },
      csrfHeaders()
    );
    const overrideResponse = await putJson(
      `/dictionary/platform-entries/${platformEntryId}/override`,
      {
        title: "Sun in Aries",
        content: "Override content"
      },
      csrfHeaders()
    );
    const updateCustomResponse = await putJson(
      `/dictionary/custom-entries/${astrologerEntryId}`,
      {
        categoryId,
        title: "Венера в Близнецах",
        content: "Новая авторская редакция"
      },
      csrfHeaders()
    );
    const deleteResponse = await deleteEmpty(
      `/dictionary/entries/${astrologerEntryId}`,
      csrfHeaders()
    );
    const resetResponse = await deleteEmpty(
      `/dictionary/platform-entries/${platformEntryId}/override`,
      csrfHeaders()
    );
    const resetAllResponse = await deleteEmpty("/dictionary/entries", csrfHeaders());

    expect(unauthenticatedResponse.status).toBe(401);
    expect(missingCsrfResponse.status).toBe(403);
    expect(createResponse.status).toBe(201);
    dictionaryAstrologerEntryResponseSchema.parse(createResponse.body);
    expect(createResponse.body).toMatchObject({
      ownerUserId,
      categoryId,
      locale: "ru",
      entryType: "custom"
    });
    expect(overrideResponse.status).toBe(200);
    dictionaryAstrologerEntryResponseSchema.parse(overrideResponse.body);
    expect(overrideResponse.body).toMatchObject({
      ownerUserId,
      platformEntryId,
      entryType: "override"
    });
    expect(updateCustomResponse.status).toBe(200);
    dictionaryAstrologerEntryResponseSchema.parse(updateCustomResponse.body);
    expect(dictionaryStore.updateCustomEntry).toHaveBeenCalledWith({
      ownerUserId,
      entryId: astrologerEntryId,
      categoryId,
      title: "Венера в Близнецах",
      content: "Новая авторская редакция",
      updatedAt: expect.any(String)
    });
    expect(deleteResponse.status).toBe(204);
    expect(resetResponse.status).toBe(204);
    expect(resetAllResponse.status).toBe(204);
  });

  it("rejects invalid route params before calling the dictionary store", async () => {
    const overrideResponse = await putJson(
      "/dictionary/platform-entries/not-a-uuid/override",
      {
        title: "Sun in Aries",
        content: "Override content"
      },
      csrfHeaders()
    );
    const deleteResponse = await deleteEmpty("/dictionary/entries/not-a-uuid", csrfHeaders());
    const resetResponse = await deleteEmpty(
      "/dictionary/platform-entries/not-a-uuid/override",
      csrfHeaders()
    );

    expect(overrideResponse.status).toBe(400);
    expect(deleteResponse.status).toBe(400);
    expect(resetResponse.status).toBe(400);
    expect(dictionaryStore.upsertPlatformEntryOverride).not.toHaveBeenCalled();
    expect(dictionaryStore.deleteAstrologerEntry).not.toHaveBeenCalled();
    expect(dictionaryStore.resetPlatformEntryOverride).not.toHaveBeenCalled();
    expect(dictionaryStore.resetAstrologerEntries).not.toHaveBeenCalled();
  });

  it("rejects authenticated sessions without the astrologer role", async () => {
    currentAuthRoles = ["client"];

    const response = await getJson("/dictionary/categories?locale=ru");

    expect(response.status).toBe(401);
    expect(dictionaryStore.listCategories).not.toHaveBeenCalled();
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

  async function putJson(
    path: string,
    body: unknown,
    headers: Record<string, string> = {}
  ): Promise<HttpJsonResponse> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        ...headers
      },
      body: JSON.stringify(body)
    });

    return readJsonResponse(response);
  }

  async function deleteEmpty(
    path: string,
    headers: Record<string, string>
  ): Promise<{ readonly status: number }> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "DELETE",
      headers
    });

    return { status: response.status };
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
          createdAt: "2026-06-30T09:00:00.000Z",
          expiresAt: "2026-07-07T10:00:00.000Z"
        },
        user: {
          id: ownerUserId,
          status: "active" as const,
          createdAt: "2026-06-30T09:00:00.000Z",
          updatedAt: "2026-06-30T09:00:00.000Z"
        },
        roleAssignments: currentAuthRoles.map((role) => ({
            id: "f7e4d8ea-7d14-4e54-a19a-9412307b3e8d",
            userId: ownerUserId,
            role,
            assignedAt: "2026-06-30T09:00:00.000Z"
          }))
      };
    })
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
          createdAt: "2026-06-30T09:00:00.000Z",
          updatedAt: "2026-06-30T09:00:00.000Z"
        }
      ],
      total: 4
    })),
    listEntries: vi.fn(async () => ({
      entries: [],
      total: 1,
      counts: {
        sources: {
          all: 4,
          platform: 2,
          modified: 1,
          custom: 1
        }
      }
    })),
    createCustomEntry: vi.fn(async (input) => ({
      id: astrologerEntryId,
      ...input
    })),
    updateCustomEntry: vi.fn(async (input) => ({
      id: astrologerEntryId,
      ownerUserId: input.ownerUserId,
      categoryId: input.categoryId,
      code: "custom_venus_gemini",
      locale: "ru" as const,
      entryType: "custom" as const,
      title: input.title,
      content: input.content,
      createdAt: "2026-06-30T09:00:00.000Z",
      updatedAt: input.updatedAt
    })),
    upsertPlatformEntryOverride: vi.fn(async (input) => ({
      id: astrologerEntryId,
      ownerUserId: input.ownerUserId,
      platformEntryId: input.platformEntryId,
      categoryId,
      code: "sun_aries",
      locale: "ru" as const,
      entryType: "override" as const,
      title: input.title,
      content: input.content,
      createdAt: input.updatedAt,
      updatedAt: input.updatedAt
    })),
    deleteAstrologerEntry: vi.fn(async () => undefined),
    resetAstrologerEntries: vi.fn(async () => undefined),
    resetPlatformEntryOverride: vi.fn(async () => undefined)
  };
}

function raise(message: string): never {
  throw new Error(message);
}

import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { hashSessionToken } from "@elevenhouse/auth";
import {
  astrologerClientListResponseSchema,
  astrologerClientResponseSchema,
  clientBirthDataUpsertRequestSchema
} from "@elevenhouse/contracts";
import type {
  AstrologerClientList,
  AstrologerClientListItem,
  AuthSessionAuthenticationStore,
  AuthSessionRevocationUnitOfWork,
  ClientAstrologerRelationship,
  ClientBirthData,
  ClientJoinIntent,
  ClientStore,
  PasswordlessAuthUnitOfWork,
  PasswordlessCustomerAccountRegistrationSessionUnitOfWork
} from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SystemClock } from "../clock/system-clock.service";
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
import { ClientsModule } from "./clients.module";
import { CLIENT_STORE } from "./clients.tokens";

const now = new Date("2026-07-06T10:00:00.000Z");
const sessionCookieName = "elevenhouse_astrologer_session";
const csrfCookieName = "elevenhouse_astrologer_csrf";
const csrfHeaderName = "x-csrf-token";
const sessionToken = "raw-session-token";
let currentCsrfToken = "";
const astrologerUserId = "22222222-2222-4222-8222-222222222222";
const secondAstrologerUserId = "33333333-3333-4333-8333-333333333333";
const clientUserId = "11111111-1111-4111-8111-111111111111";
const unrelatedClientUserId = "44444444-4444-4444-8444-444444444444";
const defaultPasswordlessRateLimits = {
  requestCodeIdentifier: { limit: 5, windowSeconds: 3600 },
  requestCodeIp: { limit: 30, windowSeconds: 3600 },
  requestCodeIdentifierIp: { limit: 3, windowSeconds: 3600 },
  verifyChallenge: { limit: 5, windowSeconds: 900 },
  verifyIp: { limit: 60, windowSeconds: 900 }
};

describe("clients HTTP routes", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let baseUrl: string;

  beforeEach(async () => {
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
      imports: [IdentityModule, ClientsModule]
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
      .useValue(createAuthStore(astrologerUserId))
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
      .overrideProvider(CLIENT_STORE)
      .useValue(createClientStore())
      .compile();

    currentCsrfToken = moduleRef.get(AstrologerCsrfTokenService).setCsrfCookie({
      response: { cookie: vi.fn() },
      sessionToken,
      sessionExpiresAt: "2026-07-09T00:00:00.000Z",
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

  it("lists only clients related to the current astrologer", async () => {
    const unauthenticatedResponse = await fetch(`${baseUrl}/clients`);
    const authenticatedResponse = await getJson("/clients");

    expect(unauthenticatedResponse.status).toBe(401);
    expect(authenticatedResponse.status).toBe(200);
    astrologerClientListResponseSchema.parse(authenticatedResponse.body);
    expect(authenticatedResponse.body).toMatchObject({
      total: 1,
      clients: [
        {
          clientUserId,
          displayName: "Марина Краснова",
          birthData: {
            birthDate: "1990-03-14"
          }
        }
      ]
    });
    expect(
      (authenticatedResponse.body.clients as Array<{ clientUserId: string }>).map(
        (client) => client.clientUserId
      )
    ).not.toContain(unrelatedClientUserId);
  });

  it("returns a related client detail and hides unrelated clients", async () => {
    const detailResponse = await getJson(`/clients/${clientUserId}`);
    const unrelatedResponse = await getJson(`/clients/${unrelatedClientUserId}`);

    expect(detailResponse.status).toBe(200);
    astrologerClientResponseSchema.parse(detailResponse.body);
    expect(detailResponse.body).toMatchObject({
      client: {
        clientUserId,
        displayName: "Марина Краснова"
      }
    });
    expect(unrelatedResponse.status).toBe(404);
  });

  it("requires CSRF for birth data updates", async () => {
    const response = await putJson(`/clients/${clientUserId}/birth-data`, validBirthDataBody(), {
      cookie: `${sessionCookieName}=${sessionToken}`
    });

    expect(response.status).toBe(403);
  });

  it("updates related client birth data and returns the refreshed client card", async () => {
    const response = await putJson(
      `/clients/${clientUserId}/birth-data`,
      validBirthDataBody(),
      csrfHeaders()
    );
    const unrelatedResponse = await putJson(
      `/clients/${unrelatedClientUserId}/birth-data`,
      validBirthDataBody(),
      csrfHeaders()
    );

    expect(response.status).toBe(200);
    astrologerClientResponseSchema.parse(response.body);
    expect(response.body).toMatchObject({
      client: {
        clientUserId,
        birthData: {
          birthDate: "1990-07-15",
          birthTime: "10:30",
          birthTimezone: "Europe/Rome",
          birthLatitude: 41.9028,
          birthLongitude: 12.4964,
          source: "manual"
        }
      }
    });
    expect(unrelatedResponse.status).toBe(404);
  });

  async function getJson(path: string): Promise<HttpJsonResponse> {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        cookie: `${sessionCookieName}=${sessionToken}`
      }
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

function createAuthStore(userId: string): AuthSessionAuthenticationStore {
  const tokenHash = hashSessionToken(sessionToken);

  return {
    findByTokenHash: vi.fn(async (candidateTokenHash: string) => {
      if (candidateTokenHash !== tokenHash) {
        return null;
      }

      return {
        session: {
          id: "8624104d-6f9b-4983-958e-9dbec6f0473c",
          userId,
          tokenHash,
          status: "active" as const,
          createdAt: "2026-07-06T10:00:00.000Z",
          expiresAt: "2026-07-09T00:00:00.000Z"
        },
        user: {
          id: userId,
          status: "active" as const,
          createdAt: "2026-07-06T10:00:00.000Z",
          updatedAt: "2026-07-06T10:00:00.000Z"
        },
        roleAssignments: [
          {
            id: "f7e4d8ea-7d14-4e54-a19a-9412307b3e8d",
            userId,
            role: "astrologer" as const,
            assignedAt: "2026-07-06T10:00:00.000Z"
          }
        ]
      };
    })
  };
}

function createClientStore(): ClientStore {
  let birthData: ClientBirthData = {
    id: "55555555-5555-4555-8555-555555555555",
    clientUserId,
    label: "Основные данные",
    birthDate: "1990-03-14",
    birthTime: "08:25",
    birthTimePrecision: "exact",
    birthPlaceText: "Москва, Россия",
    birthCountryCode: "RU",
    birthCity: "Москва",
    birthRegion: "Москва",
    birthTimezone: "Europe/Moscow",
    birthTimeDstOccurrence: null,
    birthLatitude: 55.7558,
    birthLongitude: 37.6173,
    source: "client_profile",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  const visibleClientBase: Omit<AstrologerClientListItem, "birthData"> = {
    clientUserId,
    displayName: "Марина Краснова",
    relationshipStatus: "active",
    firstLinkedAt: now.toISOString(),
    lastLinkedAt: now.toISOString()
  };
  const visibleClient = (): AstrologerClientListItem => ({ ...visibleClientBase, birthData });
  const unrelatedClient = (): AstrologerClientListItem => ({
    ...visibleClientBase,
    clientUserId: unrelatedClientUserId,
    displayName: "Чужой клиент",
    birthData: { ...birthData, clientUserId: unrelatedClientUserId }
  });

  return {
    createJoinIntent: vi.fn(
      async (): Promise<ClientJoinIntent> => raise("Unexpected create join intent call")
    ),
    findJoinIntentByTokenHash: vi.fn(async () => null),
    markJoinIntentClaimed: vi.fn(async () => null),
    ensureRelationship: vi.fn(
      async (): Promise<ClientAstrologerRelationship> =>
        raise("Unexpected ensure relationship call")
    ),
    upsertClientProfile: vi.fn(async (): Promise<void> => {}),
    upsertClientBirthData: vi.fn(async (input): Promise<ClientBirthData> => {
      birthData = {
        id: "66666666-6666-4666-8666-666666666666",
        clientUserId: input.clientUserId,
        ...input.data,
        createdAt: now.toISOString(),
        updatedAt: input.now
      };
      return birthData;
    }),
    listAstrologerClients: vi.fn(async (input): Promise<AstrologerClientList> => {
      const clients =
        input.astrologerUserId === astrologerUserId ? [visibleClient()] : [unrelatedClient()];
      return { clients, total: clients.length };
    }),
    getAstrologerClient: vi.fn(async (input) => {
      if (input.astrologerUserId === secondAstrologerUserId) {
        return unrelatedClient();
      }

      return input.clientUserId === clientUserId ? visibleClient() : null;
    })
  };
}

function validBirthDataBody(): Record<string, unknown> {
  return clientBirthDataUpsertRequestSchema.parse({
    label: "Основные данные",
    birthDate: "1990-07-15",
    birthTime: "10:30",
    birthTimePrecision: "exact",
    birthPlaceText: "Рим, Италия",
    birthCountryCode: "IT",
    birthCity: "Рим",
    birthRegion: "Лацио",
    birthTimezone: "Europe/Rome",
    birthTimeDstOccurrence: null,
    birthLatitude: 41.9028,
    birthLongitude: 12.4964
  });
}

function csrfHeaders(): Record<string, string> {
  return {
    cookie: `${sessionCookieName}=${sessionToken}; ${csrfCookieName}=${currentCsrfToken}`,
    origin: "http://localhost:3000",
    [csrfHeaderName]: currentCsrfToken
  };
}

function raise(message: string): never {
  throw new Error(message);
}

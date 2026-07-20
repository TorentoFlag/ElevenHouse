import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { hashSessionToken } from "@elevenhouse/auth";
import type {
  AuthSessionAuthenticationStore,
  AuthSessionRevocationUnitOfWork,
  AstrologerClientListItem,
  ChartCalculationCommandStore,
  ChartCalculationJobStore,
  ClientBirthData,
  ClientStore,
  PasswordlessAuthUnitOfWork,
  PasswordlessCustomerAccountRegistrationSessionUnitOfWork
} from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SystemClock } from "../clock/system-clock.service";
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
import { CHART_COMMAND_STORE, CHART_JOB_STORE } from "./charts.tokens";
import { ChartsModule } from "./charts.module";

const now = new Date("2026-07-20T12:00:00.000Z");
const sessionCookieName = "elevenhouse_astrologer_session";
const csrfCookieName = "elevenhouse_astrologer_csrf";
const csrfHeaderName = "x-csrf-token";
const sessionToken = "chart-session-token";
const ownerUserId = "11111111-1111-4111-8111-111111111111";
const clientId = "22222222-2222-4222-8222-222222222222";
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

  beforeEach(async () => {
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
      .overrideProvider(CLIENT_STORE)
      .useValue(createClientStore())
      .overrideProvider(CHART_COMMAND_STORE)
      .useValue(createCommandStore())
      .overrideProvider(CHART_JOB_STORE)
      .useValue(createJobStore())
      .compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterEach(async () => {
    await app?.close();
    await moduleRef?.close();
  });

  it("rejects authenticated cookie chart mutations without CSRF", async () => {
    const response = await postJson("/charts/natal/jobs", validBody(), {
      cookie: `${sessionCookieName}=${sessionToken}`
    });

    expect(response.status).toBe(403);
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
});

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

function raise(): never {
  throw new Error("Unexpected dependency call");
}

import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { hashSessionToken } from "@elevenhouse/auth";
import { humanDesignPreviewResponseSchema } from "@elevenhouse/contracts";
import type {
  AuthSessionAuthenticationStore,
  AuthSessionRevocationUnitOfWork,
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
import { HumanDesignModule } from "./human-design.module";

const now = new Date("2026-07-22T10:00:00.000Z");
const sessionCookieName = "elevenhouse_astrologer_session";
const csrfCookieName = "elevenhouse_astrologer_csrf";
const csrfHeaderName = "x-csrf-token";
const sessionToken = "human-design-session-token";
const ownerUserId = "8e14390f-3db1-4d1c-9344-55679c778427";
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

  beforeEach(async () => {
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
      .compile();

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

function raise(): never {
  throw new Error("Unexpected test dependency call");
}

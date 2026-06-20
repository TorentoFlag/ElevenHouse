import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import type {
  AuthSessionRevocationUnitOfWork,
  PasswordlessAuthUnitOfWork
} from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostgresRuntimeService } from "../../database/postgres-runtime.service";
import { RedisRuntimeService } from "../../redis/redis-runtime.service";
import {
  AUTH_SESSION_AUTHENTICATION_STORE,
  AUTH_SESSION_REVOCATION_UNIT_OF_WORK
} from "../auth/identity-auth.tokens";
import { IdentityModule } from "../identity.module";
import { SystemClock } from "../session/identity-session.service";
import { createIdentityConfigServiceStub } from "../testing/identity-config-service.stub";
import {
  InMemoryPasswordlessAuthStore,
  seedExistingPasswordlessAccount
} from "../testing/in-memory-passwordless-auth-store";
import { TestPasswordlessRateLimiter } from "../testing/test-passwordless-rate-limiter";
import { ASTROLOGER_AUTH_CODE_GENERATOR } from "./identity-passwordless.handler";
import {
  PASSWORDLESS_AUTH_UNIT_OF_WORK,
  PASSWORDLESS_RATE_LIMITER
} from "./identity-passwordless.tokens";

const now = new Date("2026-06-16T10:00:00.000Z");
const sessionCookieName = "elevenhouse_astrologer_session";
const csrfCookieName = "elevenhouse_astrologer_csrf";
const csrfHeaderName = "x-csrf-token";
const defaultPasswordlessRateLimits = {
  requestCodeIdentifier: { limit: 5, windowSeconds: 3600 },
  requestCodeIp: { limit: 30, windowSeconds: 3600 },
  requestCodeIdentifierIp: { limit: 3, windowSeconds: 3600 },
  verifyChallenge: { limit: 5, windowSeconds: 900 },
  verifyIp: { limit: 60, windowSeconds: 900 }
};

describe("passwordless astrologer auth HTTP flow", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let baseUrl: string;
  let store: InMemoryPasswordlessAuthStore;

  beforeEach(async () => {
    store = new InMemoryPasswordlessAuthStore(now);
    const passwordlessAuth: PasswordlessAuthUnitOfWork = {
      transact: async (operation) => operation(store)
    };
    const authSessionRevocation: AuthSessionRevocationUnitOfWork = {
      transact: async (operation) => operation(store)
    };

    moduleRef = await Test.createTestingModule({
      imports: [IdentityModule]
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
      .useValue(store)
      .overrideProvider(AUTH_SESSION_REVOCATION_UNIT_OF_WORK)
      .useValue(authSessionRevocation)
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
      .compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterEach(async () => {
    await app.close();
    await moduleRef.close();
  });

  it("logs in an existing astrologer account, sets cookies and resolves /identity/me", async () => {
    const account = seedExistingPasswordlessAccount(store, {
      channel: "email",
      identifierNormalized: "astrologer@example.com",
      roles: ["astrologer"]
    });

    const requestResponse = await postJson("/identity/astrologer/passwordless/request-code", {
      channel: "email",
      identifier: " ASTROLOGER@example.COM "
    });

    expect(requestResponse.status).toBe(201);
    expect(requestResponse.setCookie).toBeNull();
    expect(requestResponse.body).toMatchObject({
      channel: "email",
      maskedIdentifier: "a***@example.com",
      expiresAt: "2026-06-16T10:10:00.000Z",
      resendAvailableAt: "2026-06-16T10:01:00.000Z"
    });
    expect(requestResponse.body.challengeId).toEqual(expect.any(String));
    expect(store.authCodeDeliveryRequestedEvents).toHaveLength(1);
    expect(JSON.stringify(store.authCodeDeliveryRequestedEvents[0]?.payload)).not.toContain(
      "123456"
    );

    const verifyResponse = await postJson("/identity/astrologer/passwordless/verify-code", {
      challengeId: requestResponse.body.challengeId,
      code: "123456"
    });

    expect(verifyResponse.status).toBe(201);
    expect(verifyResponse.body).toMatchObject({
      account: {
        id: account.id,
        status: "active",
        roles: ["astrologer"]
      }
    });
    expect(verifyResponse.setCookie).toContain(`${sessionCookieName}=`);
    expect(verifyResponse.setCookie).toContain(`${csrfCookieName}=`);
    expect(verifyResponse.setCookie).toContain("HttpOnly");
    expect(verifyResponse.setCookie).toContain("SameSite=Lax");

    const meResponse = await getJson(
      "/identity/me",
      cookieHeader(verifyResponse.setCookies, [sessionCookieName])
    );

    expect(meResponse.status).toBe(200);
    expect(meResponse.body).toEqual(verifyResponse.body);
  });

  it("rejects login when the existing account is missing the astrologer role", async () => {
    seedExistingPasswordlessAccount(store, {
      channel: "email",
      identifierNormalized: "client@example.com",
      roles: ["client"]
    });

    const requestResponse = await postJson("/identity/astrologer/passwordless/request-code", {
      channel: "email",
      identifier: "client@example.com"
    });
    const verifyResponse = await postJson("/identity/astrologer/passwordless/verify-code", {
      challengeId: requestResponse.body.challengeId,
      code: "123456"
    });

    expect(requestResponse.status).toBe(201);
    expect(verifyResponse.status).toBe(401);
    expect(verifyResponse.setCookie).toBeNull();
    expect(store.roleAssignments).toHaveLength(1);
  });

  it("revokes the current session and clears cookies on logout", async () => {
    seedExistingPasswordlessAccount(store, {
      channel: "email",
      identifierNormalized: "astrologer@example.com",
      roles: ["astrologer"]
    });

    const requestResponse = await postJson("/identity/astrologer/passwordless/request-code", {
      channel: "email",
      identifier: "astrologer@example.com"
    });
    const verifyResponse = await postJson("/identity/astrologer/passwordless/verify-code", {
      challengeId: requestResponse.body.challengeId,
      code: "123456"
    });
    const sessionCookie = cookieHeader(verifyResponse.setCookies, [sessionCookieName]);
    const authenticatedCookies = cookieHeader(verifyResponse.setCookies, [
      sessionCookieName,
      csrfCookieName
    ]);
    const csrfToken = cookieValue(verifyResponse.setCookies, csrfCookieName);

    await expect(getJson("/identity/me", sessionCookie)).resolves.toMatchObject({
      status: 200
    });

    const logoutResponse = await postEmpty(
      "/identity/logout",
      authenticatedCookies,
      {
        "user-agent": "ElevenHouse-Test/1.0",
        origin: "http://localhost:3000",
        [csrfHeaderName]: csrfToken
      }
    );

    expect(logoutResponse.status).toBe(204);
    expect(logoutResponse.setCookie).toContain(`${sessionCookieName}=`);
    expect(logoutResponse.setCookie).toContain(`${csrfCookieName}=`);
    expect(logoutResponse.setCookie).toContain("Max-Age=0");
    expect(store.userSessions[0]).toMatchObject({
      status: "revoked",
      revokedAt: "2026-06-16T10:00:00.000Z"
    });
    expect(store.authSecurityEvents.at(-1)).toMatchObject({
      eventType: "logout_succeeded",
      sessionId: store.userSessions[0]?.id,
      userAgent: "ElevenHouse-Test/1.0"
    });

    await expect(getJson("/identity/me", sessionCookie)).resolves.toMatchObject({
      status: 401
    });
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

  async function postEmpty(
    path: string,
    cookie?: string,
    headers: Record<string, string> = {}
  ): Promise<Omit<HttpJsonResponse, "body">> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        ...(cookie ? { cookie } : {}),
        ...headers
      }
    });
    const setCookies = readSetCookies(response);

    return {
      status: response.status,
      setCookie: setCookies.length > 0 ? setCookies.join(", ") : null,
      setCookies
    };
  }

  async function getJson(path: string, cookie: string): Promise<HttpJsonResponse> {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        cookie
      }
    });

    return readJsonResponse(response);
  }
});

type HttpJsonResponse = {
  readonly status: number;
  readonly body: Record<string, unknown> & {
    readonly challengeId: string;
    readonly account: {
      readonly id: string;
      readonly roles: readonly string[];
    };
  };
  readonly setCookie: string | null;
  readonly setCookies: readonly string[];
};

async function readJsonResponse(response: Response): Promise<HttpJsonResponse> {
  const setCookies = readSetCookies(response);

  return {
    status: response.status,
    body: await response.json(),
    setCookie: setCookies.length > 0 ? setCookies.join(", ") : null,
    setCookies
  };
}

function readSetCookies(response: Response): readonly string[] {
  const headers = response.headers as Headers & {
    readonly getSetCookie?: () => string[];
  };
  const setCookies = headers.getSetCookie?.();

  if (setCookies && setCookies.length > 0) {
    return setCookies;
  }

  const setCookie = response.headers.get("set-cookie");

  return setCookie ? [setCookie] : [];
}

function cookieHeader(setCookies: readonly string[], names: readonly string[]): string {
  const cookies = setCookies
    .map((setCookie) => setCookie.split(";")[0] ?? "")
    .filter((cookie) => names.some((name) => cookie.startsWith(`${name}=`)));

  if (cookies.length !== names.length) {
    throw new Error(`Expected Set-Cookie headers for: ${names.join(", ")}`);
  }

  return cookies.join("; ");
}

function cookieValue(setCookies: readonly string[], name: string): string {
  const cookie = setCookies
    .map((setCookie) => setCookie.split(";")[0] ?? "")
    .find((candidate) => candidate.startsWith(`${name}=`));

  if (!cookie) {
    throw new Error(`Expected Set-Cookie header for: ${name}`);
  }

  return cookie.slice(name.length + 1);
}

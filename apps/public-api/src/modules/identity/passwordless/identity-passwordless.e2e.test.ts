import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import type {
  AuthSessionRevocationUnitOfWork,
  PasswordlessCustomerAccountRegistrationSessionUnitOfWork,
  PasswordlessAuthUnitOfWork
} from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostgresRuntimeService } from "../../database/postgres-runtime.service";
import { RedisRuntimeService } from "../../redis/redis-runtime.service";
import {
  AUTH_SESSION_AUTHENTICATION_STORE,
  AUTH_SESSION_REVOCATION_UNIT_OF_WORK
} from "../auth/identity-auth.tokens";
import { PASSWORDLESS_CUSTOMER_ACCOUNT_REGISTRATION_SESSION_UNIT_OF_WORK } from "../registration/identity-registration.tokens";
import { IdentityModule } from "../identity.module";
import { PUBLIC_AUTH_CODE_GENERATOR } from "./identity-passwordless.handler";
import {
  PASSWORDLESS_AUTH_UNIT_OF_WORK,
  PASSWORDLESS_RATE_LIMITER
} from "./identity-passwordless.tokens";
import { SystemClock } from "../../../common/system-clock.js";
import { createIdentityConfigServiceStub } from "../testing/identity-config-service.stub";
import {
  InMemoryPasswordlessAuthStore,
  seedExistingPasswordlessAccount
} from "../testing/in-memory-passwordless-auth-store";
import { TestPasswordlessRateLimiter } from "../testing/test-passwordless-rate-limiter";

const now = new Date("2026-06-16T10:00:00.000Z");
const sessionCookieName = "elevenhouse_public_session";
const csrfCookieName = "elevenhouse_public_csrf";
const csrfHeaderName = "x-csrf-token";
const defaultPasswordlessRateLimits = {
  requestCodeIdentifier: { limit: 5, windowSeconds: 3600 },
  requestCodeIp: { limit: 30, windowSeconds: 3600 },
  requestCodeIdentifierIp: { limit: 3, windowSeconds: 3600 },
  verifyChallenge: { limit: 5, windowSeconds: 900 },
  verifyIp: { limit: 60, windowSeconds: 900 }
};

describe("passwordless public auth HTTP flow", () => {
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
    const customerRegistration: PasswordlessCustomerAccountRegistrationSessionUnitOfWork = {
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
      .overrideProvider(PASSWORDLESS_CUSTOMER_ACCOUNT_REGISTRATION_SESSION_UNIT_OF_WORK)
      .useValue(customerRegistration)
      .overrideProvider(PASSWORDLESS_RATE_LIMITER)
      .useValue(new TestPasswordlessRateLimiter(defaultPasswordlessRateLimits, () => now))
      .overrideProvider(RedisRuntimeService)
      .useValue({
        eval: vi.fn(async () => 0),
        quit: vi.fn(async () => undefined)
      })
      .overrideProvider(PUBLIC_AUTH_CODE_GENERATOR)
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

  it("logs in an email account, sets a session cookie and resolves /identity/me", async () => {
    const account = seedExistingPasswordlessAccount(store, {
      channel: "email",
      identifierNormalized: "client@example.com",
      roles: ["client"]
    });

    const requestResponse = await postJson("/identity/passwordless/request-code", {
      channel: "email",
      identifier: " CLIENT@example.COM ",
      roles: ["client"]
    });

    expect(requestResponse.status).toBe(201);
    expect(requestResponse.setCookie).toBeNull();
    expect(requestResponse.body).toMatchObject({
      channel: "email",
      maskedIdentifier: "c***@example.com",
      expiresAt: "2026-06-16T10:10:00.000Z",
      resendAvailableAt: "2026-06-16T10:01:00.000Z"
    });
    expect(requestResponse.body.challengeId).toEqual(expect.any(String));
    expect(store.authCodeDeliveryRequestedEvents).toHaveLength(1);
    expect(JSON.stringify(store.authCodeDeliveryRequestedEvents[0]?.payload)).not.toContain(
      "123456"
    );
    expect(store.authCodeDeliveryRequestedEvents[0]?.payload).toMatchObject({
      challengeId: requestResponse.body.challengeId,
      encryptedCode: {
        algorithm: "aes-256-gcm",
        iv: expect.any(String),
        ciphertext: expect.any(String),
        authTag: expect.any(String)
      }
    });

    const verifyResponse = await postJson("/identity/passwordless/verify-code", {
      challengeId: requestResponse.body.challengeId,
      code: "123456"
    });

    expect(verifyResponse.status).toBe(201);
    expect(verifyResponse.body).toMatchObject({
      account: {
        status: "active",
        roles: ["client"]
      }
    });
    expect(verifyResponse.body.account.id).toBe(account.id);
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

  it("stores request metadata on challenges, sessions and security events", async () => {
    seedExistingPasswordlessAccount(store, {
      channel: "email",
      identifierNormalized: "client@example.com",
      roles: ["client"]
    });

    const requestResponse = await postJson(
      "/identity/passwordless/request-code",
      {
        channel: "email",
        identifier: "client@example.com",
        roles: ["client"]
      },
      {
        "user-agent": "ElevenHouse-Test/1.0"
      }
    );
    const verifyResponse = await postJson(
      "/identity/passwordless/verify-code",
      {
        challengeId: requestResponse.body.challengeId,
        code: "123456"
      },
      {
        "user-agent": "ElevenHouse-Test/1.0"
      }
    );

    expect(requestResponse.status).toBe(201);
    expect(verifyResponse.status).toBe(201);
    expect(store.authChallenges[0]).toMatchObject({
      userAgent: "ElevenHouse-Test/1.0"
    });
    expect(store.userSessions[0]).toMatchObject({
      userAgent: "ElevenHouse-Test/1.0"
    });
    expect(store.authSecurityEvents.at(-1)).toMatchObject({
      eventType: "login_succeeded",
      userAgent: "ElevenHouse-Test/1.0"
    });
  });

  it("logs in a phone account with multiple customer roles", async () => {
    seedExistingPasswordlessAccount(store, {
      channel: "phone",
      identifierNormalized: "+15551234090",
      roles: ["client", "astrologer"]
    });

    const requestResponse = await postJson("/identity/passwordless/request-code", {
      channel: "phone",
      identifier: "+1 (555) 123-4090",
      roles: ["client", "astrologer"]
    });

    expect(requestResponse.status).toBe(201);
    expect(requestResponse.body).toMatchObject({
      channel: "phone",
      maskedIdentifier: "+1******90"
    });

    const verifyResponse = await postJson("/identity/passwordless/verify-code", {
      challengeId: requestResponse.body.challengeId,
      code: "123456"
    });

    expect(verifyResponse.status).toBe(201);
    expect(verifyResponse.body.account.roles).toEqual(["client", "astrologer"]);
    expect(store.authIdentities[0]).toMatchObject({
      provider: "phone",
      providerSubject: "+15551234090",
      phoneNumber: "+15551234090",
      phoneVerifiedAt: "2026-06-16T10:00:00.000Z"
    });
  });

  it("registers an email account, creates a user profile and sets a session cookie", async () => {
    const requestResponse = await postJson("/identity/passwordless/request-code", {
      channel: "email",
      identifier: " CLIENT@example.COM ",
      roles: ["client"]
    });

    expect(requestResponse.status).toBe(201);

    const registrationResponse = await postJson("/identity/registration/passwordless/verify-code", {
      challengeId: requestResponse.body.challengeId,
      code: "123456",
      displayName: " Анна ",
      roles: ["client"]
    });

    expect(registrationResponse.status).toBe(201);
    expect(registrationResponse.body).toMatchObject({
      account: {
        status: "active",
        roles: ["client"],
        displayName: "Анна"
      }
    });
    expect(registrationResponse.setCookie).toContain(`${sessionCookieName}=`);
    expect(registrationResponse.setCookie).toContain(`${csrfCookieName}=`);
    expect(store.userProfiles).toEqual([
      expect.objectContaining({
        userId: registrationResponse.body.account.id,
        displayName: "Анна"
      })
    ]);
    expect(store.clientProfiles).toEqual([
      expect.objectContaining({
        userId: registrationResponse.body.account.id,
        displayNameSnapshot: "Анна",
        preferredLocale: null,
        timezone: null
      })
    ]);
    expect(store.authSecurityEvents.at(-1)).toMatchObject({
      eventType: "registration_succeeded",
      userId: registrationResponse.body.account.id
    });

    const meResponse = await getJson(
      "/identity/me",
      cookieHeader(registrationResponse.setCookies, [sessionCookieName])
    );

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.account.id).toBe(registrationResponse.body.account.id);
  });

  it("rejects astrologer self-assignment through public registration", async () => {
    const requestResponse = await postJson("/identity/passwordless/request-code", {
      channel: "email",
      identifier: "astrologer@example.com",
      roles: ["astrologer"]
    });
    const registrationResponse = await postJson("/identity/registration/passwordless/verify-code", {
      challengeId: requestResponse.body.challengeId,
      code: "123456",
      displayName: "Анна",
      roles: ["astrologer"]
    });

    expect(requestResponse.status).toBe(201);
    expect(registrationResponse.status).toBe(400);
    expect(registrationResponse.setCookie).toBeNull();
    expect(store.userProfiles).toHaveLength(0);
  });

  it("returns conflict when registering an identity that already exists", async () => {
    seedExistingPasswordlessAccount(store, {
      channel: "email",
      identifierNormalized: "client@example.com",
      roles: ["client"]
    });

    const requestResponse = await postJson("/identity/passwordless/request-code", {
      channel: "email",
      identifier: "client@example.com",
      roles: ["client"]
    });
    const registrationResponse = await postJson("/identity/registration/passwordless/verify-code", {
      challengeId: requestResponse.body.challengeId,
      code: "123456",
      displayName: "Анна",
      roles: ["client"]
    });

    expect(registrationResponse.status).toBe(409);
    expect(registrationResponse.setCookie).toBeNull();
  });

  it("rejects duplicate passwordless code requests during resend cooldown", async () => {
    const firstResponse = await postJson("/identity/passwordless/request-code", {
      channel: "email",
      identifier: "client@example.com",
      roles: ["client"]
    });
    const duplicateResponse = await postJson("/identity/passwordless/request-code", {
      channel: "email",
      identifier: "CLIENT@example.com",
      roles: ["client"]
    });

    expect(firstResponse.status).toBe(201);
    expect(duplicateResponse.status).toBe(429);
    expect(duplicateResponse.body).toEqual({
      message: "Passwordless code request is on cooldown",
      resendAvailableAt: "2026-06-16T10:01:00.000Z"
    });
    expect(store.authChallenges).toHaveLength(1);
    expect(store.authChallengeDeliveries).toHaveLength(1);
  });

  it("replaces a pending challenge before cooldown when the latest delivery failed", async () => {
    const firstResponse = await postJson("/identity/passwordless/request-code", {
      channel: "email",
      identifier: "client@example.com",
      roles: ["client"]
    });
    Object.assign(store.authChallengeDeliveries[0] ?? {}, {
      status: "failed",
      errorCode: "provider_unavailable"
    });

    const secondResponse = await postJson("/identity/passwordless/request-code", {
      channel: "email",
      identifier: "CLIENT@example.com",
      roles: ["client"]
    });

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);
    expect(store.authChallenges).toHaveLength(2);
    expect(store.authChallenges[0]).toMatchObject({
      id: firstResponse.body.challengeId,
      status: "cancelled",
      cancelledAt: "2026-06-16T10:00:00.000Z"
    });
    expect(store.authChallenges[1]).toMatchObject({
      id: secondResponse.body.challengeId,
      status: "pending"
    });
    expect(store.authChallengeDeliveries).toHaveLength(2);
    expect(store.authChallengeDeliveries[1]).toMatchObject({
      challengeId: secondResponse.body.challengeId,
      status: "queued"
    });
    expect(store.authCodeDeliveryRequestedEvents).toHaveLength(2);
  });

  it("queues delivery without calling the delivery provider during request-code", async () => {
    const response = await postJson("/identity/passwordless/request-code", {
      channel: "email",
      identifier: "client@example.com",
      roles: ["client"]
    });

    expect(response.status).toBe(201);
    expect(store.authChallenges).toHaveLength(1);
    expect(store.authChallenges[0]?.status).toBe("pending");
    expect(store.authChallengeDeliveries).toHaveLength(1);
    expect(store.authChallengeDeliveries[0]).toMatchObject({
      status: "queued"
    });
    expect(store.authChallengeDeliveries[0]?.provider).toBeUndefined();
    expect(store.authCodeDeliveryRequestedEvents).toHaveLength(1);
    expect(store.authCodeDeliveryRequestedEvents[0]?.payload).toMatchObject({
      deliveryId: store.authChallengeDeliveries[0]?.id,
      channel: "email",
      identifier: "client@example.com",
      encryptedCode: {
        algorithm: "aes-256-gcm",
        iv: expect.any(String),
        ciphertext: expect.any(String),
        authTag: expect.any(String)
      }
    });
    expect(JSON.stringify(store.authCodeDeliveryRequestedEvents[0]?.payload)).not.toContain(
      "123456"
    );
  });

  it("rate limits passwordless code requests by client IP before delivery", async () => {
    for (let index = 0; index < 30; index += 1) {
      const response = await postJson("/identity/passwordless/request-code", {
        channel: "email",
        identifier: `client-${index}@example.com`,
        roles: ["client"]
      });

      expect(response.status).toBe(201);
    }

    const limitedResponse = await postJson("/identity/passwordless/request-code", {
      channel: "email",
      identifier: "client-30@example.com",
      roles: ["client"]
    });

    expect(limitedResponse.status).toBe(429);
    expect(limitedResponse.body).toEqual({
      message: "Passwordless auth rate limit exceeded",
      retryAfterSeconds: 3600
    });
    expect(store.authChallenges).toHaveLength(30);
    expect(store.authChallengeDeliveries).toHaveLength(30);
    expect(store.authCodeDeliveryRequestedEvents).toHaveLength(30);
  });

  it("rejects wrong codes without setting a session cookie and still accepts the correct code", async () => {
    seedExistingPasswordlessAccount(store, {
      channel: "email",
      identifierNormalized: "client@example.com",
      roles: ["client"]
    });

    const requestResponse = await postJson("/identity/passwordless/request-code", {
      channel: "email",
      identifier: "client@example.com",
      roles: ["client"]
    });

    const wrongVerifyResponse = await postJson("/identity/passwordless/verify-code", {
      challengeId: requestResponse.body.challengeId,
      code: "000000"
    });

    expect(wrongVerifyResponse.status).toBe(401);
    expect(wrongVerifyResponse.setCookie).toBeNull();
    expect(store.authChallenges[0]?.attempts).toBe(1);

    const verifyResponse = await postJson("/identity/passwordless/verify-code", {
      challengeId: requestResponse.body.challengeId,
      code: "123456"
    });

    expect(verifyResponse.status).toBe(201);
    expect(verifyResponse.setCookie).toContain(`${sessionCookieName}=`);
  });

  it("rejects reused consumed challenges", async () => {
    seedExistingPasswordlessAccount(store, {
      channel: "email",
      identifierNormalized: "client@example.com",
      roles: ["client"]
    });

    const requestResponse = await postJson("/identity/passwordless/request-code", {
      channel: "email",
      identifier: "client@example.com",
      roles: ["client"]
    });

    await postJson("/identity/passwordless/verify-code", {
      challengeId: requestResponse.body.challengeId,
      code: "123456"
    });
    const reusedResponse = await postJson("/identity/passwordless/verify-code", {
      challengeId: requestResponse.body.challengeId,
      code: "123456"
    });

    expect(reusedResponse.status).toBe(401);
  });

  it("rejects login when a requested role is not already assigned", async () => {
    seedExistingPasswordlessAccount(store, {
      channel: "email",
      identifierNormalized: "client@example.com",
      roles: ["client"]
    });

    const requestResponse = await postJson("/identity/passwordless/request-code", {
      channel: "email",
      identifier: "CLIENT@example.com",
      roles: ["client", "astrologer"]
    });
    const verifyResponse = await postJson("/identity/passwordless/verify-code", {
      challengeId: requestResponse.body.challengeId,
      code: "123456"
    });

    expect(verifyResponse.status).toBe(401);
    expect(verifyResponse.setCookie).toBeNull();
    expect(store.roleAssignments).toHaveLength(1);
  });

  it("revokes the current session and clears the cookie on logout", async () => {
    seedExistingPasswordlessAccount(store, {
      channel: "email",
      identifierNormalized: "client@example.com",
      roles: ["client"]
    });

    const requestResponse = await postJson("/identity/passwordless/request-code", {
      channel: "email",
      identifier: "client@example.com",
      roles: ["client"]
    });
    const verifyResponse = await postJson("/identity/passwordless/verify-code", {
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

    const logoutResponse = await postEmpty("/identity/logout", authenticatedCookies, {
      "user-agent": "ElevenHouse-Test/1.0",
      origin: "http://localhost:3000",
      [csrfHeaderName]: csrfToken
    });

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

  it("rejects invalid request and verify payloads at the HTTP boundary", async () => {
    const requestResponse = await postJson("/identity/passwordless/request-code", {
      channel: "email",
      identifier: "client@example.com",
      roles: ["admin"]
    });
    const verifyResponse = await postJson("/identity/passwordless/verify-code", {
      challengeId: "not-a-uuid",
      code: "123456"
    });

    expect(requestResponse.status).toBe(400);
    expect(verifyResponse.status).toBe(400);
    expect(store.authChallenges).toHaveLength(0);
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

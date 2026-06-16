import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import type {
  AuthChallenge,
  AuthChallengeDelivery,
  AuthCodeDeliveryPort,
  AuthSecurityEvent,
  AuthSession,
  AuthSessionAuthenticationStore,
  PasswordlessAuthStore,
  PasswordlessAuthUnitOfWork,
  UserAccount,
  UserRoleAssignment
} from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { RedisRuntimeService } from "../redis/redis-runtime.service";
import { AUTH_SESSION_AUTHENTICATION_STORE } from "./identity-auth.tokens";
import { IdentityModule } from "./identity.module";
import { PUBLIC_AUTH_CODE_GENERATOR } from "./identity-passwordless.handler";
import {
  AUTH_CODE_DELIVERY,
  PASSWORDLESS_AUTH_UNIT_OF_WORK,
  PASSWORDLESS_RATE_LIMITER
} from "./identity-passwordless.tokens";
import { InMemoryPasswordlessRateLimiter } from "./identity-passwordless.rate-limit";
import { SystemClock } from "./identity-session.service";

const now = new Date("2026-06-16T10:00:00.000Z");
const sessionCookieName = "elevenhouse_public_session";
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
  let deliverAuthCodeMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    store = new InMemoryPasswordlessAuthStore(now);
    const passwordlessAuth: PasswordlessAuthUnitOfWork = {
      transact: async (operation) => operation(store)
    };
    deliverAuthCodeMock = vi.fn(
      async (input: Parameters<AuthCodeDeliveryPort["deliverAuthCode"]>[0]) => ({
        provider: "dev",
        status: "sent" as const,
        providerMessageId: `dev:${input.challengeId}`
      })
    );
    const delivery: AuthCodeDeliveryPort = {
      deliverAuthCode: deliverAuthCodeMock as AuthCodeDeliveryPort["deliverAuthCode"]
    };

    moduleRef = await Test.createTestingModule({
      imports: [IdentityModule]
    })
      .overrideProvider(PostgresRuntimeService)
      .useValue({ database: {} })
      .overrideProvider(ConfigService)
      .useValue(createConfigServiceStub())
      .overrideProvider(PASSWORDLESS_AUTH_UNIT_OF_WORK)
      .useValue(passwordlessAuth)
      .overrideProvider(AUTH_SESSION_AUTHENTICATION_STORE)
      .useValue(store)
      .overrideProvider(AUTH_CODE_DELIVERY)
      .useValue(delivery)
      .overrideProvider(PASSWORDLESS_RATE_LIMITER)
      .useValue(new InMemoryPasswordlessRateLimiter(defaultPasswordlessRateLimits))
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

  it("registers an email account, sets a session cookie and resolves /identity/me", async () => {
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
    expect(verifyResponse.body.account.id).toEqual(expect.any(String));
    expect(verifyResponse.setCookie).toContain(`${sessionCookieName}=`);
    expect(verifyResponse.setCookie).toContain("HttpOnly");
    expect(verifyResponse.setCookie).toContain("SameSite=Lax");

    const meResponse = await getJson("/identity/me", cookieHeader(verifyResponse.setCookie));

    expect(meResponse.status).toBe(200);
    expect(meResponse.body).toEqual(verifyResponse.body);
  });

  it("registers a phone account with multiple customer roles", async () => {
    const requestResponse = await postJson("/identity/passwordless/request-code", {
      channel: "phone",
      identifier: "+1 (555) 123-4090",
      roles: ["client", "astrologer"]
    });

    expect(requestResponse.status).toBe(201);
    expect(requestResponse.body).toMatchObject({
      channel: "phone",
      maskedIdentifier: "+15***90"
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

  it("returns service unavailable and cancels the challenge when delivery throws", async () => {
    deliverAuthCodeMock.mockRejectedValueOnce(new Error("SMTP timeout"));

    const response = await postJson("/identity/passwordless/request-code", {
      channel: "email",
      identifier: "client@example.com",
      roles: ["client"]
    });

    expect(response.status).toBe(503);
    expect(store.authChallenges).toHaveLength(1);
    expect(store.authChallenges[0]).toMatchObject({
      status: "cancelled",
      cancelledAt: "2026-06-16T10:00:00.000Z"
    });
    expect(store.authChallengeDeliveries).toHaveLength(1);
    expect(store.authChallengeDeliveries[0]).toMatchObject({
      provider: "unknown",
      status: "failed",
      errorCode: "DELIVERY_EXCEPTION",
      errorMessage: "SMTP timeout"
    });
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
    expect(deliverAuthCodeMock).toHaveBeenCalledTimes(30);
  });

  it("rejects wrong codes without setting a session cookie and still accepts the correct code", async () => {
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

  it("logs in an existing identity without granting requested roles again", async () => {
    const firstRequest = await postJson("/identity/passwordless/request-code", {
      channel: "email",
      identifier: "client@example.com",
      roles: ["client"]
    });
    const firstVerify = await postJson("/identity/passwordless/verify-code", {
      challengeId: firstRequest.body.challengeId,
      code: "123456"
    });
    const secondRequest = await postJson("/identity/passwordless/request-code", {
      channel: "email",
      identifier: "CLIENT@example.com",
      roles: ["client", "astrologer"]
    });
    const secondVerify = await postJson("/identity/passwordless/verify-code", {
      challengeId: secondRequest.body.challengeId,
      code: "123456"
    });

    expect(secondVerify.status).toBe(201);
    expect(secondVerify.body.account.id).toBe(firstVerify.body.account.id);
    expect(secondVerify.body.account.roles).toEqual(["client"]);
    expect(store.roleAssignments).toHaveLength(1);
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

  async function postJson(path: string, body: unknown): Promise<HttpJsonResponse> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });

    return readJsonResponse(response);
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
  readonly body: any;
  readonly setCookie: string | null;
};

async function readJsonResponse(response: Response): Promise<HttpJsonResponse> {
  return {
    status: response.status,
    body: await response.json(),
    setCookie: response.headers.get("set-cookie")
  };
}

function cookieHeader(setCookie: string | null): string {
  if (!setCookie) {
    throw new Error("Expected Set-Cookie header");
  }

  return setCookie.split(";")[0] ?? "";
}

function createConfigServiceStub(): Pick<ConfigService, "getOrThrow"> {
  return {
    getOrThrow: (key: string) => {
      if (key === "publicApi.sessionTtlSeconds") {
        return 604800;
      }

      if (key === "publicApi.sessionCookieSecure") {
        return false;
      }

      if (key === "publicApi.sessionCookieName") {
        return sessionCookieName;
      }

      if (key === "publicApi.passwordlessCodeSecret") {
        return "test-secret";
      }

      if (key === "publicApi.passwordlessCodeTtlSeconds") {
        return 600;
      }

      if (key === "publicApi.passwordlessResendCooldownSeconds") {
        return 60;
      }

      if (key === "publicApi.passwordlessMaxAttempts") {
        return 5;
      }

      if (key === "publicApi.passwordlessRateLimits") {
        return defaultPasswordlessRateLimits;
      }

      throw new Error(`Unexpected config key: ${key}`);
    }
  };
}

class InMemoryPasswordlessAuthStore implements PasswordlessAuthStore, AuthSessionAuthenticationStore {
  readonly authChallenges: AuthChallenge[] = [];
  readonly authChallengeDeliveries: AuthChallengeDelivery[] = [];
  readonly users: UserAccount[] = [];
  readonly authIdentities: Array<{
    readonly id: string;
    readonly userId: string;
    readonly provider: "email" | "phone";
    readonly providerSubject: string;
    readonly email?: string;
    readonly phoneNumber?: string;
    readonly emailVerifiedAt?: string;
    readonly phoneVerifiedAt?: string;
    readonly createdAt: string;
    readonly updatedAt: string;
  }> = [];
  readonly roleAssignments: UserRoleAssignment[] = [];
  readonly userSessions: AuthSession[] = [];
  readonly authSecurityEvents: AuthSecurityEvent[] = [];

  constructor(private readonly now: Date) {}

  async createChallenge(
    input: Parameters<PasswordlessAuthStore["createChallenge"]>[0]
  ): Promise<AuthChallenge> {
    const challenge: AuthChallenge = {
      id: randomUUID(),
      ...input,
      status: "pending",
      attempts: 0,
      createdAt: this.now.toISOString(),
      updatedAt: this.now.toISOString()
    };
    this.authChallenges.push(challenge);
    return challenge;
  }

  async recordDelivery(
    input: Parameters<PasswordlessAuthStore["recordDelivery"]>[0]
  ): Promise<AuthChallengeDelivery> {
    const delivery: AuthChallengeDelivery = {
      id: randomUUID(),
      createdAt: this.now.toISOString(),
      ...input
    };
    this.authChallengeDeliveries.push(delivery);
    return delivery;
  }

  async cancelChallenge(
    input: Parameters<PasswordlessAuthStore["cancelChallenge"]>[0]
  ): Promise<void> {
    const challenge = this.requireChallenge(input.challengeId);
    Object.assign(challenge, {
      status: "cancelled",
      cancelledAt: input.cancelledAt,
      updatedAt: input.cancelledAt
    });
  }

  async findPendingChallengeByIdentifier(
    input: Parameters<NonNullable<PasswordlessAuthStore["findPendingChallengeByIdentifier"]>>[0]
  ): Promise<AuthChallenge | null> {
    return (
      [...this.authChallenges]
        .reverse()
        .find(
          (challenge) =>
            challenge.channel === input.channel &&
            challenge.identifierNormalized === input.identifierNormalized &&
            challenge.status === "pending"
        ) ?? null
    );
  }

  async findChallengeById(challengeId: string): Promise<AuthChallenge | null> {
    return this.authChallenges.find((challenge) => challenge.id === challengeId) ?? null;
  }

  async incrementChallengeAttempts(
    input: Parameters<PasswordlessAuthStore["incrementChallengeAttempts"]>[0]
  ): Promise<void> {
    const challenge = this.requireChallenge(input.challengeId);
    Object.assign(challenge, {
      attempts: challenge.attempts + 1,
      updatedAt: input.attemptedAt
    });
  }

  async consumeChallenge(
    input: Parameters<PasswordlessAuthStore["consumeChallenge"]>[0]
  ): Promise<void> {
    const challenge = this.requireChallenge(input.challengeId);
    Object.assign(challenge, {
      status: "consumed",
      consumedAt: input.consumedAt,
      updatedAt: input.consumedAt
    });
  }

  async findAuthIdentityByProviderSubject(
    input: Parameters<PasswordlessAuthStore["findAuthIdentityByProviderSubject"]>[0]
  ) {
    const authIdentity = this.authIdentities.find(
      (identity) =>
        identity.provider === input.provider && identity.providerSubject === input.providerSubject
    );

    if (!authIdentity) {
      return null;
    }

    const user = this.requireUser(authIdentity.userId);

    return {
      user,
      authIdentity,
      roleAssignments: this.roleAssignments.filter((assignment) => assignment.userId === user.id)
    };
  }

  async createUser(input: Parameters<PasswordlessAuthStore["createUser"]>[0]): Promise<UserAccount> {
    const user: UserAccount = {
      id: randomUUID(),
      status: input.status,
      createdAt: this.now.toISOString(),
      updatedAt: this.now.toISOString()
    };
    this.users.push(user);
    return user;
  }

  async createAuthIdentity(
    input: Parameters<PasswordlessAuthStore["createAuthIdentity"]>[0]
  ) {
    const authIdentity = {
      id: randomUUID(),
      userId: input.userId,
      provider: input.provider as "email" | "phone",
      providerSubject: input.providerSubject,
      ...(input.email === undefined ? {} : { email: input.email }),
      ...(input.phoneNumber === undefined ? {} : { phoneNumber: input.phoneNumber }),
      ...(input.emailVerifiedAt === undefined ? {} : { emailVerifiedAt: input.emailVerifiedAt }),
      ...(input.phoneVerifiedAt === undefined ? {} : { phoneVerifiedAt: input.phoneVerifiedAt }),
      createdAt: this.now.toISOString(),
      updatedAt: this.now.toISOString()
    };
    this.authIdentities.push(authIdentity);
    return authIdentity;
  }

  async assignRole(
    input: Parameters<PasswordlessAuthStore["assignRole"]>[0]
  ): Promise<UserRoleAssignment> {
    const roleAssignment: UserRoleAssignment = {
      id: randomUUID(),
      userId: input.userId,
      role: input.role,
      assignedAt: this.now.toISOString()
    };
    this.roleAssignments.push(roleAssignment);
    return roleAssignment;
  }

  async createSession(
    input: Parameters<PasswordlessAuthStore["createSession"]>[0]
  ): Promise<AuthSession> {
    const session: AuthSession = {
      id: randomUUID(),
      status: "active",
      ...input
    };
    this.userSessions.push(session);
    return session;
  }

  async recordSecurityEvent(
    input: Parameters<PasswordlessAuthStore["recordSecurityEvent"]>[0]
  ): Promise<AuthSecurityEvent> {
    const securityEvent: AuthSecurityEvent = {
      id: randomUUID(),
      ...input,
      metadata: input.metadata ?? {}
    };
    this.authSecurityEvents.push(securityEvent);
    return securityEvent;
  }

  async findByTokenHash(tokenHash: string) {
    const session = this.userSessions.find((candidate) => candidate.tokenHash === tokenHash);

    if (!session) {
      return null;
    }

    const user = this.requireUser(session.userId);

    return {
      session,
      user,
      roleAssignments: this.roleAssignments.filter((assignment) => assignment.userId === user.id)
    };
  }

  private requireChallenge(challengeId: string): AuthChallenge {
    const challenge = this.authChallenges.find((candidate) => candidate.id === challengeId);

    if (!challenge) {
      throw new Error(`Challenge not found: ${challengeId}`);
    }

    return challenge;
  }

  private requireUser(userId: string): UserAccount {
    const user = this.users.find((candidate) => candidate.id === userId);

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    return user;
  }
}

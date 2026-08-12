import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import type {
  MobilePasswordlessLoginUnitOfWork,
  MobilePasswordlessRegistrationUnitOfWork,
  MobileSessionManagementStore,
  MobileSessionStore,
  MobileSessionUnitOfWork
} from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostgresRuntimeService } from "../../database/postgres-runtime.service";
import { RedisRuntimeService } from "../../redis/redis-runtime.service";
import { IdentityModule } from "../identity.module";
import { createIdentityConfigServiceStub } from "../testing/identity-config-service.stub";
import {
  InMemoryPasswordlessAuthStore,
  seedExistingPasswordlessAccount
} from "../testing/in-memory-passwordless-auth-store";
import { TestPasswordlessRateLimiter } from "../testing/test-passwordless-rate-limiter";
import { ASTROLOGER_AUTH_CODE_GENERATOR } from "../passwordless/identity-passwordless.handler";
import { PASSWORDLESS_AUTH_UNIT_OF_WORK, PASSWORDLESS_RATE_LIMITER } from "../passwordless/identity-passwordless.tokens";
import { SystemClock } from "../../clock/system-clock.service";
import {
  MOBILE_PASSWORDLESS_LOGIN_UNIT_OF_WORK,
  MOBILE_PASSWORDLESS_REGISTRATION_UNIT_OF_WORK,
  MOBILE_SESSION_AUTHENTICATION_STORE,
  MOBILE_SESSION_MANAGEMENT_STORE,
  MOBILE_SESSION_UNIT_OF_WORK
} from "./mobile-session.tokens";

const now = new Date("2026-08-12T10:00:00.000Z");
const limits = {
  requestCodeIdentifier: { limit: 5, windowSeconds: 3600 },
  requestCodeIp: { limit: 30, windowSeconds: 3600 },
  requestCodeIdentifierIp: { limit: 3, windowSeconds: 3600 },
  verifyChallenge: { limit: 5, windowSeconds: 900 },
  verifyIp: { limit: 60, windowSeconds: 900 }
};

describe("mobile astrologer auth HTTP flow", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let baseUrl: string;
  let store: InMemoryPasswordlessAuthStore;

  beforeEach(async () => {
    store = new InMemoryPasswordlessAuthStore(now);
    const mobileSessions: MobileSessionUnitOfWork<MobileSessionStore> = {
      transact: async (operation) => operation(store)
    };
    const mobileLogin: MobilePasswordlessLoginUnitOfWork = {
      transact: async (operation) => operation(store)
    };
    const mobileRegistration: MobilePasswordlessRegistrationUnitOfWork = {
      transact: async (operation) => operation(store)
    };

    moduleRef = await Test.createTestingModule({ imports: [IdentityModule] })
      .overrideProvider(PostgresRuntimeService)
      .useValue({ database: {} })
      .overrideProvider(ConfigService)
      .useValue(
        createIdentityConfigServiceStub({
          sessionCookieName: "elevenhouse_astrologer_session",
          csrfCookieName: "elevenhouse_astrologer_csrf",
          csrfHeaderName: "x-csrf-token",
          passwordlessRateLimits: limits
        })
      )
      .overrideProvider(PASSWORDLESS_AUTH_UNIT_OF_WORK)
      .useValue({ transact: async (operation: (value: InMemoryPasswordlessAuthStore) => unknown) => operation(store) })
      .overrideProvider(MOBILE_SESSION_UNIT_OF_WORK)
      .useValue(mobileSessions)
      .overrideProvider(MOBILE_PASSWORDLESS_LOGIN_UNIT_OF_WORK)
      .useValue(mobileLogin)
      .overrideProvider(MOBILE_PASSWORDLESS_REGISTRATION_UNIT_OF_WORK)
      .useValue(mobileRegistration)
      .overrideProvider(MOBILE_SESSION_AUTHENTICATION_STORE)
      .useValue(store)
      .overrideProvider(MOBILE_SESSION_MANAGEMENT_STORE)
      .useValue(store as MobileSessionManagementStore)
      .overrideProvider(PASSWORDLESS_RATE_LIMITER)
      .useValue(new TestPasswordlessRateLimiter(limits, () => now))
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
    await app.close();
    await moduleRef.close();
  });

  it("issues mobile tokens, restores a lost refresh response once, and rejects a distinct replay", async () => {
    seedExistingPasswordlessAccount(store, {
      channel: "email",
      identifierNormalized: "astrologer@example.com",
      roles: ["astrologer"]
    });
    const challenge = await post("/identity/astrologer/mobile/passwordless/request-code", {
      channel: "email",
      identifier: "astrologer@example.com"
    });
    const login = await post("/identity/astrologer/mobile/passwordless/verify-code", {
      challengeId: challenge.body.challengeId,
      code: "123456",
      platform: "ios",
      deviceLabel: "Anton iPhone"
    });

    expect(login.status).toBe(201);
    expect(login.headers.get("set-cookie")).toBeNull();
    expect(login.body).toMatchObject({ account: { roles: ["astrologer"] } });
    const protectedBeforeRefresh = await get("/identity/me", login.body.accessToken);
    expect(protectedBeforeRefresh.status).toBe(200);

    const operationId = "5a14390f-3db1-4d1c-9344-55679c778427";
    const refreshed = await post("/identity/astrologer/mobile/refresh", {
      refreshToken: login.body.refreshToken,
      operationId
    });
    const recovered = await post("/identity/astrologer/mobile/refresh", {
      refreshToken: login.body.refreshToken,
      operationId
    });

    expect(refreshed.status).toBe(201);
    expect(recovered.status).toBe(201);
    expect(recovered.body).toEqual(refreshed.body);

    const replay = await post("/identity/astrologer/mobile/refresh", {
      refreshToken: login.body.refreshToken,
      operationId: "6a14390f-3db1-4d1c-9344-55679c778427"
    });
    expect(replay.status).toBe(401);
    expect(await get("/identity/me", refreshed.body.accessToken)).toMatchObject({ status: 401 });
  });

  it("registers a new astrologer directly into a mobile device session", async () => {
    const challenge = await post("/identity/astrologer/mobile/passwordless/request-code", {
      channel: "email",
      identifier: "new-astrologer@example.com"
    });
    const registration = await post("/identity/astrologer/mobile/registration/verify-code", {
      challengeId: challenge.body.challengeId,
      code: "123456",
      displayName: "Астролог Анна",
      platform: "ios",
      deviceLabel: "Anna iPhone"
    });

    expect(registration.status).toBe(201);
    expect(registration.headers.get("set-cookie")).toBeNull();
    expect(registration.body).toMatchObject({ account: { roles: ["astrologer"] } });
    expect(store.authSecurityEvents.at(-1)).toMatchObject({ eventType: "registration_succeeded" });
  });

  it("returns a stable conflict when native registration finds an existing identity", async () => {
    seedExistingPasswordlessAccount(store, {
      channel: "email",
      identifierNormalized: "existing-astrologer@example.com",
      roles: ["astrologer"]
    });
    const challenge = await post("/identity/astrologer/mobile/passwordless/request-code", {
      channel: "email",
      identifier: "existing-astrologer@example.com"
    });

    const registration = await post("/identity/astrologer/mobile/registration/verify-code", {
      challengeId: challenge.body.challengeId,
      code: "123456",
      displayName: "Астролог Анна",
      platform: "ios",
      deviceLabel: "Anna iPhone"
    });

    expect(registration).toMatchObject({
      status: 409,
      body: { code: "identity_already_exists" }
    });
  });

  it("revokes the authenticated mobile session through the common logout endpoint", async () => {
    seedExistingPasswordlessAccount(store, {
      channel: "email",
      identifierNormalized: "logout-astrologer@example.com",
      roles: ["astrologer"]
    });
    const challenge = await post("/identity/astrologer/mobile/passwordless/request-code", {
      channel: "email",
      identifier: "logout-astrologer@example.com"
    });
    const login = await post("/identity/astrologer/mobile/passwordless/verify-code", {
      challengeId: challenge.body.challengeId,
      code: "123456",
      platform: "ios",
      deviceLabel: "Anton iPhone"
    });

    await expect(postEmpty("/identity/logout", login.body.accessToken)).resolves.toMatchObject({
      status: 204
    });
    await expect(get("/identity/me", login.body.accessToken)).resolves.toMatchObject({ status: 401 });
    expect(store.authSecurityEvents.at(-1)).toMatchObject({
      eventType: "logout_succeeded",
      metadata: expect.objectContaining({ mobileSessionId: login.body.sessionId })
    });
  });

  it("returns 400 for an invalid refresh body", async () => {
    await expect(post("/identity/astrologer/mobile/refresh", { refreshToken: "too-short" })).resolves.toMatchObject({
      status: 400
    });
  });

  async function post(path: string, body: unknown) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
  }

  async function get(path: string, accessToken: string) {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { authorization: `Bearer ${accessToken}` }
    });
    return { status: response.status, body: await response.json() };
  }

  async function postEmpty(path: string, accessToken: string) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` }
    });
    return { status: response.status, headers: response.headers };
  }
});

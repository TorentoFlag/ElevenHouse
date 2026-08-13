import { ConfigService } from "@nestjs/config";
import { hashSessionToken } from "@elevenhouse/auth";
import type {
  AuthSessionAuthenticationStore,
  AuthenticatedMobileSessionContext,
  AuthenticatedSessionContext,
  MobileSessionAuthenticationStore
} from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";
import { IdentityCurrentSessionService } from "./identity-current-session.service";
import type { SystemClock } from "../../../common/system-clock.js";

function createService(
  store: AuthSessionAuthenticationStore,
  sessionCookieName = "elevenhouse_public_session",
  mobileStore: MobileSessionAuthenticationStore = { findByAccessTokenHash: vi.fn(async () => null) }
): IdentityCurrentSessionService {
  const clock: SystemClock = {
    now: vi.fn(() => new Date("2026-06-15T10:00:00.000Z"))
  };
  const configService = {
    getOrThrow: vi.fn((key: string) => {
      if (key === "publicApi.sessionCookieName") {
        return sessionCookieName;
      }

      throw new Error(`Unexpected config key: ${key}`);
    })
  } as unknown as ConfigService;

  return new IdentityCurrentSessionService(store, mobileStore, clock, configService);
}

describe("IdentityCurrentSessionService", () => {
  it("resolves a client mobile bearer session and marks it for CSRF bypass", async () => {
    const mobileContext = {
      session: {
        id: "22222222-2222-4222-8222-222222222222",
        userId: "8e14390f-3db1-4d1c-9344-55679c778427",
        platform: "android",
        deviceLabel: "Pixel",
        status: "active",
        accessTokenHash: hashSessionToken("raw-mobile-token"),
        accessTokenExpiresAt: "2026-06-15T11:00:00.000Z",
        createdAt: "2026-06-15T09:00:00.000Z",
        lastUsedAt: "2026-06-15T09:00:00.000Z",
        expiresAt: "2026-06-22T09:00:00.000Z"
      },
      user: {
        id: "8e14390f-3db1-4d1c-9344-55679c778427",
        status: "active",
        createdAt: "2026-06-15T09:00:00.000Z",
        updatedAt: "2026-06-15T09:00:00.000Z"
      },
      roleAssignments: [
        {
          id: "role_client",
          userId: "8e14390f-3db1-4d1c-9344-55679c778427",
          role: "client",
          assignedAt: "2026-06-15T09:00:00.000Z"
        }
      ]
    } satisfies AuthenticatedMobileSessionContext;
    const mobileStore: MobileSessionAuthenticationStore = {
      findByAccessTokenHash: vi.fn(async () => mobileContext)
    };
    const request = {
      headers: { authorization: "Bearer raw-mobile-token" }
    };

    await expect(
      createService(
        { findByTokenHash: vi.fn() },
        "elevenhouse_public_session",
        mobileStore
      ).resolveCurrentCustomerAccount(request)
    ).resolves.toEqual({
      account: {
        id: "8e14390f-3db1-4d1c-9344-55679c778427",
        status: "active",
        roles: ["client"]
      }
    });
    expect(request).toMatchObject({
      currentMobileSessionId: "22222222-2222-4222-8222-222222222222"
    });
  });

  it("does not fall back to a cookie when a bearer credential is invalid", async () => {
    const cookieStore: AuthSessionAuthenticationStore = {
      findByTokenHash: vi.fn()
    };
    const mobileStore: MobileSessionAuthenticationStore = {
      findByAccessTokenHash: vi.fn(async () => null)
    };

    await expect(
      createService(
        cookieStore,
        "elevenhouse_public_session",
        mobileStore
      ).resolveCurrentCustomerAccount({
        headers: {
          authorization: "Bearer invalid-mobile-token",
          cookie: "elevenhouse_public_session=valid-cookie-token"
        }
      })
    ).resolves.toBeNull();
    expect(mobileStore.findByAccessTokenHash).toHaveBeenCalledWith(
      hashSessionToken("invalid-mobile-token")
    );
    expect(cookieStore.findByTokenHash).not.toHaveBeenCalled();
  });

  it("resolves the current account from the public session cookie", async () => {
    const authenticatedContext = {
      session: {
        id: "session_1",
        userId: "8e14390f-3db1-4d1c-9344-55679c778427",
        tokenHash: hashSessionToken("raw-session-token"),
        status: "active",
        createdAt: "2026-06-15T10:00:00.000Z",
        expiresAt: "2026-06-22T10:00:00.000Z"
      },
      user: {
        id: "8e14390f-3db1-4d1c-9344-55679c778427",
        status: "active",
        createdAt: "2026-06-15T10:00:00.000Z",
        updatedAt: "2026-06-15T10:00:00.000Z"
      },
      roleAssignments: [
        {
          id: "role_client",
          userId: "8e14390f-3db1-4d1c-9344-55679c778427",
          role: "client",
          assignedAt: "2026-06-15T10:00:00.000Z"
        }
      ]
    } satisfies AuthenticatedSessionContext;
    const store: AuthSessionAuthenticationStore = {
      findByTokenHash: vi.fn(async () => authenticatedContext)
    };

    await expect(
      createService(store).resolveCurrentCustomerAccount({
        headers: {
          cookie: "theme=dark; elevenhouse_public_session=raw-session-token; locale=ru"
        }
      })
    ).resolves.toEqual({
      account: {
        id: "8e14390f-3db1-4d1c-9344-55679c778427",
        status: "active",
        roles: ["client"]
      }
    });
    expect(store.findByTokenHash).toHaveBeenCalledWith(hashSessionToken("raw-session-token"));
  });

  it("does not leak internal roles into the customer-facing session contract", async () => {
    const authenticatedContext = {
      session: {
        id: "session_1",
        userId: "8e14390f-3db1-4d1c-9344-55679c778427",
        tokenHash: hashSessionToken("raw-session-token"),
        status: "active",
        createdAt: "2026-06-15T10:00:00.000Z",
        expiresAt: "2026-06-22T10:00:00.000Z"
      },
      user: {
        id: "8e14390f-3db1-4d1c-9344-55679c778427",
        status: "active",
        createdAt: "2026-06-15T10:00:00.000Z",
        updatedAt: "2026-06-15T10:00:00.000Z"
      },
      roleAssignments: [
        {
          id: "role_client",
          userId: "8e14390f-3db1-4d1c-9344-55679c778427",
          role: "client",
          assignedAt: "2026-06-15T10:00:00.000Z"
        },
        {
          id: "role_super_admin",
          userId: "8e14390f-3db1-4d1c-9344-55679c778427",
          role: "super_admin",
          assignedAt: "2026-06-15T10:00:00.000Z"
        }
      ]
    } satisfies AuthenticatedSessionContext;
    const store: AuthSessionAuthenticationStore = {
      findByTokenHash: vi.fn(async () => authenticatedContext)
    };

    await expect(
      createService(store).resolveCurrentCustomerAccount({
        headers: { cookie: "elevenhouse_public_session=raw-session-token" }
      })
    ).resolves.toEqual({
      account: {
        id: "8e14390f-3db1-4d1c-9344-55679c778427",
        status: "active",
        roles: ["client"]
      }
    });
  });

  it("returns null without querying the store when the request has no public session cookie", async () => {
    const store: AuthSessionAuthenticationStore = {
      findByTokenHash: vi.fn()
    };

    await expect(
      createService(store).resolveCurrentCustomerAccount({
        headers: {
          cookie: "theme=dark"
        }
      })
    ).resolves.toBeNull();
    expect(store.findByTokenHash).not.toHaveBeenCalled();
  });

  it("returns null when the domain session resolver rejects the session", async () => {
    const store: AuthSessionAuthenticationStore = {
      findByTokenHash: vi.fn(async () => null)
    };

    await expect(
      createService(store).resolveCurrentCustomerAccount({
        headers: {
          cookie: "elevenhouse_public_session=raw-session-token"
        }
      })
    ).resolves.toBeNull();
  });

  it("uses the configured production public session cookie name", async () => {
    const store: AuthSessionAuthenticationStore = {
      findByTokenHash: vi.fn(async () => null)
    };

    await expect(
      createService(store, "__Host-elevenhouse_public_session").resolveCurrentCustomerAccount({
        headers: {
          cookie: "__Host-elevenhouse_public_session=raw-session-token"
        }
      })
    ).resolves.toBeNull();
    expect(store.findByTokenHash).toHaveBeenCalledWith(hashSessionToken("raw-session-token"));
  });
});

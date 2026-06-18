import { ConfigService } from "@nestjs/config";
import { hashSessionToken } from "@elevenhouse/auth";
import type { AuthSessionRevocationUnitOfWork } from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";
import { IdentityLogoutService } from "./identity-logout.service";
import type { SystemClock } from "./identity-session.service";

function createService(revocation: AuthSessionRevocationUnitOfWork): IdentityLogoutService {
  const clock: SystemClock = {
    now: vi.fn(() => new Date("2026-06-16T10:00:00.000Z"))
  };
  const configService = {
    getOrThrow: vi.fn((key: string) => {
      if (key === "publicApi.sessionCookieName") {
        return "elevenhouse_public_session";
      }

      throw new Error(`Unexpected config key: ${key}`);
    })
  } as unknown as ConfigService;

  return new IdentityLogoutService(revocation, clock, configService);
}

describe("IdentityLogoutService", () => {
  it("revokes the session referenced by the public session cookie", async () => {
    const revocation: AuthSessionRevocationUnitOfWork = {
      transact: vi.fn(async (operation) =>
        operation({
          findByTokenHash: vi.fn(async () => null),
          revokeSession: vi.fn(),
          recordSecurityEvent: vi.fn()
        })
      )
    };
    const service = createService(revocation);

    await service.logout(
      {
        headers: {
          cookie: "theme=dark; elevenhouse_public_session=raw-session-token"
        }
      },
      {
        ipAddress: "203.0.113.10",
        userAgent: "Mozilla/5.0"
      }
    );

    expect(revocation.transact).toHaveBeenCalledOnce();
  });

  it("does not start a revocation transaction without a public session cookie", async () => {
    const revocation: AuthSessionRevocationUnitOfWork = {
      transact: vi.fn()
    };
    const service = createService(revocation);

    await service.logout({
      headers: {
        cookie: "theme=dark"
      }
    });

    expect(revocation.transact).not.toHaveBeenCalled();
  });

  it("passes the hashed session token into the revocation unit of work", async () => {
    let receivedHash: string | null = null;
    const revocation: AuthSessionRevocationUnitOfWork = {
      transact: vi.fn(async (operation) =>
        operation({
          findByTokenHash: vi.fn(async (tokenHash) => {
            receivedHash = tokenHash;
            return null;
          }),
          revokeSession: vi.fn(),
          recordSecurityEvent: vi.fn()
        })
      )
    };
    const service = createService(revocation);

    await service.logout({
      headers: {
        cookie: "elevenhouse_public_session=raw-session-token"
      }
    });

    expect(receivedHash).toBe(hashSessionToken("raw-session-token"));
  });
});

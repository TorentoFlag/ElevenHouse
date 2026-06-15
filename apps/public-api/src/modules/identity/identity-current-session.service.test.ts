import { hashSessionToken, publicSessionCookieName } from "@elevenhouse/auth";
import type {
  AuthSessionAuthenticationStore,
  AuthenticatedSessionContext
} from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";
import { IdentityCurrentSessionService } from "./identity-current-session.service";
import type { SystemClock } from "./identity-session.service";

function createService(
  store: AuthSessionAuthenticationStore
): IdentityCurrentSessionService {
  const clock: SystemClock = {
    now: vi.fn(() => new Date("2026-06-15T10:00:00.000Z"))
  };

  return new IdentityCurrentSessionService(store, clock);
}

describe("IdentityCurrentSessionService", () => {
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
          cookie: `theme=dark; ${publicSessionCookieName}=raw-session-token; locale=ru`
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
          cookie: `${publicSessionCookieName}=raw-session-token`
        }
      })
    ).resolves.toBeNull();
  });
});

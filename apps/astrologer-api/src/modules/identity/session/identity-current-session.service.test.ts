import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import type {
  AuthSessionAuthenticationStore,
  MobileSessionAuthenticationStore
} from "@elevenhouse/domain";
import {
  IdentityCurrentSessionService,
  readBearerToken,
  type AstrologerSessionRequest
} from "./identity-current-session.service";
import type { SystemClock } from "../../clock/system-clock.service";

const now = new Date("2026-08-12T08:00:00.000Z");
const user = {
  id: "8e14390f-3db1-4d1c-9344-55679c778427",
  status: "active" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

function createService(input: {
  readonly webStore?: AuthSessionAuthenticationStore;
  readonly mobileStore?: MobileSessionAuthenticationStore;
}) {
  return new IdentityCurrentSessionService(
    input.webStore ?? { findByTokenHash: vi.fn(async () => null) },
    input.mobileStore ?? { findByAccessTokenHash: vi.fn(async () => null) },
    { now: () => now } as SystemClock,
    { getOrThrow: vi.fn(() => "elevenhouse_astrologer_session") } as unknown as ConfigService
  );
}

describe("IdentityCurrentSessionService", () => {
  it("accepts a valid mobile bearer token with the same astrologer role contract", async () => {
    const service = createService({
      mobileStore: {
        findByAccessTokenHash: vi.fn(async () => ({
          session: {
            id: "5a14390f-3db1-4d1c-9344-55679c778427",
            userId: user.id,
            platform: "ios" as const,
            deviceLabel: "Anton iPhone",
            status: "active" as const,
            accessTokenHash: "hash",
            accessTokenExpiresAt: "2026-08-12T08:15:00.000Z",
            createdAt: "2026-08-12T07:00:00.000Z",
            lastUsedAt: "2026-08-12T07:00:00.000Z",
            expiresAt: "2027-02-08T08:00:00.000Z"
          },
          user,
          roleAssignments: [
            {
              id: "9e14390f-3db1-4d1c-9344-55679c778427",
              userId: user.id,
              role: "astrologer" as const,
              assignedAt: "2026-01-01T00:00:00.000Z"
            }
          ]
        }))
      }
    });
    const request: AstrologerSessionRequest = {
      headers: { authorization: "Bearer mobile-access-token" }
    };

    await expect(service.resolveCurrentAstrologerAccount(request)).resolves.toEqual({
      account: { id: user.id, status: "active", roles: ["astrologer"] }
    });
    expect(request.currentMobileSessionId).toBe("5a14390f-3db1-4d1c-9344-55679c778427");
  });

  it("does not fall back to a valid cookie when Authorization is malformed", async () => {
    const webStore: AuthSessionAuthenticationStore = { findByTokenHash: vi.fn(async () => null) };
    const service = createService({ webStore });

    await expect(
      service.resolveCurrentAstrologerAccount({
        headers: {
          authorization: "Basic credentials",
          cookie: "elevenhouse_astrologer_session=valid-web-token"
        }
      })
    ).resolves.toBeNull();
    expect(webStore.findByTokenHash).not.toHaveBeenCalled();
  });

  it("parses only a complete Bearer authorization value", () => {
    expect(readBearerToken("Bearer token-value")).toBe("token-value");
    expect(readBearerToken("Bearer")).toBeNull();
    expect(readBearerToken("Basic token-value")).toBeNull();
  });
});

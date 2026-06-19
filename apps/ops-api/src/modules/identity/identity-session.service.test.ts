import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import type { OpsCsrfTokenService } from "../security/csrf/ops-csrf-token.service";
import { OpsSessionCookieService } from "./identity-session.service";

describe("OpsSessionCookieService", () => {
  it("sets the ops session cookie and paired CSRF cookie", () => {
    const csrfTokenService = {
      setCsrfCookie: vi.fn(),
      clearCsrfCookie: vi.fn()
    } as unknown as OpsCsrfTokenService;
    const service = new OpsSessionCookieService(createConfigService(), csrfTokenService);
    const response = {
      cookie: vi.fn()
    };

    service.setSessionCookie(response, {
      token: "raw-session-token",
      expiresAt: "2026-06-23T10:00:00.000Z"
    });

    expect(response.cookie).toHaveBeenCalledWith("elevenhouse_ops_session", "raw-session-token", {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      expires: new Date("2026-06-23T10:00:00.000Z"),
      maxAge: 604800000
    });
    expect(csrfTokenService.setCsrfCookie).toHaveBeenCalledWith({
      response,
      sessionToken: "raw-session-token",
      sessionExpiresAt: "2026-06-23T10:00:00.000Z"
    });
  });

  it("clears the ops session and CSRF cookies", () => {
    const csrfTokenService = {
      setCsrfCookie: vi.fn(),
      clearCsrfCookie: vi.fn()
    } as unknown as OpsCsrfTokenService;
    const service = new OpsSessionCookieService(createConfigService(), csrfTokenService);
    const response = {
      cookie: vi.fn()
    };

    service.clearSessionCookie(response);

    expect(response.cookie).toHaveBeenCalledWith("elevenhouse_ops_session", "", {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      expires: new Date(0),
      maxAge: 0
    });
    expect(csrfTokenService.clearCsrfCookie).toHaveBeenCalledWith(response);
  });
});

function createConfigService(): ConfigService {
  return {
    getOrThrow: vi.fn((key: string) => {
      if (key === "opsApi.sessionTtlSeconds") {
        return 604800;
      }

      if (key === "opsApi.sessionCookieSecure") {
        return false;
      }

      if (key === "opsApi.sessionCookieName") {
        return "elevenhouse_ops_session";
      }

      throw new Error(`Unexpected config key: ${key}`);
    })
  } as unknown as ConfigService;
}

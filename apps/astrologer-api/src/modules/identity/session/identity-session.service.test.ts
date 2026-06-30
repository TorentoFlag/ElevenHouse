import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import type { AstrologerCsrfTokenService } from "../../security/csrf/astrologer-csrf-token.service";
import { AstrologerSessionCookieService } from "./identity-session.service";

describe("AstrologerSessionCookieService", () => {
  it("sets the astrologer session cookie and paired CSRF cookie", () => {
    const csrfTokenService = {
      setCsrfCookie: vi.fn(),
      clearCsrfCookie: vi.fn()
    } as unknown as AstrologerCsrfTokenService;
    const service = new AstrologerSessionCookieService(
      createConfigService(),
      csrfTokenService,
      createClock()
    );
    const response = {
      cookie: vi.fn()
    };

    service.setSessionCookie(response, {
      token: "raw-session-token",
      expiresAt: "2026-06-23T10:00:00.000Z"
    });

    expect(response.cookie).toHaveBeenCalledWith("elevenhouse_astrologer_session", "raw-session-token", {
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
      sessionExpiresAt: "2026-06-23T10:00:00.000Z",
      now: new Date("2026-06-16T10:00:00.000Z")
    });
  });

  it("clears the astrologer session and CSRF cookies", () => {
    const csrfTokenService = {
      setCsrfCookie: vi.fn(),
      clearCsrfCookie: vi.fn()
    } as unknown as AstrologerCsrfTokenService;
    const service = new AstrologerSessionCookieService(
      createConfigService(),
      csrfTokenService,
      createClock()
    );
    const response = {
      cookie: vi.fn()
    };

    service.clearSessionCookie(response);

    expect(response.cookie).toHaveBeenCalledWith("elevenhouse_astrologer_session", "", {
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
      if (key === "astrologerApi.sessionTtlSeconds") {
        return 604800;
      }

      if (key === "astrologerApi.sessionCookieSecure") {
        return false;
      }

      if (key === "astrologerApi.sessionCookieName") {
        return "elevenhouse_astrologer_session";
      }

      throw new Error(`Unexpected config key: ${key}`);
    })
  } as unknown as ConfigService;
}

function createClock() {
  return {
    now: () => new Date("2026-06-16T10:00:00.000Z")
  };
}

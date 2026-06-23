import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import { PublicSessionCookieService } from "./identity-session.service";
import type { PublicCsrfTokenService } from "../../security/csrf/public-csrf-token.service";
import type { SystemClock } from "../../../common/system-clock.js";

function createCsrfTokenService(): PublicCsrfTokenService {
  return {
    setCsrfCookie: vi.fn(),
    clearCsrfCookie: vi.fn()
  } as unknown as PublicCsrfTokenService;
}

describe("PublicSessionCookieService", () => {
  const now = new Date("2026-06-16T10:00:00.000Z");

  function createClock(): SystemClock {
    return {
      now: vi.fn(() => now)
    };
  }

  it("sets the public session cookie with security options from runtime config", () => {
    const csrfTokenService = createCsrfTokenService();
    const configService = {
      getOrThrow: vi.fn((key: string) => {
        if (key === "publicApi.sessionTtlSeconds") {
          return 604800;
        }

        if (key === "publicApi.sessionCookieSecure") {
          return true;
        }

        if (key === "publicApi.sessionCookieName") {
          return "__Host-elevenhouse_public_session";
        }

        throw new Error(`Unexpected config key: ${key}`);
      })
    } as unknown as ConfigService;
    const response = {
      cookie: vi.fn()
    };
    const service = new PublicSessionCookieService(
      configService,
      csrfTokenService,
      createClock()
    );

    service.setSessionCookie(response, {
      token: "raw-session-token",
      expiresAt: "2026-06-21T10:00:00.000Z"
    });

    expect(response.cookie).toHaveBeenCalledWith(
      "__Host-elevenhouse_public_session",
      "raw-session-token",
      {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        expires: new Date("2026-06-21T10:00:00.000Z"),
        maxAge: 604800000
      }
    );
    expect(csrfTokenService.setCsrfCookie).toHaveBeenCalledWith({
      response,
      sessionToken: "raw-session-token",
      sessionExpiresAt: "2026-06-21T10:00:00.000Z",
      now
    });
  });

  it("sets the local development public session cookie without the __Host prefix", () => {
    const csrfTokenService = createCsrfTokenService();
    const configService = {
      getOrThrow: vi.fn((key: string) => {
        if (key === "publicApi.sessionTtlSeconds") {
          return 604800;
        }

        if (key === "publicApi.sessionCookieSecure") {
          return false;
        }

        if (key === "publicApi.sessionCookieName") {
          return "elevenhouse_public_session";
        }

        throw new Error(`Unexpected config key: ${key}`);
      })
    } as unknown as ConfigService;
    const response = {
      cookie: vi.fn()
    };
    const service = new PublicSessionCookieService(
      configService,
      csrfTokenService,
      createClock()
    );

    service.setSessionCookie(response, {
      token: "raw-session-token",
      expiresAt: "2026-06-21T10:00:00.000Z"
    });

    expect(response.cookie).toHaveBeenCalledWith(
      "elevenhouse_public_session",
      "raw-session-token",
      {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/",
        expires: new Date("2026-06-21T10:00:00.000Z"),
        maxAge: 604800000
      }
    );
    expect(csrfTokenService.setCsrfCookie).toHaveBeenCalledWith({
      response,
      sessionToken: "raw-session-token",
      sessionExpiresAt: "2026-06-21T10:00:00.000Z",
      now
    });
  });

  it("clears the public session cookie", () => {
    const csrfTokenService = createCsrfTokenService();
    const service = new PublicSessionCookieService(
      {
        getOrThrow: (key: string) => {
          if (key === "publicApi.sessionCookieSecure") {
            return false;
          }

          if (key === "publicApi.sessionCookieName") {
            return "elevenhouse_public_session";
          }

          throw new Error(`Unexpected config key: ${key}`);
        }
      } as unknown as ConfigService,
      csrfTokenService,
      createClock()
    );
    const response = {
      cookie: vi.fn()
    };

    service.clearSessionCookie(response);

    expect(response.cookie).toHaveBeenCalledWith(
      "elevenhouse_public_session",
      "",
      {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/",
        expires: new Date(0),
        maxAge: 0
      }
    );
    expect(csrfTokenService.clearCsrfCookie).toHaveBeenCalledWith(response);
  });
});

import { ForbiddenException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import { OpsCsrfTokenService } from "./ops-csrf-token.service";

function createService(): OpsCsrfTokenService {
  return new OpsCsrfTokenService({
    getOrThrow: vi.fn((key: string) => {
      if (key === "opsApi.csrfSecret") {
        return "test-ops-csrf-secret-with-enough-entropy";
      }

      if (key === "opsApi.csrfCookieName") {
        return "elevenhouse_ops_csrf";
      }

      if (key === "opsApi.csrfHeaderName") {
        return "x-csrf-token";
      }

      if (key === "opsApi.csrfTokenTtlSeconds") {
        return 600;
      }

      if (key === "opsApi.sessionCookieSecure") {
        return false;
      }

      if (key === "opsApi.allowedOrigins") {
        return ["https://ops.elevenhouse.test"];
      }

      throw new Error(`Unexpected config key: ${key}`);
    })
  } as unknown as ConfigService);
}

describe("OpsCsrfTokenService", () => {
  it("sets a readable signed CSRF cookie and accepts the matching header", () => {
    const service = createService();
    const response = {
      cookie: vi.fn()
    };
    const token = service.setCsrfCookie({
      response,
      sessionToken: "raw-session-token",
      sessionExpiresAt: "2026-06-16T10:10:00.000Z",
      now: new Date("2026-06-16T10:00:00.000Z")
    });

    expect(response.cookie).toHaveBeenCalledWith(
      "elevenhouse_ops_csrf",
      token,
      {
        httpOnly: false,
        secure: false,
        sameSite: "lax",
        path: "/",
        expires: new Date("2026-06-16T10:10:00.000Z"),
        maxAge: 600000
      }
    );
    expect(() =>
      service.assertValidRequest({
        request: {
          headers: {
            cookie: `elevenhouse_ops_csrf=${token}`,
            origin: "https://ops.elevenhouse.test",
            "x-csrf-token": token
          }
        },
        sessionToken: "raw-session-token",
        now: new Date("2026-06-16T10:01:00.000Z")
      })
    ).not.toThrow();
  });

  it("rejects tokens from untrusted origins", () => {
    const service = createService();
    const token = service.setCsrfCookie({
      response: { cookie: vi.fn() },
      sessionToken: "raw-session-token",
      sessionExpiresAt: "2026-06-16T10:10:00.000Z",
      now: new Date("2026-06-16T10:00:00.000Z")
    });

    expect(() =>
      service.assertValidRequest({
        request: {
          headers: {
            cookie: `elevenhouse_ops_csrf=${token}`,
            origin: "https://attacker.test",
            "x-csrf-token": token
          }
        },
        sessionToken: "raw-session-token",
        now: new Date("2026-06-16T10:01:00.000Z")
      })
    ).toThrow(ForbiddenException);
  });

  it("rejects tokens signed for another session", () => {
    const service = createService();
    const token = service.setCsrfCookie({
      response: { cookie: vi.fn() },
      sessionToken: "raw-session-token",
      sessionExpiresAt: "2026-06-16T10:10:00.000Z",
      now: new Date("2026-06-16T10:00:00.000Z")
    });

    expect(() =>
      service.assertValidRequest({
        request: {
          headers: {
            cookie: `elevenhouse_ops_csrf=${token}`,
            origin: "https://ops.elevenhouse.test",
            "x-csrf-token": token
          }
        },
        sessionToken: "another-session-token",
        now: new Date("2026-06-16T10:01:00.000Z")
      })
    ).toThrow(ForbiddenException);
  });

  it("rejects mismatched CSRF cookie and header tokens", () => {
    const service = createService();
    const token = service.setCsrfCookie({
      response: { cookie: vi.fn() },
      sessionToken: "raw-session-token",
      sessionExpiresAt: "2026-06-16T10:10:00.000Z",
      now: new Date("2026-06-16T10:00:00.000Z")
    });

    expect(() =>
      service.assertValidRequest({
        request: {
          headers: {
            cookie: `elevenhouse_ops_csrf=${token}`,
            origin: "https://ops.elevenhouse.test",
            "x-csrf-token": `${token}-tampered`
          }
        },
        sessionToken: "raw-session-token",
        now: new Date("2026-06-16T10:01:00.000Z")
      })
    ).toThrow(ForbiddenException);
  });
});

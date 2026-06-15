import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import { PublicSessionCookieService } from "./identity-session.service";

describe("PublicSessionCookieService", () => {
  it("sets the public session cookie with security options from runtime config", () => {
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
    const service = new PublicSessionCookieService(configService);

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
  });

  it("sets the local development public session cookie without the __Host prefix", () => {
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
    const service = new PublicSessionCookieService(configService);

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
  });
});

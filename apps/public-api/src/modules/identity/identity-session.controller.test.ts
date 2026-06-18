import { describe, expect, it, vi } from "vitest";
import type { IdentityLogoutService } from "./identity-logout.service";
import { IdentitySessionController } from "./identity-session.controller";
import type { PublicSessionCookieService } from "./identity-session.service";

describe("IdentitySessionController", () => {
  it("revokes the current session and clears the public session cookie", async () => {
    const logoutService: IdentityLogoutService = {
      logout: vi.fn(async () => undefined)
    } as unknown as IdentityLogoutService;
    const cookieService: PublicSessionCookieService = {
      setSessionCookie: vi.fn(),
      clearSessionCookie: vi.fn()
    } as unknown as PublicSessionCookieService;
    const controller = new IdentitySessionController(logoutService, cookieService);
    const request = {
      ip: "203.0.113.10",
      headers: {
        cookie: "elevenhouse_public_session=raw-session-token",
        "user-agent": "Mozilla/5.0"
      }
    };
    const response = {
      cookie: vi.fn()
    };

    await expect(controller.logout(request, response)).resolves.toBeUndefined();

    expect(logoutService.logout).toHaveBeenCalledWith(request, {
      ipAddress: "203.0.113.10",
      userAgent: "Mozilla/5.0"
    });
    expect(cookieService.clearSessionCookie).toHaveBeenCalledWith(response);
  });
});

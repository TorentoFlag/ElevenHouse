import type {
  RequestPasswordlessCodeRequest,
  RequestPasswordlessCodeResponse,
  VerifyPasswordlessCodeResponse
} from "@elevenhouse/contracts";
import { describe, expect, it, vi } from "vitest";
import { IdentityPasswordlessController } from "./identity-passwordless.controller";
import type { IdentityPasswordlessService } from "./identity-passwordless.service";
import type { PublicSessionCookieService } from "./identity-session.service";

describe("IdentityPasswordlessController", () => {
  it("delegates passwordless code requests without setting a session cookie", async () => {
    const response: RequestPasswordlessCodeResponse = {
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      channel: "email",
      maskedIdentifier: "c***@example.com",
      expiresAt: "2026-06-16T10:10:00.000Z",
      resendAvailableAt: "2026-06-16T10:01:00.000Z"
    };
    const service: IdentityPasswordlessService = {
      requestCode: vi.fn(async () => response),
      verifyCode: vi.fn()
    } as unknown as IdentityPasswordlessService;
    const cookieService: PublicSessionCookieService = {
      setSessionCookie: vi.fn()
    } as unknown as PublicSessionCookieService;
    const controller = new IdentityPasswordlessController(service, cookieService);
    const body: RequestPasswordlessCodeRequest = {
      channel: "email",
      identifier: "client@example.com",
      roles: ["client"]
    };

    await expect(controller.requestCode(body)).resolves.toEqual(response);

    expect(service.requestCode).toHaveBeenCalledWith(body);
    expect(cookieService.setSessionCookie).not.toHaveBeenCalled();
  });

  it("sets the public session cookie after successful code verification", async () => {
    const response: VerifyPasswordlessCodeResponse = {
      account: {
        id: "8e14390f-3db1-4d1c-9344-55679c778427",
        status: "active",
        roles: ["client"]
      }
    };
    const service: IdentityPasswordlessService = {
      requestCode: vi.fn(),
      verifyCode: vi.fn(async () => ({
        response,
        session: {
          token: "raw-session-token",
          expiresAt: "2026-06-23T10:00:00.000Z"
        }
      }))
    } as unknown as IdentityPasswordlessService;
    const cookieService: PublicSessionCookieService = {
      setSessionCookie: vi.fn()
    } as unknown as PublicSessionCookieService;
    const controller = new IdentityPasswordlessController(service, cookieService);
    const httpResponse = {
      cookie: vi.fn()
    };
    const body = {
      challengeId: "e28cbfe7-414b-4d80-a410-1e3f00a380a7",
      code: "123456"
    };

    await expect(controller.verifyCode(body, httpResponse)).resolves.toEqual(response);

    expect(service.verifyCode).toHaveBeenCalledWith(body);
    expect(cookieService.setSessionCookie).toHaveBeenCalledWith(httpResponse, {
      token: "raw-session-token",
      expiresAt: "2026-06-23T10:00:00.000Z"
    });
  });
});

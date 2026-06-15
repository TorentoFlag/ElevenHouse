import type {
  RegisterCustomerAccountRequest,
  RegisterCustomerAccountResponse
} from "@elevenhouse/contracts";
import { describe, expect, it, vi } from "vitest";
import { IdentityRegistrationController } from "./identity-registration.controller";
import type { DomainCustomerAccountRegistrationHandler } from "./identity-registration.handler";
import { IdentityRegistrationService } from "./identity-registration.service";
import type { PublicSessionCookieService } from "./identity-session.service";

describe("IdentityRegistrationController", () => {
  it("delegates public registration requests to the identity registration service", async () => {
    const response: RegisterCustomerAccountResponse = {
      account: {
        id: "8e14390f-3db1-4d1c-9344-55679c778427",
        status: "active",
        roles: ["client"]
      }
    };
    const handler = {
      registerCustomerAccount: vi.fn(async () => ({
        response,
        session: {
          token: "raw-session-token",
          expiresAt: "2026-06-21T10:00:00.000Z"
        }
      }))
    };
    const service = new IdentityRegistrationService(
      handler as unknown as DomainCustomerAccountRegistrationHandler
    );
    const cookieService: PublicSessionCookieService = {
      setSessionCookie: vi.fn()
    } as unknown as PublicSessionCookieService;
    const serviceSpy = vi.spyOn(service, "registerCustomerAccount");
    const controller = new IdentityRegistrationController(service, cookieService);
    const httpResponse = {
      cookie: vi.fn()
    };
    const body: RegisterCustomerAccountRequest = {
      email: "client@example.com",
      password: "correct-horse-battery-staple",
      roles: ["client"]
    };

    await expect(controller.registerCustomerAccount(body, httpResponse)).resolves.toEqual(response);
    expect(serviceSpy).toHaveBeenCalledWith(body);
    expect(cookieService.setSessionCookie).toHaveBeenCalledWith(httpResponse, {
      token: "raw-session-token",
      expiresAt: "2026-06-21T10:00:00.000Z"
    });
    expect(handler.registerCustomerAccount).toHaveBeenCalledWith({
      email: "client@example.com",
      password: "correct-horse-battery-staple",
      roles: ["client"]
    });
  });
});

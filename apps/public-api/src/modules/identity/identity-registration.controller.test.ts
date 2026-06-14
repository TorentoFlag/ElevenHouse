import type {
  RegisterCustomerAccountRequest,
  RegisterCustomerAccountResponse
} from "@elevenhouse/contracts";
import { describe, expect, it, vi } from "vitest";
import { IdentityRegistrationController } from "./identity-registration.controller";
import type { DomainCustomerAccountRegistrationHandler } from "./identity-registration.handler";
import { IdentityRegistrationService } from "./identity-registration.service";

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
      registerCustomerAccount: vi.fn(async () => response)
    };
    const service = new IdentityRegistrationService(
      handler as unknown as DomainCustomerAccountRegistrationHandler
    );
    const serviceSpy = vi.spyOn(service, "registerCustomerAccount");
    const controller = new IdentityRegistrationController(service);
    const body: RegisterCustomerAccountRequest = {
      email: "client@example.com",
      password: "correct-horse-battery-staple",
      roles: ["client"]
    };

    await expect(controller.registerCustomerAccount(body)).resolves.toEqual(response);
    expect(serviceSpy).toHaveBeenCalledWith(body);
    expect(handler.registerCustomerAccount).toHaveBeenCalledWith({
      email: "client@example.com",
      password: "correct-horse-battery-staple",
      roles: ["client"]
    });
  });
});

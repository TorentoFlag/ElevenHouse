import { BadRequestException } from "@nestjs/common";
import type {
  RegisterCustomerAccountRequest,
  RegisterCustomerAccountResponse
} from "@elevenhouse/contracts";
import { describe, expect, it, vi } from "vitest";
import type { DomainCustomerAccountRegistrationHandler } from "./identity-registration.handler";
import { IdentityRegistrationService } from "./identity-registration.service";

describe("IdentityRegistrationService", () => {
  it("normalizes a public registration request and returns a contract-valid response", async () => {
    const registrationResponse = {
      account: {
        id: "8e14390f-3db1-4d1c-9344-55679c778427",
        status: "active",
        roles: ["client", "astrologer"]
      }
    } satisfies RegisterCustomerAccountResponse;
    const handler = {
      registerCustomerAccount: vi.fn(async () => registrationResponse)
    };
    const service = new IdentityRegistrationService(
      handler as unknown as DomainCustomerAccountRegistrationHandler
    );

    const response = await service.registerCustomerAccount({
      email: "  CLIENT@example.COM ",
      password: "correct-horse-battery-staple",
      roles: ["client", "astrologer"]
    });

    expect(handler.registerCustomerAccount).toHaveBeenCalledWith({
      email: "client@example.com",
      password: "correct-horse-battery-staple",
      roles: ["client", "astrologer"]
    });
    expect(response).toEqual({
      account: {
        id: "8e14390f-3db1-4d1c-9344-55679c778427",
        status: "active",
        roles: ["client", "astrologer"]
      }
    });
  });

  it("rejects invalid public registration requests before calling the handler", async () => {
    const handler = {
      registerCustomerAccount: vi.fn()
    };
    const service = new IdentityRegistrationService(
      handler as unknown as DomainCustomerAccountRegistrationHandler
    );

    await expect(
      service.registerCustomerAccount({
        email: "client@example.com",
        password: "correct-horse-battery-staple",
        roles: ["admin"]
      } as unknown as RegisterCustomerAccountRequest)
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(handler.registerCustomerAccount).not.toHaveBeenCalled();
  });
});

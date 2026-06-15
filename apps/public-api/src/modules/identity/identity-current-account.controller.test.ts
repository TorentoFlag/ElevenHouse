import type { AuthenticatedCustomerAccountResponse } from "@elevenhouse/contracts";
import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { IdentityCurrentAccountController } from "./identity-current-account.controller";
import type { PublicSessionRequest } from "./identity-current-session.service";

describe("IdentityCurrentAccountController", () => {
  it("returns the current customer account from the authenticated request", () => {
    const currentCustomerAccount: AuthenticatedCustomerAccountResponse = {
      account: {
        id: "8e14390f-3db1-4d1c-9344-55679c778427",
        status: "active",
        roles: ["client"]
      }
    };
    const request: PublicSessionRequest = {
      headers: {},
      currentCustomerAccount
    };

    expect(new IdentityCurrentAccountController().getCurrentCustomerAccount(request)).toEqual(
      currentCustomerAccount
    );
  });

  it("rejects requests that did not pass through the public session guard", () => {
    const request: PublicSessionRequest = {
      headers: {}
    };

    expect(() =>
      new IdentityCurrentAccountController().getCurrentCustomerAccount(request)
    ).toThrow(UnauthorizedException);
  });
});

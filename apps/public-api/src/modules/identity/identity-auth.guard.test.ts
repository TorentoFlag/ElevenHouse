import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PublicSessionAuthGuard } from "./identity-auth.guard";
import type {
  IdentityCurrentSessionService,
  PublicSessionRequest
} from "./identity-current-session.service";

function createExecutionContext(request: PublicSessionRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request
    })
  } as unknown as ExecutionContext;
}

describe("PublicSessionAuthGuard", () => {
  it("attaches the current account to the request for a valid public session", async () => {
    const currentAccount = {
      account: {
        id: "8e14390f-3db1-4d1c-9344-55679c778427",
        status: "active",
        roles: ["client"]
      }
    } as const;
    const service: IdentityCurrentSessionService = {
      resolveCurrentCustomerAccount: vi.fn(async () => currentAccount)
    } as unknown as IdentityCurrentSessionService;
    const request: PublicSessionRequest = {
      headers: {
        cookie: "__Host-elevenhouse_public_session=raw-session-token"
      }
    };

    await expect(
      new PublicSessionAuthGuard(service).canActivate(createExecutionContext(request))
    ).resolves.toBe(true);
    expect(request.currentCustomerAccount).toEqual(currentAccount);
    expect(service.resolveCurrentCustomerAccount).toHaveBeenCalledWith(request);
  });

  it("rejects requests without a valid public session", async () => {
    const service: IdentityCurrentSessionService = {
      resolveCurrentCustomerAccount: vi.fn(async () => null)
    } as unknown as IdentityCurrentSessionService;

    await expect(
      new PublicSessionAuthGuard(service).canActivate(
        createExecutionContext({
          headers: {}
        })
      )
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

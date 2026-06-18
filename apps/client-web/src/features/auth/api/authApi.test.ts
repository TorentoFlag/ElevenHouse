import type {
  AuthenticatedCustomerAccountResponse,
  RequestPasswordlessCodeResponse
} from "@elevenhouse/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { application } from "../../../Application";
import { getCurrentAccount } from "./getCurrentAccount";
import { logout } from "./logout";
import { requestPasswordlessCode } from "./requestPasswordlessCode";
import { verifyPasswordlessCode } from "./verifyPasswordlessCode";

const accountResponse = {
  account: {
    id: "8e14390f-3db1-4d1c-9344-55679c778427",
    status: "active",
    roles: ["client"]
  }
} satisfies AuthenticatedCustomerAccountResponse;

const challengeResponse = {
  challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
  channel: "email",
  maskedIdentifier: "c***@example.com",
  expiresAt: "2026-06-16T10:10:00.000Z",
  resendAvailableAt: "2026-06-16T10:01:00.000Z"
} satisfies RequestPasswordlessCodeResponse;

describe("auth API", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requests a passwordless code with a contract-normalized request", async () => {
    const post = vi.spyOn(application.http, "post").mockResolvedValue(challengeResponse);

    await expect(
      requestPasswordlessCode({
        channel: "email",
        identifier: " CLIENT@example.COM ",
        roles: ["client"]
      })
    ).resolves.toEqual(challengeResponse);

    expect(post).toHaveBeenCalledWith("/identity/passwordless/request-code", {
      channel: "email",
      identifier: "client@example.com",
      roles: ["client"]
    });
  });

  it("verifies a passwordless code and returns the authenticated account", async () => {
    const post = vi.spyOn(application.http, "post").mockResolvedValue(accountResponse);

    await expect(
      verifyPasswordlessCode({
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        code: "123456"
      })
    ).resolves.toEqual(accountResponse);

    expect(post).toHaveBeenCalledWith("/identity/passwordless/verify-code", {
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      code: "123456"
    });
  });

  it("loads the current authenticated account", async () => {
    const get = vi.spyOn(application.http, "get").mockResolvedValue(accountResponse);

    await expect(getCurrentAccount()).resolves.toEqual(accountResponse);

    expect(get).toHaveBeenCalledWith("/identity/me");
  });

  it("logs out through the public identity endpoint", async () => {
    const post = vi.spyOn(application.http, "post").mockResolvedValue(undefined);

    await expect(logout()).resolves.toBeUndefined();

    expect(post).toHaveBeenCalledWith("/identity/logout");
  });
});

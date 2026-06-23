import type {
  AuthenticatedAstrologerAccountResponse,
  RegisteredAstrologerAccountResponse,
  RequestAstrologerPasswordlessCodeResponse
} from "@elevenhouse/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { application } from "../../../Application";
import { getCurrentAccount } from "./getCurrentAccount";
import { logout } from "./logout";
import { requestPasswordlessCode } from "./requestPasswordlessCode";
import { verifyPasswordlessCode } from "./verifyPasswordlessCode";
import { verifyRegistrationPasswordlessCode } from "./verifyRegistrationPasswordlessCode";

const accountResponse = {
  account: {
    id: "8e14390f-3db1-4d1c-9344-55679c778427",
    status: "active",
    roles: ["astrologer"]
  }
} satisfies AuthenticatedAstrologerAccountResponse;

const challengeResponse = {
  challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
  channel: "email",
  maskedIdentifier: "a***@example.com",
  expiresAt: "2026-06-16T10:10:00.000Z",
  resendAvailableAt: "2026-06-16T10:01:00.000Z"
} satisfies RequestAstrologerPasswordlessCodeResponse;

const registeredAccountResponse = {
  account: {
    id: "8e14390f-3db1-4d1c-9344-55679c778427",
    status: "active",
    roles: ["astrologer"],
    displayName: "Анна"
  }
} satisfies RegisteredAstrologerAccountResponse;

describe("astrologer auth API", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requests an astrologer passwordless code without caller-controlled roles", async () => {
    const post = vi.spyOn(application.http, "post").mockResolvedValue(challengeResponse);

    await expect(
      requestPasswordlessCode({
        channel: "email",
        identifier: " ASTROLOGER@example.COM "
      })
    ).resolves.toEqual(challengeResponse);

    expect(post).toHaveBeenCalledWith("/identity/astrologer/passwordless/request-code", {
      channel: "email",
      identifier: "astrologer@example.com"
    });
  });

  it("verifies an astrologer passwordless login code", async () => {
    const post = vi.spyOn(application.http, "post").mockResolvedValue(accountResponse);

    await expect(
      verifyPasswordlessCode({
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        code: "123456"
      })
    ).resolves.toEqual(accountResponse);

    expect(post).toHaveBeenCalledWith("/identity/astrologer/passwordless/verify-code", {
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      code: "123456"
    });
  });

  it("verifies an astrologer registration passwordless code", async () => {
    const post = vi.spyOn(application.http, "post").mockResolvedValue(registeredAccountResponse);

    await expect(
      verifyRegistrationPasswordlessCode({
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        code: "123456",
        displayName: " Анна "
      })
    ).resolves.toEqual(registeredAccountResponse);

    expect(post).toHaveBeenCalledWith(
      "/identity/astrologer/registration/passwordless/verify-code",
      {
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        code: "123456",
        displayName: "Анна"
      }
    );
  });

  it("loads and logs out through the astrologer identity endpoints", async () => {
    const get = vi.spyOn(application.http, "get").mockResolvedValue(accountResponse);
    const post = vi.spyOn(application.http, "post").mockResolvedValue(undefined);

    await expect(getCurrentAccount()).resolves.toEqual(accountResponse);
    await expect(logout()).resolves.toBeUndefined();

    expect(get).toHaveBeenCalledWith("/identity/me");
    expect(post).toHaveBeenCalledWith("/identity/logout", undefined, { csrf: true });
  });
});

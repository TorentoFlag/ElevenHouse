import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common";
import type {
  RequestPasswordlessCodeRequest,
  VerifyPasswordlessCodeRequest
} from "@elevenhouse/contracts";
import {
  CustomerAccountIdentityConflictError,
  PasswordlessCodeDeliveryUnavailableError,
  PasswordlessCodeRequestCooldownError,
  PasswordlessCodeVerificationError
} from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";
import type { DomainPasswordlessAuthHandler } from "./identity-passwordless.handler";
import { IdentityPasswordlessService } from "./identity-passwordless.service";

describe("IdentityPasswordlessService", () => {
  it("normalizes a passwordless code request and returns a contract-valid response", async () => {
    const codeResponse = {
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      channel: "email" as const,
      maskedIdentifier: "c***@example.com",
      expiresAt: "2026-06-16T10:10:00.000Z",
      resendAvailableAt: "2026-06-16T10:01:00.000Z"
    };
    const handler = {
      requestCode: vi.fn(async () => codeResponse),
      verifyCode: vi.fn()
    };
    const service = new IdentityPasswordlessService(
      handler as unknown as DomainPasswordlessAuthHandler
    );

    const response = await service.requestCode({
      channel: "email",
      identifier: "  CLIENT@example.COM ",
      roles: ["client", "astrologer"]
    });

    expect(handler.requestCode).toHaveBeenCalledWith({
      channel: "email",
      identifier: "client@example.com",
      roles: ["client", "astrologer"]
    });
    expect(response).toEqual(codeResponse);
  });

  it("normalizes phone identifiers for passwordless code requests", async () => {
    const handler = {
      requestCode: vi.fn(async () => ({
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        channel: "phone" as const,
        maskedIdentifier: "+1******90",
        expiresAt: "2026-06-16T10:10:00.000Z",
        resendAvailableAt: "2026-06-16T10:01:00.000Z"
      })),
      verifyCode: vi.fn()
    };
    const service = new IdentityPasswordlessService(
      handler as unknown as DomainPasswordlessAuthHandler
    );

    await service.requestCode({
      channel: "phone",
      identifier: "+1 (555) 123-4090",
      roles: ["client"]
    });

    expect(handler.requestCode).toHaveBeenCalledWith({
      channel: "phone",
      identifier: "+15551234090",
      roles: ["client"]
    });
  });

  it("rejects invalid passwordless code requests before calling the handler", async () => {
    const handler = {
      requestCode: vi.fn(),
      verifyCode: vi.fn()
    };
    const service = new IdentityPasswordlessService(
      handler as unknown as DomainPasswordlessAuthHandler
    );

    await expect(
      service.requestCode({
        channel: "email",
        identifier: "client@example.com",
        roles: ["admin"]
      } as unknown as RequestPasswordlessCodeRequest)
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(handler.requestCode).not.toHaveBeenCalled();
  });

  it("maps delivery failures to service unavailable responses", async () => {
    const handler = {
      requestCode: vi.fn(async () => {
        throw new PasswordlessCodeDeliveryUnavailableError();
      }),
      verifyCode: vi.fn()
    };
    const service = new IdentityPasswordlessService(
      handler as unknown as DomainPasswordlessAuthHandler
    );

    await expect(
      service.requestCode({
        channel: "email",
        identifier: "client@example.com",
        roles: ["client"]
      })
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("maps resend cooldowns to too many requests responses", async () => {
    const handler = {
      requestCode: vi.fn(async () => {
        throw new PasswordlessCodeRequestCooldownError("2026-06-16T10:01:00.000Z");
      }),
      verifyCode: vi.fn()
    };
    const service = new IdentityPasswordlessService(
      handler as unknown as DomainPasswordlessAuthHandler
    );

    let error: unknown;

    try {
      await service.requestCode({
        channel: "email",
        identifier: "client@example.com",
        roles: ["client"]
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect((error as HttpException).getResponse()).toEqual({
      message: "Passwordless code request is on cooldown",
      resendAvailableAt: "2026-06-16T10:01:00.000Z"
    });
  });

  it("verifies a code and returns a contract-valid response with session metadata", async () => {
    const handler = {
      requestCode: vi.fn(),
      verifyCode: vi.fn(async () => ({
        response: {
          account: {
            id: "8e14390f-3db1-4d1c-9344-55679c778427",
            status: "active" as const,
            roles: ["client" as const]
          }
        },
        session: {
          token: "raw-session-token",
          expiresAt: "2026-06-23T10:00:00.000Z"
        }
      }))
    };
    const service = new IdentityPasswordlessService(
      handler as unknown as DomainPasswordlessAuthHandler
    );
    const request: VerifyPasswordlessCodeRequest = {
      challengeId: "e28cbfe7-414b-4d80-a410-1e3f00a380a7",
      code: "123456"
    };

    await expect(service.verifyCode(request)).resolves.toEqual({
      response: {
        account: {
          id: "8e14390f-3db1-4d1c-9344-55679c778427",
          status: "active",
          roles: ["client"]
        }
      },
      session: {
        token: "raw-session-token",
        expiresAt: "2026-06-23T10:00:00.000Z"
      }
    });
    expect(handler.verifyCode).toHaveBeenCalledWith(request);
  });

  it("rejects invalid verify requests before calling the handler", async () => {
    const handler = {
      requestCode: vi.fn(),
      verifyCode: vi.fn()
    };
    const service = new IdentityPasswordlessService(
      handler as unknown as DomainPasswordlessAuthHandler
    );

    await expect(
      service.verifyCode({
        challengeId: "e28cbfe7-414b-4d80-a410-1e3f00a380a7",
        code: "123"
      } as unknown as VerifyPasswordlessCodeRequest)
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(handler.verifyCode).not.toHaveBeenCalled();
  });

  it("maps invalid or expired codes to unauthorized responses", async () => {
    const handler = {
      requestCode: vi.fn(),
      verifyCode: vi.fn(async () => {
        throw new PasswordlessCodeVerificationError();
      })
    };
    const service = new IdentityPasswordlessService(
      handler as unknown as DomainPasswordlessAuthHandler
    );

    await expect(
      service.verifyCode({
        challengeId: "e28cbfe7-414b-4d80-a410-1e3f00a380a7",
        code: "123456"
      })
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("maps identity races to conflict responses", async () => {
    const handler = {
      requestCode: vi.fn(),
      verifyCode: vi.fn(async () => {
        throw new CustomerAccountIdentityConflictError();
      })
    };
    const service = new IdentityPasswordlessService(
      handler as unknown as DomainPasswordlessAuthHandler
    );

    await expect(
      service.verifyCode({
        challengeId: "e28cbfe7-414b-4d80-a410-1e3f00a380a7",
        code: "123456"
      })
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

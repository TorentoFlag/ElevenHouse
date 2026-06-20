import {
  BadRequestException,
  HttpException,
  HttpStatus,
  UnauthorizedException
} from "@nestjs/common";
import {
  PasswordlessCodeRequestCooldownError,
  PasswordlessCodeVerificationError
} from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";
import {
  AstrologerAccountAccessDeniedError,
  type DomainPasswordlessAuthHandler
} from "./identity-passwordless.handler";
import type { PasswordlessRateLimitPort } from "./identity-passwordless.rate-limit";
import { IdentityPasswordlessService } from "./identity-passwordless.service";
import { allowAllPasswordlessRateLimiter } from "../testing/allow-all-passwordless-rate-limiter";

describe("IdentityPasswordlessService", () => {
  it("declares the passwordless rate limiter as a required constructor dependency", () => {
    expect(IdentityPasswordlessService.length).toBe(2);
  });

  it("normalizes an astrologer passwordless code request without accepting roles from input", async () => {
    const codeResponse = {
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      channel: "email" as const,
      maskedIdentifier: "a***@example.com",
      expiresAt: "2026-06-16T10:10:00.000Z",
      resendAvailableAt: "2026-06-16T10:01:00.000Z"
    };
    const handler = {
      requestCode: vi.fn(async () => codeResponse),
      verifyCode: vi.fn()
    };
    const service = createService(handler);

    await expect(
      service.requestCode(
        {
          channel: "email",
          identifier: "  ASTROLOGER@example.COM "
        },
        {
          ipAddress: "203.0.113.10",
          userAgent: "Mozilla/5.0"
        }
      )
    ).resolves.toEqual(codeResponse);

    expect(handler.requestCode).toHaveBeenCalledWith(
      {
        channel: "email",
        identifier: "astrologer@example.com"
      },
      {
        ipAddress: "203.0.113.10",
        userAgent: "Mozilla/5.0"
      }
    );
  });

  it("rejects passwordless code requests containing caller-controlled roles", async () => {
    const handler = {
      requestCode: vi.fn(),
      verifyCode: vi.fn()
    };
    const service = createService(handler);

    await expect(
      service.requestCode({
        channel: "email",
        identifier: "astrologer@example.com",
        roles: ["admin"]
      } as never)
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(handler.requestCode).not.toHaveBeenCalled();
  });

  it("maps request rate limits to too many requests responses", async () => {
    const handler = {
      requestCode: vi.fn(),
      verifyCode: vi.fn()
    };
    const service = createService(handler, {
      consumeRequestCode: vi.fn(async () => ({
        allowed: false as const,
        retryAfterSeconds: 45
      })),
      consumeVerifyCode: vi.fn()
    });

    let error: unknown;

    try {
      await service.requestCode(
        {
          channel: "email",
          identifier: "astrologer@example.com"
        },
        { ipAddress: "203.0.113.10" }
      );
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect((error as HttpException).getResponse()).toEqual({
      message: "Passwordless auth rate limit exceeded",
      retryAfterSeconds: 45
    });
    expect(handler.requestCode).not.toHaveBeenCalled();
  });

  it("maps resend cooldowns to too many requests responses", async () => {
    const service = createService({
      requestCode: vi.fn(async () => {
        throw new PasswordlessCodeRequestCooldownError("2026-06-16T10:01:00.000Z");
      }),
      verifyCode: vi.fn()
    });

    await expect(
      service.requestCode({
        channel: "email",
        identifier: "astrologer@example.com"
      })
    ).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS
    });
  });

  it("verifies a code and requires an astrologer account response", async () => {
    const handler = {
      requestCode: vi.fn(),
      verifyCode: vi.fn(async () => ({
        response: {
          account: {
            id: "8e14390f-3db1-4d1c-9344-55679c778427",
            status: "active" as const,
            roles: ["client" as const, "astrologer" as const]
          }
        },
        session: {
          token: "raw-session-token",
          expiresAt: "2026-06-23T10:00:00.000Z"
        }
      }))
    };
    const service = createService(handler);

    await expect(
      service.verifyCode(
        {
          challengeId: "e28cbfe7-414b-4d80-a410-1e3f00a380a7",
          code: "123456"
        },
        {
          ipAddress: "203.0.113.10",
          userAgent: "Mozilla/5.0"
        }
      )
    ).resolves.toEqual({
      response: {
        account: {
          id: "8e14390f-3db1-4d1c-9344-55679c778427",
          status: "active",
          roles: ["client", "astrologer"]
        }
      },
      session: {
        token: "raw-session-token",
        expiresAt: "2026-06-23T10:00:00.000Z"
      }
    });
  });

  it("rejects verified accounts missing the astrologer role", async () => {
    const service = createService({
      requestCode: vi.fn(),
      verifyCode: vi.fn(async () => {
        throw new AstrologerAccountAccessDeniedError(
          "Authenticated account is missing the astrologer role"
        );
      })
    });

    await expect(
      service.verifyCode({
        challengeId: "e28cbfe7-414b-4d80-a410-1e3f00a380a7",
        code: "123456"
      })
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("maps invalid codes to unauthorized responses", async () => {
    await expect(
      createService({
        requestCode: vi.fn(),
        verifyCode: vi.fn(async () => {
          throw new PasswordlessCodeVerificationError();
        })
      }).verifyCode({
        challengeId: "e28cbfe7-414b-4d80-a410-1e3f00a380a7",
        code: "123456"
      })
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

function createService(
  handler: unknown,
  rateLimiter: PasswordlessRateLimitPort = allowAllPasswordlessRateLimiter
): IdentityPasswordlessService {
  return new IdentityPasswordlessService(
    handler as unknown as DomainPasswordlessAuthHandler,
    rateLimiter
  );
}

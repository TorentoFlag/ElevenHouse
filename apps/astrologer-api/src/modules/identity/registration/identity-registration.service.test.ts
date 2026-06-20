import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  UnauthorizedException
} from "@nestjs/common";
import {
  CustomerAccountIdentityConflictError,
  PasswordlessCodeVerificationError
} from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";
import type { PasswordlessRateLimitPort } from "../passwordless/identity-passwordless.rate-limit";
import { allowAllPasswordlessRateLimiter } from "../testing/allow-all-passwordless-rate-limiter";
import type { DomainRegistrationHandler } from "./identity-registration.handler";
import { IdentityRegistrationService } from "./identity-registration.service";

describe("IdentityRegistrationService", () => {
  it("declares the handler and rate limiter as required constructor dependencies", () => {
    expect(IdentityRegistrationService.length).toBe(2);
  });

  it("rejects invalid astrologer registration payloads before calling the handler", async () => {
    const handler = {
      verifyCodeAndRegister: vi.fn()
    };
    const service = createService(handler);

    await expect(
      service.verifyCodeAndRegister({
        challengeId: "not-a-uuid",
        code: "123456",
        displayName: "Астролог Анна"
      })
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(handler.verifyCodeAndRegister).not.toHaveBeenCalled();
  });

  it("rejects caller-controlled roles before calling the handler", async () => {
    const handler = {
      verifyCodeAndRegister: vi.fn()
    };
    const service = createService(handler);

    await expect(
      service.verifyCodeAndRegister({
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        code: "123456",
        displayName: "Астролог Анна",
        roles: ["admin"]
      } as never)
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(handler.verifyCodeAndRegister).not.toHaveBeenCalled();
  });

  it("verifies a code and registers an astrologer account with server-fixed roles", async () => {
    const registrationResult = {
      response: {
        account: {
          id: "8e14390f-3db1-4d1c-9344-55679c778427",
          status: "active" as const,
          roles: ["astrologer" as const],
          displayName: "Астролог Анна"
        }
      },
      session: {
        token: "raw-session-token",
        expiresAt: "2026-06-23T10:00:00.000Z"
      }
    };
    const handler = {
      verifyCodeAndRegister: vi.fn(async () => registrationResult)
    };
    const service = createService(handler);

    await expect(
      service.verifyCodeAndRegister(
        {
          challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
          code: "123456",
          displayName: " Астролог Анна "
        },
        {
          ipAddress: "203.0.113.10",
          userAgent: "ElevenHouse-Test/1.0"
        }
      )
    ).resolves.toEqual(registrationResult);

    expect(handler.verifyCodeAndRegister).toHaveBeenCalledWith({
      challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
      code: "123456",
      displayName: "Астролог Анна",
      roles: ["astrologer"],
      ipAddress: "203.0.113.10",
      userAgent: "ElevenHouse-Test/1.0"
    });
  });

  it("maps verify rate limits to too many requests responses", async () => {
    const handler = {
      verifyCodeAndRegister: vi.fn()
    };
    const service = createService(handler, {
      consumeRequestCode: vi.fn(),
      consumeVerifyCode: vi.fn(async () => ({
        allowed: false as const,
        retryAfterSeconds: 45
      }))
    });

    let error: unknown;

    try {
      await service.verifyCodeAndRegister(
        {
          challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
          code: "123456",
          displayName: "Астролог Анна"
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
    expect(handler.verifyCodeAndRegister).not.toHaveBeenCalled();
  });

  it("maps invalid or expired codes to unauthorized responses", async () => {
    const service = createService({
      verifyCodeAndRegister: vi.fn(async () => {
        throw new PasswordlessCodeVerificationError();
      })
    });

    await expect(
      service.verifyCodeAndRegister({
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        code: "123456",
        displayName: "Астролог Анна"
      })
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("maps duplicate identities to conflict responses", async () => {
    const service = createService({
      verifyCodeAndRegister: vi.fn(async () => {
        throw new CustomerAccountIdentityConflictError();
      })
    });

    await expect(
      service.verifyCodeAndRegister({
        challengeId: "8e14390f-3db1-4d1c-9344-55679c778427",
        code: "123456",
        displayName: "Астролог Анна"
      })
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

function createService(
  handler: unknown,
  rateLimiter: PasswordlessRateLimitPort = allowAllPasswordlessRateLimiter
): IdentityRegistrationService {
  return new IdentityRegistrationService(
    handler as unknown as DomainRegistrationHandler,
    rateLimiter
  );
}

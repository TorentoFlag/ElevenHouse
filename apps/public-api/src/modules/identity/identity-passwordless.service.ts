import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common";
import {
  requestPasswordlessCodeRequestSchema,
  requestPasswordlessCodeResponseSchema,
  verifyPasswordlessCodeRequestSchema,
  verifyPasswordlessCodeResponseSchema,
  type RequestPasswordlessCodeRequest,
  type RequestPasswordlessCodeResponse,
  type VerifyPasswordlessCodeRequest
} from "@elevenhouse/contracts";
import {
  CustomerAccountIdentityConflictError,
  PasswordlessCodeDeliveryUnavailableError,
  PasswordlessCodeRequestCooldownError,
  PasswordlessCodeVerificationError
} from "@elevenhouse/domain";
import {
  DomainPasswordlessAuthHandler,
  type VerifyPasswordlessCodeWithSessionResult
} from "./identity-passwordless.handler";
import { PASSWORDLESS_RATE_LIMITER } from "./identity-passwordless.tokens";
import {
  allowAllPasswordlessRateLimiter,
  anonymousPasswordlessIpAddress,
  type PasswordlessRateLimitPort,
  type PasswordlessRequestContext
} from "./identity-passwordless.rate-limit";

@Injectable()
export class IdentityPasswordlessService {
  constructor(
    private readonly handler: DomainPasswordlessAuthHandler,
    @Inject(PASSWORDLESS_RATE_LIMITER)
    private readonly rateLimiter: PasswordlessRateLimitPort = allowAllPasswordlessRateLimiter
  ) {}

  async requestCode(
    body: RequestPasswordlessCodeRequest,
    context: PasswordlessRequestContext = {}
  ): Promise<RequestPasswordlessCodeResponse> {
    const request = requestPasswordlessCodeRequestSchema.safeParse(body);

    if (!request.success) {
      throw new BadRequestException({
        message: "Invalid passwordless code request",
        issues: request.error.issues
      });
    }

    await assertPasswordlessRateLimitAllowed(
      await this.rateLimiter.consumeRequestCode({
        channel: request.data.channel,
        identifier: request.data.identifier,
        ipAddress: context.ipAddress ?? anonymousPasswordlessIpAddress
      })
    );

    try {
      return requestPasswordlessCodeResponseSchema.parse(
        await this.handler.requestCode(request.data)
      );
    } catch (error) {
      if (error instanceof PasswordlessCodeRequestCooldownError) {
        throw new HttpException(
          {
            message: "Passwordless code request is on cooldown",
            resendAvailableAt: error.resendAvailableAt
          },
          HttpStatus.TOO_MANY_REQUESTS,
          { cause: error }
        );
      }

      if (error instanceof PasswordlessCodeDeliveryUnavailableError) {
        throw new ServiceUnavailableException("Passwordless code delivery is unavailable", {
          cause: error
        });
      }

      throw error;
    }
  }

  async verifyCode(
    body: VerifyPasswordlessCodeRequest,
    context: PasswordlessRequestContext = {}
  ): Promise<VerifyPasswordlessCodeWithSessionResult> {
    const request = verifyPasswordlessCodeRequestSchema.safeParse(body);

    if (!request.success) {
      throw new BadRequestException({
        message: "Invalid passwordless code verification request",
        issues: request.error.issues
      });
    }

    await assertPasswordlessRateLimitAllowed(
      await this.rateLimiter.consumeVerifyCode({
        challengeId: request.data.challengeId,
        ipAddress: context.ipAddress ?? anonymousPasswordlessIpAddress
      })
    );

    try {
      const result = await this.handler.verifyCode(request.data);

      return {
        response: verifyPasswordlessCodeResponseSchema.parse(result.response),
        session: result.session
      };
    } catch (error) {
      if (error instanceof PasswordlessCodeVerificationError) {
        throw new UnauthorizedException("Invalid or expired passwordless code", {
          cause: error
        });
      }

      if (error instanceof CustomerAccountIdentityConflictError) {
        throw new ConflictException("Customer account identity already exists", {
          cause: error
        });
      }

      throw error;
    }
  }
}

async function assertPasswordlessRateLimitAllowed(
  decision: Awaited<ReturnType<PasswordlessRateLimitPort["consumeRequestCode"]>>
): Promise<void> {
  if (decision.allowed) {
    return;
  }

  throw new HttpException(
    {
      message: "Passwordless auth rate limit exceeded",
      retryAfterSeconds: decision.retryAfterSeconds
    },
    HttpStatus.TOO_MANY_REQUESTS
  );
}

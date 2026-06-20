import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import {
  requestAstrologerPasswordlessCodeRequestSchema,
  requestAstrologerPasswordlessCodeResponseSchema,
  verifyAstrologerPasswordlessCodeRequestSchema,
  verifyAstrologerPasswordlessCodeResponseSchema,
  type RequestAstrologerPasswordlessCodeRequest,
  type RequestAstrologerPasswordlessCodeResponse,
  type VerifyAstrologerPasswordlessCodeRequest
} from "@elevenhouse/contracts";
import {
  PasswordlessCodeRequestCooldownError,
  PasswordlessCodeVerificationError
} from "@elevenhouse/domain";
import {
  AstrologerAccountAccessDeniedError,
  DomainPasswordlessAuthHandler,
  type VerifyPasswordlessCodeWithSessionResult
} from "./identity-passwordless.handler";
import { PASSWORDLESS_RATE_LIMITER } from "./identity-passwordless.tokens";
import {
  anonymousPasswordlessIpAddress,
  type PasswordlessRateLimitPort,
  type PasswordlessRequestContext
} from "./identity-passwordless.rate-limit";
import { assertPasswordlessRateLimitAllowed } from "./identity-passwordless-http-errors";

@Injectable()
export class IdentityPasswordlessService {
  constructor(
    private readonly handler: DomainPasswordlessAuthHandler,
    @Inject(PASSWORDLESS_RATE_LIMITER)
    private readonly rateLimiter: PasswordlessRateLimitPort
  ) {}

  async requestCode(
    body: RequestAstrologerPasswordlessCodeRequest,
    context: PasswordlessRequestContext = {}
  ): Promise<RequestAstrologerPasswordlessCodeResponse> {
    const request = requestAstrologerPasswordlessCodeRequestSchema.safeParse(body);

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
      return requestAstrologerPasswordlessCodeResponseSchema.parse(
        await this.handler.requestCode(request.data, context)
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

      throw error;
    }
  }

  async verifyCode(
    body: VerifyAstrologerPasswordlessCodeRequest,
    context: PasswordlessRequestContext = {}
  ): Promise<VerifyPasswordlessCodeWithSessionResult> {
    const request = verifyAstrologerPasswordlessCodeRequestSchema.safeParse(body);

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
      const result = await this.handler.verifyCode(request.data, context);

      return {
        response: verifyAstrologerPasswordlessCodeResponseSchema.parse(result.response),
        session: result.session
      };
    } catch (error) {
      if (error instanceof PasswordlessCodeVerificationError) {
        throw new UnauthorizedException("Invalid or expired passwordless code", {
          cause: error
        });
      }

      if (error instanceof AstrologerAccountAccessDeniedError) {
        throw new UnauthorizedException("Astrologer account access is required", {
          cause: error
        });
      }

      throw error;
    }
  }
}

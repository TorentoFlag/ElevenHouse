import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
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
  ClientJoinIntentError,
  PasswordlessCodeRequestCooldownError,
  PasswordlessCodeVerificationError
} from "@elevenhouse/domain";
import {
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
    @Inject(DomainPasswordlessAuthHandler)
    private readonly handler: DomainPasswordlessAuthHandler,
    @Inject(PASSWORDLESS_RATE_LIMITER)
    private readonly rateLimiter: PasswordlessRateLimitPort
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
      const result = await this.handler.verifyCode(request.data, context);

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

      if (error instanceof ClientJoinIntentError) {
        throw new BadRequestException("Invalid or expired client join intent token", {
          cause: error
        });
      }

      throw error;
    }
  }
}

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import {
  verifyRegistrationPasswordlessCodeRequestSchema,
  verifyRegistrationPasswordlessCodeResponseSchema,
  type VerifyRegistrationPasswordlessCodeRequest
} from "@elevenhouse/contracts";
import {
  ClientJoinIntentError,
  CustomerAccountIdentityConflictError,
  PasswordlessCodeVerificationError
} from "@elevenhouse/domain";
import {
  anonymousPasswordlessIpAddress,
  type PasswordlessRateLimitPort,
  type PasswordlessRequestContext
} from "../passwordless/identity-passwordless.rate-limit";
import { assertPasswordlessRateLimitAllowed } from "../passwordless/identity-passwordless-http-errors";
import { PASSWORDLESS_RATE_LIMITER } from "../passwordless/identity-passwordless.tokens";
import {
  DomainRegistrationHandler,
  type VerifyRegistrationWithSessionResult
} from "./identity-registration.handler";

@Injectable()
export class IdentityRegistrationService {
  constructor(
    private readonly handler: DomainRegistrationHandler,
    @Inject(PASSWORDLESS_RATE_LIMITER)
    private readonly rateLimiter: PasswordlessRateLimitPort
  ) {}

  async verifyCodeAndRegister(
    body: VerifyRegistrationPasswordlessCodeRequest,
    context: PasswordlessRequestContext = {}
  ): Promise<VerifyRegistrationWithSessionResult> {
    const request = verifyRegistrationPasswordlessCodeRequestSchema.safeParse(body);

    if (!request.success) {
      throw new BadRequestException({
        message: "Invalid passwordless registration request",
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
      const result = await this.handler.verifyCodeAndRegister({
        challengeId: request.data.challengeId,
        code: request.data.code,
        displayName: request.data.displayName,
        roles: request.data.roles,
        ...(request.data.clientJoinIntentToken === undefined
          ? {}
          : { clientJoinIntentToken: request.data.clientJoinIntentToken }),
        ...(context.ipAddress === undefined ? {} : { ipAddress: context.ipAddress }),
        ...(context.userAgent === undefined ? {} : { userAgent: context.userAgent })
      });

      return {
        response: verifyRegistrationPasswordlessCodeResponseSchema.parse(result.response),
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

      if (error instanceof ClientJoinIntentError) {
        throw new BadRequestException("Invalid or expired client join intent token", {
          cause: error
        });
      }

      throw error;
    }
  }
}

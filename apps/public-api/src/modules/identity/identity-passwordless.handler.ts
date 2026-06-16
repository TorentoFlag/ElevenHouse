import { Inject, Injectable } from "@nestjs/common";
import type {
  AuthCodeDeliveryPort,
  PasswordlessAuthUnitOfWork
} from "@elevenhouse/domain";
import {
  createNumericPasswordlessCode,
  requestPasswordlessCode,
  verifyPasswordlessCode
} from "@elevenhouse/domain";
import type {
  RequestPasswordlessCodeRequest,
  RequestPasswordlessCodeResponse,
  VerifyPasswordlessCodeRequest,
  VerifyPasswordlessCodeResponse
} from "@elevenhouse/contracts";
import {
  PublicSessionTokenIssuer,
  SystemClock,
  type IssuedSessionToken
} from "./identity-session.service";
import {
  AUTH_CODE_DELIVERY,
  PASSWORDLESS_AUTH_OPTIONS,
  PASSWORDLESS_AUTH_UNIT_OF_WORK
} from "./identity-passwordless.tokens";

export const PUBLIC_AUTH_CODE_GENERATOR = Symbol("PUBLIC_AUTH_CODE_GENERATOR");

export type PasswordlessCodeGenerator = {
  readonly generateCode: () => string;
};

export type SessionTokenIssuer = {
  readonly issueSessionToken: () => IssuedSessionToken;
};

export type PasswordlessAuthOptions = {
  readonly codeSecret: string;
  readonly codeTtlSeconds: number;
  readonly resendCooldownSeconds: number;
  readonly maxAttempts: number;
  readonly sessionTtlSeconds: number;
};

export type VerifyPasswordlessCodeWithSessionResult = {
  readonly response: VerifyPasswordlessCodeResponse;
  readonly session: {
    readonly token: string;
    readonly expiresAt: string;
  };
};

@Injectable()
export class NumericPasswordlessCodeGenerator implements PasswordlessCodeGenerator {
  generateCode(): string {
    return createNumericPasswordlessCode(6);
  }
}

@Injectable()
export class DomainPasswordlessAuthHandler {
  constructor(
    @Inject(PASSWORDLESS_AUTH_UNIT_OF_WORK)
    private readonly passwordlessAuth: PasswordlessAuthUnitOfWork,
    @Inject(AUTH_CODE_DELIVERY)
    private readonly delivery: AuthCodeDeliveryPort,
    @Inject(PUBLIC_AUTH_CODE_GENERATOR)
    private readonly codeGenerator: PasswordlessCodeGenerator,
    private readonly sessionTokenIssuer: PublicSessionTokenIssuer,
    private readonly clock: SystemClock,
    @Inject(PASSWORDLESS_AUTH_OPTIONS)
    private readonly options: PasswordlessAuthOptions
  ) {}

  requestCode(input: RequestPasswordlessCodeRequest): Promise<RequestPasswordlessCodeResponse> {
    const now = this.clock.now();
    const code = this.codeGenerator.generateCode();

    return this.passwordlessAuth.transact((store) =>
      requestPasswordlessCode({
        store,
        delivery: this.delivery,
        channel: input.channel,
        identifier: input.identifier,
        roles: input.roles,
        code,
        codeSecret: this.options.codeSecret,
        now,
        ttlSeconds: this.options.codeTtlSeconds,
        resendCooldownSeconds: this.options.resendCooldownSeconds,
        maxAttempts: this.options.maxAttempts
      })
    );
  }

  async verifyCode(
    input: VerifyPasswordlessCodeRequest
  ): Promise<VerifyPasswordlessCodeWithSessionResult> {
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + this.options.sessionTtlSeconds * 1000);
    const issuedToken = this.sessionTokenIssuer.issueSessionToken();
    const result = await this.passwordlessAuth.transact((store) =>
      verifyPasswordlessCode({
        store,
        challengeId: input.challengeId,
        code: input.code,
        codeSecret: this.options.codeSecret,
        now,
        session: {
          tokenHash: issuedToken.tokenHash,
          createdAt: now,
          expiresAt
        }
      })
    );

    if (result.user.status !== "active") {
      throw new Error(`Authenticated customer account has unexpected status: ${result.user.status}`);
    }

    return {
      response: {
        account: {
          id: result.user.id,
          status: result.user.status,
          roles: result.roleAssignments.map((assignment) => assignment.role)
        }
      },
      session: {
        token: issuedToken.token,
        expiresAt: result.session.expiresAt
      }
    };
  }
}

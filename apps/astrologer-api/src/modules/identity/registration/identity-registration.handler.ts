import { Inject, Injectable } from "@nestjs/common";
import type { PasswordlessCustomerAccountRegistrationSessionUnitOfWork } from "@elevenhouse/domain";
import { verifyPasswordlessCodeAndRegisterCustomerAccountWithSession } from "@elevenhouse/domain";
import type { VerifyAstrologerRegistrationPasswordlessCodeResponse } from "@elevenhouse/contracts";
import type { PasswordlessAuthOptions } from "../passwordless/identity-passwordless.handler";
import {
  AstrologerSessionTokenIssuer,
  SystemClock,
  type IssuedSessionToken
} from "../session/identity-session.service";
import {
  ASTROLOGER_REGISTRATION_SESSION_UNIT_OF_WORK,
  REGISTRATION_AUTH_OPTIONS
} from "./identity-registration.tokens";

export type RegistrationAuthOptions = Pick<
  PasswordlessAuthOptions,
  "codeSecret" | "sessionTtlSeconds"
>;

export type VerifyAstrologerRegistrationWithSessionResult = {
  readonly response: VerifyAstrologerRegistrationPasswordlessCodeResponse;
  readonly session: {
    readonly token: string;
    readonly expiresAt: string;
  };
};

@Injectable()
export class DomainRegistrationHandler {
  constructor(
    @Inject(ASTROLOGER_REGISTRATION_SESSION_UNIT_OF_WORK)
    private readonly registration: PasswordlessCustomerAccountRegistrationSessionUnitOfWork,
    private readonly sessionTokenIssuer: AstrologerSessionTokenIssuer,
    private readonly clock: SystemClock,
    @Inject(REGISTRATION_AUTH_OPTIONS)
    private readonly options: RegistrationAuthOptions
  ) {}

  async verifyCodeAndRegister(input: {
    readonly challengeId: string;
    readonly code: string;
    readonly displayName: string;
    readonly roles: readonly ["astrologer"];
    readonly ipAddress?: string;
    readonly userAgent?: string;
  }): Promise<VerifyAstrologerRegistrationWithSessionResult> {
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + this.options.sessionTtlSeconds * 1000);
    const issuedToken: IssuedSessionToken = this.sessionTokenIssuer.issueSessionToken();
    const result = await verifyPasswordlessCodeAndRegisterCustomerAccountWithSession({
      registration: this.registration,
      challengeId: input.challengeId,
      code: input.code,
      codeSecret: this.options.codeSecret,
      now,
      displayName: input.displayName,
      roles: input.roles,
      session: {
        tokenHash: issuedToken.tokenHash,
        expiresAt,
        ...(input.ipAddress === undefined ? {} : { ipAddress: input.ipAddress }),
        ...(input.userAgent === undefined ? {} : { userAgent: input.userAgent })
      },
      securityEventType: "registration_succeeded"
    });

    return {
      response: {
        account: {
          id: result.user.id,
          status: "active",
          roles: result.roleAssignments.map((assignment) => assignment.role),
          displayName: result.userProfile.displayName
        }
      },
      session: {
        token: issuedToken.token,
        expiresAt: result.session.expiresAt
      }
    };
  }
}

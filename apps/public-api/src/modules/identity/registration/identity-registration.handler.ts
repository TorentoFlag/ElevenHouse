import { Inject, Injectable } from "@nestjs/common";
import type { CustomerPlatformRole } from "@elevenhouse/auth";
import type {
  ClientJoinIntentClaimStore,
  ClientStore,
  PasswordlessCustomerAccountRegistrationSessionStore,
  PasswordlessCustomerAccountRegistrationSessionUnitOfWork
} from "@elevenhouse/domain";
import {
  claimClientJoinIntent,
  isCustomerPlatformRole,
  verifyPasswordlessCodeAndRegisterCustomerAccountWithSession
} from "@elevenhouse/domain";
import type { VerifyRegistrationPasswordlessCodeResponse } from "@elevenhouse/contracts";
import { SystemClock } from "../../../common/system-clock.js";
import { hashClientJoinIntentToken } from "../../client-join/client-join-token.js";
import type { PasswordlessAuthOptions } from "../passwordless/identity-passwordless.handler";
import {
  PublicSessionTokenIssuer,
  type IssuedSessionToken
} from "../session/identity-session.service";
import {
  PASSWORDLESS_CUSTOMER_ACCOUNT_REGISTRATION_SESSION_UNIT_OF_WORK,
  REGISTRATION_AUTH_OPTIONS
} from "./identity-registration.tokens";

export type RegistrationAuthOptions = Pick<
  PasswordlessAuthOptions,
  "codeSecret" | "sessionTtlSeconds" | "trustedStaticCode"
>;

export type VerifyRegistrationWithSessionResult = {
  readonly response: VerifyRegistrationPasswordlessCodeResponse;
  readonly session: {
    readonly token: string;
    readonly expiresAt: string;
  };
};

type RegistrationClientStore = PasswordlessCustomerAccountRegistrationSessionStore &
  ClientJoinIntentClaimStore &
  Pick<ClientStore, "upsertClientProfile">;

@Injectable()
export class DomainRegistrationHandler {
  constructor(
    @Inject(PASSWORDLESS_CUSTOMER_ACCOUNT_REGISTRATION_SESSION_UNIT_OF_WORK)
    private readonly registration: PasswordlessCustomerAccountRegistrationSessionUnitOfWork<RegistrationClientStore>,
    @Inject(PublicSessionTokenIssuer)
    private readonly sessionTokenIssuer: PublicSessionTokenIssuer,
    @Inject(SystemClock)
    private readonly clock: SystemClock,
    @Inject(REGISTRATION_AUTH_OPTIONS)
    private readonly options: RegistrationAuthOptions
  ) {}

  async verifyCodeAndRegister(input: {
    readonly challengeId: string;
    readonly code: string;
    readonly displayName: string;
    readonly roles: readonly string[];
    readonly clientJoinIntentToken?: string;
    readonly ipAddress?: string;
    readonly userAgent?: string;
  }): Promise<VerifyRegistrationWithSessionResult> {
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + this.options.sessionTtlSeconds * 1000);
    const issuedToken: IssuedSessionToken = this.sessionTokenIssuer.issueSessionToken();
    const result =
      await verifyPasswordlessCodeAndRegisterCustomerAccountWithSession<RegistrationClientStore>({
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
        securityEventType: "registration_succeeded",
        trustedStaticCode: this.options.trustedStaticCode ?? null,
        afterRegistered: async ({ store, account }) => {
          if (account.roleAssignments.some(({ role }) => role === "client")) {
            await store.upsertClientProfile({
              userId: account.user.id,
              displayNameSnapshot: account.userProfile.displayName,
              preferredLocale: null,
              timezone: null,
              now: now.toISOString()
            });
          }
          if (input.clientJoinIntentToken !== undefined) {
            await claimClientJoinIntent({
              store,
              token: input.clientJoinIntentToken,
              tokenHasher: hashClientJoinIntentToken,
              clientUserId: account.user.id,
              now
            });
          }
        }
      });

    return {
      response: {
        account: {
          id: result.user.id,
          status: "active",
          roles: customerRoles(result.roleAssignments.map((assignment) => assignment.role)),
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

function customerRoles(roles: readonly string[]): CustomerPlatformRole[] {
  return roles.filter(isCustomerPlatformRole);
}

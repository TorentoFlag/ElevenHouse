import { Inject, Injectable } from "@nestjs/common";
import {
  createAuthenticatedSession,
  registerCustomerAccount as registerCustomerAccountUseCase,
  type AccountRegistrationUnitOfWork,
  type AuthSessionCreationUnitOfWork
} from "@elevenhouse/domain";
import {
  type RegisterCustomerAccountRequest,
  type RegisterCustomerAccountResponse
} from "@elevenhouse/contracts";
import { argon2id, hash } from "argon2";
import {
  ACCOUNT_REGISTRATION_UNIT_OF_WORK,
  AUTH_SESSION_CREATION_UNIT_OF_WORK
} from "./identity-registration.tokens";
import {
  PublicSessionTokenIssuer,
  SystemClock,
  type IssuedSessionToken
} from "./identity-session.service";

export type PasswordHasher = {
  readonly hashPassword: (password: string) => Promise<string>;
};

export type SessionTokenIssuer = {
  readonly issueSessionToken: () => IssuedSessionToken;
};

export type RegistrationSessionOptions = {
  readonly sessionTtlSeconds: number;
};

export type RegisterCustomerAccountWithSessionResult = {
  readonly response: RegisterCustomerAccountResponse;
  readonly session: {
    readonly token: string;
    readonly expiresAt: string;
  };
};

@Injectable()
export class Argon2PasswordHasher implements PasswordHasher {
  hashPassword(password: string): Promise<string> {
    return hash(password, {
      type: argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1
    });
  }
}

@Injectable()
export class DomainCustomerAccountRegistrationHandler {
  constructor(
    @Inject(ACCOUNT_REGISTRATION_UNIT_OF_WORK)
    private readonly accountRegistration: AccountRegistrationUnitOfWork,
    @Inject(AUTH_SESSION_CREATION_UNIT_OF_WORK)
    private readonly authSessionCreation: AuthSessionCreationUnitOfWork,
    private readonly passwordHasher: Argon2PasswordHasher,
    private readonly sessionTokenIssuer: PublicSessionTokenIssuer,
    private readonly clock: SystemClock,
    @Inject("REGISTRATION_SESSION_OPTIONS")
    private readonly sessionOptions: RegistrationSessionOptions
  ) {}

  async registerCustomerAccount(
    input: RegisterCustomerAccountRequest
  ): Promise<RegisterCustomerAccountWithSessionResult> {
    const passwordHash = await this.passwordHasher.hashPassword(input.password);
    const result = await registerCustomerAccountUseCase({
      accountRegistration: this.accountRegistration,
      identity: {
        provider: "email",
        providerSubject: input.email,
        email: input.email,
        passwordHash
      },
      roles: input.roles
    });

    if (result.user.status !== "active") {
      throw new Error(`Registered customer account has unexpected status: ${result.user.status}`);
    }

    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + this.sessionOptions.sessionTtlSeconds * 1000);
    const issuedToken = this.sessionTokenIssuer.issueSessionToken();
    const sessionResult = await createAuthenticatedSession({
      sessionCreation: this.authSessionCreation,
      userId: result.user.id,
      tokenHash: issuedToken.tokenHash,
      createdAt: now,
      expiresAt,
      securityEventType: "registration_succeeded"
    });

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
        expiresAt: sessionResult.session.expiresAt
      }
    };
  }
}

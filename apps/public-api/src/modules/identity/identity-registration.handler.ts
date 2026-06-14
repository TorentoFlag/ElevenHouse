import { Inject, Injectable } from "@nestjs/common";
import {
  registerCustomerAccount as registerCustomerAccountUseCase,
  type AccountRegistrationUnitOfWork
} from "@elevenhouse/domain";
import {
  type RegisterCustomerAccountRequest,
  type RegisterCustomerAccountResponse
} from "@elevenhouse/contracts";
import { argon2id, hash } from "argon2";
import { ACCOUNT_REGISTRATION_UNIT_OF_WORK } from "./identity-registration.tokens";

export type PasswordHasher = {
  readonly hashPassword: (password: string) => Promise<string>;
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
    private readonly passwordHasher: Argon2PasswordHasher
  ) {}

  async registerCustomerAccount(
    input: RegisterCustomerAccountRequest
  ): Promise<RegisterCustomerAccountResponse> {
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

    return {
      account: {
        id: result.user.id,
        status: result.user.status,
        roles: result.roleAssignments.map((assignment) => assignment.role)
      }
    };
  }
}

import type { CustomerPlatformRole } from "@elevenhouse/auth";
import type { UserAccount, UserAccountStatus } from "../../../accounts/account";
import {
  normalizeAuthIdentityInput,
  type AuthIdentity,
  type AuthIdentityInput
} from "../../../auth-identities/auth-identity";
import {
  assertCustomerRole,
  normalizeCustomerRoles,
  type UserRoleAssignment
} from "../../../roles";

export type AccountRegistrationStore = {
  readonly createUser: (input: { readonly status: UserAccountStatus }) => Promise<UserAccount>;
  readonly createAuthIdentity: (
    input: AuthIdentityInput & { readonly userId: string }
  ) => Promise<AuthIdentity>;
  readonly assignRole: (input: {
    readonly userId: string;
    readonly role: CustomerPlatformRole;
    readonly assignedByUserId?: string;
  }) => Promise<UserRoleAssignment>;
};

export type AccountRegistrationUnitOfWork = {
  readonly transact: <T>(operation: (store: AccountRegistrationStore) => Promise<T>) => Promise<T>;
};

export type RegisteredCustomerAccount = {
  readonly user: UserAccount;
  readonly authIdentity: AuthIdentity;
  readonly roleAssignments: readonly UserRoleAssignment[];
};

export async function createActiveUserAccount(input: {
  readonly store: AccountRegistrationStore;
}): Promise<UserAccount> {
  return input.store.createUser({ status: "active" });
}

export async function linkAuthIdentity(input: {
  readonly store: AccountRegistrationStore;
  readonly userId: string;
  readonly identity: AuthIdentityInput;
}): Promise<AuthIdentity> {
  const identity = normalizeAuthIdentityInput(input.identity);
  const authIdentityInput = {
    userId: input.userId,
    provider: identity.provider,
    providerSubject: identity.providerSubject,
    ...(identity.email ? { email: identity.email } : {}),
    ...(identity.phoneNumber ? { phoneNumber: identity.phoneNumber } : {}),
    ...(identity.passwordHash ? { passwordHash: identity.passwordHash } : {})
  } satisfies AuthIdentityInput & { readonly userId: string };

  return input.store.createAuthIdentity(authIdentityInput);
}

export async function grantCustomerRole(input: {
  readonly store: AccountRegistrationStore;
  readonly userId: string;
  readonly role: string;
  readonly assignedByUserId?: string;
}): Promise<UserRoleAssignment> {
  assertCustomerRole(input.role);
  const roleAssignmentInput = {
    userId: input.userId,
    role: input.role,
    ...(input.assignedByUserId ? { assignedByUserId: input.assignedByUserId } : {})
  } satisfies Parameters<AccountRegistrationStore["assignRole"]>[0];

  return input.store.assignRole(roleAssignmentInput);
}

export async function registerCustomerAccount(input: {
  readonly accountRegistration: AccountRegistrationUnitOfWork;
  readonly identity: AuthIdentityInput;
  readonly roles: readonly string[];
}): Promise<RegisteredCustomerAccount> {
  const roles = normalizeCustomerRoles(input.roles);
  const identity = normalizeAuthIdentityInput(input.identity);

  return input.accountRegistration.transact(async (store) => {
    const user = await createActiveUserAccount({ store });
    const authIdentity = await linkAuthIdentity({
      store,
      userId: user.id,
      identity
    });
    const roleAssignments: UserRoleAssignment[] = [];

    for (const role of roles) {
      roleAssignments.push(await grantCustomerRole({ store, userId: user.id, role }));
    }

    return {
      user,
      authIdentity,
      roleAssignments
    };
  });
}

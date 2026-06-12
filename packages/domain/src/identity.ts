import { customerPlatformRoles, type CustomerPlatformRole } from "@elevenhouse/auth";

export type UserAccountStatus = "active";

export type UserAccount = {
  readonly id: string;
  readonly status: UserAccountStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type IdentityProvider = "email" | "phone" | "telegram" | "google" | "apple";

export type AuthIdentity = {
  readonly id: string;
  readonly userId: string;
  readonly provider: IdentityProvider;
  readonly providerSubject: string;
  readonly email?: string;
  readonly phoneNumber?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type UserRoleAssignment = {
  readonly id: string;
  readonly userId: string;
  readonly role: CustomerPlatformRole;
  readonly assignedByUserId?: string;
  readonly assignedAt: string;
};

export type AuthIdentityInput = {
  readonly provider: IdentityProvider;
  readonly providerSubject: string;
  readonly email?: string;
  readonly phoneNumber?: string;
  readonly passwordHash?: string;
};

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

const customerRoleSet = new Set<string>(customerPlatformRoles);

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
  assertAuthIdentityInput(input.identity);

  return input.store.createAuthIdentity({
    userId: input.userId,
    provider: input.identity.provider,
    providerSubject: input.identity.providerSubject,
    email: input.identity.email,
    phoneNumber: input.identity.phoneNumber,
    passwordHash: input.identity.passwordHash
  });
}

export async function grantCustomerRole(input: {
  readonly store: AccountRegistrationStore;
  readonly userId: string;
  readonly role: string;
  readonly assignedByUserId?: string;
}): Promise<UserRoleAssignment> {
  assertCustomerRole(input.role);

  return input.store.assignRole({
    userId: input.userId,
    role: input.role,
    assignedByUserId: input.assignedByUserId
  });
}

export async function registerCustomerAccount(input: {
  readonly accountRegistration: AccountRegistrationUnitOfWork;
  readonly identity: AuthIdentityInput;
  readonly roles: readonly string[];
}): Promise<RegisteredCustomerAccount> {
  const roles = normalizeCustomerRoles(input.roles);
  assertAuthIdentityInput(input.identity);

  return input.accountRegistration.transact(async (store) => {
    const user = await createActiveUserAccount({ store });
    const authIdentity = await linkAuthIdentity({
      store,
      userId: user.id,
      identity: input.identity
    });
    const roleAssignments = await Promise.all(
      roles.map((role) => grantCustomerRole({ store, userId: user.id, role }))
    );

    return {
      user,
      authIdentity,
      roleAssignments
    };
  });
}

function normalizeCustomerRoles(roles: readonly string[]): readonly CustomerPlatformRole[] {
  if (roles.length === 0) {
    throw new Error("Customer registration requires at least one role");
  }

  return [...new Set(roles)].map((role) => {
    assertCustomerRole(role);
    return role;
  });
}

function assertCustomerRole(role: string): asserts role is CustomerPlatformRole {
  if (!customerRoleSet.has(role)) {
    throw new Error(`Customer registration cannot assign internal role: ${role}`);
  }
}

function assertAuthIdentityInput(identity: AuthIdentityInput): void {
  if (identity.providerSubject.trim().length === 0) {
    throw new Error("Auth identities require a provider subject");
  }

  if (identity.provider === "email" && !identity.email) {
    throw new Error("Email identities require an email address");
  }

  if (identity.provider === "phone" && !identity.phoneNumber) {
    throw new Error("Phone identities require a phone number");
  }
}

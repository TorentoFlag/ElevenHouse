import { customerPlatformRoles, type CustomerPlatformRole } from "@elevenhouse/auth";

export const userAccountStatusValues = ["active", "suspended", "deleted"] as const;
export type UserAccountStatus = (typeof userAccountStatusValues)[number];

export type UserAccount = {
  readonly id: string;
  readonly status: UserAccountStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export const identityProviderValues = ["email", "phone", "telegram", "google", "apple"] as const;
export type IdentityProvider = (typeof identityProviderValues)[number];

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
const identityProviderSet = new Set<string>(identityProviderValues);
const userAccountStatusSet = new Set<string>(userAccountStatusValues);

export function isCustomerPlatformRole(value: string): value is CustomerPlatformRole {
  return customerRoleSet.has(value);
}

export function isIdentityProvider(value: string): value is IdentityProvider {
  return identityProviderSet.has(value);
}

export function isUserAccountStatus(value: string): value is UserAccountStatus {
  return userAccountStatusSet.has(value);
}

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

  return input.store.createAuthIdentity(withoutUndefined({
    userId: input.userId,
    provider: identity.provider,
    providerSubject: identity.providerSubject,
    email: identity.email,
    phoneNumber: identity.phoneNumber,
    passwordHash: identity.passwordHash
  }));
}

export async function grantCustomerRole(input: {
  readonly store: AccountRegistrationStore;
  readonly userId: string;
  readonly role: string;
  readonly assignedByUserId?: string;
}): Promise<UserRoleAssignment> {
  assertCustomerRole(input.role);

  return input.store.assignRole(withoutUndefined({
    userId: input.userId,
    role: input.role,
    assignedByUserId: input.assignedByUserId
  }));
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
  if (!isCustomerPlatformRole(role)) {
    throw new Error(`Customer registration cannot assign internal role: ${role}`);
  }
}

function normalizeAuthIdentityInput(identity: AuthIdentityInput): AuthIdentityInput {
  if (!isIdentityProvider(identity.provider)) {
    throw new Error(`Unsupported identity provider: ${identity.provider}`);
  }

  const providerSubject = identity.providerSubject.trim();
  if (providerSubject.length === 0) {
    throw new Error("Auth identities require a provider subject");
  }

  const email = normalizeOptionalString(identity.email);
  const phoneNumber = normalizeOptionalString(identity.phoneNumber);

  if (identity.provider === "email" && !email) {
    throw new Error("Email identities require an email address");
  }

  if (identity.provider === "email" && !identity.passwordHash?.trim()) {
    throw new Error("Email identities require a password hash");
  }

  if (identity.provider === "phone" && !phoneNumber) {
    throw new Error("Phone identities require a phone number");
  }

  return withoutUndefined({
    provider: identity.provider,
    providerSubject,
    email,
    phoneNumber,
    passwordHash: identity.passwordHash
  });
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
  ) as T;
}

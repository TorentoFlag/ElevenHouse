import { customerPlatformRoles, type CustomerPlatformRole } from "@elevenhouse/auth";

const customerRoleSet = new Set<string>(customerPlatformRoles);

export function isCustomerPlatformRole(value: string): value is CustomerPlatformRole {
  return customerRoleSet.has(value);
}

export function assertCustomerRole(role: string): asserts role is CustomerPlatformRole {
  if (!isCustomerPlatformRole(role)) {
    throw new Error(`Customer registration cannot assign internal role: ${role}`);
  }
}

export function normalizeCustomerRoles(roles: readonly string[]): readonly CustomerPlatformRole[] {
  if (roles.length === 0) {
    throw new Error("Customer registration requires at least one role");
  }

  return [...new Set(roles)].map((role) => {
    assertCustomerRole(role);
    return role;
  });
}

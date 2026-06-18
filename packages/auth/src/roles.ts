export const customerPlatformRoles = ["client", "astrologer"] as const;
export const internalPlatformRoles = ["moderator", "admin", "super_admin"] as const;
export const platformRoles = [...customerPlatformRoles, ...internalPlatformRoles] as const;

export type PlatformRole = (typeof platformRoles)[number];
export type CustomerPlatformRole = (typeof customerPlatformRoles)[number];
export type InternalPlatformRole = (typeof internalPlatformRoles)[number];

export function isPlatformRole(value: string): value is PlatformRole {
  return platformRoles.includes(value as PlatformRole);
}

export function isInternalPlatformRole(value: string): value is InternalPlatformRole {
  return internalPlatformRoles.includes(value as InternalPlatformRole);
}

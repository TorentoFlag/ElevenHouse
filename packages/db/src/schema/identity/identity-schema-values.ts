export const userStatusValues = ["active", "suspended", "deleted"] as const;
export type UserStatus = (typeof userStatusValues)[number];

export const identityProviderValues = ["email", "phone", "telegram", "google", "apple"] as const;
export type IdentityProvider = (typeof identityProviderValues)[number];

export const databasePlatformRoleValues = [
  "client",
  "astrologer",
  "moderator",
  "admin",
  "super_admin"
] as const;
export type DatabasePlatformRole = (typeof databasePlatformRoleValues)[number];
